# Drone Range Visualizer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive split-screen web app where users click a map location to see concentric drone range circles, compare specs via parallel coordinates, and check route feasibility between two addresses.

**Architecture:** Vanilla JS + Vite app. Leaflet map (left 70%) renders concentric `L.circle` overlays with SVG arc labels. D3.js parallel coordinates chart (right 30%) shows multi-dimensional spec comparison. Shared reactive state module drives both views. Route feasibility uses Nominatim geocoding + OSRM road routing. Static JSON drone database.

**Tech Stack:** Vite, Vanilla JS (ES modules), Leaflet, D3.js, Nominatim, OSRM, CSS Grid

**Spec:** `docs/superpowers/specs/2026-03-12-drone-range-visualizer-design.md`

---

## Chunk 1: Project Scaffold, Data, and State

### Task 1: Vite Project Setup

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `src/main.js`
- Create: `src/style.css`

- [ ] **Step 1: Initialize project**

```bash
cd /Users/jeffrywhite/Documents/drone-viz
npm init -y
npm install vite --save-dev
npm install leaflet d3
```

- [ ] **Step 2: Create vite.config.js**

```js
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
});
```

- [ ] **Step 3: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Drone Range Visualizer</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="/src/style.css" />
</head>
<body>
  <div id="app">
    <div id="filter-bar"></div>
    <div id="main-content">
      <div id="map-container">
        <div id="map"></div>
        <div id="map-prompt">Click anywhere on the map to set your location</div>
      </div>
      <div id="chart-container">
        <div id="chart-header">Spec Comparison</div>
        <div id="parallel-chart"></div>
        <div id="drone-tags"></div>
      </div>
    </div>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create base CSS with dark theme and split layout**

```css
/* src/style.css */
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg-primary: #0f0f23;
  --bg-secondary: #16213e;
  --bg-surface: #1a1a2e;
  --text-primary: #e0e0e0;
  --text-secondary: #888;
  --text-muted: #555;
  --accent: #4a9eff;
  --border: #333;
}

html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg-primary); color: var(--text-primary); }

#app { display: flex; flex-direction: column; height: 100vh; }

#filter-bar {
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  padding: 10px 16px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
  z-index: 10;
}

#main-content { display: flex; flex: 1; overflow: hidden; }

#map-container {
  flex: 7;
  position: relative;
}

#map { width: 100%; height: 100%; }

#map-prompt {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--text-secondary);
  font-size: 16px;
  pointer-events: none;
  z-index: 400;
  background: rgba(0,0,0,0.6);
  padding: 12px 24px;
  border-radius: 8px;
}

#chart-container {
  flex: 3;
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
  overflow-y: auto;
}

#chart-header {
  color: var(--text-secondary);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 16px 16px 8px;
}

#parallel-chart { flex: 1; padding: 0 8px; min-height: 300px; }

#drone-tags {
  padding: 12px 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-top: 1px solid var(--border);
}

/* Leaflet overrides for dark theme */
.leaflet-container { background: #0f0f23; }
.leaflet-tile-pane { filter: brightness(0.7) contrast(1.1) saturate(0.8); }
```

- [ ] **Step 5: Create minimal main.js entry point**

```js
// src/main.js
import './style.css';

console.log('Drone Range Visualizer loaded');
```

- [ ] **Step 6: Add scripts to package.json and verify dev server starts**

Add to package.json scripts:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

Run: `npm run dev`
Expected: Vite dev server starts, page loads with dark split layout at http://localhost:5173

- [ ] **Step 7: Commit**

```bash
git add package.json vite.config.js index.html src/main.js src/style.css
git commit -m "feat: scaffold Vite project with dark split-screen layout"
```

---

### Task 2: Drone Data JSON

**Files:**
- Create: `public/drones.json`

- [ ] **Step 1: Research and compile drone data**

Use web search to gather specs for ~30-50 drones across consumer, prosumer, and commercial/enterprise categories. For each drone, collect: name, manufacturer, type, maxRangeKm, operationalRadiusKm, maxPayloadKg, rechargeTimeMin, flightTimeMin, msrp (where available), weightKg, year.

Target manufacturers: DJI, Skydio, Autel, Parrot, Wingcopter, Zipline, senseFly, AgEagle, and others.

- [ ] **Step 2: Create public/drones.json**

Write the compiled drone data as a JSON array. Each entry follows the schema from the spec. Use `null` for unknown MSRP, payload, or other nullable fields. Ensure `operationalRadiusKm` is independently sourced where possible (not just maxRange/2).

Example structure:
```json
[
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
    "specsUrl": null
  }
]
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "const d = require('./public/drones.json'); console.log(d.length + ' drones loaded'); const mfrs = [...new Set(d.map(x=>x.manufacturer))]; console.log('Manufacturers:', mfrs.join(', '));"`
Expected: "30+ drones loaded" and list of manufacturers

- [ ] **Step 4: Commit**

```bash
git add public/drones.json
git commit -m "feat: add drone spec database with 30+ models"
```

---

### Task 3: State Management Module

**Files:**
- Create: `src/state.js`
- Create: `src/colors.js`

- [ ] **Step 1: Create colors.js with manufacturer palette**

```js
// src/colors.js
const MANUFACTURER_COLORS = {
  'DJI': '#ff6b6b',
  'Skydio': '#4ecdc4',
  'Autel': '#ffd166',
  'Parrot': '#a29bfe',
  'Wingcopter': '#ff9a8b',
  'Zipline': '#81ecec',
  'senseFly': '#fdcb6e',
  'AgEagle': '#6c5ce7',
};

const FALLBACK_COLORS = ['#e17055', '#00b894', '#0984e3', '#d63031', '#6c5ce7', '#fdcb6e', '#e84393', '#00cec9'];
let fallbackIndex = 0;

export function getManufacturerColor(manufacturer) {
  if (MANUFACTURER_COLORS[manufacturer]) return MANUFACTURER_COLORS[manufacturer];
  if (!MANUFACTURER_COLORS[manufacturer]) {
    MANUFACTURER_COLORS[manufacturer] = FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
    fallbackIndex++;
  }
  return MANUFACTURER_COLORS[manufacturer];
}

export function getAllManufacturerColors() {
  return { ...MANUFACTURER_COLORS };
}
```

- [ ] **Step 2: Create state.js with reactive state**

