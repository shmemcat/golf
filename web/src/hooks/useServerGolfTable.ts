import { useEffect, useRef, useState } from "react";
import { canOpen, type Game, type GolfCard } from "@/game/engine";
import type { Stage, TableMotion, useGolfTable } from "./useGolfTable";
import { FLIP_MS } from "./useGolfTable";
import type { RoomState } from "@/lib/golfApi";
import { useSound } from "@/context/SoundContext";

function motionKey(motion: TableMotion | null) {
  // HTTP and socket JSON use different key orders; identify the movement by its values.
  return motion && JSON.stringify([
    motion.kind, motion.card.id, motion.from, motion.to, motion.flip,
    motion.seat, motion.index, motion.source,
  ]);
}

export function projectTable(state: RoomState) {
  const source = state.game!;
  const count = source.players.length;
  const seat = (absolute: number) => (absolute - state.mySeat + count) % count;
  const order = Array.from({ length: count }, (_, i) => (i + state.mySeat) % count);
  const game: Game = { ...source,
    // Record rosters are already oriented to this viewer by the server and may
    // include people who have since left the current table.
    holeRecords: state.holeRecords,
    players: order.map(i => ({ ...source.players[i], cards: source.players[i].cards.map(cell => ({ ...cell, card: { rank: "K", suit: "S", ...cell.card } as GolfCard })) })),
    deck: Array.from({ length: source.deckCount }, (_, i) => ({ id: `deck-${i}`, rank: "K", suit: "S" })),
    turn: seat(source.turn), starter: seat(source.starter), finalTurns: source.finalTurns?.map(seat) ?? null,
    history: source.history.map(hole => order.map(i => hole[i])),
  };
  const anchor = (value: string) => value.replace(/^(card|drawn)-(\d+)/, (_, kind, index) => `${kind}-${seat(+index)}`);
  const motion: TableMotion | null = state.motion ? { ...state.motion, seat: seat(state.motion.seat), from: anchor(state.motion.from), to: anchor(state.motion.to) } : null;
  return { game, motion, participants: order.map(i => state.seats[i]) };
}

export function useServerGolfTable(state: RoomState, command: (action: string, detail?: Record<string, unknown>) => Promise<boolean>, disabled: boolean) {
  const { game, motion, participants } = projectTable(state);
  const { play } = useSound();
  const previous = useRef<RoomState | null>(null);
  const [flipping, setFlipping] = useState(false);
  useEffect(() => {
    const before = previous.current;
    if (state.game && before?.game?.id === state.game.id) {
      if (state.motion && motionKey(state.motion) !== motionKey(before.motion)) play("slide");
      if (state.game.hole !== before.game.hole) play("deal");
      if (state.game.phase !== before.game.phase && state.game.phase === "game-over") play("win");
      else if (state.game.phase !== before.game.phase && state.game.phase === "round-over") play("round");
    }
    previous.current = state;
  }, [state, play]);
  useEffect(() => {
    if (!flipping) return;
    const timer = window.setTimeout(() => setFlipping(false), FLIP_MS);
    return () => window.clearTimeout(timer);
  }, [flipping]);
  const stage = state.stage as Stage;
  const available = !disabled && !motion;
  const table: ReturnType<typeof useGolfTable> = {
    game, stage, motion, pickerSeat: game.starter,
    canReveal: index => available && !flipping && stage === "opening" && canOpen(game, index),
    canDraw: available && stage === "playing" && game.turn === 0 && game.phase === "draw",
    canReplace: available && stage === "playing" && game.turn === 0 && game.phase === "replace",
    reveal: index => { setFlipping(true); play("flip"); void command("reveal", { index }); },
    draw: source => { void command("draw", { source }); },
    replace: index => { void command("replace", { index }); },
    toss: () => { void command("toss"); }, advance: () => { void command("advance"); }, restart: () => { void command("restart"); },
  };
  return { table, participants };
}
