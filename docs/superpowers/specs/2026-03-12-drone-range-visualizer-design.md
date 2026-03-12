# Drone Range Visualizer — Design Spec

## Overview

A browser-based interactive tool for comparing commercial and consumer drone operational ranges on a real map. Users click a location, and concentric circles show each drone's range radiating outward. A parallel coordinates chart on the right enables multi-dimensional spec comparison. Filters let users narrow by manufacturer, drone type, and range mode.

## Goals

- Visualize drone operational radius on a real map from any clicked location
- Compare drones across range, payload, recharge time, flight time, and MSRP
- Filter by manufacturer and drone type using multi-select dropdowns
- Toggle between one-way max range and round-trip operational radius
- No limit on simultaneous drone selections — color-coded with opacity management
- **Route feasibility**: enter start and end addresses to see which drones can make the round-trip

## Target Data

- **Scope**: Consumer, prosumer, and commercial/enterprise drones
- **Manufacturers**: DJI, Skydio, Autel, Parrot, Wingcopter, Zipline, senseFly, AgEagle, and others
- **Volume**: ~30-50 drone models
- **Source**: Web-researched from manufacturer spec sheets
- **MSRP**: Included where readily available, otherwise null

## Project Structure

```
drone-viz/
├── index.html
├── vite.config.js
├── package.json
├── src/
│   ├── main.js          # Entry point — init map, chart, filters, wire events
│   ├── map.js            # Leaflet map, circle rendering, SVG label overlays
│   ├── chart.js          # D3 parallel coordinates chart
│   ├── filters.js        # Multi-select dropdown components, filter state
│   ├── state.js          # Shared app state (selected drones, center, range mode)
│   ├── colors.js         # Manufacturer color palette
│   ├── route.js           # Route feasibility — geocoding, flight path, drone matching
│   └── style.css         # Dark theme, split layout, filter UI
├── data/
│   └── drones.json       # Static drone spec database
└── docs/
```

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Build | Vite | Fast dev server, zero-config |
| Language | Vanilla JS | No framework overhead needed |
| Map | Leaflet | Free, no API key, mature ecosystem |
| Charts | D3.js | Parallel coordinates, full control |
| Styling | CSS (custom) | Dark theme, split-screen layout |
| Data | Static JSON | `drones.json` baked into the build |
| Geocoding | Nominatim (OpenStreetMap) | Free, no API key, address → lat/lng |
| Routing | OSRM (Open Source Routing Machine) | Free, no API key, road-snapped routes via `router.project-osrm.org` |

## Layout

Split-screen design:
- **Left (70%)**: Leaflet map with concentric range circles
- **Right (30%)**: D3 parallel coordinates chart with selected drone tags

Filter bar sits above the map with:
- Manufacturer multi-select dropdown (checkbox list with chip tags)
- Drone Type multi-select dropdown (checkbox list with chip tags)
- Range Mode toggle (Round-trip / One-way)

## Data Schema

```json
{
  "id": "dji-mavic-3-pro",
  "name": "Mavic 3 Pro",
  "manufacturer": "DJI",
  "type": "prosumer",         // enum: "consumer", "prosumer", "enterprise", "delivery", "agricultural", "inspection"
  "maxRangeKm": 28,
  "operationalRadiusKm": 14,  // independently sourced, NOT always maxRangeKm/2 (varies by payload, wind profile, battery curve)
  "maxPayloadKg": 0.25,
  "rechargeTimeMin": 96,
  "flightTimeMin": 43,
  "msrp": 2199,
  "msrpNote": "Fly More Combo",
  "weightKg": 0.958,
  "year": 2023,
  "specsUrl": "https://..."
}
```

**Nullable fields**: `msrp`, `msrpNote`, `maxPayloadKg`, `specsUrl`. Drone still renders on all non-null dimensions.

Fields `weightKg`, `year`, and `specsUrl` are metadata — they appear in the hover tooltip but are not charted or filtered.

## Drone Selection Model

Filtering and individual selection are separate layers:

