# Phase 2: latest-departure search

This document is the implementation record and contract for Issue #26. Phase 2 answers this question:

> What is the latest time I can leave each stop and still arrive at the selected destination by a
> given deadline?

It extends the Phase 1 timetable, service-day, worker, and stop-search infrastructure. It does not
add rail, other bus operators, live delays, or a server-side journey planner.

## Implemented components

Phase 2 extends the Phase 1 components without changing existing shared links or forward results:

- `packages/raptor/src/core.ts` accepts the `Query` discriminated union and returns direction-specific
  typed-array results.
- Reverse routing has direction-specific pattern queuing, trip selection, timetable scanning, and
  inbound footpath relaxation. Forward routing remains unchanged.
- `resolveReverseServiceLayers` returns the selected service day and next service day with offsets
  `0` and `-1440`.
- Worker requests and responses are discriminated by search kind, preserve cancellation, and skip
  forward polygon generation for reverse results.
- The web app provides `Depart at` and `Arrive by` modes, shareable URL state, and labeled
  latest-departure stop points.

## Engine contract

The public request remains the discriminated union:

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

The reverse result does not overload the meaning of `arrival`:

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

Latest-departure routing uses the directionally symmetric RAPTOR scan:

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

`ServiceLayer.minuteOffset` is `-1440 | 0 | 1440`, with direction-specific resolvers:

- Forward: selected date at `0`, previous date at `+1440`.
- Reverse: selected date at `0`, next date at `-1440`.

Continue converting a trip-local minute to the query timeline with
`globalMinute = localMinute - minuteOffset`. Resolve `calendar` and `calendar_dates` against each
layer's own service date. At the feed boundary, return an empty adjacent layer rather than reading
outside the published service period.

Required service-day tests cover the next-day layer, a trip past 24:00, weekday-to-holiday and
holiday-to-weekday boundaries, added and removed exceptions, and both ends of the feed period.

## Worker and result processing

The worker query payload is `Query` and responses are discriminated by search kind. Request
cancellation and transferable typed arrays are preserved. Forward searches continue generating
30/60-minute reachability polygons; latest-departure searches return stop departure labels and do
not call the forward polygon generator.

The Phase 2 UI displays the latest departure at reachable stops and highlights the selected
destination. A reverse isochrone polygon remains a separate enhancement because its walking-time
interpretation and legend differ from the existing forward polygons.

## UI and URL state

- A two-option segmented control switches between `Depart at` and `Arrive by`.
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

Phase 2 was implemented and reviewed in this order:

1. Service-layer type and next-day resolver with boundary tests.
2. Reverse trip selection, pattern scan, and inbound footpaths on small deterministic fixtures.
3. A brute-force reference search for property tests on generated small timetables.
4. `Query` worker protocol, cancellation, transfer, and error tests.
5. URL-state migration and arrive-by UI tests.
6. Real-feed CLI cases for an ordinary weekday, a holiday boundary, last bus, a trip after 24:00,
   and an impossible deadline.

The latest-departure result matches fixture brute-force and real-feed forward-boundary checks. A
real `栄` 23:30 deadline query reached 3,884 stops with a median runtime of about 2.55 ms on the
reference machine, below the 200 ms target. Phase 1 tests remain green, and 390px mobile and 1200px
desktop layouts have no horizontal overflow or overlapping controls.

## Out of scope

Phase 2 does not include multi-agency routing, GTFS-RT, arbitrary map-point origins, a time slider,
fare rules, or guaranteed connections. Those remain Issues #27 through #30 or new focused issues.