```js
// src/state.js
const listeners = [];

const state = {
  drones: [],                    // full drone dataset
  selectedManufacturers: [],     // filter: selected manufacturer names
  selectedTypes: [],             // filter: selected type names
  rangeMode: 'roundtrip',       // 'roundtrip' or 'oneway'
  center: null,                  // { lat, lng } or null
  highlightedDroneIds: new Set(), // individually highlighted drones
  hoveredDroneId: null,          // currently hovered drone id
  brushRanges: {},               // { axisKey: [min, max] } for axis brushing on parallel coords
  route: null,                   // { start: {lat,lng,label}, end: {lat,lng,label}, polyline: [[lat,lng],...], roadDistanceKm: number, straightLineKm: number } or null
};

export function getState() {
  return state;
}

export function setState(updates) {
  Object.assign(state, updates);
  listeners.forEach(fn => fn(state));
}

export function subscribe(fn) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx > -1) listeners.splice(idx, 1);
  };
}

export function getVisibleDrones() {
  const { drones, selectedManufacturers, selectedTypes } = state;
  return drones.filter(d =>
    (selectedManufacturers.length === 0 || selectedManufacturers.includes(d.manufacturer))
    && (selectedTypes.length === 0 || selectedTypes.includes(d.type))
  );
}

export function getDroneRange(drone) {
  return state.rangeMode === 'roundtrip' ? drone.operationalRadiusKm : drone.maxRangeKm;
}

export function isHighlighted(droneId) {
  return state.highlightedDroneIds.size === 0 || state.highlightedDroneIds.has(droneId);
}

export function passesBrushFilter(drone) {
  const { brushRanges, rangeMode } = state;
  const accessors = {
    range: d => rangeMode === 'roundtrip' ? d.operationalRadiusKm : d.maxRangeKm,
    maxPayloadKg: d => d.maxPayloadKg,
    rechargeTimeMin: d => d.rechargeTimeMin,
    flightTimeMin: d => d.flightTimeMin,
    msrp: d => d.msrp,
  };
  for (const [axisKey, [min, max]] of Object.entries(brushRanges)) {
    const val = accessors[axisKey]?.(drone);
    if (val != null && (val < min || val > max)) return false;
  }
  return true;
}

export function toggleHighlight(droneId) {
  const ids = new Set(state.highlightedDroneIds);
  if (ids.has(droneId)) {
    ids.delete(droneId);
  } else {
    ids.add(droneId);
  }
  setState({ highlightedDroneIds: ids });
}
```

- [ ] **Step 3: Verify modules import correctly**

Update `src/main.js`:
```js
import './style.css';
import { getState, setState, subscribe, getVisibleDrones } from './state.js';
import { getManufacturerColor } from './colors.js';

async function init() {
  const response = await fetch('/drones.json');
  const drones = await response.json();
  setState({ drones });
  console.log(`Loaded ${drones.length} drones`);
  console.log('Visible:', getVisibleDrones().length);
  console.log('DJI color:', getManufacturerColor('DJI'));
}

init();
```

Run: `npm run dev` and check browser console
Expected: "Loaded XX drones", "Visible: XX", "DJI color: #ff6b6b"

- [ ] **Step 4: Commit**

```bash
git add src/state.js src/colors.js src/main.js
git commit -m "feat: add state management and manufacturer color palette"
```

---

## Chunk 2: Leaflet Map with Concentric Circles

### Task 4: Leaflet Map Initialization

**Files:**
- Modify: `src/main.js`
- Create: `src/map.js`

- [ ] **Step 1: Create map.js with Leaflet initialization**

```js
// src/map.js
import L from 'leaflet';
import { getState, setState, subscribe, getVisibleDrones, getDroneRange, isHighlighted, passesBrushFilter } from './state.js';
import { getManufacturerColor } from './colors.js';

let map;
let circleLayer;
let labelLayer;
let centerMarker;

export function initMap(containerId) {
  map = L.map(containerId, {
    center: [39.8, -98.5],
    zoom: 4,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19,
  }).addTo(map);

  circleLayer = L.layerGroup().addTo(map);
  labelLayer = L.layerGroup().addTo(map);

  map.on('click', (e) => {
    const { route } = getState();
    if (route) return; // don't override center when route is active
    setState({ center: { lat: e.latlng.lat, lng: e.latlng.lng } });
    document.getElementById('map-prompt').style.display = 'none';
  });

  subscribe((state) => {
    renderCircles();
  });

  map.on('zoomend', renderCircles);

  return map;
}

function renderCircles() {
  circleLayer.clearLayers();
  labelLayer.clearLayers();

  const { center, hoveredDroneId } = getState();
  if (!center) return;

  // Update center marker
  if (centerMarker) centerMarker.remove();
  centerMarker = L.circleMarker([center.lat, center.lng], {
    radius: 6,
    fillColor: '#4a9eff',
    fillOpacity: 1,
    color: '#fff',
    weight: 2,
  }).addTo(map);

  const visible = getVisibleDrones();
  // Sort by range descending so smallest circles render on top
  const sorted = [...visible].sort((a, b) => getDroneRange(b) - getDroneRange(a));

  sorted.forEach(drone => {
    const rangeKm = getDroneRange(drone);
    const color = getManufacturerColor(drone.manufacturer);
    const highlighted = isHighlighted(drone.id);
    const hovered = hoveredDroneId === drone.id;

    const brushed = passesBrushFilter(drone);
    const fillOpacity = hovered ? 0.25 : (!brushed ? 0.02 : (highlighted ? 0.15 : 0.03));
    const borderOpacity = hovered ? 1 : (!brushed ? 0.1 : (highlighted ? 0.6 : 0.15));
    const weight = hovered ? 3 : 2;

    const circle = L.circle([center.lat, center.lng], {
      radius: rangeKm * 1000,
      color: color,
      fillColor: color,
      fillOpacity: fillOpacity,
      opacity: borderOpacity,
      weight: weight,
    });

    circle.on('mouseover', () => setState({ hoveredDroneId: drone.id }));
    circle.on('mouseout', () => setState({ hoveredDroneId: null }));
    circle.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      import('./state.js').then(mod => mod.toggleHighlight(drone.id));
    });

    circle.bindTooltip(buildTooltip(drone, rangeKm), {
      sticky: true,
      className: 'drone-tooltip',
    });

    circleLayer.addLayer(circle);

    // Arc label
    const zoom = map.getZoom();
    const label = zoom > 8
      ? `${drone.name} — ${rangeKm}km`
      : drone.manufacturer;

    const labelMarker = L.marker(
      getArcLabelPosition(center, rangeKm),
      {
        icon: L.divIcon({
          className: 'arc-label',
          html: `<span style="color:${color};opacity:${highlighted ? 0.8 : 0.3}">${label}</span>`,
          iconSize: [0, 0],
        }),
        interactive: false,
      }
    );
    labelLayer.addLayer(labelMarker);
  });
}

function getArcLabelPosition(center, rangeKm) {
  // Place label at the north point of the circle
  const earthRadius = 6371;
  const dLat = rangeKm / earthRadius;
  const lat = center.lat + (dLat * 180 / Math.PI);
  return [lat, center.lng];
}

function buildTooltip(drone, rangeKm) {
  const mode = getState().rangeMode === 'roundtrip' ? 'round-trip' : 'one-way max';
  let html = `<strong style="color:${getManufacturerColor(drone.manufacturer)}">${drone.name}</strong><br>`;
  html += `${drone.manufacturer} · ${drone.type}<br>`;
  html += `Range: ${rangeKm} km (${mode})<br>`;
  if (drone.maxPayloadKg != null) html += `Payload: ${drone.maxPayloadKg} kg<br>`;
  html += `Flight time: ${drone.flightTimeMin} min<br>`;
  html += `Weight: ${drone.weightKg} kg · ${drone.year}`;
  if (drone.msrp != null) html += `<br>MSRP: $${drone.msrp.toLocaleString()}`;
  if (drone.specsUrl) html += `<br><a href="${drone.specsUrl}" target="_blank" style="color:var(--accent)">Specs →</a>`;
  return html;
}

export function getMap() { return map; }
```

