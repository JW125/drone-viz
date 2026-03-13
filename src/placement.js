import L from 'leaflet';
import { getState } from './state.js';
import { getManufacturerColor } from './colors.js';

// ─── placed drones (independent of the concentric-circle system) ─────────

let placedGroups = [];   // Each entry: { layers: [circle, pin, label] }
let placementMode = false;
let selectedDrone = null;
let mapRef = null;

export function setMapRef(map) { mapRef = map; }

// ─── modal logic ─────────────────────────────────────────────────────────

export function initPlacement() {
  const modal      = document.getElementById('drone-modal');
  const backdrop   = modal.querySelector('.modal-backdrop');
  const closeBtn   = modal.querySelector('.modal-close');
  const cancelBtn  = document.getElementById('modal-cancel');
  const placeBtn   = document.getElementById('modal-place');
  const mfgSelect  = document.getElementById('modal-manufacturer');
  const typeSelect = document.getElementById('modal-type');
  const droneSelect = document.getElementById('modal-drone');
  const statsDiv   = document.getElementById('modal-stats');
  const addBtn     = document.getElementById('add-drone-btn');

  const { drones } = getState();

  // Populate manufacturer dropdown
  const mfgs = [...new Set(drones.map(d => d.manufacturer))].sort();
  mfgs.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    mfgSelect.appendChild(opt);
  });

  function openModal() {
    modal.classList.remove('hidden');
    mfgSelect.value = '';
    typeSelect.innerHTML = '<option value="">Select type...</option>';
    droneSelect.innerHTML = '<option value="">Select drone...</option>';
    statsDiv.innerHTML = '';
    placeBtn.disabled = true;
    selectedDrone = null;
  }

  function closeModal() {
    modal.classList.add('hidden');
    exitPlacement();
  }

  function exitPlacement() {
    placementMode = false;
    selectedDrone = null;
    if (mapRef) mapRef.getContainer().style.cursor = '';
    addBtn.textContent = '+';
    addBtn.title = 'Place a drone on the map';
    addBtn.classList.remove('active');
  }

  addBtn.addEventListener('click', () => {
    if (placementMode) {
      exitPlacement();
    } else {
      openModal();
    }
  });
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);

  // Esc key exits placement mode
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && placementMode) exitPlacement();
  });

  // Manufacturer → populate types
  mfgSelect.addEventListener('change', () => {
    const mfg = mfgSelect.value;
    typeSelect.innerHTML = '<option value="">Select type...</option>';
    droneSelect.innerHTML = '<option value="">Select drone...</option>';
    statsDiv.innerHTML = '';
    placeBtn.disabled = true;
    selectedDrone = null;

    if (!mfg) return;
    const types = [...new Set(drones.filter(d => d.manufacturer === mfg).map(d => d.type))].sort();
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      typeSelect.appendChild(opt);
    });
  });

  // Type → populate drones
  typeSelect.addEventListener('change', () => {
    const mfg = mfgSelect.value;
    const type = typeSelect.value;
    droneSelect.innerHTML = '<option value="">Select drone...</option>';
    statsDiv.innerHTML = '';
    placeBtn.disabled = true;
    selectedDrone = null;

    if (!mfg || !type) return;
    const matching = drones.filter(d => d.manufacturer === mfg && d.type === type);
    matching.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      droneSelect.appendChild(opt);
    });
  });

  // Drone → show stats + enable place
  droneSelect.addEventListener('change', () => {
    const droneId = droneSelect.value;
    statsDiv.innerHTML = '';
    placeBtn.disabled = true;
    selectedDrone = null;

    if (!droneId) return;
    const drone = drones.find(d => d.id === droneId);
    if (!drone) return;
    selectedDrone = drone;
    placeBtn.disabled = false;

    const color = getManufacturerColor(drone.manufacturer);
    const fmt = v => v == null ? '—' : v;
    const fmtK = v => v == null ? '—' : `$${Number(v).toLocaleString()}`;
    statsDiv.innerHTML = `
      <div class="stat-header" style="color:${color}">${drone.manufacturer} ${drone.name}</div>
      <div class="stat-grid">
        <span class="stat-label">Op. Radius</span><span>${fmt(drone.operationalRadiusKm)} km</span>
        <span class="stat-label">Max Range</span><span>${fmt(drone.maxRangeKm)} km</span>
        <span class="stat-label">Payload</span><span>${fmt(drone.maxPayloadKg)} kg</span>
        <span class="stat-label">Flight Time</span><span>${fmt(drone.flightTimeMin)} min</span>
        <span class="stat-label">Weight</span><span>${fmt(drone.weightKg)} kg</span>
        <span class="stat-label">MSRP</span><span>${fmtK(drone.msrp)}</span>
      </div>
    `;
  });

  // Place button → enter placement mode
  placeBtn.addEventListener('click', () => {
    if (!selectedDrone || !mapRef) return;
    placementMode = true;
    modal.classList.add('hidden');
    mapRef.getContainer().style.cursor = 'crosshair';
    addBtn.textContent = '✓';
    addBtn.title = 'Done placing';
    addBtn.classList.add('active');
  });

}

// Called from map click handler
export function isPlacementMode() { return placementMode; }

export function handlePlacementClick(latlng) {
  if (!placementMode || !selectedDrone || !mapRef) return false;

  const drone = selectedDrone;
  const color = getManufacturerColor(drone.manufacturer);
  const { rangeMode } = getState();
  const rangeKm = rangeMode === 'roundtrip' ? drone.operationalRadiusKm : drone.maxRangeKm;

  const group = { layers: [] };

  if (rangeKm) {
    const circle = L.circle([latlng.lat, latlng.lng], {
      radius: rangeKm * 1000,
      color,
      fillColor: color,
      fillOpacity: 0.12,
      opacity: 0.6,
      weight: 1.5,
      interactive: false,
    }).addTo(mapRef);
    group.layers.push(circle);
  }

  // Pin marker
  const pin = L.circleMarker([latlng.lat, latlng.lng], {
    radius: 5,
    color,
    fillColor: color,
    fillOpacity: 1,
    weight: 2,
  }).addTo(mapRef);

  pin.bindTooltip(`<b style="color:${color}">${drone.manufacturer} ${drone.name}</b><br>` +
    `Range: ${drone.operationalRadiusKm ?? '—'} km radius<br>` +
    `Flight: ${drone.flightTimeMin ?? '—'} min`, {
    className: 'drone-tooltip',
    sticky: true,
  });

  // Double-click pin to remove this placement
  pin.on('dblclick', (e) => {
    L.DomEvent.stopPropagation(e);
    removePlacement(group);
  });

  group.layers.push(pin);

  // Label
  const label = L.marker([latlng.lat, latlng.lng], {
    interactive: false,
    icon: L.divIcon({
      className: 'arc-label',
      html: `<span style="color:${color};text-shadow:0 1px 3px #000,0 0 6px #000;font-size:10px">${drone.name}</span>`,
      iconAnchor: [-8, 4],
    }),
  }).addTo(mapRef);
  group.layers.push(label);

  placedGroups.push(group);

  // Stay in placement mode — click "+" again or Esc to exit
  return true;
}

function removePlacement(group) {
  group.layers.forEach(l => mapRef?.removeLayer(l));
  const idx = placedGroups.indexOf(group);
  if (idx > -1) placedGroups.splice(idx, 1);
}

export function clearPlacedDrones() {
  placedGroups.forEach(g => g.layers.forEach(l => mapRef?.removeLayer(l)));
  placedGroups = [];
}
