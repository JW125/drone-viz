import L from 'leaflet';

// ─── module state ────────────────────────────────────────────────────────────

let mapRef = null;
let structureLayers = [];
let businessLayers = [];
let legendEl = null;
let businessesVisible = false;
let satelliteLayer = null;
let streetLayer = null;
let isSatellite = false;

export function setMapRef(map) { mapRef = map; }

// ─── satellite toggle ────────────────────────────────────────────────────────

export function initSatelliteToggle() {
  const btn = document.getElementById('toggle-satellite');
  if (!btn || !mapRef) return;

  streetLayer = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    { attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 19 }
  );

  satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '&copy; Esri', maxZoom: 19 }
  );

  btn.addEventListener('click', () => {
    if (isSatellite) {
      mapRef.removeLayer(satelliteLayer);
      streetLayer.addTo(mapRef);
      btn.textContent = 'S';
      btn.title = 'Toggle satellite view';
    } else {
      mapRef.eachLayer(l => { if (l._url && l._url.includes('carto')) mapRef.removeLayer(l); });
      satelliteLayer.addTo(mapRef);
      btn.textContent = 'M';
      btn.title = 'Toggle map view';
    }
    isSatellite = !isSatellite;
  });
}

// ─── structure overlay ───────────────────────────────────────────────────────

export function initStructureOverlay() {
  const select = document.getElementById('town-select');
  legendEl = document.getElementById('structure-legend');
  if (!select) return;

  select.addEventListener('change', async () => {
    clearStructures();
    const town = select.value;
    if (!town) {
      legendEl?.classList.add('hidden');
      return;
    }

    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}${town}-structures.json`);
      const data = await resp.json();
      renderStructures(data);
    } catch (e) {
      console.error('Failed to load structures:', e);
    }
  });
}

function renderStructures(data) {
  if (!mapRef) return;

  // Fly to town center
  mapRef.flyTo([data.center.lat, data.center.lon], 13, { duration: 1.5 });

  // Render each structure as a small circle marker
  for (const s of data.structures) {
    const marker = L.circleMarker([s.lat, s.lon], {
      radius: 4,
      color: s.color,
      fillColor: s.color,
      fillOpacity: 0.7,
      weight: 1,
      opacity: 0.9,
    }).addTo(mapRef);

    const assessed = s.assessed ? `$${s.assessed.toLocaleString()}` : '—';
    marker.bindTooltip(
      `<b>${s.location || 'Unknown'}</b><br>` +
      `<span style="color:${s.color}">${s.primeUse}</span><br>` +
      `Assessed: ${assessed}`,
      { className: 'drone-tooltip', sticky: true }
    );

    structureLayers.push(marker);
  }

  // Build legend
  if (legendEl) {
    if (data.structures.length === 0) {
      legendEl.innerHTML = `<div class="legend-title">${data.town}, ${data.state || 'ME'}</div>
        <div class="legend-row"><span class="legend-label" style="color:var(--text-muted)">No structure data available</span></div>`;
      legendEl.classList.remove('hidden');
      return;
    }

    const useCounts = {};
    for (const s of data.structures) {
      useCounts[s.primeUse] = (useCounts[s.primeUse] || 0) + 1;
    }

    let html = '<div class="legend-title">Structures</div>';
    const sorted = Object.entries(useCounts).sort((a, b) => b[1] - a[1]);
    for (const [use, count] of sorted) {
      const color = data.legend[use] || '#777';
      html += `<div class="legend-row">
        <span class="legend-dot" style="background:${color}"></span>
        <span class="legend-label">${use}</span>
        <span class="legend-count">${count}</span>
      </div>`;
    }
    legendEl.innerHTML = html;
    legendEl.classList.remove('hidden');
  }
}

function clearStructures() {
  structureLayers.forEach(l => mapRef?.removeLayer(l));
  structureLayers = [];
}

// ─── business overlay (Overpass API) ─────────────────────────────────────────

export function initBusinessOverlay() {
  const btn = document.getElementById('toggle-businesses');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (businessesVisible) {
      clearBusinesses();
      businessesVisible = false;
      btn.classList.remove('active');
      return;
    }

    // Get current map bounds
    if (!mapRef) return;
    const bounds = mapRef.getBounds();
    const s = bounds.getSouth();
    const w = bounds.getWest();
    const n = bounds.getNorth();
    const e = bounds.getEast();

    btn.textContent = '...';
    btn.disabled = true;

    try {
      const query = `[out:json][timeout:15];
(
  node["shop"~"supermarket|convenience|grocery|hardware|chemist|pharmacy"](${s},${w},${n},${e});
  node["amenity"~"pharmacy"](${s},${w},${n},${e});
);
out;`;

      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const data = await resp.json();

      const iconMap = {
        supermarket: { color: '#2ecc71', label: 'Grocery' },
        grocery: { color: '#2ecc71', label: 'Grocery' },
        convenience: { color: '#27ae60', label: 'Market' },
        pharmacy: { color: '#e74c3c', label: 'Pharmacy' },
        chemist: { color: '#e74c3c', label: 'Pharmacy' },
        hardware: { color: '#f39c12', label: 'Hardware' },
      };

      for (const el of data.elements) {
        const tags = el.tags || {};
        const shopType = tags.shop || tags.amenity || '';
        const info = iconMap[shopType] || { color: '#3498db', label: shopType };
        const name = tags.name || info.label;

        const marker = L.circleMarker([el.lat, el.lon], {
          radius: 6,
          color: info.color,
          fillColor: info.color,
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(mapRef);

        marker.bindTooltip(
          `<b style="color:${info.color}">${name}</b><br>${info.label}`,
          { className: 'drone-tooltip', sticky: true }
        );

        businessLayers.push(marker);
      }

      businessesVisible = true;
      btn.classList.add('active');
    } catch (e) {
      console.error('Business overlay failed:', e);
    } finally {
      btn.textContent = 'B';
      btn.disabled = false;
    }
  });
}

function clearBusinesses() {
  businessLayers.forEach(l => mapRef?.removeLayer(l));
  businessLayers = [];
}
