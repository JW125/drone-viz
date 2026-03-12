import * as d3 from 'd3';
import { getState, setState, subscribe, getVisibleDrones, getDroneRange, isHighlighted, toggleHighlight } from './state.js';
import { getManufacturerColor } from './colors.js';

const AXES = [
  { key: 'range',           label: 'Range (km)',    accessor: d => getDroneRange(d) },
  { key: 'maxPayloadKg',    label: 'Payload (kg)',  accessor: d => d.maxPayloadKg },
  { key: 'rechargeTimeMin', label: 'Recharge (min)',accessor: d => d.rechargeTimeMin },
  { key: 'flightTimeMin',   label: 'Flight (min)',  accessor: d => d.flightTimeMin },
  { key: 'msrp',            label: 'MSRP ($)',      accessor: d => d.msrp },
];

const DASH_PATTERNS = ['', '8,4', '4,4', '2,4', '8,2,2,2'];

// Map from manufacturer → index (populated as we encounter new ones)
const manufacturerIndex = new Map();
function getManufacturerIndex(manufacturer) {
  if (!manufacturerIndex.has(manufacturer)) {
    manufacturerIndex.set(manufacturer, manufacturerIndex.size);
  }
  return manufacturerIndex.get(manufacturer);
}

// ─── renderChart ─────────────────────────────────────────────────────────────

