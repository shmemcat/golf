import { mkdirSync, writeFileSync } from "node:fs";

// Original designs informed by restrained casino backs and botanical decks.
// References are linked in the gallery. Never split or reflect a tiled field:
// motifs are drawn whole, and each repeat is continuous across its boundaries.
const destination = new URL("../web/public/card-back-preview/", import.meta.url);
mkdirSync(new URL("assets/", destination), { recursive: true });
const paper = "#faf6ee";
const palettes = {
  light: { base: "#c6d5be", leaf: "#7c9885", ink: "#849d87", soft: "#a8bea4", leafAlpha: .72 },
  dark: { base: "#344c40", leaf: "#7c9885", ink: "#cf9f9c", soft: "#e4b4ad", leafAlpha: .66 },
};
const g = (transform, art) => `<g transform="${transform}">${art}</g>`;
const fill = (d, color, opacity = 1) => `<path d="${d}" fill="${color}" opacity="${opacity}"/>`;
const line = (d, color, width = 4, opacity = .9) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle = (x, y, r, color, opacity = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
const ellipse = (x, y, rx, ry, color, opacity = 1) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${color}" opacity="${opacity}"/>`;
const ring = (x, y, r, color, width = 4, opacity = .9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`;
const repeat = (count, draw) => Array.from({ length: count }, (_, i) => draw(i)).join("");
const pair = art => art + g("rotate(180 120 168)", art);
const emblem = art => ({ defs: "", art });
function leaf(x, y, angle, length, p, vein = true) {
  return g(`translate(${x} ${y}) rotate(${angle}) scale(${length / 80})`,
    fill("M0 0C-32-17-35-51 0-80C35-51 32-17 0 0Z", p.leaf, p.leafAlpha) +
    (vein ? line("M0-10V-65", p.ink, 3.5, .8) : ""));
}
function flower(x, y, radius, p, petals = 6) {
  return g(`translate(${x} ${y})`, repeat(petals, i => g(`rotate(${i * 360 / petals})`,
    ellipse(0, -radius * .48, radius * .27, radius * .52, p.leaf, p.leafAlpha))) + circle(0, 0, radius * .2, p.ink, .95));
}
function star(x, y, radius, p) {
  return fill(`M${x} ${y - radius}Q${x + radius * .16} ${y - radius * .16} ${x + radius} ${y}Q${x + radius * .16} ${y + radius * .16} ${x} ${y + radius}Q${x - radius * .16} ${y + radius * .16} ${x - radius} ${y}Q${x - radius * .16} ${y - radius * .16} ${x} ${y - radius}Z`, p.ink, .9);
}
function tile(width, height, art) {
  return { defs: `<pattern id="pattern" x="120" y="168" width="${width}" height="${height}" patternUnits="userSpaceOnUse">${art}</pattern>`, art: '<rect width="240" height="336" fill="url(#pattern)"/>' };
}

const designs = [
  { id: "41-olive-sprig", name: "Olive sprig", family: "Botanical", description: "Paired olive branches with broad leaves and a clear, quiet center.", draw: p => {
    const sprig = line("M125 151Q107 102 122 57", p.ink, 4) +
      g("rotate(-32 108 126)", ellipse(108, 126, 21, 9, p.leaf, p.leafAlpha)) +
      g("rotate(24 133 109)", ellipse(133, 109, 21, 9, p.leaf, p.leafAlpha)) +
      g("rotate(-32 106 88)", ellipse(106, 88, 21, 9, p.leaf, p.leafAlpha)) +
      g("rotate(-9 122 66)", ellipse(122, 66, 9, 18, p.leaf, p.leafAlpha));
    return emblem(pair(sprig));
  } },
  { id: "42-eucalyptus", name: "Eucalyptus", family: "Botanical", description: "Rounded eucalyptus leaves on two gently curved stems.", draw: p => emblem(pair(
    line("M123 149Q103 103 121 59", p.ink, 4) +
    ellipse(107, 123, 22, 14, p.leaf, p.leafAlpha) + ellipse(132, 98, 23, 15, p.leaf, p.leafAlpha) + ellipse(117, 69, 17, 21, p.leaf, p.leafAlpha))) },
  { id: "43-laurel-seal", name: "Laurel seal", family: "Botanical", description: "A classic open wreath, made from six generous leaves.", draw: p => {
    const side = line("M111 248C53 215 49 130 103 88", p.ink, 4) +
      leaf(76, 209, -60, 42, p, false) + leaf(63, 166, -30, 44, p, false) + leaf(77, 124, 8, 44, p, false);
    return emblem(pair(side) + star(120, 168, 15, p));
  } },
  { id: "44-maidenhair", name: "Maidenhair", family: "Botanical", description: "Soft fan-shaped leaves, kept as simple silhouettes at table size.", draw: p => {
    const fan = fill("M0 0-24-22Q-18-44 0-31Q18-44 24-22Z", p.leaf, p.leafAlpha);
    return emblem(pair(line("M125 150Q106 110 117 59M115 123 90 105M116 104 143 85", p.ink, 4) +
      g("translate(90 105) rotate(-28)", fan) + g("translate(143 85) rotate(26)", fan) + g("translate(117 67)", fan)));
  } },
  { id: "45-oak-leaf", name: "Oak leaf", family: "Botanical", description: "Two full oak leaves, with rounded lobes and one strong center vein.", draw: p => {
    const oak = fill("M120 144C102 140 99 130 105 122C83 121 86 104 99 100C80 91 94 75 106 79C98 59 115 51 120 61C125 51 142 59 134 79C146 75 160 91 141 100C154 104 157 121 135 122C141 130 138 140 120 144Z", p.leaf, p.leafAlpha) + line("M120 151V78", p.ink, 4);
    return emblem(pair(oak));
  } },
  { id: "46-acorn", name: "Acorn", family: "Botanical", description: "A small woodland emblem: a broad acorn and one leaf, repeated at the other end.", draw: p => emblem(pair(
    fill("M93 92H147V114Q147 145 120 151Q93 145 93 114Z", p.leaf, p.leafAlpha) +
    fill("M87 97Q87 66 120 66Q153 66 153 97Z", p.ink, .9) + line("M120 66V55", p.ink, 5) + leaf(145, 73, 44, 40, p, false))) },
  { id: "47-jasmine", name: "Jasmine", family: "Botanical", description: "A light six-petal blossom with two long leaves; simple and spacious.", draw: p => emblem(
    flower(120, 168, 60, p) + leaf(93, 112, -28, 64, p, false) + leaf(147, 224, 152, 64, p, false)) },
  { id: "48-tulip", name: "Tulip", family: "Botanical", description: "Two opposed tulips, using the quiet paired-symbol layout of casino backs.", draw: p => emblem(pair(
    fill("M84 67 104 83 120 61 136 83 156 67V95Q156 127 120 130Q84 127 84 95Z", p.leaf, p.leafAlpha) +
    line("M120 130V153", p.ink, 4) + fill("M120 150Q87 151 86 125Q111 126 120 150Z", p.leaf, p.leafAlpha))) },
  { id: "49-lotus", name: "Lotus", family: "Botanical", description: "Two compact lotus blossoms, with whole petals and a small central gap.", draw: p => emblem(pair(
    fill("M120 150Q70 124 120 65Q170 124 120 150Z", p.leaf, p.leafAlpha) +
    fill("M120 150Q61 151 56 99Q107 101 120 150ZM120 150Q179 151 184 99Q133 101 120 150Z", p.leaf, p.leafAlpha) +
    line("M120 136V91", p.ink, 3.5, .75))) },
  { id: "50-camellia", name: "Camellia", family: "Botanical", description: "A single generous flower medallion, with a clean round center.", draw: p => emblem(
    repeat(8, i => g(`rotate(${i * 45} 120 168)`, ellipse(120, 126, 26, 39, p.leaf, p.leafAlpha))) + circle(120, 168, 25, p.base) + circle(120, 168, 16, p.ink, .9)) },
  { id: "51-crescent", name: "Crescent", family: "Emblem", description: "Opposed crescent moons and a small star, with open space around each symbol.", draw: p => emblem(pair(
    fill("M138 66A40 40 0 1 0 138 138A34 34 0 0 1 138 66Z", p.leaf, .9)) + star(120, 168, 16, p)) },
  { id: "52-celestial-seal", name: "Celestial seal", family: "Emblem", description: "A soft four-point star inside a single ring; a restrained companion to North star.", draw: p => emblem(
    ring(120, 168, 77, p.leaf, 4, .85) + star(120, 168, 65, p) + circle(120, 66, 5, p.ink, .9) + circle(120, 270, 5, p.ink, .9)) },
  { id: "53-daisy-repeat", name: "Daisy repeat", family: "Pattern", description: "Whole flowers on a regular, roomy grid. The repeat continues naturally across the card.", draw: p => tile(96, 96, flower(48, 48, 32, p, 8)) },
  { id: "54-leaf-rows", name: "Leaf rows", family: "Pattern", description: "Large diagonal leaves in a continuous two-way repeat, without cut-through stems.", draw: p => tile(104, 168,
    leaf(42, 78, -28, 65, p) + leaf(62, 90, 152, 65, p)) },
  { id: "55-pearl-dot", name: "Pearl dot", family: "Pattern", description: "A classic small casino dot, with ample space so it reads as dots rather than texture.", draw: p => tile(72, 72, circle(36, 36, 8, p.ink, .85)) },
  { id: "56-diamond-linen", name: "Diamond linen", family: "Pattern", description: "One continuous, evenly spaced diamond lattice at the scale of the original Argyle.", draw: p => tile(84, 84,
    line("M42 0 84 42 42 84 0 42Z", p.ink, 4, .8)) },
  { id: "57-quatrefoil", name: "Quatrefoil", family: "Pattern", description: "A traditional four-lobed outline, repeated whole with a calm amount of space.", draw: p => tile(104, 104,
    line("M32 32A20 20 0 0 1 72 32A20 20 0 0 1 72 72A20 20 0 0 1 32 72A20 20 0 0 1 32 32Z", p.ink, 4, .85)) },
  { id: "58-regency-stripe", name: "Regency stripe", family: "Pattern", description: "Broad vertical bands and a quiet companion line, with no horizontal join.", draw: p => tile(84, 84,
    `<rect x="22" width="40" height="84" fill="${p.leaf}" opacity="${p.leafAlpha * .7}"/>` + line("M12 0V84M72 0V84", p.ink, 3, .75)) },
  { id: "59-on-the-green", name: "On the green", family: "Golf", description: "Two simple flag-and-ball motifs, spaced like traditional paired casino emblems.", draw: p => emblem(pair(
    line("M112 61V132", p.ink, 5) + fill("M114 61 154 76 114 92Z", p.leaf, .9) + circle(130, 139, 10, p.ink, .95))) },
  { id: "60-crossed-irons", name: "Crossed irons", family: "Golf", description: "A pair of clean crossed-club emblems. Each club is complete, without overlapping crests.", draw: p => {
    const clubs = line("M88 137 147 69M152 137 93 69", p.ink, 5) +
      fill("M140 74 152 59Q156 55 161 61L167 69Q171 75 164 78L149 82Z", p.leaf, .95) +
      fill("M100 74 88 59Q84 55 79 61L73 69Q69 75 76 78L91 82Z", p.leaf, .95);
    return emblem(pair(clubs) + circle(120, 168, 6, p.ink, .85));
  } },
];

function svg(design, theme) {
  const p = palettes[theme];
  const { art, defs } = design.draw(p);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="336" viewBox="0 0 240 336">
  <title>${design.name} — ${theme} mode</title>
  <defs><clipPath id="edge"><rect x="20" y="20" width="200" height="296" rx="4"/></clipPath>${defs}</defs>
  <rect width="240" height="336" rx="16" fill="${paper}"/>
  <rect x="7" y="7" width="226" height="322" rx="11" fill="${p.base}"/>
  <g clip-path="url(#edge)">${art}</g>
  <rect x="15" y="15" width="210" height="306" rx="6" fill="none" stroke="${p.ink}" stroke-width="2.5"/>
</svg>\n`;
}
for (const design of designs) for (const theme of ["light", "dark"]) {
  writeFileSync(new URL(`assets/${design.id}-${theme}.svg`, destination), svg(design, theme));
}
writeFileSync(new URL("designs-refined.js", destination), `export const designs = ${JSON.stringify(designs.map(({ draw, ...metadata }) => metadata), null, 2)};\n`);
console.log(`Created ${designs.length} refined designs (41–60), including two golf motifs.`);
