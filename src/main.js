import './style.css';
import { setState } from './state.js';
import { initMap, getMapInstance } from './map.js';
import { initFilters } from './filters.js';
import { initChart, renderDroneTags } from './chart.js';
import { initRoute } from './route.js';
import { initPlacement, setMapRef as setPlacementMap } from './placement.js';
import {
  setMapRef as setOverlayMap,
  initSatelliteToggle,
  initStructureOverlay,
  initBusinessOverlay,
} from './overlays.js';

async function init() {
  const response = await fetch(`${import.meta.env.BASE_URL}drones.json`);
  const drones = await response.json();
  setState({ drones });

  initMap('map');

  const map = getMapInstance();
  setPlacementMap(map);
  setOverlayMap(map);

  initFilters('filter-bar');
  initChart('parallel-chart');
  renderDroneTags('drone-tags');
  initRoute();
  initPlacement();
  initSatelliteToggle();
  initStructureOverlay();
  initBusinessOverlay();
}

init();
