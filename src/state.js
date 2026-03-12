const listeners = [];

const state = {
  drones: [],
  selectedManufacturers: [],
  selectedTypes: [],
  rangeMode: 'roundtrip',
  center: null,
  highlightedDroneIds: new Set(),
  hoveredDroneId: null,
  brushRanges: {},
  route: null,
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
