# Operations runbook

This runbook covers feed review, timetable revisions, deployment, rollback, and map provider
migration. Run commands from the repository root unless noted otherwise.

## Weekly feed update

`.github/workflows/data-update.yml` runs every Monday at 03:00 JST and can also be started with
`workflow_dispatch`. It performs these steps:

1. Read the approved `feedVersion` from `config/feed-snapshots/nagoya-cbus.json`.
2. Resolve the selected CKAN resource and compare its `last_modified` value.
3. Exit successfully without downloading data or creating a PR when the values match.
4. Download the new zip, validate the dataset, and enforce the gzip size gate when they differ.
5. Update the tracked snapshot with the feed version, validity period, hashes, and validation stats.
6. Create or update `automation/data-nagoya-cbus` with a review PR.

CKAN lookup, validation, or size-gate failures stop the job before PR creation. Inspect failed runs
under `Actions > Check for GTFS updates`; do not bypass a failed gate by editing the snapshot.

## Manual update check

Use the same workflow for an immediate check:

```sh
gh workflow run data-update.yml -f rehearsal=false
gh run list --workflow data-update.yml --limit 1
```

An unchanged feed produces a successful run with the download, validation, dataset, and PR steps
marked as skipped. A changed feed produces a PR. Review its feed version and statistics before
merging.

Use this local sequence when investigating a feed before running Actions:

```sh
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install --frozen-lockfile
approved="$(jq -r '.feedVersion' config/feed-snapshots/nagoya-cbus.json)"
pnpm --filter @isochrone/pipeline cli check-update nagoya-cbus \
  --current-version "$approved"
pnpm --filter @isochrone/pipeline cli download nagoya-cbus
pnpm --filter @isochrone/pipeline cli validate nagoya-cbus
pnpm --filter @isochrone/pipeline cli dataset nagoya-cbus
```

`validate` must report `"ok": true`, no issues, and zero warnings. `dataset` must keep the gzip total
at or below 1,500,000 bytes.

## Multi-agency staging

Download each configured source separately, then pass every source to `validate` and `dataset` with
an explicit composite dataset id:

```sh
pnpm --filter @isochrone/pipeline cli download nagoya-cbus
pnpm --filter @isochrone/pipeline cli download nagoya-subway
pnpm --filter @isochrone/pipeline cli validate nagoya-cbus nagoya-subway \
  --dataset-id nagoya-transit
pnpm --filter @isochrone/pipeline cli dataset nagoya-cbus nagoya-subway \
  --dataset-id nagoya-transit \
  --out-dir .cache/web-data/nagoya-transit
```

The source order does not affect the composite feed version or entity order. Every selected agency
must have the same effective footpath configuration because walking transfers are regenerated once
from the merged stop set. Keep production deployment on the single approved City Bus source until
an additional official feed has stable download and redistribution terms. Before enabling it,
approve a snapshot for every source, set a measured composite size gate, and update the City
Bus-only UI note.

## Timetable revision review

Treat the snapshot PR as a data change, even if only dates changed.

1. Open the CKAN resource linked in `config/agencies.json` and confirm that the resource name and
   `last_modified` describe an expected City Bus timetable revision.
2. Compare every statistic in the PR with the previous snapshot. Investigate large stop, route,
   pattern, trip, service, footpath, or calendar-date changes.
3. Confirm that `warnings` remains zero and the service period covers the intended public dates.
4. Run the RAPTOR smoke cases against the new local cache:

   ```sh
   pnpm --filter @isochrone/raptor cli 栄 20260707 08:00 \
     --data-dir ../../.cache/web-data/nagoya-cbus \
     --representative 名古屋駅 \
     --representative 金山
   ```

   Repeat the command for each case in `config/raptor-smoke-cases.json`, using its origin, service
   date, departure, and representative stops. Compare the JSON output with the verified reachable
   stop count and representative arrival times in that file. Update the cases only after checking
   the official timetable sources recorded in `sources`.