- [ ] **Step 2: Add tooltip CSS to style.css**

Append to `src/style.css`:
```css
/* Tooltips */
.drone-tooltip {
  background: rgba(0,0,0,0.9) !important;
  border: 1px solid var(--border) !important;
  color: var(--text-primary) !important;
  font-size: 12px !important;
  line-height: 1.5 !important;
  border-radius: 6px !important;
  padding: 8px 12px !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
}
.drone-tooltip::before { border-right-color: rgba(0,0,0,0.9) !important; }

/* Arc labels */
.arc-label {
  font-family: monospace;
  font-size: 11px;
  white-space: nowrap;
  pointer-events: none;
}
```

- [ ] **Step 3: Wire map into main.js**

Update `src/main.js`:
```js
import './style.css';
import { setState } from './state.js';
import { initMap } from './map.js';

async function init() {
  const response = await fetch('/drones.json');
  const drones = await response.json();
  setState({ drones });

  initMap('map');
}

init();
```

- [ ] **Step 4: Verify map loads and circles render on click**

Run: `npm run dev`
Expected: Dark map loads centered on US. Click anywhere → concentric circles appear for all drones, colored by manufacturer. Hover circles → tooltip appears. Zoom in/out → labels switch between full name and initials at zoom 8.

- [ ] **Step 5: Commit**

```bash
git add src/map.js src/main.js src/style.css
git commit -m "feat: add Leaflet map with concentric range circles and tooltips"
```

---

## Chunk 3: Filter System

### Task 5: Multi-Select Filter Dropdowns

**Files:**
- Create: `src/filters.js`
- Modify: `src/main.js`
- Modify: `src/style.css`

- [ ] **Step 1: Create filters.js with multi-select dropdown component**

```js
// src/filters.js
import { getState, setState, subscribe } from './state.js';
import { getManufacturerColor } from './colors.js';

export function initFilters(containerId) {
  const container = document.getElementById(containerId);

  container.innerHTML = `
    <div class="filter-group" id="manufacturer-filter">
      <label class="filter-label">Manufacturer</label>
      <div class="multi-select" data-filter="manufacturer">
        <div class="selected-chips"></div>
        <div class="dropdown-toggle">Select...</div>
        <div class="dropdown-menu hidden"></div>
      </div>
    </div>
    <div class="filter-group" id="type-filter">
      <label class="filter-label">Drone Type</label>
      <div class="multi-select" data-filter="type">
        <div class="selected-chips"></div>
        <div class="dropdown-toggle">Select...</div>
        <div class="dropdown-menu hidden"></div>
      </div>
    </div>
    <div class="filter-group" id="range-toggle">
      <label class="filter-label">Range Mode</label>
      <div class="toggle-buttons">
        <button class="toggle-btn active" data-mode="roundtrip">Round-trip</button>
        <button class="toggle-btn" data-mode="oneway">One-way</button>
      </div>
    </div>
  `;

  setupMultiSelect('manufacturer');
  setupMultiSelect('type');
  setupRangeToggle();
  subscribe(renderChips);
}

function setupMultiSelect(filterKey) {
  const wrapper = document.querySelector(`.multi-select[data-filter="${filterKey}"]`);
  const toggle = wrapper.querySelector('.dropdown-toggle');
  const menu = wrapper.querySelector('.dropdown-menu');

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close other menus
    document.querySelectorAll('.dropdown-menu').forEach(m => {
      if (m !== menu) m.classList.add('hidden');
    });
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) populateMenu(filterKey, menu);
  });

  document.addEventListener('click', () => menu.classList.add('hidden'));
  menu.addEventListener('click', (e) => e.stopPropagation());
}

function populateMenu(filterKey, menu) {
  const { drones } = getState();
  const stateKey = filterKey === 'manufacturer' ? 'selectedManufacturers' : 'selectedTypes';
  const selected = getState()[stateKey];

  const values = [...new Set(drones.map(d => d[filterKey]))].sort();
  const counts = {};
  values.forEach(v => {
    counts[v] = drones.filter(d => d[filterKey] === v).length;
  });

  let html = `<div class="dropdown-actions">
    <button class="dropdown-action" data-action="all">Select All</button>
    <button class="dropdown-action" data-action="clear">Clear</button>
  </div>`;

  values.forEach(value => {
    const checked = selected.includes(value) ? 'checked' : '';
    const colorDot = filterKey === 'manufacturer'
      ? `<span class="color-dot" style="background:${getManufacturerColor(value)}"></span>`
      : '';
    html += `<label class="dropdown-item">
      <input type="checkbox" value="${value}" ${checked} />
      ${colorDot}
      <span class="item-name">${value}</span>
      <span class="item-count">${counts[value]}</span>
    </label>`;
  });

  menu.innerHTML = html;

  // Bind checkboxes
  menu.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const current = [...getState()[stateKey]];
      if (cb.checked) {
        current.push(cb.value);
      } else {
        const idx = current.indexOf(cb.value);
        if (idx > -1) current.splice(idx, 1);
      }
      setState({ [stateKey]: current });
    });
  });

  // Select all / Clear
  menu.querySelector('[data-action="all"]').addEventListener('click', () => {
    setState({ [stateKey]: [...values] });
    populateMenu(filterKey, menu);
  });
  menu.querySelector('[data-action="clear"]').addEventListener('click', () => {
    setState({ [stateKey]: [] });
    populateMenu(filterKey, menu);
  });
}

function renderChips() {
  ['manufacturer', 'type'].forEach(filterKey => {
    const stateKey = filterKey === 'manufacturer' ? 'selectedManufacturers' : 'selectedTypes';
    const selected = getState()[stateKey];
    const wrapper = document.querySelector(`.multi-select[data-filter="${filterKey}"]`);
    const chipsContainer = wrapper.querySelector('.selected-chips');

    if (selected.length === 0) {
      chipsContainer.innerHTML = '';
      return;
    }

    chipsContainer.innerHTML = selected.map(value => {
      const color = filterKey === 'manufacturer' ? getManufacturerColor(value) : 'var(--accent)';
      return `<span class="chip" style="background:${color}22;color:${color};border:1px solid ${color}44" data-value="${value}" data-filter="${stateKey}">
        ${value} <span class="chip-remove">×</span>
      </span>`;
    }).join('');

    chipsContainer.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        const value = chip.dataset.value;
        const key = chip.dataset.filter;
        const current = getState()[key].filter(v => v !== value);
        setState({ [key]: current });
      });
    });
  });
}

function setupRangeToggle() {
  const buttons = document.querySelectorAll('.toggle-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setState({ rangeMode: btn.dataset.mode });
    });
  });
}
```

