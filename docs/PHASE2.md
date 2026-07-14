# Phase 2: latest-departure search

This document is the single implementation plan for Issue #26. Phase 2 answers this question:

> What is the latest time I can leave each stop and still arrive at the selected destination by a
> given deadline?

It extends the Phase 1 timetable, service-day, worker, and stop-search infrastructure. It does not
add rail, other bus operators, live delays, or a server-side journey planner.

## Current extension points

Phase 1 deliberately contains only part of the contract:

- `packages/raptor/src/core.ts` exports `LatestDepartureQuery` and includes it in `Query`, but
  `route` accepts only `EarliestArrivalQuery` and returns an `arrival` array.
- The forward scan already isolates pattern queuing, trip selection, timetable lookup, and
  footpath relaxation. Reverse routing must provide direction-specific versions of those steps.
- `resolveServiceLayers` currently returns the selected service day and the previous service day
  with offsets `0` and `+1440`. Reverse routing also needs the next service day with offset
  `-1440` so trips around the following midnight share the query timeline.
- Worker requests, results, polygon generation, URL state, and the UI currently assume
  earliest-arrival searches.

These are extension points, not evidence that latest-departure routing already works. A
`LatestDepartureQuery` must not be passed to `route` until the contracts below are implemented.

## Engine contract

Keep the public request as the existing discriminated union:

```ts
export interface LatestDepartureQuery {
  readonly kind: 'latestDeparture';
  readonly destinations: readonly {
    readonly stopIndex: number;
    readonly arrival: Minutes;
  }[];
  readonly serviceDate: string;
  readonly maxRounds?: number;
}
```

Return a discriminated result rather than overloading the meaning of `arrival`:

```ts
export interface LatestDepartureResult {
  readonly kind: 'latestDeparture';
  readonly departure: Uint16Array;
  readonly rounds: number;
}
```

The label for each stop is the greatest departure minute that still reaches any destination by
its deadline. Use a dedicated unreached sentinel and helper functions so maximizing labels cannot
accidentally reuse forward-routing comparisons. Keep minute values on the same query-day timeline
as Phase 1 and reject values outside the representable range.

## Reverse RAPTOR

Implement latest-departure routing as the directionally symmetric RAPTOR scan:

1. Initialize each destination with its arrival deadline and relax inbound walking transfers.
2. Queue every pattern containing a newly improved stop, starting from the greatest relevant stop
   position.
3. Scan stop positions from the end of each pattern to the start.
4. Select the latest active trip whose arrival at the current stop is no later than the current
   label. Trips are stored in ascending order, so use an upper-bound binary search and then scan
   backward past inactive services.
5. Propagate that trip's departure time to earlier stops, maximizing their labels.
6. Relax inbound footpaths after each transit round and stop when no labels improve or
   `maxRounds` is reached.

Do not assume footpaths are symmetric. Either emit an inbound CSR index in the browser dataset or
build it once in the loader, then test asymmetric edges explicitly. Keep the forward path unchanged
to limit the regression surface.

## Service-day layers

Generalize `ServiceLayer.minuteOffset` to `-1440 | 0 | 1440` and expose direction-specific
resolvers:

- Forward: selected date at `0`, previous date at `+1440`.
- Reverse: selected date at `0`, next date at `-1440`.

Continue converting a trip-local minute to the query timeline with
`globalMinute = localMinute - minuteOffset`. Resolve `calendar` and `calendar_dates` against each
layer's own service date. At the feed boundary, return an empty adjacent layer rather than reading
outside the published service period.

Required service-day tests cover the next-day layer, a trip past 24:00, weekday-to-holiday and
holiday-to-weekday boundaries, added and removed exceptions, and both ends of the feed period.

## Worker and result processing

Change the worker query payload to `Query` and make responses discriminated by search kind. Preserve
request cancellation and transferable typed arrays. Forward searches may continue generating
30/60-minute reachability polygons; latest-departure searches return stop departure labels and do
not call the forward polygon generator.

For the first Phase 2 UI, display the latest departure at reachable stops and highlight the selected
destination. A reverse isochrone polygon is a separate enhancement because its walking-time
interpretation and legend differ from the existing forward polygons.

## UI and URL state

- Add a two-option segmented control: `Depart at` and `Arrive by`.
- In `Depart at`, retain the current origin, date, time, 30/60-minute layers, and copy.
- In `Arrive by`, search and select a destination, enter an arrival date and time, then show the
  latest departure for reachable stops and the selected stop details.
- Store `mode=depart|arrive` in the URL. Use `origin` for depart mode and `destination` for arrive
  mode; keep `date`, `time`, and `view` backward compatible.
- Treat URLs without `mode` as `depart` so existing shared links continue to work.
- Report the selected, previous, or next service-day layers used by the result. Keep the timetable
  disclaimer visible because the result does not include live delays.

Keyboard, focus, loading, empty, error, cancellation, narrow-screen, and reload-from-URL behavior
must match the Phase 1 controls.

## Verification

Implement and review Phase 2 in this order:

1. Service-layer type and next-day resolver with boundary tests.
2. Reverse trip selection, pattern scan, and inbound footpaths on small deterministic fixtures.
3. A brute-force reference search for property tests on generated small timetables.
4. `Query` worker protocol, cancellation, transfer, and error tests.
5. URL-state migration and arrive-by UI tests.
6. Real-feed CLI cases for an ordinary weekday, a holiday boundary, last bus, a trip after 24:00,
   and an impossible deadline.

Acceptance requires the latest-departure result to match hand-verified and brute-force results,
preserve every Phase 1 test, complete the real-data query within the existing 200 ms target on the
reference machine, and remain shareable and usable on desktop and mobile.

## Out of scope

Phase 2 does not include multi-agency routing, GTFS-RT, arbitrary map-point origins, a time slider,
fare rules, or guaranteed connections. Those remain Issues #27 through #30 or new focused issues.
