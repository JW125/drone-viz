import { getState, setState, subscribe, getVisibleDrones } from './state.js';

// ─── haversine ────────────────────────────────────────────────────────────────

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ─── geocode via Nominatim ────────────────────────────────────────────────────

async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DroneRangeViz/1.0' },
  });
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

// ─── sleep helper ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── status helpers ───────────────────────────────────────────────────────────

function setStatus(html, type = '') {
  const el = document.getElementById('route-status');
  if (!el) return;
  el.innerHTML = html;
  el.className = type ? `route-status-${type}` : '';
}

// ─── route results panel ──────────────────────────────────────────────────────

function renderRouteResults() {
  const { route } = getState();

  // Remove existing results panel
  const existing = document.getElementById('route-results');
  if (existing) existing.remove();

  if (!route) return;

  const { roadDistanceKm, straightLineKm, fallback } = route;
  const oneWayKm = roadDistanceKm;
  const roundTripKm = roadDistanceKm * 2;

  const drones = getVisibleDrones();
  if (drones.length === 0) return;

  // Categorise drones
  const green = [];
  const yellow = [];
  const red = [];

  for (const drone of drones) {
    const opRadius = drone.operationalRadiusKm ?? 0;
    const maxRange = drone.maxRangeKm ?? 0;

    if (opRadius * 2 >= roundTripKm) {
      // Can complete round-trip on operational radius
      const surplus = opRadius * 2 - roundTripKm;
      green.push({ drone, surplus });
    } else if (maxRange >= oneWayKm) {
      // One-way possible but not round-trip
      const deficit = roundTripKm - opRadius * 2;
      yellow.push({ drone, deficit });
    } else {
      // Cannot even complete one-way
      const deficit = oneWayKm - maxRange;
      red.push({ drone, deficit });
    }
  }

  // Sort within each group
  green.sort((a, b) => b.surplus - a.surplus);
  yellow.sort((a, b) => a.deficit - b.deficit);
  red.sort((a, b) => a.deficit - b.deficit);

  // Build HTML
  let html = `<div id="route-results">`;
  html += `<div class="route-results-header">`;
  html += `Route Feasibility`;
  if (fallback) {
    html += ` <span class="route-fallback-badge" title="OSRM unavailable — using straight-line distance">straight-line</span>`;
  }
  html += `</div>`;
  html += `<div class="route-results-summary">`;
  html += `<span class="route-dist-road">${roadDistanceKm.toFixed(1)} km road</span>`;
  if (straightLineKm != null) {
    html += ` · <span class="route-dist-straight">${straightLineKm.toFixed(1)} km straight</span>`;
  }
  html += ` · <span class="route-dist-rt">Round-trip: ${roundTripKm.toFixed(1)} km</span>`;
  html += `</div>`;

  function renderGroup(items, colorClass, label, showSurplus) {
    if (items.length === 0) return '';
    let g = `<div class="feasibility-group">`;
    g += `<div class="feasibility-label ${colorClass}">${label} (${items.length})</div>`;

    const displayItems = colorClass === 'red' ? items.slice(0, 3) : items;
    for (const item of displayItems) {
      const { drone } = item;
      const val = showSurplus ? item.surplus : item.deficit;
      const sign = showSurplus ? '+' : '-';
      const detail = colorClass === 'green'
        ? `op. radius ${(drone.operationalRadiusKm ?? 0).toFixed(0)} km`
        : colorClass === 'yellow'
          ? `max range ${(drone.maxRangeKm ?? 0).toFixed(0)} km, needs ${roundTripKm.toFixed(0)} km round-trip`
          : `max range ${(drone.maxRangeKm ?? 0).toFixed(0)} km, needs ${oneWayKm.toFixed(0)} km one-way`;

      g += `<div class="feasibility-row">`;
      g += `<span class="feasibility-dot ${colorClass}"></span>`;
      g += `<span class="feasibility-name">${drone.name ?? drone.id}</span>`;
      g += `<span class="feasibility-delta ${colorClass}">${sign}${val.toFixed(1)} km</span>`;
      g += `<span class="feasibility-detail">${detail}</span>`;
      g += `</div>`;
    }

    if (colorClass === 'red' && items.length > 3) {
      const remaining = items.length - 3;
      g += `<div class="feasibility-more">${remaining} more out of range</div>`;
    }

    g += `</div>`;
    return g;
  }

  html += renderGroup(green, 'green', 'Round-trip capable', true);
  html += renderGroup(yellow, 'yellow', 'One-way only', false);
  html += renderGroup(red, 'red', 'Out of range', false);
  html += `</div>`;

  // Prepend to #chart-container
  const chartContainer = document.getElementById('chart-container');
  if (chartContainer) {
    chartContainer.insertAdjacentHTML('afterbegin', html);
  }
}

// ─── initRoute ────────────────────────────────────────────────────────────────

