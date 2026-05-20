// Hand-drawn category icons used as map markers. Each icon is authored in
// a 24x24 viewBox with rounded caps and intentionally non-rectilinear
// paths so it reads as sketched rather than vector-precise. Coffee and
// matcha additionally show their beverage as a colored fill at the rim;
// other icons are stroke-only.

const COFFEE_OUTLINE = `
  <path d="M7 10 L7.6 19 Q7.8 20.6 9.4 20.6 L14.6 20.6 Q16.2 20.6 16.4 19 L17 10"/>
  <path d="M17 12 Q19.6 12.6 19.6 14.6 Q19.6 16.6 17 17.2"/>
  <ellipse cx="12" cy="10" rx="5" ry="1.4"/>
  <path d="M10 5 Q11 6.5 10 8"/>
  <path d="M13.2 4 Q14.2 5.6 13.2 7.2"/>
`;
const COFFEE_FILL = `<ellipse cx="12" cy="10" rx="5" ry="1.4" fill="#2A1A0E"/>`;

const BAKERY_OUTLINE = `
  <path d="M 12 3.4 Q 18 3.6 20.4 8 Q 21.4 12 19.6 16 Q 16.8 20.4 12 20.6 Q 7 20.4 4.4 16 Q 2.6 12 3.6 8 Q 6 3.6 12 3.4 Z"/>
`;
const BAKERY_FILL = `
  <path d="M 12 3.4 Q 18 3.6 20.4 8 Q 21.4 12 19.6 16 Q 16.8 20.4 12 20.6 Q 7 20.4 4.4 16 Q 2.6 12 3.6 8 Q 6 3.6 12 3.4 Z" fill="#D9B486"/>
  <ellipse cx="9" cy="8.2" rx="1.1" ry="0.9" fill="#3E2A1C"/>
  <ellipse cx="14.5" cy="9.6" rx="1" ry="1.1" fill="#3E2A1C"/>
  <ellipse cx="7.8" cy="13" rx="1" ry="0.9" fill="#3E2A1C"/>
  <ellipse cx="13.7" cy="14.2" rx="1.2" ry="1" fill="#3E2A1C"/>
  <ellipse cx="10.6" cy="17" rx="1" ry="0.9" fill="#3E2A1C"/>
`;

const MATCHA_OUTLINE = `
  <path d="M5.4 11.4 L7 19.6 Q7.2 21 8.6 21 L15.4 21 Q16.8 21 17 19.6 L18.6 11.4"/>
  <ellipse cx="12" cy="11.4" rx="6.6" ry="1.6"/>
`;
const MATCHA_FILL = `<ellipse cx="12" cy="11.4" rx="6.6" ry="1.6" fill="#5C7A32"/>`;

const OTHER = `
  <path d="M12 4.4 L12 19.6"/>
  <path d="M4.4 12 L19.6 12"/>
  <path d="M6.7 6.7 L17.3 17.3"/>
  <path d="M17.3 6.7 L6.7 17.3"/>
`;

const ICONS = {
  coffee: { outline: COFFEE_OUTLINE, fill: COFFEE_FILL },
  bakery: { outline: BAKERY_OUTLINE, fill: BAKERY_FILL },
  matcha: { outline: MATCHA_OUTLINE, fill: MATCHA_FILL },
  other:  { outline: OTHER, fill: '' },
};

function iconFor(category) {
  return ICONS[category] || ICONS.other;
}

// Build a complete SVG marker for an array of categories. For each
// category we render a halo (wide white stroke) so the icon stays legible
// on any tile, then any colored fill (the beverage), then the navy
// stroke on top. Multi-category pop-ups show their icons side by side.
export function buildIconMarkerSvg(categories, isSelected) {
  const cats = categories && categories.length > 0 ? categories : ['other'];
  const visible = cats.slice(0, 3);
  const unit = isSelected ? 40 : 34;
  const gap = isSelected ? 4 : 3;
  const width = visible.length * unit + (visible.length - 1) * gap;
  const height = unit;
  const sw = isSelected ? 1.9 : 1.7;
  const haloSw = sw + 3;

  const cellVB = 24;
  const scale = unit / cellVB;
  const gapVB = gap / scale;
  const viewW = visible.length * cellVB + (visible.length - 1) * gapVB;
  const swVB = sw / scale;
  const haloVB = haloSw / scale;
  const ink = '#0A1628';

  let body = '';
  for (let i = 0; i < visible.length; i++) {
    const { outline, fill } = iconFor(visible[i]);
    const x = i * (cellVB + gapVB);
    body += `
      <g transform="translate(${x},0)">
        <g fill="none" stroke="#FFFFFF" stroke-width="${haloVB}" stroke-linecap="round" stroke-linejoin="round" opacity="0.95">${outline}</g>
        ${fill}
        <g fill="none" stroke="${ink}" stroke-width="${swVB}" stroke-linecap="round" stroke-linejoin="round">${outline}</g>
      </g>
    `;
  }

  return {
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${viewW} ${cellVB}" style="display:block;overflow:visible">${body}</svg>`,
  };
}
