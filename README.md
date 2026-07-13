# Isochrone

## Web map configuration

The web app uses MapLibre GL JS with OpenFreeMap's Liberty style. Override the
style without changing application code by setting `VITE_MAP_STYLE_URL`:

```sh
VITE_MAP_STYLE_URL=https://maps.example.com/style.json pnpm --filter @isochrone/web dev
```

The configured style must include the required OpenMapTiles and OpenStreetMap
attribution. OpenFreeMap's hosted styles provide it automatically.

If the hosted tile provider changes, generate or obtain an OpenMapTiles-compatible
PMTiles archive, host the archive and style assets on static storage, add the
MapLibre PMTiles protocol adapter, and point `VITE_MAP_STYLE_URL` at the self-hosted
style. Application map layers should continue to depend on MapLibre source and
layer APIs rather than provider-specific URLs.

Set `VITE_DATASET_MANIFEST_URL` when the generated browser dataset is not served
at `/data/manifest.json`. During local development, it can point at the pipeline
output through Vite's workspace file serving:

```sh
VITE_DATASET_MANIFEST_URL=/@fs/absolute/path/to/.cache/web-data/nagoya-cbus/manifest.json \
  pnpm --filter @isochrone/web dev
```

## GitHub Pages deployment

Pushing `main` runs `.github/workflows/deploy.yml`. The workflow restores the latest cached GTFS
zip, checks BODIK for an updated resource, validates it, and generates a fresh browser dataset in
`apps/web/public/data` before building and deploying the Pages artifact. Generated data is not
committed: rebuilding it from the cached source zip keeps the repository small while validation and
the feed version make each deployment traceable.

`actions/configure-pages` supplies the repository base path to Vite through `VITE_BASE_PATH`, so
assets and the default dataset manifest resolve under `/isochrone/`. For a custom domain, the same
setting becomes `/`; no application paths need to change.

Run the equivalent production build locally with:

```sh
pnpm --filter @isochrone/pipeline cli download nagoya-cbus
pnpm --filter @isochrone/pipeline cli validate nagoya-cbus
pnpm --filter @isochrone/pipeline cli dataset nagoya-cbus --out-dir ../../apps/web/public/data
VITE_BASE_PATH=/isochrone/ pnpm --filter @isochrone/web build
```

## GTFS update review

`.github/workflows/data-update.yml` checks CKAN every Monday at 03:00 JST. It compares the remote
`last_modified` value with `config/feed-snapshots/nagoya-cbus.json`. When the feed changes, the
workflow downloads it, runs dataset validation and the size gate, then opens or updates a pull
request containing the approved feed version, content hashes, and validation statistics.

Generated browser JSON remains outside Git. Merging the snapshot pull request records the reviewed
version and triggers `deploy.yml`, which requires CKAN to match that version before regenerating the
same content-hashed files. This prevents an unrelated deployment from publishing an unreviewed feed.
A failed CKAN lookup, validation, or size gate fails the scheduled workflow before a pull request is
created.

For an end-to-end rehearsal, manually run `Check for GTFS updates` with `rehearsal` enabled. This
uses a deliberately stale comparison version and creates a clearly marked do-not-merge pull
request. Verify its statistics, then close it without merging. A normal manual run exercises the
no-update path and must finish successfully without creating a pull request.