export function initRoute() {
  // Collapsible toggle
  const toggleLabel = document.querySelector('.route-toggle-label');
  const inputsDiv = document.querySelector('.route-inputs');
  if (toggleLabel && inputsDiv) {
    toggleLabel.addEventListener('click', () => {
      inputsDiv.classList.toggle('collapsed');
      toggleLabel.textContent = inputsDiv.classList.contains('collapsed')
        ? 'Route Feasibility ▸'
        : 'Route Feasibility ▾';
    });
  }

  // Check Route button
  const checkBtn = document.getElementById('route-check');
  if (checkBtn) {
    checkBtn.addEventListener('click', async () => {
      const startVal = document.getElementById('route-start')?.value?.trim();
      const endVal = document.getElementById('route-end')?.value?.trim();

      if (!startVal || !endVal) {
        setStatus('Please enter both a start and end address.', 'error');
        return;
      }

      checkBtn.disabled = true;
      setStatus('Geocoding start address…');

      // Geocode start
      let startCoord;
      try {
        startCoord = await geocode(startVal);
      } catch (e) {
        setStatus('Network error geocoding start address.', 'error');
        checkBtn.disabled = false;
        return;
      }

      if (!startCoord) {
        setStatus('Could not find that address.', 'error');
        checkBtn.disabled = false;
        return;
      }

      setStatus('Waiting for rate limit…');
      await sleep(1100); // Nominatim rate limit

      setStatus('Geocoding end address…');

      // Geocode end
      let endCoord;
      try {
        endCoord = await geocode(endVal);
      } catch (e) {
        setStatus('Network error geocoding end address.', 'error');
        checkBtn.disabled = false;
        return;
      }

      if (!endCoord) {
        setStatus('Could not find that address.', 'error');
        checkBtn.disabled = false;
        return;
      }

      // Straight-line distance
      const straightLineKm = haversineKm(startCoord, endCoord);

      if (straightLineKm < 0.01) {
        setStatus('Start and end appear to be the same location.', 'info');
        checkBtn.disabled = false;
        return;
      }

      setStatus('Fetching road route…');

      // OSRM routing
      let polyline;
      let roadDistanceKm;
      let fallback = false;

      try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startCoord.lng},${startCoord.lat};${endCoord.lng},${endCoord.lat}?overview=full&geometries=geojson`;
        const osrmRes = await fetch(osrmUrl);
        const osrmData = await osrmRes.json();

        if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
          const osrmRoute = osrmData.routes[0];
          // OSRM returns [lng, lat]; convert to [lat, lng] for Leaflet
          polyline = osrmRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          roadDistanceKm = osrmRoute.distance / 1000;
        } else {
          throw new Error('OSRM returned no route');
        }
      } catch (e) {
        // Fallback to straight-line
        fallback = true;
        polyline = [
          [startCoord.lat, startCoord.lng],
          [endCoord.lat, endCoord.lng],
        ];
        roadDistanceKm = straightLineKm;
        setStatus('Road routing unavailable — using straight-line distance.', 'warn');
      }

      // Set state — map.js reads state.route and draws the polyline
      setState({
        route: {
          start: startCoord,
          end: endCoord,
          polyline,
          latlngs: polyline,             // map.js reads `latlngs`
          roadDistanceKm,
          distanceKm: roadDistanceKm,    // map.js reads `distanceKm`
          straightLineKm,
          straightKm: straightLineKm,    // map.js reads `straightKm`
          fallback,
        },
        center: { lat: startCoord.lat, lng: startCoord.lng },
      });

      // Hide map prompt
      const prompt = document.getElementById('map-prompt');
      if (prompt) prompt.style.display = 'none';

      const roundTripKm = roadDistanceKm * 2;
      const distMsg = fallback
        ? `Straight-line: ${roadDistanceKm.toFixed(1)} km one-way · ${roundTripKm.toFixed(1)} km round-trip`
        : `Road: ${roadDistanceKm.toFixed(1)} km one-way · ${roundTripKm.toFixed(1)} km round-trip (straight-line: ${straightLineKm.toFixed(1)} km)`;

      setStatus(distMsg, 'ok');
      checkBtn.disabled = false;
    });
  }

  // Clear Route button
  const clearBtn = document.getElementById('route-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      setState({ route: null, center: null });

      const startInput = document.getElementById('route-start');
      const endInput = document.getElementById('route-end');
      if (startInput) startInput.value = '';
      if (endInput) endInput.value = '';

      setStatus('');

      // Show map prompt again
      const prompt = document.getElementById('map-prompt');
      if (prompt) prompt.style.display = '';

      // Remove results panel
      const results = document.getElementById('route-results');
      if (results) results.remove();
    });
  }

  // Subscribe to state for results panel
  subscribe(() => {
    renderRouteResults();
  });
}
