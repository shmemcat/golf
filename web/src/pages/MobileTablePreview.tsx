import { useLayoutEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createGame, type Game, type Rank, type Suit } from "@/game/engine";
import { FLIGHT_MS, type TableMotion, type useGolfTable } from "@/hooks/useGolfTable";
import { drawLayoutFrom, GolfTableView } from "./GamePage";

const HANDS: [Rank, Suit][][] = [
  [["9", "S"], ["K", "D"], ["8", "C"], ["5", "H"], ["3", "D"], ["9", "H"]],
  [["7", "C"], ["9", "H"], ["9", "S"], ["2", "S"], ["5", "D"], ["J", "C"]],
  [["6", "S"], ["8", "C"], ["K", "H"], ["4", "D"], ["4", "C"], ["A", "S"]],
  [["A", "D"], ["5", "H"], ["K", "C"], ["2", "H"], ["6", "D"], ["3", "S"]],
  [["4", "H"], ["Q", "D"], ["3", "C"], ["6", "H"], ["2", "C"], ["A", "H"]],
  [["8", "S"], ["J", "D"], ["10", "C"], ["7", "H"], ["K", "S"], ["2", "D"]],
];

// Static, identical hands make empty/drawn layout comparisons reproducible.
export function mobilePreviewGame(count: number, drawn: boolean, actor = 0): Game {
  const base = createGame(count);
  return {
    ...base, starter: 0, turn: actor, phase: drawn ? "replace" : "draw",
    deck: base.deck.slice(0, base.deck.length - 1 - Number(drawn)),
    discard: [{ id: "preview-discard", rank: "6", suit: "C" }],
    drawn: drawn ? { card: { id: "preview-draw", rank: "Q", suit: "S" }, source: "deck" } : null,
    players: HANDS.slice(0, count).map((hand, seat) => ({ score: 0, cards: hand.map(([rank, suit], index) => ({
      card: { id: `preview-${seat}-${index}`, rank, suit }, faceUp: seat === 0 ? [0, 4].includes(index) : [1, 2].includes(index),
    })) })),
  };
}

export default function MobileTablePreview() {
  const [params] = useSearchParams();
  const requested = Number(params.get("players") ?? 3);
  const count = Number.isInteger(requested) && requested >= 2 && requested <= 6 ? requested : 3;
  const drawn = params.get("drawn") === "1";
  const requestedActor = Number(params.get("actor") ?? 0);
  const actor = Number.isInteger(requestedActor) && requestedActor >= 0 && requestedActor < count ? requestedActor : 0;
  const replay = params.get("replay") ?? "0";
  const [animating, setAnimating] = useState(false);
  // Start after the table's anchor refs have mounted, before the first paint.
  useLayoutEffect(() => {
    if (!drawn || replay === "0") { setAnimating(false); return; }
    setAnimating(true);
    const timer = window.setTimeout(() => setAnimating(false), FLIGHT_MS);
    return () => clearTimeout(timer);
  }, [drawn, replay, actor]);
  const sample = useMemo(() => mobilePreviewGame(count, drawn, actor), [count, drawn, actor]);
  const game = animating && sample.drawn ? { ...sample, deck: [...sample.deck, sample.drawn.card], drawn: null, phase: "draw" as const } : sample;
  const motion = useMemo<TableMotion | null>(() => animating && sample.drawn ? {
    kind: "draw", card: sample.drawn.card, from: "deck", to: `drawn-${actor}`, flip: true, seat: actor, index: -1, source: "deck",
  } : null, [animating, sample, actor]);
  const noop = () => {};
  const table: ReturnType<typeof useGolfTable> = {
    game, stage: "playing", motion, pickerSeat: 0, canReveal: () => false,
    canDraw: false, canReplace: false, reveal: noop, draw: noop, replace: noop, toss: noop, advance: noop, restart: noop,
  };
  return <GolfTableView count={count} selection="backing" table={table} drawLayout={drawLayoutFrom(params.get("drawLayout"))} />;
}
