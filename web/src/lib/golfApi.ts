import type { Game, GolfCard } from "@/game/engine";
import type { Stage, TableMotion } from "@/hooks/useGolfTable";

export type GolfMode = "bot" | "multiplayer";
export interface Participant { name: string; profileIcon: string; isBot: boolean; connected: boolean }
export interface RoomState {
  code: string; mode: GolfMode; capacity: number; revision: number; mySeat: number; isHost: boolean;
  actionTokens?: Record<string, string>;
  seats: Participant[]; stage: Stage | "lobby" | "closed"; closed?: boolean; closedReason?: "not_enough_players" | null;
  game: (Omit<Game, "deck" | "players"> & { deckCount: number; players: { score: number; cards: { faceUp: boolean; revealedAtEnd?: boolean; card: Pick<GolfCard, "id"> & Partial<GolfCard> }[] }[] }) | null;
  motion: TableMotion | null; ready: number[]; rematchReady: number[]; idleWarning?: boolean;
}
export interface Statistics {
  games_started: number; games_played: number; games_completed: number; games_won: number; games_lost: number;
  games_abandoned: number; win_rate: number; current_win_streak: number; best_win_streak: number;
  holes_played: number; best_score: number | null; worst_score: number | null; average_score: number | null;
  best_hole: number | null; worst_hole: number | null; negative_holes: number; zero_holes: number;
  pairs: number; bonus_blocks: number; shared_wins: number; deck_draws: number; discard_draws: number;
  replacements: number; discarded_draws: number; cards_revealed: number; autoplay_turns: number;
  achievements: Record<string, boolean>;
}
export type AccountStatistics = Record<"all_time" | GolfMode, Statistics>;
export interface Leader { rank: number; username: string; profile_icon: string; games_won: number }
export interface Rankings { monthly: Leader[]; all_time: Leader[] }
export class GolfError extends Error {
  constructor(message: string, public code = "UNAVAILABLE") { super(message); }
}
export async function golfGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return golfRequest<T>(path, { signal });
}
async function golfRequest<T>(path: string, init: RequestInit): Promise<T> {
  try {
    const response = await fetch(`/api/golf${path}`, { credentials: "include", cache: "no-store", ...init });
    const data = await response.json();
    if (!response.ok) throw new GolfError(data.error || "Golf is temporarily unavailable. Please retry.", data.code);
    return data as T;
  } catch (error) {
    if (error instanceof GolfError || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new GolfError("Couldn’t reach Golf. Check your connection and try again.");
  }
}
export const golfSession = () => golfGet<{ csrf_token: string; user: { id: string; name: string } | null }>("/session");
export async function golfPost<T>(path: string, body: unknown, expectedUserId?: string): Promise<T> {
  const session = await golfSession();
  if (expectedUserId !== undefined && session.user?.id !== expectedUserId) {
    throw new GolfError("Your account changed. Please refresh and try again.", "SIGNED_OUT");
  }
  return golfRequest<T>(path, { method: "POST", headers: {
    "Content-Type": "application/json", "X-Golf-CSRF": session.csrf_token,
    "X-Golf-UTC-Offset": String(new Date().getTimezoneOffset()),
  }, body: JSON.stringify(body) });
}
export const newRequestId = () => crypto.randomUUID();
export const roomPath = (code: string) => `/rooms/${encodeURIComponent(code)}`;
