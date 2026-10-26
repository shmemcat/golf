import { mkdirSync, writeFileSync } from "node:fs";

// Second collection: Argyle-sized repeats, broad silhouettes, and no microtexture.
// 240 source units = 56–76 CSS pixels at the table; strokes are 4–7 units.
const destination = new URL("../web/public/card-back-preview/", import.meta.url);
mkdirSync(new URL("assets/", destination), { recursive: true });
const paper = "#faf6ee";
const palettes = {
  light: { base: "#c6d5be", leaf: "#7c9885", ink: "#849d87", soft: "#a8bea4", leafAlpha: .65, softAlpha: .80 },
  dark: { base: "#344c40", leaf: "#7c9885", ink: "#cf9f9c", soft: "#e4b4ad", leafAlpha: .55, softAlpha: .24 },
};
const group = (transform, art) => `<g transform="${transform}">${art}</g>`;
const fill = (d, color, opacity = 1) => `<path d="${d}" fill="${color}" opacity="${opacity}"/>`;
const line = (d, color, width = 5, opacity = .9) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle = (x, y, r, color, opacity = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
const ring = (x, y, r, color, width = 5, opacity = .9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`;
const repeat = (count, draw) => Array.from({ length: count }, (_, i) => draw(i)).join("");
const paired = art => art + group("rotate(180 120 168)", art);
function tile(width, height, art) {
  return { defs: `<pattern id="pattern" x="120" y="168" width="${width}" height="${height}" patternUnits="userSpaceOnUse">${art}</pattern>`, art: '<rect width="240" height="336" fill="url(#pattern)"/>' };
}
const emblem = art => ({ defs: "", art });
function leaf(x, y, angle, scale, p) {
  return group(`translate(${x} ${y}) rotate(${angle}) scale(${scale})`,
    fill("M0 0C-38-18-45-63 0-94C45-63 38-18 0 0Z", p.leaf, p.leafAlpha) +
    line("M0-9V-76", p.ink, 4, .8));
}

const designs = [
  {
    id: "21-bold-argyle", name: "Bold Argyle", family: "Pattern", description: "Large diamonds at the scale of the current Argyle, with a single clear crossing line.",
    draw: p => tile(168, 168,
      fill("M0 0 42 42 0 84-42 42ZM84 0 126 42 84 84 42 42ZM168 0 210 42 168 84 126 42ZM42 84 84 126 42 168 0 126ZM126 84 168 126 126 168 84 126Z", p.leaf, p.leafAlpha) +
      line("M0 84 84 0 168 84 84 168Z", p.ink, 4.5, .75)),
  },
  {
    id: "22-wide-chevron", name: "Wide chevron", family: "Pattern", description: "Broad zigzags with open space between them; only a handful of bands per card.",
    draw: p => tile(104, 84,
      fill("M0 0 52 27 104 0V29L52 56 0 29Z", p.leaf, p.leafAlpha) +
      line("M0 38 52 65 104 38", p.ink, 4.5, .85)),
  },
  {
    id: "23-country-check", name: "Country check", family: "Pattern", description: "A generous gingham check with just two broad bands in each repeat.",
    draw: p => tile(96, 96,
      `<path d="M0 0H48V96H0ZM0 0H96V48H0Z" fill="${p.leaf}" opacity="${p.leafAlpha * .55}"/>` +
      `<rect width="48" height="48" fill="${p.ink}" opacity=".65"/>`),
  },
  {
    id: "24-awning-stripe", name: "Awning stripe", family: "Pattern", description: "Three strong stripes, with no hairlines or dotted texture.",
    draw: p => tile(72, 72, `<rect x="18" width="36" height="72" fill="${p.leaf}" opacity="${p.leafAlpha}"/>` + line("M18 0V72", p.ink, 4, .8)),
  },
  {
    id: "25-large-scallop", name: "Large scallop", family: "Pattern", description: "Big shell-shaped arches; one clean curve per shell.",
    draw: p => tile(96, 96,
      fill("M0 48A48 48 0 0 1 96 48Q48 10 0 48Z", p.leaf, p.leafAlpha) +
      line("M0 48A48 48 0 0 1 96 48M-48 96A48 48 0 0 1 48 96A48 48 0 0 1 144 96M-48 0A48 48 0 0 1 48 0A48 48 0 0 1 144 0", p.ink, 4.5, .85)),
  },
  {
    id: "26-linked-rings", name: "Linked rings", family: "Pattern", description: "Two large linked circles across the card, drawn with a steady bold line.",
    draw: p => tile(96, 112,
      circle(48, 56, 36, p.leaf, p.leafAlpha * .45) + ring(48, 56, 43, p.ink, 5) +
      ring(0, 0, 28, p.leaf, 5, .85) + ring(96, 0, 28, p.leaf, 5, .85) + ring(0, 112, 28, p.leaf, 5, .85) + ring(96, 112, 28, p.leaf, 5, .85)),
  },
  {
    id: "27-petal-quilt", name: "Petal quilt", family: "Pattern", description: "A bold four-petal repeat with large, solid leaf shapes.",
    draw: p => tile(96, 96, repeat(4, i => group(`translate(48 48) rotate(${45 + i * 90})`,
      fill("M0 0Q-30-25 0-59Q30-25 0 0Z", p.leaf, p.leafAlpha))) + circle(48, 48, 5, p.ink, .9)),
  },
  {
    id: "28-basket-blocks", name: "Basket blocks", family: "Pattern", description: "Chunky woven blocks; a single accent stroke replaces fine threads.",
    draw: p => tile(104, 104,
      fill("M0 0H52V52H104V104H52V52H0Z", p.leaf, p.leafAlpha) +
      line("M26 8V44M60 26H96M78 60V96M8 78H44", p.ink, 5, .9)),
  },
  {
    id: "29-rolling-waves", name: "Rolling waves", family: "Pattern", description: "Four or five wide ribbons, flowing gently over the back.",
    draw: p => tile(144, 84,
      fill("M0 14C36-15 108 43 144 14V47C108 76 36 18 0 47Z", p.leaf, p.leafAlpha) +
      line("M0 14C36-15 108 43 144 14", p.ink, 4.5, .85)),
  },
  {
    id: "30-open-diamonds", name: "Open diamonds", family: "Pattern", description: "A few roomy outlined diamonds, with solid centers for recognition.",
    draw: p => tile(104, 104,
      line("M52 0 104 52 52 104 0 52Z", p.ink, 5) +
      fill("M52 28 76 52 52 76 28 52Z", p.leaf, p.leafAlpha)),
  },
  {
    id: "31-leaf-pair", name: "Leaf pair", family: "Botanical", description: "Two generous leaves on a simple diagonal stem, with plenty of breathing room.",
    draw: p => emblem(paired(leaf(116, 156, -28, 1.14, p)) + line("M94 214 146 122", p.ink, 5, .85)),
  },
  {
    id: "32-bold-laurel", name: "Bold laurel", family: "Botanical", description: "Eight broad leaves make a large, quiet wreath around an open center.",
    draw: p => {
      const upper = line("M57 169Q55 83 113 66M183 169Q185 83 127 66", p.ink, 5, .85) +
        leaf(63, 142, -48, .48, p) + leaf(74, 108, -12, .48, p) +
        leaf(177, 142, 48, .48, p) + leaf(166, 108, 12, .48, p);
      return emblem(paired(upper) + fill("M120 155 131 168 120 181 109 168Z", p.ink, .9));
    },
  },
  {
    id: "33-fern-sprig", name: "Fern sprig", family: "Botanical", description: "One large frond, built from a few broad leaf pairs instead of fine frills.",
    draw: p => {
      const upper = line("M120 168V71", p.ink, 5) +
        fill("M120 89Q94 70 120 44Q146 70 120 89Z", p.leaf, p.leafAlpha) +
        repeat(2, i => {
          const y = 92 + i * 36;
          return fill(`M120 ${y + 27}Q67 ${y + 22} 68 ${y - 14}Q111 ${y - 14} 120 ${y + 27}ZM120 ${y + 27}Q173 ${y + 22} 172 ${y - 14}Q129 ${y - 14} 120 ${y + 27}Z`, p.leaf, p.leafAlpha);
        });
      return emblem(paired(upper));
    },
  },
  {
    id: "34-ginkgo", name: "Ginkgo", family: "Botanical", description: "Two fan-shaped leaves; their silhouette does the work.",
    draw: p => emblem(paired(
      fill("M120 150 56 91Q71 51 106 68L120 80 134 68Q169 51 184 91Z", p.leaf, p.leafAlpha) +
      line("M120 166V150M120 150 93 82M120 150 147 82", p.ink, 5, .85))),
  },
  {
    id: "35-four-leaf", name: "Four leaf", family: "Botanical", description: "A single oversized four-leaf motif, without background texture.",
    draw: p => emblem(repeat(4, i => group(`rotate(${45 + i * 90} 120 168)`,
      fill("M120 168C55 139 76 75 120 100C164 75 185 139 120 168Z", p.leaf, p.leafAlpha) +
      line("M120 156V115", p.ink, 4, .85)))),
  },
  {
    id: "36-daisy", name: "Daisy", family: "Botanical", description: "One bold six-petal flower, with a clear round center.",
    draw: p => emblem(repeat(6, i => group(`rotate(${i * 60} 120 168)`,
      `<ellipse cx="120" cy="119" rx="24" ry="44" fill="${p.leaf}" opacity="${p.leafAlpha}"/>`)) + circle(120, 168, 24, p.ink, .95) + circle(120, 168, 10, p.soft, p.softAlpha)),
  },
  {
    id: "37-solitaire-bold", name: "Solitaire bold", family: "Emblem", description: "A larger central diamond with one strong outline and an open center.",
    draw: p => emblem(fill("M120 81 181 168 120 255 59 168Z", p.leaf, p.leafAlpha * .6) +
      line("M120 81 181 168 120 255 59 168Z", p.ink, 6) +
      fill("M120 145 137 168 120 191 103 168Z", p.ink, .95)),
  },
  {
    id: "38-clubhouse-bold", name: "Clubhouse bold", family: "Emblem", description: "Bold crossed clubs and a single golf ball inside one clean crest.",
    draw: p => {
      const clubs = line("M78 112 162 224M162 112 78 224", p.ink, 7) + paired(
        fill("M69 108Q62 104 67 97L76 88Q82 84 87 90L98 106Q102 114 94 118L82 121Z", p.ink, .95) +
        fill("M171 108Q178 104 173 97L164 88Q158 84 153 90L142 106Q138 114 146 118L158 121Z", p.ink, .95));
      return emblem(ring(120, 168, 84, p.leaf, 5, .9) + clubs + circle(120, 168, 20, p.base) + circle(120, 168, 14, paper, .95));
    },
  },
  {
    id: "39-tee-time", name: "Tee time", family: "Emblem", description: "Two simple golf balls and tees, mirrored like a traditional playing card.",
    draw: p => emblem(paired(
      circle(120, 97, 35, p.leaf, p.leafAlpha) + ring(120, 97, 35, p.ink, 5) +
      fill("M99 139H141L126 151V168H114V151Z", p.ink, .95))),
  },
  {
    id: "40-north-star", name: "North star", family: "Emblem", description: "Four bold points and a single broad ring; no compass ticks or miniature decoration.",
    draw: p => emblem(ring(120, 168, 85, p.leaf, 5, .8) +
      fill("M120 67 141 147 202 168 141 189 120 269 99 189 38 168 99 147Z", p.ink, .95) +
      fill("M120 67V168H38L99 147ZM120 269V168H202L141 189Z", p.leaf, .8) + circle(120, 168, 10, paper, .8)),
  },
];

function svg(design, theme) {
  const p = palettes[theme];
  const { art, defs } = design.draw(p);
  // Repeat the upper half at 180 degrees for a balanced, two-way playing card.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="336" viewBox="0 0 240 336">
  <title>${design.name} — ${theme} mode</title>
  <defs><clipPath id="edge"><rect x="19" y="19" width="202" height="298" rx="4"/></clipPath><clipPath id="half"><rect width="240" height="168"/></clipPath>${defs}<g id="art">${art}</g></defs>
  <rect width="240" height="336" rx="16" fill="${paper}"/>
  <rect x="7" y="7" width="226" height="322" rx="11" fill="${p.base}"/>
  <g clip-path="url(#edge)"><g clip-path="url(#half)"><use href="#art"/></g><g transform="rotate(180 120 168)"><g clip-path="url(#half)"><use href="#art"/></g></g></g>
  <rect x="14" y="14" width="212" height="308" rx="7" fill="none" stroke="${p.ink}" stroke-width="2.5"/>
</svg>\n`;
}

for (const design of designs) {
  for (const theme of ["light", "dark"]) {
    writeFileSync(new URL(`assets/${design.id}-${theme}.svg`, destination), svg(design, theme));
  }
}
writeFileSync(new URL("designs-large.js", destination), `export const designs = ${JSON.stringify(designs.map(({ draw, ...metadata }) => metadata), null, 2)};\n`);
console.log(`Created ${designs.length} larger-motif card backs (21–40) in both palettes.`);
