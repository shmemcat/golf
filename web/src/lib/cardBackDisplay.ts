export type CardBackDisplayMode = "uniform" | "players";

export function normalizeCardBackDisplay(value: unknown): CardBackDisplayMode {
  return value === "players" ? "players" : "uniform";
}
