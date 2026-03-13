import L from 'leaflet';
import {
  getState,
  setState,
  subscribe,
  getVisibleDrones,
  getDroneRange,
  isHighlighted,
  passesBrushFilter,
  toggleHighlight,
} from './state.js';
import { getManufacturerColor } from './colors.js';
import { isPlacementMode, handlePlacementClick } from './placement.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function getArcLabelPosition(center, rangeKm) {
  return {
    lat: center.lat + (rangeKm / 6371) * (180 / Math.PI),
    lng: center.lng,
  };
}

function computeBufferPolygon(latlngs, bufferKm) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const toDeg = r => (r * 180) / Math.PI;

  function offsetPoint(lat, lng, bearingRad, distKm) {
    const d = distKm / R;
    const lat1 = toRad(lat);
    const lng1 = toRad(lng);
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(bearingRad)
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearingRad) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
      );
    return [toDeg(lat2), toDeg(lng2)];
  }

  function bearing(lat1, lng1, lat2, lng2) {
    const dLng = toRad(lng2 - lng1);
    const rlat1 = toRad(lat1);
    const rlat2 = toRad(lat2);
    return Math.atan2(
      Math.sin(dLng) * Math.cos(rlat2),
      Math.cos(rlat1) * Math.sin(rlat2) -
        Math.sin(rlat1) * Math.cos(rlat2) * Math.cos(dLng)
    );
  }

  const left = [];
  const right = [];

  for (let i = 0; i < latlngs.length - 1; i++) {
    const [lat1, lng1] = latlngs[i];
    const [lat2, lng2] = latlngs[i + 1];
    const brg = bearing(lat1, lng1, lat2, lng2);
    const perpLeft = brg - Math.PI / 2;
    const perpRight = brg + Math.PI / 2;

    if (i === 0) {
      left.push(offsetPoint(lat1, lng1, perpLeft, bufferKm));
      right.push(offsetPoint(lat1, lng1, perpRight, bufferKm));
    }
    left.push(offsetPoint(lat2, lng2, perpLeft, bufferKm));
    right.push(offsetPoint(lat2, lng2, perpRight, bufferKm));
  }

  return [...left, ...[...right].reverse()];
}

// ─── module state ────────────────────────────────────────────────────────────

let map = null;
let circleLayers = [];       // all Leaflet layers to remove on rebuild
let centerMarker = null;
let routeLayers = [];
let droneCircleData = [];    // [{drone, circle, color}] for hover updates
let lastSnapshotKey = '';    // detect when a full rebuild is needed vs hover-only

// ─── animation ──────────────────────────────────────────────────────────────

function animateCircle(circle, targetRadius, duration = 600) {
  const start = performance.now();
  function frame(now) {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);
    const r = targetRadius * easeOutCubic(t);
    circle.setRadius(r);
    if (t < 1) requestAnimationFrame(frame);
  }
  circle.setRadius(0);
  requestAnimationFrame(frame);
}

// ─── tooltip builder ─────────────────────────────────────────────────────────

function buildTooltipHtml(drone, color) {
  const fmt = v => (v == null ? '—' : v);
  const fmtMsrp = v => (v == null ? '—' : `$${Number(v).toLocaleString()}`);
  const specsLink = drone.specsUrl
    ? `<a href="${drone.specsUrl}" target="_blank" rel="noopener"
          style="color:${color};text-decoration:underline;">specs ↗</a>`
    : '';
  return `
    <div style="min-width:180px">
      <div style="font-weight:bold;color:${color};margin-bottom:4px;">${fmt(drone.name)}</div>
      <div style="color:#aaa;font-size:11px;margin-bottom:6px;">${fmt(drone.manufacturer)} · ${fmt(drone.type)}</div>
      <table style="border-collapse:collapse;font-size:11px;width:100%">
        <tr><td style="color:#888;padding:1px 6px 1px 0">Range</td><td>${fmt(drone.operationalRadiusKm)} km radius / ${fmt(drone.maxRangeKm)} km max</td></tr>
        <tr><td style="color:#888;padding:1px 6px 1px 0">Payload</td><td>${fmt(drone.maxPayloadKg)} kg</td></tr>
        <tr><td style="color:#888;padding:1px 6px 1px 0">Flight time</td><td>${fmt(drone.flightTimeMin)} min</td></tr>
        <tr><td style="color:#888;padding:1px 6px 1px 0">Weight</td><td>${fmt(drone.weightKg)} kg</td></tr>
        <tr><td style="color:#888;padding:1px 6px 1px 0">Year</td><td>${fmt(drone.year)}</td></tr>
        <tr><td style="color:#888;padding:1px 6px 1px 0">MSRP</td><td>${fmtMsrp(drone.msrp)}</td></tr>
      </table>
      ${specsLink ? `<div style="margin-top:6px">${specsLink}</div>` : ''}
    </div>
  `;
}

// ─── initials helper ─────────────────────────────────────────────────────────

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

// ─── opacity logic ───────────────────────────────────────────────────────────