function renderChart(container) {
  // Clear previous render
  d3.select(container).selectAll('*').remove();

  const drones = getVisibleDrones();

  if (drones.length === 0) {
    d3.select(container)
      .append('div')
      .attr('class', 'empty-state')
      .style('color', '#888')
      .style('font-size', '13px')
      .style('padding', '32px 16px')
      .style('text-align', 'center')
      .text('No drones match the current filters.');
    return;
  }

  const margin = { top: 30, right: 20, bottom: 10, left: 20 };
  const totalWidth  = container.clientWidth  || 400;
  const totalHeight = container.clientHeight || 320;
  const width  = totalWidth  - margin.left - margin.right;
  const height = totalHeight - margin.top  - margin.bottom;

  // Filter axes to those with at least one non-null value
  const activeAxes = AXES.filter(axis =>
    drones.some(d => axis.accessor(d) != null)
  );

  if (activeAxes.length < 2) return;

  // ── Scales ──────────────────────────────────────────────────────────────────

  const xScale = d3.scalePoint()
    .domain(activeAxes.map(a => a.key))
    .range([0, width])
    .padding(0.1);

  const yScales = {};
  for (const axis of activeAxes) {
    const vals = drones.map(d => axis.accessor(d)).filter(v => v != null);
    yScales[axis.key] = d3.scaleLinear()
      .domain(d3.extent(vals))
      .range([height, 0])
      .nice();
  }

  // ── SVG ─────────────────────────────────────────────────────────────────────

  const svg = d3.select(container)
    .append('svg')
    .attr('width',  totalWidth)
    .attr('height', totalHeight);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // ── Axes ────────────────────────────────────────────────────────────────────

  for (const axis of activeAxes) {
    const x = xScale(axis.key);
    const axisG = g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(${x},0)`);

    // Axis line
    const tickFormat = axis.key === 'msrp'
      ? v => `$${d3.format(',.0f')(v)}`
      : d3.format('.3~g');

    const d3Axis = d3.axisLeft(yScales[axis.key])
      .ticks(5)
      .tickFormat(tickFormat);

    axisG.call(d3Axis);

    // Style axis elements
    axisG.selectAll('text')
      .style('fill', '#888')
      .style('font-size', '10px');

    axisG.selectAll('line, path')
      .style('stroke', '#333');

    // Axis label (above)
    axisG.append('text')
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .style('fill', '#888')
      .style('font-size', '10px')
      .text(axis.label);

    // ── Brush ────────────────────────────────────────────────────────────────

    const brush = d3.brushY()
      .extent([[-10, 0], [10, height]])
      .on('brush end', (event) => {
        const brushRanges = { ...getState().brushRanges };
        if (event.selection) {
          const [y0, y1] = event.selection;
          brushRanges[axis.key] = [
            yScales[axis.key].invert(y1),
            yScales[axis.key].invert(y0),
          ];
        } else {
          delete brushRanges[axis.key];
        }
        setState({ brushRanges });
      });

    axisG.append('g')
      .attr('class', 'brush')
      .call(brush);
  }

  // ── Lines (drone paths) ──────────────────────────────────────────────────────

  const { brushRanges, hoveredDroneId } = getState();

  // Line generator
  const lineGen = d3.line()
    .x(([axisKey]) => xScale(axisKey))
    .y(([axisKey, val]) => yScales[axisKey](val))
    .defined(([, val]) => val != null);

  // Sort: highlighted / passes-brush on top
  const sorted = [...drones].sort((a, b) => {
    const aH = getState().highlightedDroneIds.has(a.id) ? 1 : 0;
    const bH = getState().highlightedDroneIds.has(b.id) ? 1 : 0;
    return aH - bH;
  });

  for (const drone of sorted) {
    // Collect non-null points: [[axisKey, value], ...]
    const points = activeAxes
      .map(axis => [axis.key, axis.accessor(drone)])
      .filter(([, v]) => v != null);

    if (points.length < 2) continue;

    // Brush filter
    let passesBrush = true;
    for (const [axisKey, [min, max]] of Object.entries(brushRanges)) {
      const axis = activeAxes.find(a => a.key === axisKey);
      if (axis) {
        const val = axis.accessor(drone);
        if (val != null && (val < min || val > max)) {
          passesBrush = false;
          break;
        }
      }
    }

    const hovered     = hoveredDroneId === drone.id;
    const highlighted = getState().highlightedDroneIds.has(drone.id);
    const anyHighlighted = getState().highlightedDroneIds.size > 0;

    // Opacity logic
    let opacity;
    if (hovered)           opacity = 1;
    else if (!passesBrush) opacity = 0.1;
    else if (highlighted)  opacity = 0.85;
    else if (anyHighlighted) opacity = 0.15;
    else                   opacity = 0.55;

    const strokeWidth = hovered ? 3 : 1.5;
    const color = getManufacturerColor(drone.manufacturer);
    const mIdx  = getManufacturerIndex(drone.manufacturer);
    const dashArray = DASH_PATTERNS[mIdx % DASH_PATTERNS.length];

    const pathG = g.append('g').attr('class', 'drone-path-group');

    // Draw path
    pathG.append('path')
      .datum(points)
      .attr('class', 'drone-line')
      .attr('d', lineGen)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', strokeWidth)
      .attr('stroke-dasharray', dashArray || null)
      .attr('opacity', opacity)
      .style('cursor', 'pointer')
      .on('mouseenter', () => setState({ hoveredDroneId: drone.id }))
      .on('mouseleave', () => setState({ hoveredDroneId: null }))
      .on('click', (event) => {
        event.stopPropagation();
        toggleHighlight(drone.id);
      });

    // Draw dots at each axis point
    for (const [axisKey, val] of points) {
      pathG.append('circle')
        .attr('cx', xScale(axisKey))
        .attr('cy', yScales[axisKey](val))
        .attr('r', hovered ? 4 : 3)
        .attr('fill', color)
        .attr('opacity', opacity)
        .style('cursor', 'pointer')
        .on('mouseenter', () => setState({ hoveredDroneId: drone.id }))
        .on('mouseleave', () => setState({ hoveredDroneId: null }))
        .on('click', (event) => {
          event.stopPropagation();
          toggleHighlight(drone.id);
        });
    }
  }
}

// ─── initChart ───────────────────────────────────────────────────────────────

export function initChart(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Re-render on any state change
  subscribe(() => renderChart(container));

  // Initial render
  renderChart(container);

  // Re-render on resize
  const ro = new ResizeObserver(() => renderChart(container));
  ro.observe(container);
}

// ─── renderDroneTags ─────────────────────────────────────────────────────────

export function renderDroneTags(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  function render(state) {
    container.innerHTML = '';

    const { highlightedDroneIds, drones } = state;

    if (!highlightedDroneIds || highlightedDroneIds.size === 0) {
      const hint = document.createElement('span');
      hint.style.color = '#555';
      hint.style.fontSize = '11px';
      hint.textContent = 'Click a circle or line to highlight individual drones';
      container.appendChild(hint);
      return;
    }

    for (const droneId of highlightedDroneIds) {
      const drone = drones.find(d => d.id === droneId);
      if (!drone) continue;

      const color = getManufacturerColor(drone.manufacturer);

      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.background = color + '22';  // semi-transparent fill
      chip.style.border = `1px solid ${color}66`;
      chip.style.color = color;

      const label = document.createElement('span');
      label.textContent = drone.model || drone.name || droneId;
      chip.appendChild(label);

      const remove = document.createElement('span');
      remove.className = 'chip-remove';
      remove.textContent = '×';
      remove.title = 'Remove highlight';
      remove.addEventListener('click', () => toggleHighlight(droneId));
      chip.appendChild(remove);

      container.appendChild(chip);
    }
  }

  // Initial render
  render(getState());

  // Subscribe to state changes
  subscribe(render);
}
