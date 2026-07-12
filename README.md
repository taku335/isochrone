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
