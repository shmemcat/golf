import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { designs as originals } from "../web/public/card-back-preview/designs.js";

// The first collection is the style reference. Enlarge its native repeat by
// 45–55%, and let the pattern continue across the whole card without a join.
const destination = new URL("../web/public/card-back-preview/", import.meta.url);
mkdirSync(new URL("assets/", destination), { recursive: true });
const palettes = {
  light: { base: "#c6d5be", leaf: "#7c9885", ink: "#849d87", soft: "#a8bea4", leafAlpha: .55, softAlpha: .60 },
  dark: { base: "#344c40", leaf: "#7c9885", ink: "#cf9f9c", soft: "#e4b4ad", leafAlpha: .34, softAlpha: .18 },
};
const paper = "#faf6ee";
const path = (d, color, width = 2, opacity = .9) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d, color, opacity = 1) => `<path d="${d}" fill="${color}" opacity="${opacity}"/>`;
const circle = (x, y, r, color, opacity = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
const group = (transform, art) => `<g transform="${transform}">${art}</g>`;
const repeat = (count, draw) => Array.from({ length: count }, (_, i) => draw(i)).join("");
const metadata = [];

function patternSvg(name, theme, width, height, art) {
  const p = palettes[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="336" viewBox="0 0 240 336">
  <title>${name} — ${theme} mode</title>
  <defs><clipPath id="edge"><rect x="19" y="19" width="202" height="298" rx="4"/></clipPath><pattern id="pattern" x="120" y="168" width="${width}" height="${height}" patternUnits="userSpaceOnUse">${art}</pattern></defs>
  <rect width="240" height="336" rx="16" fill="${paper}"/>
  <rect x="7" y="7" width="226" height="322" rx="11" fill="${p.base}"/>
  <g clip-path="url(#edge)"><rect width="240" height="336" fill="url(#pattern)"/></g>
  <rect x="14" y="14" width="212" height="308" rx="7" fill="none" stroke="${p.ink}" stroke-width="1.5"/>
  <rect x="19" y="19" width="202" height="298" rx="4" fill="none" stroke="${paper}" stroke-opacity=".45" stroke-width=".8"/>
</svg>\n`;
}

for (let index = 0; index < 15; index++) {
  if (index === 11) continue; // A repeating laurel companion is drawn below.
  const original = originals[index];
  const id = `${index + 61}-${original.id.slice(3)}`;
  const scale = index === 10 ? 1.45 : 1.55;
  const description = `${original.description} A more generous repeat, based on ${String(index + 1).padStart(2, "0")} in the first collection.`;
  metadata.push({ id, name: original.name, family: original.family, description });
  for (const theme of ["light", "dark"]) {
    let source = readFileSync(new URL(`assets/${original.id}-${theme}.svg`, destination), "utf8");
    source = source.replace(/<title>.*?<\/title>/, `<title>${original.name}, larger repeat — ${theme} mode</title>`);
    source = source.replace(/(<pattern\b[^>]*)(>)/, `$1 patternTransform="translate(120 168) scale(${scale}) translate(-120 -168)"$2`);
    source = source.replace('<g clip-path="url(#edge)"><g clip-path="url(#half)"><use href="#art"/></g><g transform="rotate(180 120 168)"><g clip-path="url(#half)"><use href="#art"/></g></g></g>', '<g clip-path="url(#edge)"><use href="#art"/></g>');
    source = source.replace('<clipPath id="half"><rect width="240" height="168"/></clipPath>', "");
    writeFileSync(new URL(`assets/${id}-${theme}.svg`, destination), source);
  }
}

const additions = [
  { id: "72-laurel-repeat", name: "Laurel repeat", family: "Botanical", description: "Little leafy wreaths, drawn in the first collection’s calm botanical style.", width: 104, height: 132, draw: p => {
    const branch = path("M51 111C16 95 16 49 43 25", p.ink, 2, .8) +
      group("translate(29 79) rotate(-40)", fill("M0 0Q-15-8-7-26Q13-17 0 0Z", p.leaf, p.leafAlpha)) +
      group("translate(29 53)", fill("M0 0Q-15-8-7-26Q13-17 0 0Z", p.leaf, p.leafAlpha));
    return branch + group("rotate(180 52 66)", branch) + fill("M52 59 58 66 52 73 46 66Z", p.ink, .8);
  } },
  { id: "76-double-lattice", name: "Double lattice", family: "Geometric", description: "A roomy diamond lattice with one fine companion line, like a light woven trellis.", width: 72, height: 96, draw: p =>
    path("M-36 0 36 96 108 0M-36 96 36 0 108 96", p.ink, 2, .85) +
    path("M-29 0 43 96M29 0 101 96M-29 96 43 0M29 96 101 0", p.leaf, 1.2, .7) },
  { id: "77-clover-link", name: "Clover link", family: "Geometric", description: "Open four-lobed clovers, gently linked into a classic wallpaper repeat.", width: 96, height: 96, draw: p =>
    path("M28 28A20 20 0 0 1 68 28A20 20 0 0 1 68 68A20 20 0 0 1 28 68A20 20 0 0 1 28 28Z", p.ink, 2, .85) + circle(48, 48, 3, p.leaf, .8) },
  { id: "78-leaf-stripe", name: "Leaf stripe", family: "Botanical", description: "A repeating vine with broad paired leaves and generous spacing between stems.", width: 80, height: 112, draw: p =>
    path("M40 0V112", p.ink, 1.8, .8) +
    fill("M40 39Q7 36 11 9Q38 11 40 39ZM40 73Q73 70 69 43Q42 45 40 73Z", p.leaf, p.leafAlpha) +
    path("M40 39 20 19M40 73 60 53", p.ink, 1.2, .7) },
  { id: "79-petal-pinwheel", name: "Petal pinwheel", family: "Botanical", description: "Four soft, curved petals make a quiet pinwheel, with open space around each repeat.", width: 96, height: 96, draw: p =>
    repeat(4, i => group(`translate(48 48) rotate(${i * 90})`, fill("M0 0Q-7-37 22-35Q38-10 0 0Z", p.leaf, p.leafAlpha))) + circle(48, 48, 3, p.ink, .85) },
  { id: "80-layered-fan", name: "Layered fan", family: "Geometric", description: "Overlapping fans with three simple nested arches, enlarged to stay clear at card size.", width: 96, height: 96, draw: p =>
    path("M0 48A48 48 0 0 1 96 48M-48 96A48 48 0 0 1 48 96A48 48 0 0 1 144 96M-48 0A48 48 0 0 1 48 0A48 48 0 0 1 144 0", p.ink, 2.5, .85) +
    path("M12 48A36 36 0 0 1 84 48M24 48A24 24 0 0 1 72 48M-36 96A36 36 0 0 1 36 96M60 96A36 36 0 0 1 132 96M-24 96A24 24 0 0 1 24 96M72 96A24 24 0 0 1 120 96M-36 0A36 36 0 0 1 36 0M60 0A36 36 0 0 1 132 0M-24 0A24 24 0 0 1 24 0M72 0A24 24 0 0 1 120 0", p.leaf, 2, .8) },
];
for (const { draw, width, height, ...design } of additions) {
  metadata.push(design);
  for (const theme of ["light", "dark"]) writeFileSync(new URL(`assets/${design.id}-${theme}.svg`, destination), patternSvg(design.name, theme, width, height, draw(palettes[theme])));
}
metadata.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(new URL("designs-patterns.js", destination), `export const designs = ${JSON.stringify(metadata, null, 2)};\n`);
console.log(`Created ${metadata.length} flat SVG patterns, using the first collection as the reference.`);
