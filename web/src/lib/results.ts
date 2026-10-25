import type { Game } from "@/game/engine";
import { readStorage, removeStorage, writeStorage } from "./storage";

export type GolfResult = {
  id: string;
  finishedAt: string;
  scores: number[];
  holes: number[];
};

const resultsKey = (userId: string) => `golf.results.v1:${encodeURIComponent(userId)}`;
export const clearResults = (userId: string) => removeStorage(resultsKey(userId));
const score = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

function isResult(value: unknown): value is GolfResult {
  if (!value || typeof value !== "object") return false;
  const result = value as GolfResult;
  return typeof result.id === "string" && !!result.id &&
    typeof result.finishedAt === "string" && Number.isFinite(Date.parse(result.finishedAt)) &&
    Array.isArray(result.scores) && result.scores.length >= 2 && result.scores.length <= 6 &&
    result.scores.every(value => score(value) && value >= -288 && value <= 630) &&
    Array.isArray(result.holes) && result.holes.length === 9 &&
    result.holes.every(value => score(value) && value >= -32 && value <= 70) &&
    result.holes.reduce((sum, value) => sum + value, 0) === result.scores[0];
}

export function readResults(userId: string): GolfResult[] {
  const stored = readStorage<unknown>(resultsKey(userId), []);
  if (!Array.isArray(stored)) return [];
  const ids = new Set<string>();
  return stored.filter(isResult).filter(result => {
    if (ids.has(result.id)) return false;
    ids.add(result.id);
    return true;
  });
}

export function recordResult(game: Game, userId: string): boolean {
  if (game.phase !== "game-over" || game.history.length !== 9) return true;
  const results = readResults(userId);
  if (results.some(result => result.id === game.id)) return true;
  const result: GolfResult = {
    id: game.id,
    finishedAt: new Date().toISOString(),
    scores: game.players.map(player => player.score),
    holes: game.history.map(hole => hole[0]),
  };
  if (!isResult(result)) return false;
  return writeStorage(resultsKey(userId), [...results, result]);
}

export const isWin = (result: GolfResult) => result.scores[0] === Math.min(...result.scores);

export function summarizeResults(results: GolfResult[]) {
  const scores = results.map(result => result.scores[0]);
  const holes = results.flatMap(result => result.holes);
  const won = results.filter(isWin).length;
  return {
    played: results.length,
    won,
    winRate: results.length ? `${Math.round(won / results.length * 100)}%` : "—",
    holesPlayed: holes.length,
    bestScore: scores.length ? Math.min(...scores) : "—",
    bestHole: holes.length ? Math.min(...holes) : "—",
    averageScore: scores.length ? (scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1) : "—",
    negativeHoles: holes.filter(value => value < 0).length,
  };
}
