import { getState, setState, subscribe } from './state.js';
import { getManufacturerColor } from './colors.js';

export function initFilters(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Prepend filter controls before the existing route panel
  const filterHtml = `
    <div class="filter-group">
      <div class="filter-label">Manufacturer</div>
      <div class="multi-select" data-filter="manufacturer">
        <div class="selected-chips"></div>
        <button class="dropdown-toggle">Select...</button>
        <div class="dropdown-menu hidden"></div>
      </div>
    </div>
    <div class="filter-group">
      <div class="filter-label">Type</div>
      <div class="multi-select" data-filter="type">
        <div class="selected-chips"></div>
        <button class="dropdown-toggle">Select...</button>
        <div class="dropdown-menu hidden"></div>
      </div>
    </div>
    <div class="filter-group">
      <div class="filter-label">Range Mode</div>
      <div class="toggle-buttons">
        <button class="toggle-btn active" data-mode="roundtrip">Round-Trip</button>
        <button class="toggle-btn" data-mode="oneway">One-Way</button>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('afterbegin', filterHtml);

  setupMultiSelect('manufacturer');
  setupMultiSelect('type');
  setupRangeToggle();
  renderChips();
}

function setupMultiSelect(filterKey) {
  const el = document.querySelector(`.multi-select[data-filter="${filterKey}"]`);
  if (!el) return;

  const toggle = el.querySelector('.dropdown-toggle');
  const menu = el.querySelector('.dropdown-menu');

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = menu.classList.contains('hidden');

    // Close all other open menus
    document.querySelectorAll('.dropdown-menu').forEach(m => {
      if (m !== menu) m.classList.add('hidden');
    });

    if (isHidden) {
      menu.classList.remove('hidden');
      populateMenu(filterKey, menu);
    } else {
      menu.classList.add('hidden');
    }
  });

  menu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  document.addEventListener('click', () => {
    menu.classList.add('hidden');
  });
}

function populateMenu(filterKey, menu) {
  const state = getState();
  const drones = state.drones || [];
  const stateKey = filterKey === 'manufacturer' ? 'selectedManufacturers' : 'selectedTypes';
  const selected = state[stateKey] || [];

  // Count occurrences of each value
  const counts = {};
  drones.forEach(d => {
    const val = d[filterKey];
    if (val != null) {
      counts[val] = (counts[val] || 0) + 1;
    }
  });

  const allValues = Object.keys(counts).sort();

  menu.innerHTML = `
    <div class="dropdown-actions">
      <button class="dropdown-action" data-action="select-all">Select All</button>
      <button class="dropdown-action" data-action="clear">Clear</button>
    </div>
    ${allValues.map(val => {
      const isChecked = selected.includes(val);
      const color = filterKey === 'manufacturer' ? getManufacturerColor(val) : null;
      const dotHtml = color
        ? `<span class="color-dot" style="background:${color}"></span>`
        : '';
      return `
        <label class="dropdown-item">
          <input type="checkbox" value="${val}" ${isChecked ? 'checked' : ''}>
          ${dotHtml}
          <span class="item-name">${val}</span>
          <span class="item-count">${counts[val]}</span>
        </label>
      `;
    }).join('')}
  `;

  // Select All action
  menu.querySelector('[data-action="select-all"]').addEventListener('click', () => {
    setState({ [stateKey]: [...allValues] });
    populateMenu(filterKey, menu);
  });

  // Clear action
  menu.querySelector('[data-action="clear"]').addEventListener('click', () => {
    setState({ [stateKey]: [] });
    populateMenu(filterKey, menu);
  });

  // Checkbox changes
  menu.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const currentState = getState();
      const currentSelected = [...(currentState[stateKey] || [])];
      const val = checkbox.value;
      if (checkbox.checked) {
        if (!currentSelected.includes(val)) currentSelected.push(val);
      } else {
        const idx = currentSelected.indexOf(val);
        if (idx > -1) currentSelected.splice(idx, 1);
      }
      setState({ [stateKey]: currentSelected });
    });
  });
}

function renderChips() {
  subscribe((state) => {
    renderChipsForFilter('manufacturer', state.selectedManufacturers || []);
    renderChipsForFilter('type', state.selectedTypes || []);
  });
}

function renderChipsForFilter(filterKey, selectedValues) {
  const el = document.querySelector(`.multi-select[data-filter="${filterKey}"]`);
  if (!el) return;

  const chipsContainer = el.querySelector('.selected-chips');
  if (!chipsContainer) return;

  const stateKey = filterKey === 'manufacturer' ? 'selectedManufacturers' : 'selectedTypes';
  const accentColor = '#4a9eff';

  chipsContainer.innerHTML = selectedValues.map(val => {
    const color = filterKey === 'manufacturer' ? getManufacturerColor(val) : accentColor;
    return `
      <span class="chip" style="background:${color}20; color:${color}; border: 1px solid ${color}40;">
        ${val}
        <span class="chip-remove" data-filter="${filterKey}" data-value="${val}">×</span>
      </span>
    `;
  }).join('');

  chipsContainer.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = btn.dataset.value;
      const currentState = getState();
      const currentSelected = [...(currentState[stateKey] || [])];
      const idx = currentSelected.indexOf(value);
      if (idx > -1) currentSelected.splice(idx, 1);
      setState({ [stateKey]: currentSelected });
    });
  });
}

function setupRangeToggle() {
  const toggleContainer = document.querySelector('.toggle-buttons');
  if (!toggleContainer) return;

  toggleContainer.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleContainer.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setState({ rangeMode: btn.dataset.mode });
    });
  });
}