5. If `validate` fails a count range but the official revision is legitimate, adjust only the
   affected range in `DEFAULT_VALIDATION_RANGES` in `packages/pipeline/src/validation.ts`. Explain
   the evidence in the PR and add or update a focused test.
6. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before approval.
7. Merge the generated snapshot PR. The merge starts CI and the Pages deployment.
8. Verify the deployment run, public manifest, footer feed version, stop search, and one 30/60
   minute query.

The strict numbers in unit tests belong to fixed in-memory fixtures. Do not update them for a normal
CKAN timetable revision. Update fixture expectations only when the fixture or supported data format
changes intentionally. The current real-feed numbers in `docs/PLAN.md` are descriptive; update them
from the approved snapshot when a revision changes those values.

## Rehearsal

Exercise PR creation without waiting for a CKAN revision:

```sh
gh workflow run data-update.yml -f rehearsal=true
gh run list --workflow data-update.yml --limit 1
```

The workflow compares CKAN with a deliberately stale value, runs every gate, and creates
`automation/data-nagoya-cbus-rehearsal`. Its PR begins with `Rehearsal only: do not merge`. Confirm
that the body includes validation statistics, then close the PR and delete its branch.

## Deployment

`.github/workflows/deploy.yml` runs on each push to `main`. It downloads the selected CKAN resource
and compares its `lastModified` with the approved snapshot before building. A mismatch fails the run
and leaves the previous Pages deployment in place, preventing an unreviewed feed from being
published.

Start a manual deployment only when CKAN and the approved snapshot match:

```sh
gh workflow run deploy.yml
gh run list --workflow deploy.yml --limit 1
```

Verify the public files after a successful run:

```sh
curl -I https://taku335.github.io/isochrone/
curl -I https://taku335.github.io/isochrone/data/manifest.json
curl -L https://taku335.github.io/isochrone/data/manifest.json
```

Use the paths in the returned manifest to check the content-hashed stops and timetable files.

## Rollback

GitHub Pages retains the last successful deployment when a new deployment fails. For an application
regression, revert the application PR on `main`; the revert starts a new deployment against the
currently approved feed.

For a bad feed, do not merge its snapshot PR. If it was already merged, revert the snapshot PR and
stop further deployment attempts. Because CKAN exposes the latest resource, a reverted older
snapshot will intentionally fail the approved-version gate. Keep the last successful Pages artifact
online while the data provider corrects CKAN or while a separate pinned-source recovery is prepared.

## PMTiles migration

The app currently uses OpenFreeMap's hosted Liberty style. `VITE_MAP_STYLE_URL` keeps the style
replaceable, but a self-hosted PMTiles basemap requires a protocol adapter in addition to a new style.

1. Generate or obtain an OpenMapTiles-compatible PMTiles v3 archive and the matching MapLibre style,
   glyphs, and sprites. Record the OpenStreetMap-derived data attribution and the asset licenses.
2. Host the archive and style assets on static storage that supports byte-range requests. Configure
   CORS for the GitHub Pages origin and verify `206 Partial Content` responses.
3. Add the `pmtiles` JavaScript dependency to `apps/web`.
4. In the map bootstrap, instantiate `Protocol` once and register `pmtiles` with MapLibre's
   `addProtocol` before creating the map. Remove the protocol during teardown if the application
   lifecycle can recreate it.
5. Point the style source at `pmtiles://https://.../nagoya.pmtiles` and set
   `VITE_MAP_STYLE_URL` to the hosted style JSON.
6. Verify glyphs, sprites, source-layer names, zoom bounds, range requests, and attribution on desktop
   and mobile before changing the production variable.
7. Retain the OpenFreeMap URL as a rollback value until the self-hosted deployment is stable.

The integration API and source URL format are documented in the
[official Protomaps MapLibre guide](https://docs.protomaps.com/pmtiles/maplibre).