function getCircleOpacity(drone, hoveredDroneId) {
  const hovered = hoveredDroneId === drone.id;
  const highlighted = isHighlighted(drone.id);
  const brushed = passesBrushFilter(drone);

  let fillOpacity, opacity;
  if (hovered) {
    fillOpacity = 0.30; opacity = 1.0;
  } else if (highlighted && brushed) {
    fillOpacity = 0.15; opacity = 0.6;
  } else if (!brushed) {
    fillOpacity = 0.02; opacity = 0.1;
  } else {
    fillOpacity = highlighted ? 0.15 : 0.03;
    opacity = highlighted ? 0.6 : 0.15;
  }
  return { fillOpacity, opacity };
}

// ─── snapshot key ────────────────────────────────────────────────────────────
// Build a string that changes when we need a full rebuild (center moved,
// filters changed, brush changed, highlights changed) but stays the same
// when only hoveredDroneId changed.

function getSnapshotKey() {
  const s = getState();
  const vis = getVisibleDrones().map(d => d.id).join(',');
  const hl = [...s.highlightedDroneIds].sort().join(',');
  const br = JSON.stringify(s.brushRanges);
  const c = s.center ? `${s.center.lat},${s.center.lng}` : '';
  const z = map ? map.getZoom() : '';
  const rm = s.rangeMode;
  return `${c}|${z}|${vis}|${hl}|${br}|${rm}`;
}

// ─── updateCircleStyles (hover-only, no rebuild) ─────────────────────────────

function updateCircleStyles() {
  const { hoveredDroneId } = getState();
  for (const entry of droneCircleData) {
    const { drone, circle } = entry;
    const { fillOpacity, opacity } = getCircleOpacity(drone, hoveredDroneId);
    circle.setStyle({ fillOpacity, opacity });
  }
}

// ─── renderCircles (full rebuild) ────────────────────────────────────────────

function renderCircles() {
  if (!map) return;
  const { center, hoveredDroneId } = getState();

  // Clear previous circles / marker
  circleLayers.forEach(l => map.removeLayer(l));
  circleLayers = [];
  droneCircleData = [];
  if (centerMarker) { map.removeLayer(centerMarker); centerMarker = null; }

  if (!center) return;

  // Blue center marker
  centerMarker = L.circleMarker([center.lat, center.lng], {
    radius: 6,
    color: '#4a9eff',
    fillColor: '#4a9eff',
    fillOpacity: 1,
    weight: 2,
    interactive: false,
    pane: 'markerPane',
  }).addTo(map);
  circleLayers.push(centerMarker);

  // Sort: largest range first → drawn first → sits on bottom
  const drones = getVisibleDrones().slice().sort(
    (a, b) => getDroneRange(b) - getDroneRange(a)
  );

  const zoom = map.getZoom();

  drones.forEach(drone => {
    const rangeKm = getDroneRange(drone);
    if (!rangeKm) return;

    const color = getManufacturerColor(drone.manufacturer);
    const { fillOpacity, opacity } = getCircleOpacity(drone, hoveredDroneId);

    // Visual circle — non-interactive
    const circle = L.circle([center.lat, center.lng], {
      radius: 0,
      color,
      fillColor: color,
      fillOpacity,
      opacity,
      weight: 1.5,
      interactive: false,
    }).addTo(map);

    circleLayers.push(circle);
    droneCircleData.push({ drone, circle, color });

    // Animate
    animateCircle(circle, rangeKm * 1000);

    // Arc label at north point
    const labelPos = getArcLabelPosition(center, rangeKm);
    const labelText = zoom > 8 ? (drone.name || '') : getInitials(drone.name);
    const arcLabel = L.marker([labelPos.lat, labelPos.lng], {
      interactive: false,
      icon: L.divIcon({
        className: 'arc-label',
        html: `<span style="color:${color};text-shadow:0 1px 3px #000,0 0 6px #000">${labelText}</span>`,
        iconAnchor: [0, 0],
      }),
    }).addTo(map);
    circleLayers.push(arcLabel);
  });

  lastSnapshotKey = getSnapshotKey();
}

// ─── onStateChange ───────────────────────────────────────────────────────────
// Called on every state change. Does a full rebuild only when something
// structural changed; otherwise just tweaks circle opacities for hover.

function onStateChange() {
  const key = getSnapshotKey();
  if (key !== lastSnapshotKey) {
    renderCircles();
    renderRoute();
  } else {
    updateCircleStyles();
  }
}

// ─── map-level hover detection ───────────────────────────────────────────────
// Instead of per-circle mouse events (which fight each other), use a single
// mousemove on the map to find which circle's EDGE is closest to the cursor.

