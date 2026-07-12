# Issue 19: Reachability polygon generation

## Current algorithm

The RAPTOR worker generates separate 30-minute and 60-minute GeoJSON layers after routing.
Each reached stop receives a 16-sided walking buffer with a radius of
`min(remaining minutes * 80m, 960m)`. Buffers that are exactly contained by a larger buffer are
removed, then `@turf/union` (polyclip-ts) merges the remaining buffers in hierarchical batches.

The worker response reports generation time for each layer and for both layers combined. On the
Nagoya City Bus snapshot (`2026-05-18T01:57:40.761365`), the representative Sakae weekday 08:00
query generated the 60-minute layer in 1,343ms on 2026-07-12. The output was a valid MultiPolygon
of about 35KB.

## Fallback design

If future, larger datasets exceed the 1.5-second target, use a 100m occupancy grid instead of
unioning every buffer:

1. Project reached stops to a local metric coordinate system and mark grid cells within each
   remaining-time radius.
2. Extract boundaries for the 30-minute and 60-minute masks with marching squares.
3. Convert rings back to WGS84, remove rings below a configured area threshold, and validate ring
   closure and winding before returning GeoJSON.
4. Keep the current Turf implementation as the correctness reference and compare containment and
   area error in tests.

This fallback should be implemented in a separate issue only when a supported target device or a
larger production dataset demonstrably misses the performance budget.
