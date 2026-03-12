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
