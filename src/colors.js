const MANUFACTURER_COLORS = {
  'DJI': '#ff6b6b',
  'Skydio': '#4ecdc4',
  'Autel': '#ffd166',
  'Parrot': '#a29bfe',
  'Wingcopter': '#ff9a8b',
  'Zipline': '#81ecec',
  'senseFly': '#fdcb6e',
  'AgEagle': '#6c5ce7',
};

const FALLBACK_COLORS = ['#e17055', '#00b894', '#0984e3', '#d63031', '#6c5ce7', '#fdcb6e', '#e84393', '#00cec9'];
let fallbackIndex = 0;

export function getManufacturerColor(manufacturer) {
  if (MANUFACTURER_COLORS[manufacturer]) return MANUFACTURER_COLORS[manufacturer];
  MANUFACTURER_COLORS[manufacturer] = FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
  fallbackIndex++;
  return MANUFACTURER_COLORS[manufacturer];
}

export function getAllManufacturerColors() {
  return { ...MANUFACTURER_COLORS };
}