function setupMapHover() {
  let currentHoveredId = null;

  map.on('mousemove', (e) => {
    const latlng = e.latlng;
    let closestId = null;
    let closestEdgeDist = Infinity;

    for (const entry of droneCircleData) {
      const { drone, circle } = entry;
      const radiusM = circle.getRadius();
      if (!radiusM) continue;

      const centerLatLng = circle.getLatLng();
      const distFromCenter = map.distance(latlng, centerLatLng);
      const distFromEdge = Math.abs(distFromCenter - radiusM);

      // Only consider if cursor is within 15px of the ring edge (in meters)
      const metersPerPixel = 40075016.686 * Math.cos(latlng.lat * Math.PI / 180)
        / Math.pow(2, map.getZoom() + 8);
      const thresholdM = metersPerPixel * 15;

      if (distFromEdge < thresholdM && distFromEdge < closestEdgeDist) {
        closestEdgeDist = distFromEdge;
        closestId = drone.id;
      }
    }

    if (closestId !== currentHoveredId) {
      currentHoveredId = closestId;
      setState({ hoveredDroneId: closestId });
    }
  });

  map.on('mouseout', () => {
    if (currentHoveredId !== null) {
      currentHoveredId = null;
      setState({ hoveredDroneId: null });
    }
  });
}

// ─── map-level click detection ───────────────────────────────────────────────

function setupMapClick() {
  map.on('click', e => {
    // Placement mode takes priority
    if (isPlacementMode()) {
      handlePlacementClick(e.latlng);
      return;
    }

    const { route } = getState();

    // Check if click is near a circle edge first
    const latlng = e.latlng;
    let closestId = null;
    let closestEdgeDist = Infinity;

    for (const entry of droneCircleData) {
      const { drone, circle } = entry;
      const radiusM = circle.getRadius();
      if (!radiusM) continue;

      const centerLatLng = circle.getLatLng();
      const distFromCenter = map.distance(latlng, centerLatLng);
      const distFromEdge = Math.abs(distFromCenter - radiusM);

      const metersPerPixel = 40075016.686 * Math.cos(latlng.lat * Math.PI / 180)
        / Math.pow(2, map.getZoom() + 8);
      const thresholdM = metersPerPixel * 15;

      if (distFromEdge < thresholdM && distFromEdge < closestEdgeDist) {
        closestEdgeDist = distFromEdge;
        closestId = drone.id;
      }
    }

    if (closestId) {
      toggleHighlight(closestId);
      return;
    }

    // No circle edge hit — set center (unless route mode)
    if (route) return;
    setState({ center: { lat: e.latlng.lat, lng: e.latlng.lng } });
  });
}

// ─── renderRoute ──────────────────────────────────────────────────────────────

export function renderRoute() {
  if (!map) return;
  const { route } = getState();

  routeLayers.forEach(l => map.removeLayer(l));
  routeLayers = [];

  if (!route) return;

  const { latlngs, distanceKm, straightKm } = route;
  if (!latlngs || latlngs.length < 2) return;

  const bufferPoly = computeBufferPolygon(latlngs, 1.6);
  const bufferLayer = L.polygon(bufferPoly, {
    color: '#ffd166',
    fillColor: '#ffd166',
    fillOpacity: 0.08,
    weight: 1,
    dashArray: '4 4',
    interactive: false,
  }).addTo(map);
  routeLayers.push(bufferLayer);

  const roadLine = L.polyline(latlngs, {
    color: '#ffd166',
    weight: 2.5,
    opacity: 0.85,
    interactive: false,
  }).addTo(map);
  routeLayers.push(roadLine);

  const start = latlngs[0];
  const end = latlngs[latlngs.length - 1];
  const straightLine = L.polyline([start, end], {
    color: '#888',
    weight: 1,
    dashArray: '6 4',
    opacity: 0.5,
    interactive: false,
  }).addTo(map);
  routeLayers.push(straightLine);

  const startPin = L.circleMarker(start, {
    radius: 7, color: '#2ecc71', fillColor: '#2ecc71',
    fillOpacity: 1, weight: 2, interactive: false,
  }).addTo(map);
  routeLayers.push(startPin);

  const endPin = L.circleMarker(end, {
    radius: 7, color: '#e74c3c', fillColor: '#e74c3c',
    fillOpacity: 1, weight: 2, interactive: false,
  }).addTo(map);
  routeLayers.push(endPin);

  const midIdx = Math.floor(latlngs.length / 2);
  const mid = latlngs[midIdx];
  const labelHtml = straightKm
    ? `<div>${distanceKm.toFixed(1)} km road<br><span class="route-straight">${straightKm.toFixed(1)} km straight</span></div>`
    : `<div>${distanceKm.toFixed(1)} km</div>`;
  const distLabel = L.marker(mid, {
    interactive: false,
    icon: L.divIcon({
      className: 'distance-label',
      html: labelHtml,
      iconAnchor: [0, 0],
    }),
  }).addTo(map);
  routeLayers.push(distLabel);
}

// ─── initMap ─────────────────────────────────────────────────────────────────

export function getMapInstance() { return map; }

export function initMap(containerId) {
  map = L.map(containerId, {
    center: [39.8, -98.5],
    zoom: 4,
    zoomControl: true,
  });

  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }
  ).addTo(map);

  // Single map-level hover + click (no per-circle events = no flicker)
  setupMapHover();
  setupMapClick();

  // Re-render on zoom (label text changes at zoom 8)
  map.on('zoomend', () => renderCircles());

  // Subscribe to state changes
  subscribe(onStateChange);
}