1. **Filters** (manufacturer, type) determine the **visible pool** of drones
2. Within the visible pool, **all drones are shown** on the chart and map by default
3. Users can **click a drone's line** on the parallel coordinates chart or **click a circle** on the map to toggle individual drone highlighting
4. Highlighted drones get full opacity; non-highlighted visible drones fade to 30%
5. If no individual drones are highlighted, all visible drones render at full opacity (no highlight mode)
6. **Drone tags** (colored chips) appear below the chart for individually highlighted drones. Click × to de-highlight.

## Map Behavior

1. **Click anywhere** on the map to set center point (blue pin marker)
2. Concentric circles animate outward from the center — one circle per selected drone
3. Circle radius = `operationalRadiusKm` (round-trip mode) or `maxRangeKm` (one-way mode)
4. Each circle is color-coded by manufacturer with 15% fill opacity, 60% border opacity
5. **Drone name + range** rendered along the top arc of each circle using a custom Leaflet SVG overlay (`L.SVGOverlay` or `L.layerGroup` with SVG text paths). Each circle is an `L.circle` for geo-accurate radius; the label is a separate SVG overlay positioned on the circle's north arc.
6. Smallest circles render on top (z-order)
7. Hover a circle → tooltip with drone name, range, payload, flight time, weight, year
8. When zoomed out past zoom level 8, arc labels collapse to manufacturer initials (e.g., "DJI" instead of "DJI Mavic 3 Pro — 14km"); hover to expand

## Route Feasibility Mode

A second interaction mode alongside the radius visualizer. Users enter two addresses to see which drones can complete the flight.

### UI

A collapsible panel below the filter bar with:
- **Start address** text input with autocomplete (geocoded via Nominatim)
- **End address** text input with autocomplete
- **"Check Route"** button
- **Results panel**: sorted list of drones showing feasibility status

### Behavior

