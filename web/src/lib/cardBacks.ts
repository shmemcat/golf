import { readStorage } from "@/lib/storage";

export const CARD_BACKS = [
  {
    "id": "argyle",
    "name": "Argyle",
    "group": "Patterns",
    "number": 0,
    "collection": "original",
    "galleryId": ""
  },
  {
    "id": "compass",
    "name": "Compass",
    "group": "Emblems",
    "number": 18,
    "collection": "original",
    "galleryId": "18-compass"
  },
  {
    "id": "leaf-pair",
    "name": "Leaf pair",
    "group": "Botanicals",
    "number": 31,
    "collection": "large",
    "galleryId": "31-leaf-pair"
  },
  {
    "id": "fern-sprig",
    "name": "Fern sprig",
    "group": "Botanicals",
    "number": 33,
    "collection": "large",
    "galleryId": "33-fern-sprig"
  },
  {
    "id": "ginkgo",
    "name": "Ginkgo",
    "group": "Botanicals",
    "number": 34,
    "collection": "large",
    "galleryId": "34-ginkgo"
  },
  {
    "id": "four-leaf",
    "name": "Four leaf",
    "group": "Botanicals",
    "number": 35,
    "collection": "large",
    "galleryId": "35-four-leaf"
  },
  {
    "id": "solitaire-bold",
    "name": "Solitaire bold",
    "group": "Emblems",
    "number": 37,
    "collection": "large",
    "galleryId": "37-solitaire-bold"
  },
  {
    "id": "north-star",
    "name": "North star",
    "group": "Emblems",
    "number": 40,
    "collection": "large",
    "galleryId": "40-north-star"
  },
  {
    "id": "laurel-seal",
    "name": "Laurel seal",
    "group": "Botanicals",
    "number": 43,
    "collection": "refined",
    "galleryId": "43-laurel-seal"
  },
  {
    "id": "acorn",
    "name": "Acorn",
    "group": "Botanicals",
    "number": 46,
    "collection": "refined",
    "galleryId": "46-acorn"
  },
  {
    "id": "jasmine",
    "name": "Jasmine",
    "group": "Botanicals",
    "number": 47,
    "collection": "refined",
    "galleryId": "47-jasmine"
  },
  {
    "id": "lotus",
    "name": "Lotus",
    "group": "Botanicals",
    "number": 49,
    "collection": "refined",
    "galleryId": "49-lotus"
  },
  {
    "id": "celestial-seal",
    "name": "Celestial seal",
    "group": "Emblems",
    "number": 52,
    "collection": "refined",
    "galleryId": "52-celestial-seal"
  },
  {
    "id": "diamond-linen",
    "name": "Diamond linen",
    "group": "Patterns",
    "number": 56,
    "collection": "refined",
    "galleryId": "56-diamond-linen"
  },
  {
    "id": "crossed-irons",
    "name": "Crossed irons",
    "group": "Golf",
    "number": 60,
    "collection": "refined",
    "galleryId": "60-crossed-irons"
  },
  {
    "id": "heritage-gingham",
    "name": "Heritage gingham",
    "group": "Patterns",
    "number": 61,
    "collection": "textiles",
    "galleryId": "61-heritage-gingham"
  },
  {
    "id": "glen-plaid",
    "name": "Glen plaid",
    "group": "Patterns",
    "number": 63,
    "collection": "textiles",
    "galleryId": "63-glen-plaid"
  },
  {
    "id": "tattersall",
    "name": "Tattersall",
    "group": "Patterns",
    "number": 64,
    "collection": "textiles",
    "galleryId": "64-tattersall"
  },
  {
    "id": "country-tartan",
    "name": "Country tartan",
    "group": "Patterns",
    "number": 65,
    "collection": "textiles",
    "galleryId": "65-country-tartan"
  },
  {
    "id": "harlequin",
    "name": "Harlequin",
    "group": "Patterns",
    "number": 75,
    "collection": "textiles",
    "galleryId": "75-harlequin"
  },
  {
    "id": "madras-plaid",
    "name": "Madras plaid",
    "group": "Patterns",
    "number": 76,
    "collection": "textiles",
    "galleryId": "76-madras-plaid"
  },
  {
    "id": "diamond-lattice",
    "name": "Diamond lattice",
    "group": "Patterns",
    "number": 81,
    "collection": "patterns",
    "galleryId": "61-diamond-lattice"
  },
  {
    "id": "scallop",
    "name": "Scallop",
    "group": "Patterns",
    "number": 85,
    "collection": "patterns",
    "galleryId": "65-scallop"
  },
  {
    "id": "fern",
    "name": "Fern",
    "group": "Botanicals",
    "number": 91,
    "collection": "patterns",
    "galleryId": "71-fern"
  },
  {
    "id": "wildflower",
    "name": "Wildflower",
    "group": "Botanicals",
    "number": 93,
    "collection": "patterns",
    "galleryId": "73-wildflower"
  },
  {
    "id": "garden-trellis",
    "name": "Garden trellis",
    "group": "Botanicals",
    "number": 94,
    "collection": "patterns",
    "galleryId": "74-garden-trellis"
  },
  {
    "id": "petal-tile",
    "name": "Petal tile",
    "group": "Botanicals",
    "number": 95,
    "collection": "patterns",
    "galleryId": "75-petal-tile"
  },
  {
    "id": "leaf-stripe",
    "name": "Leaf stripe",
    "group": "Botanicals",
    "number": 98,
    "collection": "patterns",
    "galleryId": "78-leaf-stripe"
  },
  {
    "id": "layered-fan",
    "name": "Layered fan",
    "group": "Patterns",
    "number": 100,
    "collection": "patterns",
    "galleryId": "80-layered-fan"
  }
] as const;
export type CardBackDefinition = (typeof CARD_BACKS)[number];
export type CardBackId = CardBackDefinition["id"];
export type CardBackGroup = CardBackDefinition["group"];
export const CARD_BACK_STORAGE_KEY = "golf.card-back.v1";
export const CARD_BACK_GROUPS = ["Botanicals", "Patterns", "Emblems", "Golf"] as const;
const shortlistDefaults: Record<string, string[]> = {
  "original": [
    "18-compass"
  ],
  "large": [
    "31-leaf-pair",
    "33-fern-sprig",
    "34-ginkgo",
    "35-four-leaf",
    "37-solitaire-bold",
    "40-north-star"
  ],
  "refined": [
    "43-laurel-seal",
    "46-acorn",
    "47-jasmine",
    "49-lotus",
    "52-celestial-seal",
    "60-crossed-irons"
  ],
  "textiles": [
    "61-heritage-gingham",
    "63-glen-plaid",
    "64-tattersall",
    "65-country-tartan",
    "75-harlequin",
    "76-madras-plaid"
  ],
  "patterns": [
    "61-diamond-lattice",
    "65-scallop",
    "71-fern",
    "73-wildflower",
    "74-garden-trellis",
    "75-petal-tile",
    "78-leaf-stripe",
    "80-layered-fan"
  ]
};
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
  return id === "argyle" ? `cards/back${theme === "light" ? "-light" : ""}.svg` : `cards/backs/${id}-${theme}.svg`;
}
export function readShortlistedCardBacks(): CardBackDefinition[] {
  const selected: Record<string, unknown[]> = {};
  for (const [collection, key] of Object.entries(shortlistKeys)) {
    const saved = readStorage<unknown>(key, shortlistDefaults[collection]);
    selected[collection] = Array.isArray(saved) ? saved : shortlistDefaults[collection];
  }
  return CARD_BACKS.filter(back => back.id === "argyle" || selected[back.collection].includes(back.galleryId));
}
