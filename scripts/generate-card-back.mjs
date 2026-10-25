import { writeFileSync } from "node:fs";

// Preserve the geometry, translucent diamonds, and stitching of the approved
// enlarged Argyle preview. Miniatures use its continuous, heavier thread.
const paper = "#faf6ee";
const palettes = {
  light: { base: "#c6d5be", leaf: "#7c9885", blush: "#849d87", peach: "#a8bea4", leafOpacity: 0.55, peachOpacity: 0.60 },
  dark: { base: "#344c40", leaf: "#7c9885", blush: "#cf9f9c", peach: "#e4b4ad", leafOpacity: 0.34, peachOpacity: 0.18 },
};
function svg(miniature, theme) {
  const { base, leaf, blush, peach, leafOpacity, peachOpacity } = palettes[theme];
  const diamonds = [];
  for (let row = -5; row <= 5; row++) {
    for (let col = -4; col <= 4; col++) {
      const x = 120 + col * 84 + (Math.abs(row) % 2 ? 42 : 0);
      const y = 168 + row * 42;
      // Staggered rows form a checkerboard: edge-sharing diamonds alternate.
      const warm = row % 2 === 0;
      diamonds.push(
        `<path d="M${x} ${y - 41.3} ${x + 41.3} ${y} ${x} ${y + 41.3} ${
          x - 41.3
        } ${y}Z" fill="${warm ? peach : leaf}" fill-opacity="${
          warm ? peachOpacity : leafOpacity
        }"/>`
      );
    }
  }
  const threads = [];
  for (let k = -5; k <= 5; k++) {
    const x = 120 + k * 84;
    threads.push(`M${x - 151} 17 ${x + 151} 319 M${x + 151} 17 ${x - 151} 319`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="336" viewBox="0 0 240 336">
  <defs><clipPath id="edge"><rect x="17" y="17" width="206" height="302" rx="5"/></clipPath></defs>
  <rect width="240" height="336" rx="16" fill="${paper}"/>
  <rect x="7" y="7" width="226" height="322" rx="11" fill="${base}"/>
  <g clip-path="url(#edge)">
    ${diamonds.join("\n    ")}
    <path d="${threads.join(
      " "
    )}" fill="none" stroke="${blush}" stroke-opacity=".9" stroke-width="${
    miniature ? 3.5 : 2
  }"${miniature ? "" : ' stroke-dasharray="5 5"'}/>
  </g>
  <rect x="14" y="14" width="212" height="308" rx="7" fill="none" stroke="${blush}" stroke-width="1.5"/>
  <rect x="19" y="19" width="202" height="298" rx="4" fill="none" stroke="${paper}" stroke-opacity=".45" stroke-width=".8"/>
</svg>\n`;
}
for (const theme of ["light", "dark"]) {
  for (const miniature of [false, true]) {
    writeFileSync(
      new URL(
        `../web/public/cards/back${theme === "light" ? "-light" : ""}${miniature ? "-mini" : ""}.svg`,
        import.meta.url
      ),
      svg(miniature, theme)
    );
  }
}