- [ ] **Step 2: Add filter CSS to style.css**

Append to `src/style.css`:
```css
/* Filters */
.filter-group { display: flex; flex-direction: column; gap: 4px; }
.filter-label { color: var(--text-secondary); font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }

.multi-select { position: relative; min-width: 180px; }

.dropdown-toggle {
  background: #2a2a3e;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.dropdown-toggle:hover { border-color: var(--accent); }

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #2a2a3e;
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-top: 4px;
  max-height: 300px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}

.dropdown-menu.hidden { display: none; }

.dropdown-actions {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.dropdown-action {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.dropdown-action:hover { text-decoration: underline; }

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
}
.dropdown-item:hover { background: rgba(255,255,255,0.05); }
.dropdown-item input { accent-color: var(--accent); }

.color-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.item-name { flex: 1; }
.item-count { color: var(--text-muted); font-size: 10px; }

.selected-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
}
.chip-remove { cursor: pointer; opacity: 0.6; }
.chip-remove:hover { opacity: 1; }

/* Range toggle */
.toggle-buttons {
  display: flex;
  background: #2a2a3e;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.toggle-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.toggle-btn.active {
  background: var(--accent);
  color: #fff;
}
```

- [ ] **Step 3: Wire filters into main.js**

Update `src/main.js`:
```js
import './style.css';
import { setState } from './state.js';
import { initMap } from './map.js';
import { initFilters } from './filters.js';

async function init() {
  const response = await fetch('/drones.json');
  const drones = await response.json();
  setState({ drones });

  initMap('map');
  initFilters('filter-bar');
}

init();
```

- [ ] **Step 4: Verify filters work**

Run: `npm run dev`
Expected: Filter bar appears above map. Click "Select..." to open dropdown. Check manufacturers → chips appear. Circles on map update to show only filtered drones. Range toggle switches between round-trip and one-way (circles resize).

- [ ] **Step 5: Commit**

```bash
git add src/filters.js src/main.js src/style.css
git commit -m "feat: add multi-select filter dropdowns with chip tags"
```

---

## Chunk 4: D3 Parallel Coordinates Chart

### Task 6: Parallel Coordinates Chart

**Files:**
- Create: `src/chart.js`
- Modify: `src/main.js`
- Modify: `src/style.css`

- [ ] **Step 1: Create chart.js with D3 parallel coordinates**

