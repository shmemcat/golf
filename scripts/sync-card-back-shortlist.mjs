import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { designs as original } from "../web/public/card-back-preview/designs.js";
import { designs as large } from "../web/public/card-back-preview/designs-large.js";
import { designs as refined } from "../web/public/card-back-preview/designs-refined.js";
import { designs as textiles } from "../web/public/card-back-preview/designs-textiles.js";
import { designs as patterns } from "../web/public/card-back-preview/designs-patterns.js";
import { shortlistSnapshot } from "../web/public/card-back-preview/picker-shortlist.js";

const collections = { original: { designs: original, first: 1 }, large: { designs: large, first: 21 }, refined: { designs: refined, first: 41 }, textiles: { designs: textiles, first: 61 }, patterns: { designs: patterns, first: 81 } };
const groupFor = family => family === "Botanical" ? "Botanicals" : family === "Emblem" ? "Emblems" : family === "Golf" ? "Golf" : "Patterns";
const backs = [{ id: "argyle", name: "Argyle", group: "Patterns", number: 0, collection: "original", galleryId: "" }];
const destination = new URL("../web/public/cards/backs/", import.meta.url);
mkdirSync(destination, { recursive: true });
for (const [collection, { designs, first }] of Object.entries(collections)) {
  const ids = new Set(shortlistSnapshot[collection]);
  if (collection === "refined") ids.add("56-diamond-linen"); // Retain an earlier approved preference.
  for (const [index, design] of designs.entries()) {
    if (!ids.has(design.id)) continue;
    const id = design.id.slice(3);
    backs.push({ id, name: design.name, group: groupFor(design.family), number: first + index, collection, galleryId: design.id });
    for (const theme of ["light", "dark"]) copyFileSync(new URL(`../web/public/card-back-preview/assets/${design.id}-${theme}.svg`, import.meta.url), new URL(`${id}-${theme}.svg`, destination));
  }
}
backs.sort((a, b) => a.number - b.number);
const source = `import { readStorage } from "@/lib/storage";

export const CARD_BACKS = ${JSON.stringify(backs, null, 2)} as const;
export type CardBackDefinition = (typeof CARD_BACKS)[number];
export type CardBackId = CardBackDefinition["id"];
export type CardBackGroup = CardBackDefinition["group"];
export const CARD_BACK_STORAGE_KEY = "golf.card-back.v1";
export const CARD_BACK_GROUPS = ["Botanicals", "Patterns", "Emblems", "Golf"] as const;
const shortlistDefaults: Record<string, string[]> = ${JSON.stringify(shortlistSnapshot, null, 2)};
const shortlistKeys: Record<string, string> = {
  original: "golf.card-back-concepts.shortlist.v1",
  large: "golf.card-back-concepts.shortlist.large.v1",
  refined: "golf.card-back-concepts.shortlist.refined.v1",
  textiles: "golf.card-back-concepts.shortlist.textiles.v1",
  patterns: "golf.card-back-concepts.shortlist.patterns.v1",
};

export function normalizeCardBack(value: unknown): CardBackId {
  return CARD_BACKS.find(back => back.id === value)?.id ?? "argyle";
}
export const SELECTABLE_CARD_BACKS = CARD_BACKS.filter(back => back.id === "argyle" || shortlistDefaults[back.collection].includes(back.galleryId));
export function cardBackAsset(id: CardBackId, theme: "light" | "dark") {
  return id === "argyle" ? \`cards/back\${theme === "light" ? "-light" : ""}.svg\` : \`cards/backs/\${id}-\${theme}.svg\`;
}
export function readShortlistedCardBacks(): CardBackDefinition[] {
  const selected: Record<string, unknown[]> = {};
  for (const [collection, key] of Object.entries(shortlistKeys)) {
    const saved = readStorage<unknown>(key, shortlistDefaults[collection]);
    selected[collection] = Array.isArray(saved) ? saved : shortlistDefaults[collection];
  }
  return CARD_BACKS.filter(back => back.id === "argyle" || selected[back.collection].includes(back.galleryId));
}
`;
writeFileSync(new URL("../web/src/lib/cardBacks.ts", import.meta.url), source);
console.log(`Synced ${backs.length - 1} card backs and the user's shortlist.`);
