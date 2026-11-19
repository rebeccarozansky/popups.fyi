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

// Hot/savory food. The other icons are two tapered cups and a round cookie,
// so this is a deliberately wide, shallow bowl with chopsticks angled across
// it — the diagonals are what keep it readable at marker size, where a
// plain container silhouette would just read as another cup.
const SAVORY_OUTLINE = `
  <path d="M3.8 11.8 Q4.7 20.5 12 20.8 Q19.3 20.5 20.2 11.8"/>
  <ellipse cx="12" cy="11.8" rx="8.2" ry="1.7"/>
  <path d="M15.4 3.3 L11.3 10.2"/>
  <path d="M17.8 4.5 L13.9 10.6"/>
`;
const SAVORY_FILL = `<ellipse cx="12" cy="11.8" rx="8.2" ry="1.7" fill="#B15442"/>`;

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
  savory: { outline: SAVORY_OUTLINE, fill: SAVORY_FILL },
  other:  { outline: OTHER, fill: '' },
};

function iconFor(category) {
  return ICONS[category] || ICONS.other;
}

// Nominal on-screen size of a single category icon, in px.
export const MARKER_UNIT_PX = 34;

// Residency mark: a minimal hand-drawn house, i.e. "this vendor has a home
// here" (a looping arrow was tried first, but read as an undo button). Roof
// eaves overhang the walls so it reads as a house rather than a pentagon even
// at ~11px. Authored in a 12x12 box. On a marker it is an exponent on the
// category icon ("bakery to the power of residency"); a residency is always a
// single marker, so it never competes with a repeat count. The same paths are
// reused by the legend, cards, popups and the toggle.
export const RESIDENCY_GLYPH_PATHS = [
  // Roof
  'M1.2 6.5 C 2.7 4.8 4.3 3.2 6 1.8 C 7.7 3.2 9.3 4.7 10.8 6.4',
  // Walls and floor
  'M3 4.9 C 2.9 6.8 3 8.6 3.1 10.4 C 5.1 10.5 7 10.3 8.9 10.4 C 9 8.5 9 6.7 9 4.9',
];

// Exponent geometry, in the 24-unit icon space. The mark's box starts inside
// the last icon's cell and above it: every icon leaves its top-right corner
// empty, so overlapping there makes the mark hug the artwork like an exponent
// instead of floating off as a pin of its own. The white halo knocks it out
// cleanly where it brushes the icon.
const RES_EXP_SIZE = 10.5;
const RES_EXP_INSET = 4.5; // how far the box starts inside the icons' right edge
const RES_EXP_RAISE = 3; // how far the box starts above the icon
// How far the exponent reaches past the icons' right edge.
const RES_EXP_OVERHANG = RES_EXP_SIZE - RES_EXP_INSET;

function residencyExponentSvg(rightEdgeVB, swVB, haloVB, ink) {
  const s = RES_EXP_SIZE / 12;
  const glyph = RESIDENCY_GLYPH_PATHS.map((d) => `<path d="${d}"/>`).join('');
  // A touch lighter than the icon's own line so it reads as a modifier.
  return `
    <g transform="translate(${(rightEdgeVB - RES_EXP_INSET).toFixed(2)},${-RES_EXP_RAISE}) scale(${s.toFixed(3)})" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <g stroke="#FFFFFF" stroke-width="${((haloVB * 0.8) / s).toFixed(2)}">${glyph}</g>
      <g stroke="${ink}" stroke-width="${((swVB * 0.85) / s).toFixed(2)}">${glyph}</g>
    </g>
  `;
}