```js
// src/chart.js
import * as d3 from 'd3';
import { getState, setState, subscribe, getVisibleDrones, getDroneRange, isHighlighted, toggleHighlight } from './state.js';
import { getManufacturerColor } from './colors.js';

let svg, dimensions, yScales, xScale;

const AXES = [
  { key: 'range', label: 'Range (km)', accessor: d => getDroneRange(d) },
  { key: 'maxPayloadKg', label: 'Payload (kg)', accessor: d => d.maxPayloadKg },
  { key: 'rechargeTimeMin', label: 'Recharge (min)', accessor: d => d.rechargeTimeMin },
  { key: 'flightTimeMin', label: 'Flight (min)', accessor: d => d.flightTimeMin },
  { key: 'msrp', label: 'MSRP ($)', accessor: d => d.msrp },
];

const DASH_PATTERNS = ['', '8,4', '4,4', '2,4', '8,2,2,2'];

export function initChart(containerId) {
  const container = document.getElementById(containerId);

  subscribe(() => renderChart(container));
  renderChart(container);
}

function renderChart(container) {
  container.innerHTML = '';

  const visible = getVisibleDrones();
  if (visible.length === 0) {
    container.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:40px;">No drones match your filters.</div>';
    return;
  }

  const { hoveredDroneId } = getState();
  const margin = { top: 30, right: 20, bottom: 10, left: 20 };
  const width = container.clientWidth - margin.left - margin.right;
  const height = Math.max(300, container.clientHeight - margin.top - margin.bottom);

  svg = d3.select(container)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Build scales
  const activeAxes = AXES.filter(axis => {
    return visible.some(d => axis.accessor(d) != null);
  });

  xScale = d3.scalePoint()
    .domain(activeAxes.map(a => a.key))
    .range([0, width]);

  yScales = {};
  activeAxes.forEach(axis => {
    const values = visible.map(axis.accessor).filter(v => v != null);
    yScales[axis.key] = d3.scaleLinear()
      .domain([d3.min(values), d3.max(values)])
      .range([height, 0])
      .nice();
  });

  // Draw axes
  activeAxes.forEach(axis => {
    const g = svg.append('g')
      .attr('transform', `translate(${xScale(axis.key)},0)`);

    g.call(d3.axisLeft(yScales[axis.key]).ticks(6).tickFormat(d => {
      if (axis.key === 'msrp') return '$' + d3.format(',.0f')(d);
      return d3.format('.4~g')(d);
    }));

    g.selectAll('text').attr('fill', '#888').attr('font-size', '9px');
    g.selectAll('line').attr('stroke', '#333');
    g.selectAll('path').attr('stroke', '#333');

    g.append('text')
      .attr('y', -12)
      .attr('text-anchor', 'middle')
      .attr('fill', '#888')
      .attr('font-size', '10px')
      .text(axis.label);

    // Axis brushing
    const brush = d3.brushY()
      .extent([[-10, 0], [10, height]])
      .on('brush end', (event) => {
        const brushRanges = { ...getState().brushRanges };
        if (event.selection) {
          const [y0, y1] = event.selection;
          brushRanges[axis.key] = [yScales[axis.key].invert(y1), yScales[axis.key].invert(y0)];
        } else {
          delete brushRanges[axis.key];
        }
        setState({ brushRanges });
      });

    g.append('g')
      .attr('class', 'brush')
      .call(brush);
  });

  // Track drone index within manufacturer for dash pattern
  const mfrCounts = {};
  visible.forEach(d => {
    mfrCounts[d.manufacturer] = (mfrCounts[d.manufacturer] || 0);
  });
  const mfrIndex = {};

  // Draw lines
  visible.forEach(drone => {
    const mfr = drone.manufacturer;
    if (!mfrIndex[mfr]) mfrIndex[mfr] = 0;
    const dashIdx = mfrIndex[mfr]++;

    const points = [];
    activeAxes.forEach(axis => {
      const val = axis.accessor(drone);
      if (val != null) {
        points.push([xScale(axis.key), yScales[axis.key](val)]);
      }
    });

    if (points.length < 2) return;

    const highlighted = isHighlighted(drone.id);
    const hovered = hoveredDroneId === drone.id;
    const { brushRanges } = getState();

    // Check if drone passes all brush filters
    let passesBrush = true;
    for (const [axisKey, [min, max]] of Object.entries(brushRanges)) {
      const axis = activeAxes.find(a => a.key === axisKey);
      if (axis) {
        const val = axis.accessor(drone);
        if (val != null && (val < min || val > max)) { passesBrush = false; break; }
      }
    }

    const opacity = hovered ? 1 : (!passesBrush ? 0.1 : (highlighted ? 0.7 : 0.1));
    const strokeWidth = hovered ? 3 : 1.5;

    const line = svg.append('path')
      .datum(points)
      .attr('d', d3.line())
      .attr('fill', 'none')
      .attr('stroke', getManufacturerColor(mfr))
      .attr('stroke-width', strokeWidth)
      .attr('stroke-opacity', opacity)
      .attr('stroke-dasharray', DASH_PATTERNS[dashIdx % DASH_PATTERNS.length])
      .style('cursor', 'pointer');

    line.on('mouseover', () => setState({ hoveredDroneId: drone.id }));
    line.on('mouseout', () => setState({ hoveredDroneId: null }));
    line.on('click', () => toggleHighlight(drone.id));

    // Dots on axes
    points.forEach(([x, y]) => {
      svg.append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', hovered ? 4 : 2.5)
        .attr('fill', getManufacturerColor(mfr))
        .attr('opacity', opacity)
        .style('pointer-events', 'none');
    });
  });
}

export function renderDroneTags(containerId) {
  const container = document.getElementById(containerId);

  subscribe(() => updateTags(container));
  updateTags(container);
}

function updateTags(container) {
  const { highlightedDroneIds, drones } = getState();
  if (highlightedDroneIds.size === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:11px;">Click a circle or line to highlight individual drones</span>';
    return;
  }

  container.innerHTML = [...highlightedDroneIds].map(id => {
    const drone = drones.find(d => d.id === id);
    if (!drone) return '';
    const color = getManufacturerColor(drone.manufacturer);
    return `<span class="chip" style="background:${color}22;color:${color};border:1px solid ${color}44" data-id="${id}">
      ${drone.name} <span class="chip-remove">×</span>
    </span>`;
  }).join('');

  container.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.chip').dataset.id;
      toggleHighlight(id);
    });
  });
}
```

- [ ] **Step 2: Wire chart into main.js**

Update `src/main.js`:
```js
import './style.css';
import { setState } from './state.js';
import { initMap } from './map.js';
import { initFilters } from './filters.js';
import { initChart, renderDroneTags } from './chart.js';

async function init() {
  const response = await fetch('/drones.json');
  const drones = await response.json();
  setState({ drones });

  initMap('map');
  initFilters('filter-bar');
  initChart('parallel-chart');
  renderDroneTags('drone-tags');
}

init();
```

- [ ] **Step 3: Verify chart renders and cross-highlights with map**

Run: `npm run dev`
Expected: Parallel coordinates chart renders on right panel with 5 axes. Lines colored by manufacturer. Hover a line → it bolds, others fade, AND the corresponding circle on the map brightens. Hover circle on map → corresponding line on chart bolds. Click a line or circle → drone highlighted (others fade to 30%), chip tag appears below chart. Click × on chip → de-highlights.

- [ ] **Step 4: Commit**

```bash
git add src/chart.js src/main.js
git commit -m "feat: add D3 parallel coordinates chart with cross-highlighting"
```

---

## Chunk 5: Route Feasibility Mode

### Task 7: Route Feasibility — Geocoding, Routing, and Results

**Files:**
- Create: `src/route.js`
- Modify: `src/main.js`
- Modify: `src/map.js`
- Modify: `src/style.css`
- Modify: `index.html`

- [ ] **Step 1: Add route panel HTML to index.html**

Add inside `#filter-bar` div, after the existing filter groups:
```html
<div id="route-panel" class="filter-group route-panel">
  <label class="filter-label route-toggle-label" style="cursor:pointer;">Route Feasibility ▸</label>
  <div class="route-inputs collapsed">
    <div class="route-input-row">
      <span class="route-pin start">●</span>
      <input type="text" id="route-start" class="route-input" placeholder="Start address..." />
    </div>
    <div class="route-input-row">
      <span class="route-pin end">●</span>
      <input type="text" id="route-end" class="route-input" placeholder="End address..." />
    </div>
    <div class="route-actions">
      <button id="route-check" class="route-btn primary">Check Route</button>
      <button id="route-clear" class="route-btn secondary">Clear ×</button>
    </div>
    <div id="route-status"></div>
  </div>
</div>
```

