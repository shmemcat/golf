import { mkdirSync, writeFileSync } from "node:fs";

// Design previews only. The approved Argyle and the game's settings stay intact.
const destination = new URL("../web/public/card-back-preview/", import.meta.url);
mkdirSync(new URL("assets/", destination), { recursive: true });
const paper = "#faf6ee";
const palettes = {
  light: { base: "#c6d5be", leaf: "#7c9885", ink: "#849d87", soft: "#a8bea4", leafAlpha: .55, softAlpha: .60 },
  dark: { base: "#344c40", leaf: "#7c9885", ink: "#cf9f9c", soft: "#e4b4ad", leafAlpha: .34, softAlpha: .18 },
};

const path = (d, color, width = 1.8, opacity = 1) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d, color, opacity = 1) => `<path d="${d}" fill="${color}" opacity="${opacity}"/>`;
const circle = (x, y, r, color, opacity = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
const ring = (x, y, r, color, width = 1.8, opacity = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`;
const group = (transform, art) => `<g transform="${transform}">${art}</g>`;
function tile(width, height, art) {
  return { defs: `<pattern id="pattern" x="120" y="168" width="${width}" height="${height}" patternUnits="userSpaceOnUse">${art}</pattern>`, art: '<rect width="240" height="336" fill="url(#pattern)"/>' };
}
const repeated = (count, draw) => Array.from({ length: count }, (_, index) => draw(index)).join("");
function flower(x, y, radius, p) {
  return group(`translate(${x} ${y})`, repeated(8, i => group(`rotate(${i * 45})`, `<ellipse cy="-${radius * .58}" rx="${radius * .22}" ry="${radius * .48}" fill="${p.soft}" opacity="${p.softAlpha * 1.6}"/>`)) + circle(0, 0, radius * .17, p.ink));
}
function leaf(x, y, angle, p, scale = 1) {
  return group(`translate(${x} ${y}) rotate(${angle}) scale(${scale})`, fill("M0 0Q-13-13 0-29Q13-13 0 0Z", p.leaf, p.leafAlpha) + path("M0-3V-24", p.ink, .9, .6));
}
function star(x, y, radius, p) {
  const points = repeated(16, i => {
    const angle = (i * Math.PI / 8) - Math.PI / 2;
    const r = i % 2 === 0 ? radius : radius * .34;
    return `${i === 0 ? "M" : "L"}${(x + Math.cos(angle) * r).toFixed(2)} ${(y + Math.sin(angle) * r).toFixed(2)}`;
  });
  return fill(`${points}Z`, p.ink, .85);
}

const designs = [
  {
    id: "01-diamond-lattice", name: "Diamond lattice", family: "Tailored", description: "Fine crossed lines with a small pearl at every meeting point.",
    draw: p => tile(40, 56,
      path("M-20 0 20 56 60 0M-20 56 20 0 60 56", p.ink, 1.5, .85) +
      path("M-16 0 24 56M16 0 56 56M-16 56 24 0M16 56 56 0", p.leaf, .8, .7) +
      circle(20, 28, 2.5, paper, .7)),
  },
  {
    id: "02-herringbone", name: "Herringbone", family: "Tailored", description: "A crisp chevron weave, like a well-loved wool jacket.",
    draw: p => tile(36, 48,
      fill("M0 0 18 12V36L0 24ZM18 12 36 0V24L18 36Z", p.leaf, p.leafAlpha) +
      path("M0 0 18 12 36 0M0 24 18 36 36 24M0 48 18 60 36 48M18 12V36", p.ink, 1.5, .8) +
      path("M0 6 18 18 36 6M0 18 18 30 36 18M0 42 18 54 36 42", paper, .8, .35)),
  },
  {
    id: "03-basketweave", name: "Basketweave", family: "Tailored", description: "Broad interwoven ribbons with delicate parallel threads.",
    draw: p => tile(48, 48,
      `<path d="M0 0H24V24H48V48H24V24H0Z" fill="${p.leaf}" opacity="${p.leafAlpha}"/>` +
      path("M4 0V24M10 0V24M16 0V24M0 28H24M0 34H24M0 40H24M28 24V48M34 24V48M40 24V48M24 4H48M24 10H48M24 16H48", p.ink, 1.4, .75)),
  },
  {
    id: "04-pinstripe", name: "Pinstripe", family: "Tailored", description: "Quiet vertical tailoring with tiny dotted companion lines.",
    draw: p => tile(24, 24,
      `<rect x="8" width="8" height="24" fill="${p.leaf}" opacity="${p.leafAlpha * .7}"/>` +
      path("M8 0V24M16 0V24", p.ink, 1.2, .75) + circle(1, 6, 1, p.ink, .85) + circle(1, 18, 1, p.ink, .85)),
  },
  {
    id: "05-scallop", name: "Scallop", family: "Geometric", description: "Overlapping shells with a soft, fabric-like rhythm.",
    draw: p => tile(48, 48,
      path("M-24 24A24 24 0 0 1 24 24A24 24 0 0 1 72 24M0 0A24 24 0 0 1 48 0M0 48A24 24 0 0 1 48 48", p.ink, 2, .85) +
      path("M-18 24A18 18 0 0 1 18 24M30 24A18 18 0 0 1 66 24M6 0A18 18 0 0 1 42 0M6 48A18 18 0 0 1 42 48", p.leaf, 1.5, .8) +
      circle(24, 24, 2, paper, .7)),
  },
  {
    id: "06-deco-arches", name: "Deco arches", family: "Geometric", description: "A little 1920s glamour, drawn in slender nested arches.",
    draw: p => tile(48, 64,
      fill("M0 32Q24-4 48 32Q24 68 0 32Z", p.leaf, p.leafAlpha * .7) +
      path("M0 32Q24-4 48 32Q24 68 0 32ZM8 32Q24 8 40 32Q24 56 8 32ZM16 32Q24 20 32 32Q24 44 16 32Z", p.ink, 1.6, .85) +
      path("M24 0V12M24 52V64", p.ink, 1.5, .75)),
  },
  {
    id: "07-chainlink", name: "Chainlink", family: "Geometric", description: "Long oval links, softened with alternating translucent fills.",
    draw: p => tile(48, 64,
      `<rect x="6" y="-12" width="36" height="56" rx="18" fill="${p.leaf}" fill-opacity="${p.leafAlpha * .55}" stroke="${p.ink}" stroke-width="1.8"/><rect x="6" y="20" width="36" height="56" rx="18" fill="none" stroke="${p.ink}" stroke-width="1.8"/>` +
      path("M12 3Q24-9 36 3M12 61Q24 73 36 61", paper, 1, .4)),
  },
  {
    id: "08-starlight", name: "Starlight", family: "Geometric", description: "Eight-pointed stars and little constellations of dots.",
    draw: p => tile(56, 56,
      star(28, 28, 13, p) + circle(0, 0, 2, p.ink, .7) + circle(56, 0, 2, p.ink, .7) +
      circle(0, 56, 2, p.ink, .7) + circle(56, 56, 2, p.ink, .7) +
      path("M28 4V9M28 47V52M4 28H9M47 28H52", p.leaf, 1.6, .85)),
  },
  {
    id: "09-rosette", name: "Rosette", family: "Botanical", description: "Formal little flower medallions, evenly spaced like wallpaper.",
    draw: p => tile(64, 64,
      ring(32, 32, 24, p.leaf, 1, .8) + flower(32, 32, 21, p) +
      path("M0 0 8 8M64 0 56 8M0 64 8 56M64 64 56 56", p.ink, 1.5, .8)),
  },
  {
    id: "10-windowpane", name: "Windowpane", family: "Tailored", description: "Airy country-club checks with small diamond intersections.",
    draw: p => tile(48, 48,
      `<rect x="4" y="4" width="40" height="40" fill="${p.soft}" opacity="${p.softAlpha}"/>` +
      path("M0 0H48V48H0ZM5 0V48M0 5H48", p.ink, 1.2, .85) +
      fill("M24 18 30 24 24 30 18 24Z", p.leaf, p.leafAlpha)),
  },
  {
    id: "11-fern", name: "Fern", family: "Botanical", description: "Paired fern fronds, gently mirrored in a repeating garden.",
    draw: p => {
      const frond = path("M0 27Q-5 0 0-27", p.ink, 1.3, .85) + repeated(5, i => {
        const y = -18 + i * 9;
        return fill(`M0 ${y + 6}Q-18 ${y + 3} -17 ${y - 7}Q-3 ${y - 6} 0 ${y + 6}ZM0 ${y + 6}Q18 ${y + 3} 17 ${y - 7}Q3 ${y - 6} 0 ${y + 6}Z`, p.leaf, p.leafAlpha + .1);
      });
      return tile(80, 112, group("translate(20 28) rotate(-18)", frond) + group("translate(60 84) rotate(162)", frond) + circle(60, 28, 1.5, p.ink, .7) + circle(20, 84, 1.5, p.ink, .7));
    },
  },
  {
    id: "12-laurel", name: "Laurel", family: "Botanical", description: "A calm wreath in the center, surrounded by tiny seed dots.",
    draw: p => {
      let wreath = path("M116 230C45 205 51 126 104 100M124 230C195 205 189 126 136 100", p.ink, 2, .8);
      for (let i = 0; i < 7; i++) {
        const angle = (-105 + i * 31) * Math.PI / 180;
        const x = 120 + Math.cos(angle) * 57;
        const y = 168 + Math.sin(angle) * 66;
        wreath += leaf(x, y, angle * 180 / Math.PI + 40, p, .72);
      }
      wreath += group("rotate(180 120 168)", wreath);
      return { defs: tile(24, 24, circle(12, 12, .9, p.ink, .4)).defs, art: '<rect width="240" height="336" fill="url(#pattern)"/>' + `<ellipse cx="120" cy="168" rx="80" ry="104" fill="${p.base}"/>` + wreath + fill("M120 155 129 168 120 181 111 168Z", p.ink, .85) };
    },
  },
  {
    id: "13-wildflower", name: "Wildflower", family: "Botanical", description: "Small six-petal blossoms scattered over a dotted ground.",
    draw: p => {
      const blossom = repeated(6, i => group(`rotate(${i * 60})`, `<ellipse cy="-7" rx="3.6" ry="6.4" fill="${p.soft}" opacity="${Math.min(1, p.softAlpha * 1.7)}"/>`)) + circle(0, 0, 2, p.ink);
      return tile(64, 80, group("translate(16 20)", blossom) + group("translate(48 60)", blossom) + circle(48, 20, 1.5, p.leaf) + circle(16, 60, 1.5, p.leaf));
    },
  },
  {
    id: "14-garden-trellis", name: "Garden trellis", family: "Botanical", description: "Soft ogee curves, with a leaf held inside every opening.",
    draw: p => tile(48, 80,
      path("M24 0C24 20 0 20 0 40S24 60 24 80M24 0C24 20 48 20 48 40S24 60 24 80", p.ink, 1.8, .85) +
      leaf(24, 40, 0, p, .65) + leaf(24, 40, 180, p, .65) + circle(24, 0, 2, paper, .65) + circle(24, 80, 2, paper, .65)),
  },
  {
    id: "15-petal-tile", name: "Petal tile", family: "Botanical", description: "Four almond-shaped petals meeting in a ceramic-style repeat.",
    draw: p => tile(48, 48,
      repeated(4, i => group(`translate(24 24) rotate(${45 + i * 90})`, fill("M0 0Q-20-18 0-32Q20-18 0 0Z", p.leaf, p.leafAlpha) + path("M0-3V-27", p.ink, 1.1, .8))) + circle(24, 24, 3, p.ink, .8)),
  },
  {
    id: "16-contour", name: "Contour", family: "Organic", description: "Smooth contour rings, like the map of a rolling fairway.",
    draw: p => {
      const art = repeated(14, i => {
        const r = 11 + i * 13;
        return path(`M120 ${168 - r}C${120 + r * 1.4} ${168 - r * 1.3} ${120 + r * .65} ${168 - r * .1} ${120 + r} 168S${120 + r * .65} ${168 + r * 1.3} 120 ${168 + r}S${120 - r * .65} ${168 + r * .1} ${120 - r} 168S${120 - r * .65} ${168 - r * 1.3} 120 ${168 - r}Z`, i % 3 === 0 ? p.ink : p.leaf, i % 3 === 0 ? 1.8 : 1.1, .8);
      });
      return { art, defs: "" };
    },
  },
  {
    id: "17-woven-waves", name: "Woven waves", family: "Organic", description: "Gentle ribbons flowing in opposite directions.",
    draw: p => tile(64, 48,
      fill("M0 12C16-4 48 28 64 12V24C48 40 16 8 0 24ZM0 36C16 20 48 52 64 36V48C48 64 16 32 0 48Z", p.leaf, p.leafAlpha) +
      path("M0 12C16-4 48 28 64 12M0 36C16 20 48 52 64 36", p.ink, 1.4, .85) +
      path("M0 18C16 2 48 34 64 18M0 42C16 26 48 58 64 42", paper, 1, .4)),
  },
  {
    id: "18-compass", name: "Compass", family: "Emblem", description: "A vintage compass medallion, with a finely ruled frame.",
    draw: p => {
      const rays = repeated(16, i => group(`rotate(${i * 22.5} 120 168)`, path("M120 88V95", p.ink, i % 2 ? 1 : 2, .8)));
      const points = repeated(8, i => group(`rotate(${i * 45} 120 168)`, fill("M120 109 131 157 120 168 109 157Z", i % 2 ? p.leaf : p.ink, i % 2 ? .65 : .85) + fill("M120 109V168L109 157Z", p.soft, p.softAlpha)));
      return { defs: "", art: `<rect x="27" y="27" width="186" height="282" rx="2" fill="none" stroke="${p.leaf}" stroke-width="1"/>` + ring(120, 168, 83, p.ink, 1.2, .7) + ring(120, 168, 72, p.leaf, 1, .8) + rays + points + ring(120, 168, 8, p.ink, 1.5) + circle(120, 168, 3, paper, .7) + star(120, 57, 8, p) + star(120, 279, 8, p) };
    },
  },
  {
    id: "19-solitaire", name: "Solitaire", family: "Emblem", description: "One open diamond, generous space, and a restrained double frame.",
    draw: p => ({ defs: "", art:
      `<rect x="29" y="29" width="182" height="278" rx="4" fill="none" stroke="${p.ink}" stroke-width="1.4" opacity=".75"/><rect x="34" y="34" width="172" height="268" rx="2" fill="none" stroke="${p.leaf}" stroke-width=".8" opacity=".8"/>` +
      fill("M120 119 155 168 120 217 85 168Z", p.leaf, p.leafAlpha * .6) +
      path("M120 112 160 168 120 224 80 168ZM120 126 150 168 120 210 90 168Z", p.ink, 1.6, .85) +
      circle(120, 168, 4, p.ink, .85) + path("M120 62V81M120 255V274", p.ink, 1.4, .75) + circle(120, 88, 1.7, p.ink) + circle(120, 248, 1.7, p.ink) }),
  },
  {
    id: "20-clubhouse", name: "Clubhouse", family: "Emblem", description: "Crossed vintage clubs in a crest, with a dimpled-ball detail.",
    draw: p => {
      const crest = ring(120, 168, 66, p.ink, 1.8, .85) + ring(120, 168, 61, p.leaf, 1, .8) +
        path("M91 197 146 135M94 137 149 199", p.ink, 3.4, .9) +
        path("M142 138 151 128Q155 125 158 129L162 135Q163 139 158 140L147 143M98 140 88 129Q84 125 81 129L78 135Q77 139 82 141L94 144", p.ink, 4.2, .9) +
        circle(120, 197, 10, paper, .8) + repeated(5, i => circle(114 + i % 3 * 5, 194 + Math.floor(i / 3) * 5, 1, p.leaf, .85));
      const doubled = group("translate(0 -15) scale(1 .92)", crest) + group("rotate(180 120 168) translate(0 -15) scale(1 .92)", crest);
      return { defs: tile(20, 20, circle(10, 10, .8, p.ink, .35)).defs, art: '<rect width="240" height="336" fill="url(#pattern)"/>' + `<ellipse cx="120" cy="168" rx="79" ry="100" fill="${p.base}"/>` + doubled };
    },
  },
];

function svg(design, theme) {
  const p = palettes[theme];
  const { art, defs } = design.draw(p);
  // Reflect the lower half from the upper half: no design reveals orientation.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="336" viewBox="0 0 240 336">
  <title>${design.name} — ${theme} mode</title>
  <defs><clipPath id="edge"><rect x="19" y="19" width="202" height="298" rx="4"/></clipPath><clipPath id="half"><rect width="240" height="168"/></clipPath>${defs}<g id="art">${art}</g></defs>
  <rect width="240" height="336" rx="16" fill="${paper}"/>
  <rect x="7" y="7" width="226" height="322" rx="11" fill="${p.base}"/>
  <g clip-path="url(#edge)"><g clip-path="url(#half)"><use href="#art"/></g><g transform="rotate(180 120 168)"><g clip-path="url(#half)"><use href="#art"/></g></g></g>
  <rect x="14" y="14" width="212" height="308" rx="7" fill="none" stroke="${p.ink}" stroke-width="1.5"/>
  <rect x="19" y="19" width="202" height="298" rx="4" fill="none" stroke="${paper}" stroke-opacity=".45" stroke-width=".8"/>
</svg>\n`;
}
for (const design of designs) {
  for (const theme of ["light", "dark"]) {
    writeFileSync(new URL(`assets/${design.id}-${theme}.svg`, destination), svg(design, theme));
  }
}
writeFileSync(new URL("designs.js", destination), `export const designs = ${JSON.stringify(designs.map(({ draw, ...metadata }) => metadata), null, 2)};\n`);
console.log(`Created ${designs.length} card-back concepts in both palettes.`);
