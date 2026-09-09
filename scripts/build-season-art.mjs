// Deterministic, editable vector artwork for the Season 1 design preview.
// Run: node scripts/build-season-art.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const destination = new URL('../public/cosmetics/season-1/', import.meta.url);
await mkdir(destination, { recursive: true });
const gold = '#c8a45b', light = '#e5ce91', green = '#102e25';
const repeat = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');
const n = v => Number(v.toFixed(2));
const point = (r, a, cx = 150, cy = 210) => [n(cx + r * Math.cos(a)), n(cy + r * Math.sin(a))];
const path = (d, attrs = '') => `<path d="${d}" ${attrs}/>`;
const circle = (x, y, r, attrs = '') => `<circle cx="${x}" cy="${y}" r="${r}" ${attrs}/>`;
const line = (x, y, xx, yy, attrs = '') => `<path d="M${x} ${y}L${xx} ${yy}" fill="none" ${attrs}/>`;
const rotate = (angle, content, x = 150, y = 210) => `<g transform="rotate(${angle} ${x} ${y})">${content}</g>`;
const text = (x, y, label, size = 12, attrs = '') => `<text x="${x}" y="${y}" text-anchor="middle" fill="${light}" font-family="Georgia,serif" font-size="${size}" ${attrs}>${label}</text>`;
const suitPaths = {
  spade: 'M0 -25C-8 -14 -24 -6 -24 6C-24 23 -7 25 -2 13C-2 25 -7 28 -10 31H10C7 28 2 25 2 13C7 25 24 23 24 6C24 -6 8 -14 0 -25Z',
  diamond: 'M0 -27L21 2L0 31L-21 2Z',
  club: 'M-4 14C-21 31 -34 2 -15 -3C-29 -28 27 -28 15 -3C34 2 21 31 4 14C3 24 7 29 10 31H-10C-7 29 -3 24 -4 14Z',
  heart: 'M0 29C-8 19 -28 4 -25 -10C-22 -25 -6 -25 0 -13C6 -25 22 -25 25 -10C28 4 8 19 0 29Z',
};
const suit = (name, x, y, scale = 1, fill = gold, attrs = '') => `<g transform="translate(${x} ${y}) scale(${scale})">${path(suitPaths[name], `fill="${fill}" ${attrs}`)}</g>`;
const defs = `<defs>
<linearGradient id="gold" x2=".8" y2="1"><stop stop-color="#eedca8"/><stop offset=".5" stop-color="#c7a25c"/><stop offset="1" stop-color="#a98242"/></linearGradient>
<radialGradient id="felt"><stop stop-color="#204b39"/><stop offset="1" stop-color="#09231c"/></radialGradient>
<pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 1H6M1 0V6" stroke="#c6d6aa" stroke-opacity=".07" stroke-width=".6"/></pattern>
<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V6" stroke="#c8a45b" stroke-opacity=".12" stroke-width="1"/></pattern>
</defs>`;
async function save(id, title, width, height, content) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="title"><title id="title">${title}</title>${defs}${content}</svg>\n`;
  await writeFile(new URL(`${id}.svg`, destination), svg);
}
function border() {
  return `<rect x="9" y="9" width="282" height="402" rx="15" fill="none" stroke="${gold}" stroke-width="2"/><rect x="16" y="16" width="268" height="388" rx="10" fill="none" stroke="${gold}" stroke-width=".7"/>` +
    repeat(4, i => `<g transform="translate(${i % 2 ? 300 : 0} ${i > 1 ? 420 : 0}) scale(${i % 2 ? -1 : 1} ${i > 1 ? -1 : 1})">${path('M24 63V28Q24 24 28 24H63M29 48V30H48M24 59Q46 57 56 35Q35 46 33 66', `fill="none" stroke="${gold}" stroke-width="1.2"`)}</g>`);
}
function card(bg, content) { return `<rect width="300" height="420" rx="18" fill="${bg}"/><rect width="300" height="420" rx="18" fill="url(#hatch)"/>${border()}${content}`; }
function rosette(cx, cy, base, depth, petals, layers, color = gold) {
  return repeat(layers, k => {
    const d = repeat(181, i => {
      const a = i / 180 * Math.PI * 2;
      const r = base + k * 1.7 + depth * Math.cos(petals * a + k * .22);
      const [x, y] = point(r, a, cx, cy);
      return `${i ? 'L' : 'M'}${x} ${y}`;
    });
    return path(d + 'Z', `fill="none" stroke="${color}" stroke-width=".6" opacity=".8"`);
  });
}
function laurel(cx, cy, radius, leafColor = gold) {
  return repeat(2, side => `<g transform="translate(${cx} ${cy}) scale(${side ? -1 : 1} 1)">` +
    path(`M-8 ${radius + 4}C${-radius - 30} ${radius - 3} ${-radius - 20} ${-radius / 2} -26 ${-radius}`, `fill="none" stroke="${leafColor}" stroke-width="2"`) +
    repeat(9, i => {
      const a = (64 + i * 14) * Math.PI / 180;
      const x = -Math.sin(a) * radius, y = Math.cos(a) * radius;
      return `<g transform="translate(${n(x)} ${n(y)}) rotate(${-50 - i * 14})">${path('M0 0C-7 -17 -1 -24 2 -30C13 -18 13 -9 0 0Z', `fill="${leafColor}"`)}${line(0, -2, 3, -24, 'stroke="#725727" stroke-width=".7"')}</g>`;
    }) + '</g>');
}

// Gilded Court: engraved scrollwork, guilloche medallion, mirrored suit inlays.
let court = repeat(2, i => rotate(i * 180,
  path('M73 190C38 144 41 91 84 73C123 57 121 109 95 109C71 109 87 80 99 88M227 190C262 144 259 91 216 73C177 57 179 109 205 109C229 109 213 80 201 88', `fill="none" stroke="${gold}" stroke-width="2"`) +
  repeat(6, j => `<g transform="translate(${73 + j * 3} ${115 + j * 10}) rotate(${j * 9})">${path('M0 0C-19 -20 -31 -10 -25 -5C-17 2 -7 -4 0 0M0 0C16 -20 22 -13 18 -6C14 0 6 -3 0 0', `fill="none" stroke="${gold}" stroke-width="1"`)}</g>`) +
  suit('diamond', 150, 57, .45) + path('M112 50H133M167 50H188', `stroke="${gold}"`)));
court += rosette(150, 210, 56, 10, 12, 9) + circle(150, 210, 50, `fill="${green}" stroke="${gold}" stroke-width="2"`) + circle(150, 210, 44, `fill="none" stroke="${gold}" stroke-dasharray="1 4"`);
court += suit('spade', 150, 199, 1.1, '#d2b470') + path('M116 240Q150 226 184 240M126 247H174', `fill="none" stroke="${gold}"`);
await save('gilded_suits', 'Gilded Court: engraved scrolls and a guilloche spade medallion', 300, 420, card('#0b281f', court));

// Velvet Club: four interwoven branches, fine leaf veins and clover blossoms.
let garden = repeat(4, i => `<g transform="translate(${i % 2 ? 300 : 0} ${i > 1 ? 420 : 0}) scale(${i % 2 ? -1 : 1} ${i > 1 ? -1 : 1})">` +
  path('M150 210C88 188 130 147 80 123C37 103 66 62 122 47M150 210C113 152 51 177 46 211', `fill="none" stroke="#acb080" stroke-width="2"`) +
  repeat(7, j => `<g transform="translate(${80 + Math.sin(j * .7) * 19} ${70 + j * 17}) rotate(${j * 25 - 35})">${path('M0 0Q-37 -30 -34 -48Q3 -35 0 0Z', 'fill="#305342" stroke="#a7b17b" stroke-width=".8"')}${path('M0 0L-30 -42M-11 -15L-29 -23M-18 -25L-19 -38', 'stroke="#93a976" stroke-width=".6" fill="none"')}</g>`) + '</g>');
garden += `<path d="M150 144Q187 151 197 210Q187 269 150 276Q113 269 103 210Q113 151 150 144Z" fill="#12382c" stroke="${gold}" stroke-width="2"/>` + suit('club', 150, 198, 1.1, '#b9bd85') + circle(150, 239, 3, `fill="${gold}"`);
garden += repeat(4, i => suit('club', i % 2 ? 251 : 49, i > 1 ? 363 : 57, .24, '#dfd8a2'));
await save('velvet_club', 'Velvet Conservatory: interwoven vines, engraved leaves and clover blossoms', 300, 420, card('#163d30', garden));

// Garnet Mosaic: jewel facets and angular enamel inlays, not filigree.
let mosaic = repeat(8, row => repeat(5, col => {
  const x = 30 + col * 60, y = row * 58 + 6;
  return `<g opacity=".64"><path d="M${x} ${y}l29 29l-29 29l-29 -29Z" fill="${(row + col) % 2 ? '#5e2235' : '#371722'}" stroke="#af7b56" stroke-width=".7"/><path d="M${x} ${y}v58l-29 -29Z" fill="#922f49" opacity=".3"/></g>`;
}));
mosaic += path('M150 100L244 210L150 320L56 210Z', 'fill="#271620" stroke="url(#gold)" stroke-width="4"') + path('M150 116L230 210L150 304L70 210Z', `fill="none" stroke="${gold}" stroke-width="1"`);
mosaic += '<path d="M150 136L210 210L150 284L90 210Z" fill="#9b3a53"/>' +
  '<path d="M150 136L168 210H210ZM90 210H132L150 284Z" fill="#d28b90"/>' +
  '<path d="M150 136L132 210H90ZM210 210H168L150 284Z" fill="#5b253c"/>' +
  '<path d="M150 154L171 210L150 266L129 210Z" fill="#c87b79" stroke="#ebbb99" stroke-width="1"/>' +
  repeat(4, i => rotate(i * 90, path('M150 92l5 -7l-5 -7l-5 7Z', `fill="${gold}"`)));
await save('ruby_diamond', 'Garnet Mosaic: faceted ruby glass with geometric gold inlay', 300, 420, card('#37151f', `<svg x="20" y="20" width="260" height="380" viewBox="20 20 260 380">${mosaic}</svg>`));

// Golden Wagon: a twelve-spoke carriage wheel with turned spokes, a segmented
// rim and a riveted axle hub. The deep red field and centered wheel remain key.
const wagonDefs = `<defs>
<radialGradient id="wagon-red"><stop stop-color="#811e30"/><stop offset=".65" stop-color="#621223"/><stop offset="1" stop-color="#400b18"/></radialGradient>
<linearGradient id="wagon-brass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ddc283"/><stop offset=".45" stop-color="#c29b51"/><stop offset="1" stop-color="#9a7035"/></linearGradient>
<pattern id="wagon-damask" width="38" height="52" patternUnits="userSpaceOnUse"><path d="M19 4C16 14 4 17 7 27C10 35 20 29 15 25M19 4C22 14 34 17 31 27C28 35 18 29 23 25M19 10V45M13 38L19 45L25 38" fill="none" stroke="#c77568" stroke-width=".65" opacity=".22"/></pattern>
</defs>`;
let wagon = wagonDefs + '<rect width="300" height="420" rx="18" fill="url(#wagon-red)"/><rect x="23" y="23" width="254" height="374" rx="9" fill="url(#wagon-damask)"/>' + border();
// Engraved side rails and opposing scrolls frame the wheel without obscuring it.
wagon += repeat(2, side => `<g transform="translate(${side ? 300 : 0} 0) scale(${side ? -1 : 1} 1)">` +
  line(26, 78, 26, 342, `stroke="${gold}" stroke-width=".6"`) +
  repeat(23, i => path(`M30 ${86 + i * 11}q-6 4 0 8q6 -4 0 -8Z`, `fill="none" stroke="${gold}" stroke-width=".7"`)) + '</g>');
wagon += repeat(2, i => rotate(i * 180,
  path('M63 104C43 74 67 49 88 58C107 67 87 86 77 75C72 68 78 62 85 65M237 104C257 74 233 49 212 58C193 67 213 86 223 75C228 68 222 62 215 65M91 56C119 57 125 92 150 94C175 92 181 57 209 56M112 68C110 49 130 45 138 58C147 70 133 77 127 68M188 68C190 49 170 45 162 58C153 70 167 77 173 68', `fill="none" stroke="${gold}" stroke-width="1.1"`) +
  path('M150 36C139 48 140 63 150 70C160 63 161 48 150 36ZM150 42V65M96 95Q121 98 134 108M204 95Q179 98 166 108', `fill="none" stroke="${light}" stroke-width=".8"`) +
  circle(150, 83, 2, `fill="${gold}"`)));
// Inset wheel face and shadow; all wheel detail stays within the outer tire.
wagon += circle(150, 213, 104, 'fill="#250910" opacity=".55"') +
  circle(150, 210, 103, 'fill="#4a0e1c" stroke="#d5b46e" stroke-width="1.5"') +
  circle(150, 210, 98, 'fill="none" stroke="#936932" stroke-width="9"') +
  circle(150, 210, 93, 'fill="#601426" stroke="#e0c689" stroke-width="1.5"');
// Twelve fitted rim sections, each with a fine grain line and a flush gold pin.
wagon += repeat(12, i => rotate(i * 30,
  path('M125.5 118.5A94.7 94.7 0 0 1 174.5 118.5L171.1 131.4A81.4 81.4 0 0 0 128.9 131.4Z', 'fill="url(#wagon-brass)" stroke="#795525" stroke-width=".7"') +
  path('M128 121.5Q150 115.6 172 121.5M130 126Q150 120.7 170 126', 'fill="none" stroke="#eed296" stroke-width=".55" opacity=".7"') +
  circle(150, 122, 1.65, 'fill="#f0d799" stroke="#785328" stroke-width=".6"') +
  path('M149 122H151', 'stroke="#785328" stroke-width=".45"')));
wagon += circle(150, 210, 81.5, 'fill="none" stroke="#e1c183" stroke-width="1.5"');
// Tapered, turned spokes have carved collars and an engraved center line.
wagon += repeat(12, i => rotate(i * 30,
  path('M144 191Q144 183 146 177L147.5 145Q144 141 147 137L147 129H153V137Q156 141 152.5 145L154 177Q156 183 156 191Z', 'fill="url(#wagon-brass)" stroke="#795525" stroke-width=".9"') +
  path('M150 147V176M147 139H153M147 143H153M145 182Q150 184 155 182M145 187H155', 'fill="none" stroke="#efda9d" stroke-width=".65"') +
  path('M148 148L147 175M152 148L153 175', 'stroke="#916a35" stroke-width=".5"')));
// A machined axle boss, six rivets and a small engraved end cap.
wagon += circle(150, 210, 26, 'fill="#805926" stroke="#e6cb8c" stroke-width="1"') +
  circle(150, 210, 22, 'fill="url(#wagon-brass)" stroke="#6b4925" stroke-width="1.2"') +
  repeat(6, i => rotate(i * 60, circle(150, 193.5, 2.2, 'fill="#e9cf8f" stroke="#8c6532" stroke-width=".65"'))) +
  circle(150, 210, 12, 'fill="#6a4424" stroke="#efd99e" stroke-width=".8"') +
  circle(150, 210, 9.5, 'fill="url(#wagon-brass)" stroke="#c49b54" stroke-width=".8"') +
  rosette(150, 210, 5.1, 1.4, 6, 2, '#795026') +
  circle(150, 210, 2, 'fill="#e9ce8a"');
await save('golden_wagon', 'Golden Wagon: engraved twelve-spoke gold wheel, riveted hub, scrollwork and deep red damask', 300, 420, wagon);

// Midnight Observatory: plotted stars, orbit rings and an engraved spade lens.
let cosmos = repeat(72, i => {
  const x = 30 + (i * 61 % 240), y = 35 + (i * 97 % 350);
  return i % 9 === 0 ? path(`M${x - 3} ${y}h6M${x} ${y - 3}v6`, 'stroke="#ddcea6" stroke-width=".7"') : circle(x, y, i % 3 === 0 ? .9 : .45, 'fill="#b8c8bc"');
});
cosmos += '<path d="M53 98L97 78L126 121L177 102L239 149M50 300L85 335L162 355L221 315" fill="none" stroke="#6a887e" stroke-width=".6"/>' +
  repeat(3, i => circle(150, 210, 78 + i * 10, `fill="none" stroke="${i === 1 ? '#6a887e' : gold}" stroke-width="${i === 1 ? .6 : 1}"`)) +
  repeat(60, i => rotate(i * 6, line(150, 111, 150, i % 5 === 0 ? 102 : 108, `stroke="${gold}" stroke-width=".8"`))) +
  '<ellipse cx="150" cy="210" rx="46" ry="94" transform="rotate(35 150 210)" stroke="#b1bba0" stroke-width=".8" fill="none"/>' +
  '<ellipse cx="150" cy="210" rx="94" ry="37" transform="rotate(-25 150 210)" stroke="#b1bba0" stroke-width=".8" fill="none"/>' +
  suit('spade', 150, 198, 1.8, '#0c2725', `stroke="${gold}" stroke-width=".8"`) +
  path('M150 168V222M126 198H174', 'stroke="#b9be9d" stroke-width=".6"') + circle(150, 198, 9, `fill="#dcc58d"`) +
  path('M141 198A9 9 0 00153 189A9 9 0 10141 198', 'fill="#15312c"') +
  text(150, 67, 'XII', 10, 'letter-spacing="2"') + text(150, 366, 'VI', 10, 'letter-spacing="2"');
await save('midnight', 'Midnight Observatory: celestial chart, orbit rings and a crescent spade', 300, 420, card('#081f22', cosmos));

// Ivory Engraved: actual card face with legible corners and a custom ace engraving.
let ivory = '<rect width="300" height="420" rx="18" fill="#f4ead2"/><rect x="11" y="11" width="278" height="398" rx="12" fill="none" stroke="#b6a177" stroke-width=".8"/>';
ivory += repeat(2, i => rotate(i * 180, text(32, 51, 'A', 32, 'style="fill:#152f28"') + suit('spade', 32, 71, .42, '#152f28')));
ivory += rosette(150, 204, 67, 9, 16, 5, '#c0a770') + suit('spade', 150, 177, 2.8, '#15362b');
ivory += '<path d="M150 130C146 167 103 174 109 200C115 218 141 206 144 188M150 130C154 167 197 174 191 200C185 218 159 206 156 188M150 138V252" fill="none" stroke="#d3be84" stroke-width="1.5"/>';
ivory += repeat(2, side => `<g transform="translate(${side ? 300 : 0} 0) scale(${side ? -1 : 1} 1)">${repeat(5, j => path(`M${145 - j * 6} ${169 + j * 10}q-13 -9 -19 5q13 5 19 -5`, 'fill="#d3be84"'))}</g>`);
ivory += text(150, 304, 'BRASTA', 15, 'letter-spacing="5" style="fill:#15362b"') + text(150, 325, 'THE GOLDEN TABLE', 7, 'letter-spacing="2" style="fill:#786745"');
await save('ivory_faces', 'Ivory Engraved: cream ace with botanical engraving and clear corner indices', 300, 420, ivory);

// First Seat: a chair and table medallion rather than a numeral placeholder.
let seat = circle(120, 120, 105, `fill="#0c2c23" stroke="${gold}" stroke-width="3"`) + circle(120, 120, 96, `fill="none" stroke="${gold}" stroke-width="1" stroke-dasharray="1 5"`);
seat += '<path d="M84 132V83Q120 58 156 83V132M91 89Q120 74 149 89V124H91ZM85 128H155V144H85ZM91 144L83 175M149 144L157 175M110 90V119M130 90V119" fill="none" stroke="url(#gold)" stroke-width="4" stroke-linejoin="round"/>';
seat += path('M64 162H176M68 167H172', `stroke="${gold}" stroke-width="1"`) + text(120, 202, 'FIRST SEAT', 11, 'letter-spacing="2"') + suit('diamond', 120, 45, .22);
await save('first_seat', 'First Seat: engraved chair medallion with a dotted coin edge', 240, 240, seat);

// Fourfold Crest: inlaid suits in the established spade, diamond, club, heart order.
let crest = path('M120 14L207 47L222 138L185 201L120 226L55 201L18 138L33 47Z', 'fill="#102e25" stroke="url(#gold)" stroke-width="5"') + path('M120 26L196 55L208 135L177 190L120 212L63 190L32 135L44 55Z', `fill="url(#hatch)" stroke="${gold}" stroke-width="1"`);
crest += '<path d="M120 52L187 87V149L120 184L53 149V87Z" fill="#cdb678" stroke="#ecd8a3" stroke-width="2"/><path d="M120 52V184M53 118H187" stroke="#8c743f" stroke-width="1"/>';
crest += suit('spade', 89, 82, .64, '#10231c') + suit('diamond', 151, 81, .64, '#8d243b') + suit('club', 89, 139, .64, '#10231c') + suit('heart', 151, 140, .64, '#8d243b') + circle(120, 118, 6, 'fill="#e6d199" stroke="#8c743f"');
crest += repeat(4, i => circle(i % 2 ? 193 : 47, i > 1 ? 175 : 58, 3, `fill="${light}"`));
await save('four_suits', 'Fourfold Crest: four enamel suits set into an octagonal seal', 240, 240, crest);

// Season Archive: pale porcelain keepsake, engraved season scroll and leaf sprigs.
let archive = circle(120, 120, 101, 'fill="#e8dcc0" stroke="#b89a59" stroke-width="4"') + circle(120, 120, 91, 'fill="url(#hatch)" stroke="#b89a59" stroke-width="1"') + laurel(120, 113, 70, '#345744');
archive += '<path d="M79 66H156Q176 66 171 86H163V154Q163 173 141 173H81Q98 170 96 153V86Q76 90 79 66ZM96 153H153Q153 168 141 173" fill="#f6edd8" stroke="#9c8049" stroke-width="2"/>';
archive += text(126, 132, '01', 37, 'style="fill:#355340"') + path('M107 92H145M106 140H146', 'stroke="#b89a59"') + text(120, 205, 'SEASON ARCHIVE', 9, 'letter-spacing="1.2" style="fill:#355340"');
await save('season_keepsake', 'Season Archive: porcelain keepsake with a season scroll and olive sprigs', 240, 240, archive);

// Golden Brasta: a layered sun seal distinct from competitive rank shields.
let seal = repeat(24, i => rotate(i * 15, path('M120 6L127 33L120 42L113 33Z', 'fill="url(#gold)"'), 120, 120));
seal += circle(120, 120, 88, 'fill="#b5914c" stroke="#e6cd8d" stroke-width="2"') + rosette(120, 120, 70, 5, 16, 7) + circle(120, 120, 60, 'fill="#163b2b" stroke="#e9d49c" stroke-width="2"');
seal += text(120, 143, 'B', 74, 'font-weight="bold"') + path('M83 155Q120 171 157 155', `fill="none" stroke="${gold}" stroke-width="2"`) + repeat(3, i => suit('diamond', 105 + i * 15, 174, .13));
await save('golden_brasta', 'Golden Brasta: layered sunburst seal with engraved gold and a central B', 240, 240, seal);

// Avatar frames have transparent centers. The preview supplies a neutral portrait behind them.
let wreath = circle(150, 150, 108, `fill="none" stroke="${gold}" stroke-width="3"`) + circle(150, 150, 102, 'fill="none" stroke="#597160" stroke-width="2"') + laurel(150, 150, 113);
wreath += path('M127 275L150 258L173 275L161 291L150 283L139 291Z', 'fill="#294c36" stroke="#c8a45b" stroke-width="1.5"') + suit('diamond', 150, 20, .4, light);
await save('laurel', 'Laureate Wreath: layered gold leaves with an emerald ribbon', 300, 300, wreath);
let halo = circle(150, 150, 116, 'fill="none" stroke="#c3a366" stroke-width="18"') + circle(150, 150, 126, 'fill="none" stroke="#e3c989" stroke-width="2"') + circle(150, 150, 105, 'fill="none" stroke="#e3c989" stroke-width="2"');
halo += repeat(16, i => rotate(i * 22.5, '<path d="M150 20L163 34L150 48L137 34Z" fill="#762c43" stroke="#efd29a" stroke-width="1"/><path d="M150 20V48L137 34Z" fill="#b06070"/><path d="M150 25L158 34L150 42L142 34Z" fill="#df9b9c"/>', 150, 150));
halo += repeat(16, i => rotate(i * 22.5 + 11.25, circle(150, 34, 3, 'fill="#fff0c4"'), 150, 150));
await save('ruby_frame', 'Garnet Halo: faceted garnet stones and gold milgrain around a portrait', 300, 300, halo);

// Profile titles use a matching badge emblem; their name is rendered by the UI.
let guest = path('M120 16L196 48L216 120L196 192L120 224L44 192L24 120L44 48Z', 'fill="#14382b" stroke="url(#gold)" stroke-width="4"');
guest += path('M120 26L188 55L205 120L188 185L120 214L52 185L35 120L52 55Z', `fill="url(#hatch)" stroke="${gold}" stroke-width="1"`);
guest += '<rect x="65" y="68" width="110" height="96" rx="5" fill="#d5bd82" stroke="#efe0b4" stroke-width="2"/><path d="M66 72L120 117L174 72M66 162L107 122M174 162L133 122" fill="none" stroke="#8f713e" stroke-width="2"/>';
guest += circle(120, 120, 19, 'fill="#7b2940" stroke="#e6c988" stroke-width="2"') + suit('diamond', 120, 119, .35, light);
guest += repeat(4, i => rotate(i * 90, path('M120 37l4 7l-4 7l-4 -7Z', `fill="${gold}"`), 120, 120));
await save('golden_guest', 'Golden Guest title badge: engraved invitation with a garnet seal', 240, 240, guest);
let regular = circle(120, 120, 102, 'fill="#203c32" stroke="#91ac91" stroke-width="3"') + circle(120, 120, 93, 'fill="url(#weave)" stroke="#748e77" stroke-dasharray="2 5"');
regular += repeat(3, i => rotate((i - 1) * 19, '<rect x="91" y="62" width="58" height="104" rx="5" fill="#b9c6a2" stroke="#294b39" stroke-width="2"/><rect x="96" y="67" width="48" height="94" rx="3" fill="none" stroke="#708a6c" stroke-width=".8"/>', 120, 157));
regular += suit('club', 120, 109, .67, '#274b39') + path('M70 178Q120 200 170 178M84 188Q120 204 156 188', 'fill="none" stroke="#91ac91" stroke-width="1.5"') + circle(120, 40, 3, 'fill="#bdc8a1"');
await save('season_regular', 'Season Regular title badge: a fan of cards with a clover crest', 240, 240, regular);

// Felt is a wide table surface, with detail kept to the perimeter for legibility.
let woven = '<rect x="10" y="10" width="580" height="340" rx="164" fill="#19382c" stroke="#6d7154" stroke-width="8"/><rect x="24" y="24" width="552" height="312" rx="152" fill="url(#felt)" stroke="#809676" stroke-width="1.5"/><rect x="24" y="24" width="552" height="312" rx="152" fill="url(#weave)"/>';
woven += '<rect x="32" y="32" width="536" height="296" rx="143" fill="none" stroke="#9ba586" stroke-width="1" stroke-dasharray="3 5"/>' + suit('club', 300, 57, .3, '#71866a') + suit('club', 300, 298, .3, '#71866a');
await save('woven_green', 'Woven Green: herringbone felt with hand-stitched sage edging', 600, 360, woven);
let hour = '<rect x="10" y="10" width="580" height="340" rx="164" fill="#735b32"/><rect x="17" y="17" width="566" height="326" rx="157" fill="#153628" stroke="#c8a45b" stroke-width="2"/><rect x="27" y="27" width="546" height="306" rx="147" fill="url(#felt)"/><rect x="27" y="27" width="546" height="306" rx="147" fill="url(#weave)"/>';
hour += repeat(2, i => rotate(i * 180, '<path d="M136 55H260L300 39L340 55H464M153 64H261L300 48L339 64H447M290 63L300 56L310 63" fill="none" stroke="#b69856" stroke-width="1.2"/>', 300, 180)) + repeat(2, i => rotate(i * 180, '<path d="M56 132L42 180L56 228M64 141L53 180L64 219M70 168L64 180L70 192" fill="none" stroke="#b69856" stroke-width="1.2"/>', 300, 180));
await save('golden_hour', 'Golden Hour: dark felt with an Art Deco sunrise rail', 600, 360, hour);
console.log(`Wrote 16 Season 1 SVG designs to ${fileURLToPath(destination)}`);