- [ ] **Step 2: Create route.js with geocoding, OSRM routing, and feasibility**

```js
// src/route.js
import { getState, setState, subscribe, getVisibleDrones } from './state.js';
import { getManufacturerColor } from './colors.js';

let debounceTimer;

export function initRoute() {
  const checkBtn = document.getElementById('route-check');
  const clearBtn = document.getElementById('route-clear');
  const statusEl = document.getElementById('route-status');

  // Collapsible toggle
  const toggleLabel = document.querySelector('.route-toggle-label');
  const inputsDiv = document.querySelector('.route-inputs');
  toggleLabel.addEventListener('click', () => {
    inputsDiv.classList.toggle('collapsed');
    toggleLabel.textContent = inputsDiv.classList.contains('collapsed')
      ? 'Route Feasibility ▸' : 'Route Feasibility ▾';
  });

  checkBtn.addEventListener('click', () => handleCheckRoute(statusEl));
  clearBtn.addEventListener('click', handleClearRoute);

  subscribe(() => {
    const { route } = getState();
    if (route) renderRouteResults();
  });
}

async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'DroneRangeViz/1.0' } });
  const data = await res.json();
  if (data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
}

async function getOSRMRoute(start, end) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes.length) return null;
    const route = data.routes[0];
    return {
      distanceKm: route.distance / 1000,
      geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]), // Leaflet expects [lat, lng]
    };
  } catch (e) {
    console.warn('OSRM failed, falling back to straight-line:', e);
    return null;
  }
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}

async function handleCheckRoute(statusEl) {
  const startAddr = document.getElementById('route-start').value.trim();
  const endAddr = document.getElementById('route-end').value.trim();

  if (!startAddr || !endAddr) {
    statusEl.innerHTML = '<span class="route-error">Please enter both addresses.</span>';
    return;
  }

  statusEl.innerHTML = '<span class="route-loading">Geocoding addresses...</span>';

  // Respect Nominatim rate limit: 1 req/sec
  const start = await geocode(startAddr);
  if (!start) {
    statusEl.innerHTML = '<span class="route-error">Could not find start address. Try a more specific query.</span>';
    return;
  }

  await new Promise(r => setTimeout(r, 1100)); // rate limit
  const end = await geocode(endAddr);
  if (!end) {
    statusEl.innerHTML = '<span class="route-error">Could not find end address. Try a more specific query.</span>';
    return;
  }

  const straightLineKm = haversineKm(start, end);

  if (start.lat === end.lat && start.lng === end.lng) {
    statusEl.innerHTML = '<span class="route-info">Start and end are the same location. Distance: 0 km. All drones can make this trip.</span>';
    return;
  }

  statusEl.innerHTML = '<span class="route-loading">Finding road route...</span>';

  const osrmResult = await getOSRMRoute(start, end);
  let roadDistanceKm, polyline, fallback = false;

  if (osrmResult) {
    roadDistanceKm = osrmResult.distanceKm;
    polyline = osrmResult.geometry;
  } else {
    roadDistanceKm = straightLineKm;
    polyline = [[start.lat, start.lng], [end.lat, end.lng]];
    fallback = true;
  }

  const routeData = {
    start,
    end,
    polyline,
    roadDistanceKm,
    straightLineKm,
    fallback,
  };

  setState({
    route: routeData,
    center: { lat: start.lat, lng: start.lng },
  });

  const roundTrip = (roadDistanceKm * 2).toFixed(1);
  let statusHtml = `<div class="route-distance">
    <strong>${roadDistanceKm.toFixed(1)} km</strong> road distance · <strong style="color:#ffd166">${roundTrip} km round-trip</strong>
    <br><span class="route-straight">${straightLineKm.toFixed(1)} km straight-line</span>
  </div>`;
  if (fallback) {
    statusHtml += '<span class="route-warning">Road routing unavailable — showing straight-line distance.</span>';
  }
  if (roadDistanceKm > 500) {
    statusHtml += '<span class="route-warning">This route exceeds all known drone ranges.</span>';
  }
  statusEl.innerHTML = statusHtml;

  document.getElementById('map-prompt').style.display = 'none';
}

function handleClearRoute() {
  setState({ route: null, center: null });
  document.getElementById('route-start').value = '';
  document.getElementById('route-end').value = '';
  document.getElementById('route-status').innerHTML = '';
  document.getElementById('map-prompt').style.display = '';
  // Clear route results panel
  const resultsEl = document.getElementById('route-results');
  if (resultsEl) resultsEl.innerHTML = '';
}

function renderRouteResults() {
  let resultsEl = document.getElementById('route-results');
  if (!resultsEl) {
    resultsEl = document.createElement('div');
    resultsEl.id = 'route-results';
    document.getElementById('chart-container').prepend(resultsEl);
  }

  const { route } = getState();
  if (!route) {
    resultsEl.innerHTML = '';
    return;
  }

  const visible = getVisibleDrones();
  const roundTripKm = route.roadDistanceKm * 2;
  const oneWayKm = route.roadDistanceKm;

  const green = [];
  const yellow = [];
  const red = [];

  visible.forEach(drone => {
    const maxRT = drone.operationalRadiusKm * 2;
    const maxOW = drone.maxRangeKm;

    if (maxRT >= roundTripKm) {
      green.push({ drone, surplus: maxRT - roundTripKm });
    } else if (maxOW >= oneWayKm) {
      yellow.push({ drone, deficit: roundTripKm - maxRT });
    } else {
      red.push({ drone, deficit: oneWayKm - maxOW });
    }
  });

  green.sort((a, b) => b.surplus - a.surplus);
  yellow.sort((a, b) => a.deficit - b.deficit);
  red.sort((a, b) => a.deficit - b.deficit);

  let html = `<div class="route-results-header">
    <div class="route-results-title">Route Feasibility</div>
    <div class="route-results-subtitle">Round-trip: ${roundTripKm.toFixed(1)} km needed</div>
  </div>`;

  if (green.length) {
    html += `<div class="feasibility-group"><div class="feasibility-label green">✓ Can Round-Trip (${green.length})</div>`;
    green.forEach(({ drone, surplus }) => {
      html += feasibilityRow(drone, `+${surplus.toFixed(0)} km surplus`, 'green');
    });
    html += '</div>';
  }

  if (yellow.length) {
    html += `<div class="feasibility-group"><div class="feasibility-label yellow">⚠ One-Way Only (${yellow.length})</div>`;
    yellow.forEach(({ drone, deficit }) => {
      html += feasibilityRow(drone, `can reach, can't return`, 'yellow');
    });
    html += '</div>';
  }

  if (red.length) {
    html += `<div class="feasibility-group"><div class="feasibility-label red">✗ Out of Range (${red.length})</div>`;
    const showRed = red.slice(0, 3);
    showRed.forEach(({ drone, deficit }) => {
      html += feasibilityRow(drone, `-${deficit.toFixed(0)} km short`, 'red');
    });
    if (red.length > 3) {
      html += `<div class="feasibility-more">+ ${red.length - 3} more drones out of range</div>`;
    }
    html += '</div>';
  }

  resultsEl.innerHTML = html;
}

