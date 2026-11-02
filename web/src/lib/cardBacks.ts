
export const CARD_BACKS = [
  {
    "id": "argyle",
    "name": "Argyle",
    "group": "Patterns",
    "number": 0
  },
  {
    "id": "compass",
    "name": "Compass",
    "group": "Emblems",
    "number": 18
  },
  {
    "id": "leaf-pair",
    "name": "Leaf pair",
    "group": "Botanicals",
    "number": 31
  },
  {
    "id": "fern-sprig",
    "name": "Fern sprig",
    "group": "Botanicals",
    "number": 33
  },
  {
    "id": "ginkgo",
    "name": "Ginkgo",
    "group": "Botanicals",
    "number": 34
  },
  {
    "id": "four-leaf",
    "name": "Four leaf",
    "group": "Botanicals",
    "number": 35
  },
  {
    "id": "solitaire-bold",
    "name": "Solitaire bold",
    "group": "Emblems",
    "number": 37
  },
  {
    "id": "north-star",
    "name": "North star",
    "group": "Emblems",
    "number": 40
  },
  {
    "id": "laurel-seal",
    "name": "Laurel seal",
    "group": "Botanicals",
    "number": 43
  },
  {
    "id": "acorn",
    "name": "Acorn",
    "group": "Botanicals",
    "number": 46
  },
  {
    "id": "jasmine",
    "name": "Jasmine",
    "group": "Botanicals",
    "number": 47
  },
  {
    "id": "lotus",
    "name": "Lotus",
    "group": "Botanicals",
    "number": 49
  },
  {
    "id": "celestial-seal",
    "name": "Celestial seal",
    "group": "Emblems",
    "number": 52
  },
  {
    "id": "diamond-linen",
    "name": "Diamond linen",
    "group": "Patterns",
    "number": 56
  },
  {
    "id": "crossed-irons",
    "name": "Crossed irons",
    "group": "Golf",
    "number": 60
  },
  {
    "id": "heritage-gingham",
    "name": "Heritage gingham",
    "group": "Patterns",
    "number": 61
  },
  {
    "id": "glen-plaid",
    "name": "Glen plaid",
    "group": "Patterns",
    "number": 63
  },
  {
    "id": "tattersall",
    "name": "Tattersall",
    "group": "Patterns",
    "number": 64
  },
  {
    "id": "country-tartan",
    "name": "Country tartan",
    "group": "Patterns",
    "number": 65
  },
  {
    "id": "harlequin",
    "name": "Harlequin",
    "group": "Patterns",
    "number": 75
  },
  {
    "id": "madras-plaid",
    "name": "Madras plaid",
    "group": "Patterns",
    "number": 76
  },
  {
    "id": "diamond-lattice",
    "name": "Diamond lattice",
    "group": "Patterns",
    "number": 81
  },
  {
    "id": "scallop",
    "name": "Scallop",
    "group": "Patterns",
    "number": 85
  },
  {
    "id": "fern",
    "name": "Fern",
    "group": "Botanicals",
    "number": 91
  },
  {
    "id": "wildflower",
    "name": "Wildflower",
    "group": "Botanicals",
    "number": 93
  },
  {
    "id": "garden-trellis",
    "name": "Garden trellis",
    "group": "Botanicals",
    "number": 94
  },
  {
    "id": "petal-tile",
    "name": "Petal tile",
    "group": "Botanicals",
    "number": 95
  },
  {
    "id": "leaf-stripe",
    "name": "Leaf stripe",
    "group": "Botanicals",
    "number": 98
  },
  {
    "id": "layered-fan",
    "name": "Layered fan",
    "group": "Patterns",
    "number": 100
  }
] as const;
export type CardBackDefinition = (typeof CARD_BACKS)[number];
export type CardBackId = CardBackDefinition["id"];
export type CardBackGroup = CardBackDefinition["group"];
export const CARD_BACK_STORAGE_KEY = "golf.card-back.v1";
export const CARD_BACK_GROUPS = ["Botanicals", "Patterns", "Emblems", "Golf"] as const;
export function normalizeCardBack(value: unknown): CardBackId {
  return CARD_BACKS.find(back => back.id === value)?.id ?? "argyle";
}
const selectableIds: ReadonlySet<CardBackId> = new Set(["argyle","compass","leaf-pair","fern-sprig","ginkgo","four-leaf","solitaire-bold","north-star","laurel-seal","acorn","jasmine","lotus","celestial-seal","crossed-irons","heritage-gingham","glen-plaid","tattersall","country-tartan","harlequin","madras-plaid","diamond-lattice","scallop","fern","wildflower","garden-trellis","petal-tile","leaf-stripe","layered-fan"]);
export const SELECTABLE_CARD_BACKS = CARD_BACKS.filter(back => selectableIds.has(back.id));
export function cardBackAsset(id: CardBackId, theme: "light" | "dark") {
  return id === "argyle" ? `cards/back${theme === "light" ? "-light" : ""}.svg` : `cards/backs/${id}-${theme}.svg`;
}
