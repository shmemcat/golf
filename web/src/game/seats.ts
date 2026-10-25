export type Position = "top" | "top-left" | "top-right" | "left" | "right" | "bottom" | "bottom-left" | "bottom-right";
// Seat numbers run clockwise from the human at the bottom center.
export const SEAT_LAYOUTS: Record<number, Position[]> = {
  2: ["bottom", "top"],
  3: ["bottom", "top-left", "top-right"],
  4: ["bottom", "top-left", "top", "top-right"],
  5: ["bottom", "left", "top-left", "top-right", "right"],
  6: ["bottom", "left", "top-left", "top", "top-right", "right"],
};
export const BOT_NAMES = ["Clover", "Birdie", "Sunny", "Maple", "Robin"];
