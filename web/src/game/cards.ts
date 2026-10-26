export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export const SUITS = ["S", "H", "C", "D"] as const;
export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export interface GolfCard { id: string; rank: Rank; suit: Suit }
export interface GridCard { card: GolfCard; faceUp: boolean; revealedAtEnd?: boolean }

export function cardValue(rank: Rank): number {
  if (rank === "K") return 0;
  if (rank === "A") return 1;
  if (rank === "2") return -2;
  return rank === "Q" || rank === "J" ? 10 : Number(rank);
}