function feasibilityRow(drone, statusText, colorClass) {
  const color = getManufacturerColor(drone.manufacturer);
  return `<div class="feasibility-row ${colorClass}">
    <div class="feasibility-row-main">
      <span class="color-dot" style="background:${color}"></span>
      <span class="feasibility-name">${drone.name}</span>
      <span class="feasibility-status">${statusText}</span>
    </div>
    <div class="feasibility-detail">RT: ${drone.operationalRadiusKm * 2} km · Max: ${drone.maxRangeKm} km · ${drone.type}</div>
  </div>`;
}
```

- [ ] **Step 3: Update map.js to render route polyline and buffer**

Add to the bottom of `src/map.js`, before the closing export:

```js
let routeLayer;

export function renderRoute() {
  if (routeLayer) {
    routeLayer.remove();
    routeLayer = null;
  }

  const { route } = getState();
  if (!route) return;

  routeLayer = L.layerGroup().addTo(map);

  // 1-mile (1.6km) geo-accurate buffer corridor
  // Compute offset polylines 1.6km left and right of the route
  const bufferPolygon = computeBufferPolygon(route.polyline, 1.6);
  const buffer = L.polygon(bufferPolygon, {
    color: '#4a9eff',
    fillColor: '#4a9eff',
    fillOpacity: 0.08,
    opacity: 0.2,
    weight: 1,
    dashArray: '4,4',
    interactive: false,
  });
  routeLayer.addLayer(buffer);

  // Road route line
  const routeLine = L.polyline(route.polyline, {
    color: '#ffffff',
    weight: 2.5,
    opacity: 0.7,
  });
  routeLayer.addLayer(routeLine);

  // Straight-line reference
  const straightLine = L.polyline(
    [[route.start.lat, route.start.lng], [route.end.lat, route.end.lng]],
    { color: '#ffffff', weight: 0.5, opacity: 0.2, dashArray: '4,8' }
  );
  routeLayer.addLayer(straightLine);

  // Start pin (green)
  const startMarker = L.circleMarker([route.start.lat, route.start.lng], {
    radius: 8, fillColor: '#2ecc71', fillOpacity: 1, color: '#fff', weight: 2,
  }).bindTooltip(route.start.label || 'Start', { permanent: false });
  routeLayer.addLayer(startMarker);

  // End pin (red)
  const endMarker = L.circleMarker([route.end.lat, route.end.lng], {
    radius: 8, fillColor: '#e74c3c', fillOpacity: 1, color: '#fff', weight: 2,
  }).bindTooltip(route.end.label || 'End', { permanent: false });
  routeLayer.addLayer(endMarker);

  // Distance label at midpoint
  const mid = route.polyline[Math.floor(route.polyline.length / 2)];
  const distLabel = L.marker(mid, {
    icon: L.divIcon({
      className: 'distance-label',
      html: `<div>${route.roadDistanceKm.toFixed(1)} km${route.fallback ? ' (straight)' : ' (road)'}<br><span style="font-size:9px;color:#666">${route.straightLineKm.toFixed(1)} km straight-line</span></div>`,
      iconSize: [0, 0],
    }),
    interactive: false,
  });
  routeLayer.addLayer(distLabel);

  // Fit map to route bounds
  const bounds = L.latLngBounds([
    [route.start.lat, route.start.lng],
    [route.end.lat, route.end.lng],
  ]);
  map.fitBounds(bounds.pad(0.2));
}

// Compute a polygon buffer around a polyline at a given distance in km
function computeBufferPolygon(polyline, bufferKm) {
  const R = 6371;
  const left = [];
  const right = [];

  for (let i = 0; i < polyline.length; i++) {
    const [lat, lng] = polyline[i];
    let bearing;

    if (i < polyline.length - 1) {
      const [lat2, lng2] = polyline[i + 1];
      bearing = Math.atan2(
        Math.sin((lng2 - lng) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180),
        Math.cos(lat * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lng2 - lng) * Math.PI / 180)
      );
    } else {
      const [lat2, lng2] = polyline[i - 1];
      bearing = Math.atan2(
        Math.sin((lng - lng2) * Math.PI / 180) * Math.cos(lat * Math.PI / 180),
        Math.cos(lat2 * Math.PI / 180) * Math.sin(lat * Math.PI / 180) -
        Math.sin(lat2 * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.cos((lng - lng2) * Math.PI / 180)
      );
    }

    // Offset perpendicular (left = bearing - 90°, right = bearing + 90°)
    const offsetPoint = (b) => {
      const latR = lat * Math.PI / 180;
      const lngR = lng * Math.PI / 180;
      const d = bufferKm / R;
      const lat2 = Math.asin(Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(b));
      const lng2 = lngR + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(latR), Math.cos(d) - Math.sin(latR) * Math.sin(lat2));
      return [lat2 * 180 / Math.PI, lng2 * 180 / Math.PI];
    };

    left.push(offsetPoint(bearing - Math.PI / 2));
    right.push(offsetPoint(bearing + Math.PI / 2));
  }

  return [...left, ...right.reverse()];
}
```

Then update the `subscribe` in `initMap` to also call `renderRoute`:
```js
subscribe((state) => {
  renderCircles();
  renderRoute();
});
```

- [ ] **Step 4: Add route CSS to style.css**

Append to `src/style.css`:
```css
/* Route panel */
.route-panel { min-width: 320px; }

.route-inputs { display: flex; flex-direction: column; gap: 6px; }
.route-inputs.collapsed { display: none; }

.route-input-row { display: flex; align-items: center; gap: 8px; }

