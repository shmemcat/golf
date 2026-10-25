// Design studies only. The playable table continues to use SEAT_LAYOUTS.
export type LayoutId = "raised" | "own-row" | "center" | "below" | "header";
export type PreviewCount = 5 | 6;
export interface PreviewSeat {
  seat: number;
  x: number;
  y: number;
  cardWidth: number;
  width: number;
  height: number;
  label: "above" | "below";
}
export interface PreviewLayout {
  width: number;
  height: number;
  seats: PreviewSeat[];
  drawn: { x: number; y: number; width: number; height: number };
  hintY: number;
}
export const LAYOUT_IDEAS: { id: LayoutId; letter: string; title: Record<PreviewCount, string>; benefit: string; tradeoff: Record<PreviewCount, string> }[] = [
  {
    id: "raised", letter: "A", title: { 5: "Open horseshoe", 6: "Raised sides" },
    benefit: "Bring the lower opponents up and outward. Your draw stays beside you.",
    tradeoff: { 5: "Keeps the familiar table feel, with more room around your seat.", 6: "Keeps three across the top and opens the bottom corners." },
  },
  {
    id: "own-row", letter: "B", title: { 5: "Four above", 6: "Five above" },
    benefit: "Give your board and drawn card a row of their own.",
    tradeoff: { 5: "An open lower half. Opponents form one wider row.", 6: "An open lower half. Five opponents share a compact top row." },
  },
  {
    id: "center", letter: "C", title: { 5: "Draw above you", 6: "Draw above you" },
    benefit: "Keep the existing seats and put the draw in a dedicated center spot.",
    tradeoff: { 5: "A little more vertical space keeps the draw close to your cards.", 6: "Adds a center lane between the top opponents and your board." },
  },
  {
    id: "below", letter: "D", title: { 5: "Draw below you", 6: "Draw below you" },
    benefit: "Keep the existing seats and tuck the draw between your cards and name.",
    tradeoff: { 5: "Your whole turn fits in one column, but your seat becomes taller.", 6: "Protects the side seats at the cost of a taller personal area." },
  },
  {
    id: "header", letter: "E", title: { 5: "Draw with the piles", 6: "Draw with the piles" },
    benefit: "Reserve a third spot beside deck and discard.",
    tradeoff: { 5: "Compact fallback. The drawn card sits farther from your board.", 6: "The clearest separation, with the longest trip from draw to replacement." },
  },
];

export function previewLayout(count: PreviewCount, id: LayoutId, width: number, actor = 0): PreviewLayout {
  // Keep a shared gradual sizing baseline for comparing the studies.
  const t = Math.max(0, Math.min(1, (width - 760) / 360));
  const playerCard = 54 + 22 * t;
  const opponentCard = 40 + 16 * t;
  const playerHeight = 2 * playerCard * 1.4 + 14;
  const opponentHeight = 2 * opponentCard * 1.4 + 8;
  const height = id === "center" ? 645 + 115 * t
    : id === "below" ? 660 + 140 * t : 530 + 90 * t;
  const seats: PreviewSeat[] = [];
  function add(seat: number, x: number, y: number, label: PreviewSeat["label"] = "above") {
    const cardWidth = seat === 0 ? playerCard : opponentCard;
    seats.push({ seat, x: x * width, y, cardWidth, width: 3 * cardWidth + (seat === 0 ? 20 : 16),
      height: seat === 0 ? playerHeight : opponentHeight, label });
  }
  const humanY = height - 75 - playerHeight - (id === "below" ? playerCard * 1.4 + 54 : 0);
  add(0, .5, humanY, "below");
  if (id === "own-row") {
    Array.from({ length: count - 1 }, (_, i) => (i + .5) / (count - 1)).forEach((x, i) => add(i + 1, x, 90));
  } else if (id === "raised") {
    const sideY = count === 6 ? 306 + 42 * t : 230 + 32 * t;
    const sideX = .14;
    add(1, sideX, sideY);
    if (count === 5) {
      add(2, .33, 90); add(3, .67, 90);
    } else {
      add(2, 1 / 6, 90); add(3, .5, 90); add(4, 5 / 6, 90);
    }
    add(count - 1, 1 - sideX, sideY);
  } else {
    add(1, 1 / 6, height - 75 - opponentHeight, "below");
    if (count === 5) {
      add(2, 1 / 3, 90); add(3, 2 / 3, 90);
    } else {
      add(2, 1 / 6, 90); add(3, .5, 90); add(4, 5 / 6, 90);
    }
    add(count - 1, 5 / 6, height - 75 - opponentHeight, "below");
  }
  const owner = seats.find(seat => seat.seat === actor)!;
  const drawWidth = owner.cardWidth;
  const drawHeight = drawWidth * 1.4;
  let drawn = { x: owner.x + owner.width / 2 + 22, y: owner.y + (owner.height - drawHeight) / 2, width: drawWidth, height: drawHeight };
  if (actor && owner.x > width / 2) drawn.x = owner.x - owner.width / 2 - 22 - drawWidth;
  if (id === "own-row" && actor) drawn = { x: owner.x - drawWidth / 2, y: owner.y + owner.height + 24, width: drawWidth, height: drawHeight };
  if (id === "center") drawn = { x: width / 2 - drawWidth / 2, y: humanY - drawHeight - 38, width: drawWidth, height: drawHeight };
  if (id === "below") drawn = { x: width / 2 - drawWidth / 2, y: humanY + playerHeight + 24, width: drawWidth, height: drawHeight };
  if (id === "header") drawn = { x: width / 2 + 59, y: -128, width: 58, height: 81.2 };
  const hintY = id === "center" ? drawn.y - 43 : humanY - 54;
  return { width, height, seats, drawn, hintY };
}
