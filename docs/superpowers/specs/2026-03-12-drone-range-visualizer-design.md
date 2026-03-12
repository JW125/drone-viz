# Drone Range Visualizer — Design Spec

## Overview

A browser-based interactive tool for comparing commercial and consumer drone operational ranges on a real map. Users click a location, and concentric circles show each drone's range radiating outward. A parallel coordinates chart on the right enables multi-dimensional spec comparison. Filters let users narrow by manufacturer, drone type, and range mode.

## Goals

- Visualize drone operational radius on a real map from any clicked location
- Compare drones across range, payload, recharge time, flight time, and MSRP
- Filter by manufacturer and drone type using multi-select dropdowns
- Toggle between one-way max range and round-trip operational radius
- No limit on simultaneous drone selections — color-coded with opacity management

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

## Layout

Split-screen design:
- **Left (60%)**: Leaflet map with concentric range circles
- **Right (40%)**: D3 parallel coordinates chart with selected drone tags

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
  "type": "prosumer",
  "maxRangeKm": 28,
  "operationalRadiusKm": 14,
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

## Map Behavior

1. **Click anywhere** on the map to set center point (blue pin marker)
2. Concentric circles animate outward from the center — one circle per selected drone
3. Circle radius = `operationalRadiusKm` (round-trip mode) or `maxRangeKm` (one-way mode)
4. Each circle is color-coded by manufacturer with 15% fill opacity, 60% border opacity
5. **Drone name + range** rendered along the top arc of each circle using a custom Leaflet SVG overlay (`L.SVGOverlay` or `L.layerGroup` with SVG text paths). Each circle is an `L.circle` for geo-accurate radius; the label is a separate SVG overlay positioned on the circle's north arc.
6. Smallest circles render on top (z-order)
7. Hover a circle → tooltip with drone name, range, payload, flight time, weight, year
8. When zoomed out past zoom level 8, arc labels collapse to manufacturer initials (e.g., "DJI" instead of "DJI Mavic 3 Pro — 14km"); hover to expand

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
