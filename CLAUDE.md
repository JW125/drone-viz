# Drone Range Visualizer

## Project

Interactive web app for visualizing drone operational ranges on a real map with structure overlays, business plotting, and route feasibility analysis.

- **GitHub**: https://github.com/JW125/drone-viz
- **Live**: https://jw125.github.io/drone-viz/
- **Local dev**: `npx vite` → http://localhost:5173

## Stack

- **Vite 8** — build tool and dev server
- **Vanilla JS (ES modules)** — no framework
- **Leaflet** — map (CartoDB light_all tiles, Esri satellite)
- **D3.js** — parallel coordinates chart
- **Nominatim** — geocoding (structured address parsing, US bias, map viewbox bias)
- **OSRM** — road routing
- **Overpass API** — business data (grocery, pharmacy, hardware)
- **NH GRANIT ArcGIS REST API** — structure/parcel data for NH towns

## File Structure

```
src/
  main.js        — entry point, loads data, inits modules
  map.js         — Leaflet map, range circles, hover/click (single mousemove, no per-circle events)
  state.js       — centralized state with pub/sub
  filters.js     — manufacturer/type dropdowns, range mode toggle
  chart.js       — D3 parallel coordinates
  route.js       — route feasibility (Nominatim + OSRM)
  placement.js   — drone placement modal + multi-place mode
  overlays.js    — satellite toggle, structure overlay, business overlay
  colors.js      — manufacturer color palette
  style.css      — dark theme styles
public/
  drones.json           — 44 drone models, 8 manufacturers
  {town}-structures.json — 76 NH towns + 20 ME towns (ME towns are label-only, empty structures)
```

## Key Conventions

- All map circles are `interactive: false` — hover is handled by a single `map.on('mousemove')`
- Fetch paths use `import.meta.env.BASE_URL` prefix for GitHub Pages compatibility
- Maine towns with same name as NH towns use `-me` suffix (e.g., `bethel-me`, `hanover-me`)
- Structure data: NH GRANIT `nhgeodata.unh.edu` with SLU codes. Maine data is unavailable (no land use classification).

## Deploy to GitHub Pages

1. Ensure `vite.config.js` has `base: '/drone-viz/'`
2. `npx vite build`
3. `git stash && git checkout gh-pages`
4. Copy `dist/*` to repo root (overwrite `index.html`, `assets/`, keep structure JSONs)
5. `git add -A && git commit -m "Deploy" && git push origin gh-pages --force`
6. `git checkout master && git stash pop`

## Adding Drones

Edit `public/drones.json`. Each drone needs: `id`, `name`, `manufacturer`, `type`, `operationalRadiusKm`, `maxRangeKm`, `maxPayloadKg`, `flightTimeMin`, `weightKg`, `msrp`.

## Adding Towns

1. Query NH GRANIT: `nhgeodata.unh.edu/nhgeodata/rest/services/CAD/ParcelMosaic/MapServer/0/query` with `Town='{name}'&outSR=4326`
2. Generate `{town}-structures.json` with center, structures array, legend, categories
3. Add `<option>` to town dropdown in `index.html`
4. For label-only towns (no data): create JSON with empty `structures: []`