1. User enters start and end addresses → geocoded to lat/lng via Nominatim (OpenStreetMap, free, no API key)
2. Route fetched from OSRM (`router.project-osrm.org/route/v1/driving/`) which returns a road-following polyline and total distance
3. The drone flight path is **loosely snapped to the road** — the OSRM polyline represents the road corridor, and the drone follows it with a max deviation of **1 mile (1.6 km)** from paved road. The route distance used for feasibility is the **OSRM road distance**, not straight-line haversine, since the drone must stay within the road corridor.
4. Round-trip distance = 2 × one-way road distance
5. Map draws:
   - **Start pin** (green) and **End pin** (red)
   - **Road-snapped polyline** (solid white line following OSRM route geometry)
   - **1-mile buffer zone** rendered as a semi-transparent corridor around the route polyline (the drone's allowed deviation envelope)
   - **Distance label** at midpoint (e.g., "148 km road distance / 296 km round-trip")
   - **Straight-line distance** shown in smaller text for reference (e.g., "130 km as-the-crow-flies")
6. Each visible drone is evaluated:
   - **Green check**: `operationalRadiusKm × 2 >= round-trip road distance` (can do round-trip along road)
   - **Yellow warning**: `maxRangeKm >= one-way road distance` but can't round-trip (one-way only)
   - **Red X**: `maxRangeKm < one-way road distance` (can't reach destination even one-way)
7. Results panel shows all visible drones sorted: green first, then yellow, then red. Each row shows drone name, manufacturer color dot, range, and surplus/deficit km.
8. The concentric circles from radius mode remain visible (centered on start pin) so the user can see range context alongside the route.

### Route + Radius Interaction

- When a route is active, the **center point** auto-sets to the start address
- Concentric circles render from the start pin, so the user sees which drones' circles encompass the end pin
- Clearing the route (× button) returns to click-to-set-center mode

### Edge Cases

| Scenario | Behavior |
|---------|----------|
| Address not found | Show inline error: "Could not find that address. Try a more specific query." |
| Same start and end | Show info: "Start and end are the same location. Distance: 0 km. All drones can make this trip." |
| Very long route (>500km) | All drones likely red. Show note: "This route exceeds all known drone ranges." |
| Nominatim rate limit | Nominatim allows 1 req/sec. Debounce autocomplete to 1 second. Show spinner during geocoding. |
| OSRM route not found | No road connection (e.g., across ocean). Show error: "No road route found between these locations." Fall back to straight-line with a note. |
| OSRM service down | Fall back to haversine straight-line distance. Show warning: "Road routing unavailable — showing straight-line distance." |

## Parallel Coordinates Chart

- **Axes**: Range (km), Payload (kg), Recharge Time (min), Flight Time (min), MSRP ($)
- Each drone is a polyline threading through all axes
- Color matches the drone's manufacturer color on the map
- Within a manufacturer, individual drones use different dash patterns (solid, dashed, dotted)
- **Axis brushing**: Drag a range on any axis to filter (e.g., only drones with >10km range)
- Null values on an axis → polyline draws a straight segment connecting the two neighboring non-null axes, skipping the null axis. If the last axis (MSRP) is null, the line ends at the previous axis.

## Filter System

### Multi-Select Dropdowns
- Checkbox list with model count per option
- Selected items shown as colored chip tags with × remove button
- "Select All / Clear" shortcuts at top of each dropdown

### Filter Logic
```
visibleDrones = drones.filter(d =>
  (selectedManufacturers.length === 0 || selectedManufacturers.includes(d.manufacturer))
  && (selectedTypes.length === 0 || selectedTypes.includes(d.type))
)
```
- Empty filter = show all for that dimension
- Both empty = all drones visible

### Range Toggle
- **Round-trip** (default): Uses `operationalRadiusKm` — realistic return radius
- **One-way**: Uses `maxRangeKm` — maximum distance before battery dies
- Toggle scales all map circles and updates the Range axis on the chart

## Color System

Each manufacturer gets a stable color from a 10-color palette:

| Manufacturer | Color |
|-------------|-------|
| DJI | `#ff6b6b` (red) |
| Skydio | `#4ecdc4` (teal) |
| Autel | `#ffd166` (yellow) |
| Parrot | `#a29bfe` (purple) |
| Wingcopter | `#ff9a8b` (salmon) |
| Zipline | `#81ecec` (cyan) |
| senseFly | `#fdcb6e` (gold) |
| AgEagle | `#6c5ce7` (indigo) |

Within a manufacturer, drones differ by line dash pattern on chart and opacity variation on map circles.

## Cross-Highlighting

| Action | Map Effect | Chart Effect |
|--------|-----------|-------------|
| Hover circle on map | Circle brightens, pulse | Corresponding line goes bold, others fade to 20% |
| Hover line on chart | Others fade | Corresponding circle brightens + pulse |
| Click drone tag (×) | Circle removed | Line removed |
| Brush axis on chart | Non-matching circles fade to 5% fill / 20% border | Lines outside brush range fade to 10% opacity |

## Edge Cases

| Scenario | Behavior |
|---------|----------|
| No center selected | Map shows prompt: "Click anywhere to set your location." Chart still functional. |
| No drones match filters | Map clears circles. Chart shows: "No drones match your filters." |
| Many overlapping circles | 15% fill opacity layers gracefully. Hovered ring → full opacity + thick border. Smallest on top. |
| Missing MSRP/payload | Show "N/A" in tooltip. Omit from chart axis. Drone still visible on other dimensions. |

## Initial State

On first load:
- Both filter dropdowns are empty → all drones visible (per "empty = all" rule)
- Map centered on continental US (lat 39.8, lng -98.5, zoom 4)
- No center pin set — map shows prompt: "Click anywhere to set your location"
- Parallel coordinates chart renders all drones immediately (chart works without a map pin)
- Range mode defaults to Round-trip

## Deployment

Static Vite build served locally during development (`vite dev`). No hosting target for v1 — local tool only.

## Out of Scope

- Real-time drone tracking or telemetry
- User accounts or saved comparisons
- Backend API — all data is static JSON
- Terrain/wind modeling affecting range
- 3D visualization
- Mobile/responsive layout (desktop-first, v1 only)
- Accessibility (color-blind palette, keyboard nav) — future enhancement
