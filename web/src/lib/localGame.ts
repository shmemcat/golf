import { RANKS, SUITS, type Game, type GolfCard } from "@/game/engine";
import type { Stage, TableMotion } from "@/hooks/useGolfTable";
import { readStorage, removeStorage, writeStorage } from "./storage";

const key = "golf.active-local.v1";
export interface LocalGame {
  game: Game;
  stage: Stage;
  motion: TableMotion | null;
  pickerTick: number;
  openingBusy: boolean;
}

const card = (value: GolfCard) => value && typeof value.id === "string" &&
  RANKS.includes(value.rank) && SUITS.includes(value.suit);

export function readLocalGame(): LocalGame | null {
  const saved = readStorage<LocalGame | null>(key, null);
  if (!saved || typeof saved !== "object") return null;
  const { game, stage, motion, pickerTick, openingBusy } = saved;
  if (!game || typeof game.id !== "string" || !Array.isArray(game.players) ||
    game.players.length < 2 || game.players.length > 6 ||
    !game.players.every(player => player && Number.isInteger(player.score) && Array.isArray(player.cards) &&
      player.cards.length === 6 && player.cards.every(cell => cell && typeof cell.faceUp === "boolean" && card(cell.card))) ||
    !Array.isArray(game.deck) || !game.deck.every(card) || !Array.isArray(game.discard) || !game.discard.every(card) ||
    !Number.isInteger(game.hole) || game.hole < 1 || game.hole > 9 ||
    ![game.turn, game.starter].every(seat => Number.isInteger(seat) && seat >= 0 && seat < game.players.length) ||
    !["opening", "draw", "replace", "round-over"].includes(game.phase) ||
    !Array.isArray(game.history) || !game.history.every(hole => Array.isArray(hole) && hole.length === game.players.length && hole.every(Number.isInteger)) ||
    (game.finalTurns !== null && (!Array.isArray(game.finalTurns) || !game.finalTurns.every(seat => Number.isInteger(seat) && seat >= 0 && seat < game.players.length))) ||
    (game.drawn !== null && (!game.drawn || !card(game.drawn.card) || !["deck", "discard"].includes(game.drawn.source))) ||
    (game.phase === "replace" && !game.drawn) ||
    !["dealing", "opening", "opponents", "upcard", "picking", "announcing", "playing"].includes(stage) ||
    !Number.isInteger(pickerTick) || pickerTick < 0 || typeof openingBusy !== "boolean" ||
    (motion !== null && (!motion || !card(motion.card) || !["draw", "discard", "place", "toss", "upcard"].includes(motion.kind) ||
      !Number.isInteger(motion.seat) || motion.seat < 0 || motion.seat >= game.players.length ||
      !Number.isInteger(motion.index) || motion.index < -1 || motion.index > 5 ||
      !["deck", "discard"].includes(motion.source) || typeof motion.from !== "string" || typeof motion.to !== "string" ||
      typeof motion.flip !== "boolean"))) return null;
  return saved;
}

export function clearLocalGame(id: string) {
  if (readLocalGame()?.game.id === id) removeStorage(key);
}

export function saveLocalGame(saved: LocalGame) {
  if (saved.game.phase === "game-over") clearLocalGame(saved.game.id);
  else writeStorage(key, saved);
}
