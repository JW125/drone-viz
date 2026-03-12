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
  "category": "camera",
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

## Map Behavior

1. **Click anywhere** on the map to set center point (blue pin marker)
2. Concentric circles animate outward from the center — one circle per selected drone
3. Circle radius = `operationalRadiusKm` (round-trip mode) or `maxRangeKm` (one-way mode)
4. Each circle is color-coded by manufacturer with 15% fill opacity, 60% border opacity
5. **Drone name + range** rendered along the top arc of each circle via SVG text path
6. Smallest circles render on top (z-order)
7. Hover a circle → tooltip with drone name, range, payload, flight time
8. When zoomed out and labels overlap, collapse to manufacturer initials; hover to expand

## Parallel Coordinates Chart

- **Axes**: Range (km), Payload (kg), Recharge Time (min), Flight Time (min), MSRP ($)
- Each drone is a polyline threading through all axes
- Color matches the drone's manufacturer color on the map
- Within a manufacturer, individual drones use different dash patterns (solid, dashed, dotted)
- **Axis brushing**: Drag a range on any axis to filter (e.g., only drones with >10km range)
- Null values on an axis → line skips that axis segment

## Filter System

### Multi-Select Dropdowns
- Checkbox list with model count per option
- Selected items shown as colored chip tags with × remove button
- "Select All / Clear" shortcuts at top of each dropdown

### Filter Logic
- Manufacturer AND Type combined: `selected_manufacturers ∩ selected_types`
- Shows drones matching ANY selected manufacturer AND ANY selected type
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
| Brush axis on chart | Circles for non-matching drones fade | Lines outside brush range fade |

## Edge Cases

| Scenario | Behavior |
|---------|----------|
| No center selected | Map shows prompt: "Click anywhere to set your location." Chart still functional. |
| No drones match filters | Map clears circles. Chart shows: "No drones match your filters." |
| Many overlapping circles | 15% fill opacity layers gracefully. Hovered ring → full opacity + thick border. Smallest on top. |
| Missing MSRP/payload | Show "N/A" in tooltip. Omit from chart axis. Drone still visible on other dimensions. |
| Mobile/narrow viewport | Stack vertically — map on top, chart below. Filter bar collapses to hamburger. |

## Out of Scope

- Real-time drone tracking or telemetry
- User accounts or saved comparisons
- Backend API — all data is static JSON
- Terrain/wind modeling affecting range
- 3D visualization