// Legend sample for residencies: a faint dashed stand-in for "any icon"
// wearing the exponent, so the legend explains the corner mark rather than
// listing residency as a category of its own. Same size and stroke as an
// unselected marker, so it scales in the legend exactly like the icons above.
export function buildResidencyLegendSvg() {
  const scale = MARKER_UNIT_PX / 24;
  const swVB = 1.7 / scale;
  const haloVB = (1.7 + 3) / scale;
  const viewW = 24 + RES_EXP_OVERHANG;
  return {
    width: viewW * scale,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${viewW * scale}" height="${MARKER_UNIT_PX}" viewBox="0 0 ${viewW} 24" style="display:block;overflow:visible">
      <g fill="none" stroke="#9CA3AF" stroke-width="${swVB.toFixed(2)}" stroke-linecap="round" stroke-dasharray="2.4 2.8">${BAKERY_OUTLINE}</g>
      ${residencyExponentSvg(24, swVB, haloVB, '#0A1628')}
    </svg>`,
  };
}

// Standalone residency mark for HTML strings (Leaflet popups).
export function residencyGlyphSvg(size = 12, color = '#0A1628') {
  const paths = RESIDENCY_GLYPH_PATHS.map((d) => `<path d="${d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 12 12" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;vertical-align:-1px">${paths}</svg>`;
}

// Instagram mode draws smaller pins. A screenshot is taken in as one whole
// image rather than panned around, so the markers want to read as map
// annotation rather than as thumb-sized tap targets. Production stays at 1.
export const IG_ICON_SCALE = 0.72;

// Build a complete SVG marker for an array of categories. For each
// category we render a halo (wide white stroke) so the icon stays legible
// on any tile, then any colored fill (the beverage), then the navy
// stroke on top. Multi-category pop-ups show their icons side by side.
//
// `repeatCount` > 1 draws a superscript after the icons — a vendor running the
// same venue across several days reads as "icon squared" rather than being
// hidden inside a cluster bubble. The returned `anchorX` is the centre of the
// icon block only, NOT of the whole SVG, so the exponent hangs off to the side
// without dragging the marker off its actual coordinates.
//
// `iconScale` shrinks the whole marker. Stroke and halo widths stay in screen
// px on purpose — letting them scale down too would leave the linework too
// faint to read once the image is downsized for a feed.
//
// `residency` tucks the residency house into the top-right corner of the last
// icon as an exponent, in place of a repeat count.
export function buildIconMarkerSvg(
  categories,
  isSelected,
  repeatCount = 1,
  iconScale = 1,
  residency = false,
) {
  const cats = categories && categories.length > 0 ? categories : ['other'];
  const visible = cats.slice(0, 3);
  const unit = (isSelected ? 40 : MARKER_UNIT_PX) * iconScale;
  const gap = (isSelected ? 4 : 3) * iconScale;
  const iconsWidth = visible.length * unit + (visible.length - 1) * gap;
  const height = unit;
  const sw = isSelected ? 1.9 : 1.7;
  const haloSw = sw + 3;

  const cellVB = 24;
  const scale = unit / cellVB;
  const gapVB = gap / scale;
  const iconsVB = visible.length * cellVB + (visible.length - 1) * gapVB;
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

  const count = Number(repeatCount) || 1;
  let viewW = iconsVB;
  if (residency) {
    body += residencyExponentSvg(iconsVB, swVB, haloVB, ink);
    viewW = iconsVB + RES_EXP_OVERHANG;
  } else if (count > 1) {
    const label = String(count);
    const fontVB = isSelected ? 16 : 15;
    // Indie Flower is narrow; ~0.55em per digit is close enough, and the SVG
    // renders with overflow visible so an under-estimate can't clip.
    const supVB = 2 + fontVB * 0.55 * label.length;
    body += `
      <text x="${(iconsVB + 1).toFixed(2)}" y="10.5" font-family="'Indie Flower','Bradley Hand',cursive"
            font-size="${fontVB}" fill="${ink}" stroke="#FFFFFF" stroke-width="${(haloVB * 0.8).toFixed(2)}"
            stroke-linejoin="round" paint-order="stroke">${label}</text>
    `;
    viewW = iconsVB + supVB;
  }

  return {
    width: viewW * scale,
    height,
    anchorX: iconsWidth / 2,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${viewW * scale}" height="${height}" viewBox="0 0 ${viewW} ${cellVB}" style="display:block;overflow:visible">${body}</svg>`,
  };
}

