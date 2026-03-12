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

// ─── helpers ────────────────────────────────────────────────────────────────

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

/**
 * Returns the lat of the north-pole point on a circle of rangeKm
 * centred at `center` – used to anchor the arc label.
 */
function getArcLabelPosition(center, rangeKm) {
  return {
    lat: center.lat + (rangeKm / 6371) * (180 / Math.PI),
    lng: center.lng,
  };
}

/**
 * Compute a closed buffer polygon around a polyline.
 * Offsets every segment by `bufferKm` km to the left and right,
 * then concatenates left-side + reversed right-side to close the ring.
 *
 * @param {Array<[number,number]>} latlngs  – [[lat,lng], ...]
 * @param {number} bufferKm
 * @returns {Array<[number,number]>}
 */
function computeBufferPolygon(latlngs, bufferKm) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const toDeg = r => (r * 180) / Math.PI;

  // Offset a single point by `distKm` in direction `bearingRad`
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

  // Bearing from point A to point B (radians)
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
let circleLayers = [];
let centerMarker = null;
let routeLayers = [];

// ─── animation ──────────────────────────────────────────────────────────────

/**
 * Animate a Leaflet circle from 0 → targetRadius over `duration` ms.
 */
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

// ─── renderCircles ────────────────────────────────────────────────────────────

function renderCircles() {
  if (!map) return;
  const { center, hoveredDroneId, route } = getState();

  // Clear previous circles / marker
  circleLayers.forEach(l => map.removeLayer(l));
  circleLayers = [];
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

  // Drones sorted largest range first (so smallest renders on top)
  const drones = getVisibleDrones().slice().sort(
    (a, b) => getDroneRange(b) - getDroneRange(a)
  );

  const zoom = map.getZoom();

  drones.forEach(drone => {
    const rangeKm = getDroneRange(drone);
    if (!rangeKm) return;

    const color = getManufacturerColor(drone.manufacturer);
    const hovered = hoveredDroneId === drone.id;
    const highlighted = isHighlighted(drone.id);
    const brushed = passesBrushFilter(drone);

    let fillOpacity, opacity;
    if (hovered) {
      fillOpacity = 0.25; opacity = 1.0;
    } else if (highlighted && brushed) {
      fillOpacity = 0.15; opacity = 0.6;
    } else if (!brushed) {
      fillOpacity = 0.02; opacity = 0.1;
    } else {
      // highlighted===true when set is empty (all visible), or this one is in set
      fillOpacity = highlighted ? 0.15 : 0.03;
      opacity = highlighted ? 0.6 : 0.15;
    }

    const circle = L.circle([center.lat, center.lng], {
      radius: 0,
      color,
      fillColor: color,
      fillOpacity,
      opacity,
      weight: 1.5,
      interactive: true,
    }).addTo(map);

    circle.bindTooltip(buildTooltipHtml(drone, color), {
      className: 'drone-tooltip',
      sticky: true,
      opacity: 1,
    });

    circle.on('mouseover', () => setState({ hoveredDroneId: drone.id }));
    circle.on('mouseout', () => setState({ hoveredDroneId: null }));
    circle.on('click', e => {
      L.DomEvent.stopPropagation(e);
      toggleHighlight(drone.id);
    });

    circleLayers.push(circle);

    // Animate from 0 → target
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
}

// ─── renderRoute ──────────────────────────────────────────────────────────────

export function renderRoute() {
  if (!map) return;
  const { route } = getState();

  // Clear previous route layers
  routeLayers.forEach(l => map.removeLayer(l));
  routeLayers = [];

  if (!route) return;

  const { latlngs, distanceKm, straightKm } = route;
  if (!latlngs || latlngs.length < 2) return;

  // Buffer polygon (1.6 km offset)
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

  // Road polyline
  const roadLine = L.polyline(latlngs, {
    color: '#ffd166',
    weight: 2.5,
    opacity: 0.85,
    interactive: false,
  }).addTo(map);
  routeLayers.push(roadLine);

  // Straight-line reference
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

  // Start pin
  const startPin = L.circleMarker(start, {
    radius: 7,
    color: '#2ecc71',
    fillColor: '#2ecc71',
    fillOpacity: 1,
    weight: 2,
    interactive: false,
  }).addTo(map);
  routeLayers.push(startPin);

  // End pin
  const endPin = L.circleMarker(end, {
    radius: 7,
    color: '#e74c3c',
    fillColor: '#e74c3c',
    fillOpacity: 1,
    weight: 2,
    interactive: false,
  }).addTo(map);
  routeLayers.push(endPin);

  // Distance label at midpoint
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

export function initMap(containerId) {
  map = L.map(containerId, {
    center: [39.8, -98.5],
    zoom: 4,
    zoomControl: true,
  });

  // CartoDB dark tiles (free, no API key)
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }
  ).addTo(map);

  // Map click → set center, hide prompt
  map.on('click', e => {
    const { route } = getState();
    if (route) return; // skip if route mode is active
    setState({ center: { lat: e.latlng.lat, lng: e.latlng.lng } });
    const prompt = document.getElementById('map-prompt');
    if (prompt) prompt.style.display = 'none';
  });

  // Re-render circles on zoom (label text changes at zoom 8)
  map.on('zoomend', () => renderCircles());

  // Subscribe to state changes
  subscribe(() => {
    renderCircles();
    renderRoute();
  });
}