.route-pin { font-size: 14px; }
.route-pin.start { color: #2ecc71; }
.route-pin.end { color: #e74c3c; }

.route-input {
  flex: 1;
  background: #2a2a3e;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--text-primary);
  font-size: 12px;
}
.route-input:focus { outline: none; border-color: var(--accent); }

.route-actions { display: flex; gap: 8px; }

.route-btn {
  border: none;
  border-radius: 6px;
  padding: 6px 16px;
  font-size: 11px;
  cursor: pointer;
}
.route-btn.primary { background: var(--accent); color: #fff; }
.route-btn.secondary { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); }

.route-loading { color: var(--accent); font-size: 11px; }
.route-error { color: #e74c3c; font-size: 11px; }
.route-warning { color: #ffd166; font-size: 11px; display: block; margin-top: 4px; }
.route-info { color: var(--accent); font-size: 11px; }

.route-distance { font-size: 11px; color: var(--text-primary); margin-top: 6px; }
.route-straight { color: var(--text-muted); font-size: 10px; }

.distance-label div {
  background: rgba(0,0,0,0.85);
  color: #aaa;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  white-space: nowrap;
  font-family: monospace;
}

/* Route results */
#route-results { padding: 12px 16px; border-bottom: 1px solid var(--border); }

.route-results-header { margin-bottom: 12px; }
.route-results-title { color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
.route-results-subtitle { color: #ffd166; font-size: 10px; font-weight: bold; margin-top: 2px; }

.feasibility-group { margin-bottom: 10px; }
.feasibility-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
.feasibility-label.green { color: #2ecc71; }
.feasibility-label.yellow { color: #ffd166; }
.feasibility-label.red { color: #e74c3c; }

.feasibility-row {
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 4px;
}
.feasibility-row.green { background: rgba(46,204,113,0.08); border: 1px solid rgba(46,204,113,0.2); }
.feasibility-row.yellow { background: rgba(255,209,102,0.08); border: 1px solid rgba(255,209,102,0.2); }
.feasibility-row.red { background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.2); }

.feasibility-row-main { display: flex; align-items: center; gap: 6px; }
.feasibility-name { color: #fff; font-size: 11px; flex: 1; }
.feasibility-status { font-size: 10px; }
.feasibility-row.green .feasibility-status { color: #2ecc71; }
.feasibility-row.yellow .feasibility-status { color: #ffd166; }
.feasibility-row.red .feasibility-status { color: #e74c3c; }

.feasibility-detail { color: var(--text-secondary); font-size: 10px; margin-top: 2px; margin-left: 14px; }
.feasibility-more { color: var(--text-muted); font-size: 10px; text-align: center; margin-top: 6px; }
```

- [ ] **Step 5: Wire route into main.js**

Update `src/main.js`:
```js
import './style.css';
import { setState } from './state.js';
import { initMap } from './map.js';
import { initFilters } from './filters.js';
import { initChart, renderDroneTags } from './chart.js';
import { initRoute } from './route.js';

async function init() {
  const response = await fetch('/drones.json');
  const drones = await response.json();
  setState({ drones });

  initMap('map');
  initFilters('filter-bar');
  initChart('parallel-chart');
  renderDroneTags('drone-tags');
  initRoute();
}

init();
```

- [ ] **Step 6: Verify route feasibility works end-to-end**

Run: `npm run dev`
Expected:
1. Enter "New York, NY" and "Philadelphia, PA" in route inputs
2. Click "Check Route"
3. Map shows road-snapped route polyline with buffer corridor, start (green) and end (red) pins
4. Distance label shows road distance and round-trip
5. Right panel shows feasibility results: green/yellow/red sorted list
6. Concentric circles render from start pin
7. "Clear ×" removes route, returns to click-to-set-center mode
8. Filter changes update the results panel

- [ ] **Step 7: Commit**

```bash
git add src/route.js src/map.js src/main.js src/style.css index.html
git commit -m "feat: add route feasibility mode with OSRM road-snapped routing"
```

---

## Chunk 6: Polish and Final Integration

### Task 8: Animation, Responsive Tweaks, and Final Polish

**Files:**
- Modify: `src/map.js`
- Modify: `src/style.css`
- Modify: `src/chart.js`

- [ ] **Step 1: Add circle animation on center click**

In `src/map.js`, update circle creation to animate from 0 radius. After creating each `L.circle`, use a simple CSS transition approach — Leaflet doesn't natively animate circle radius, so instead add circles at 0 radius and step up via `requestAnimationFrame`:

Add this helper function at the top of `src/map.js` (outside any other function):
```js
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
```

Then in `renderCircles()`, replace `circleLayer.addLayer(circle);` with:
```js
const targetRadius = rangeKm * 1000;
circle.setRadius(0);
circleLayer.addLayer(circle);

// Animate radius expansion
let progress = 0;
const animate = () => {
  progress += 0.05;
  if (progress >= 1) {
    circle.setRadius(targetRadius);
    return;
  }
  circle.setRadius(targetRadius * easeOutCubic(progress));
  requestAnimationFrame(animate);
};
requestAnimationFrame(animate);
```

- [ ] **Step 2: Add chart resize handling**

In `src/chart.js`, add a ResizeObserver so the chart redraws when the panel resizes:

```js
// In initChart(), after first render:
const resizeObserver = new ResizeObserver(() => renderChart(container));
resizeObserver.observe(container);
```

- [ ] **Step 3: Add .gitignore**

Create `.gitignore`:
```
node_modules/
dist/
.superpowers/
.DS_Store
```

- [ ] **Step 4: Verify everything works together**

Run: `npm run dev`

Full integration test:
1. Page loads → dark theme, map centered on US, chart shows all drones
2. Click map → concentric circles animate outward, labels appear on arcs
3. Hover circle → tooltip, chart line highlights
4. Hover chart line → map circle highlights
5. Filter by manufacturer → circles and chart update
6. Filter by type → circles and chart update
7. Toggle range mode → circles resize, chart Range axis rescales
8. Enter route → road polyline, buffer corridor, feasibility results
9. Clear route → back to radius mode

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add circle animation, chart resize handling, and polish"
```

---

### Task 9: Final Build Verification

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: `dist/` folder created with bundled assets, no errors

- [ ] **Step 2: Preview production build**

Run: `npx vite preview`
Expected: Production build serves correctly at localhost:4173, all features work

- [ ] **Step 3: Final commit if any changes needed**

```bash
git add -A
git commit -m "chore: final build verification"
```
