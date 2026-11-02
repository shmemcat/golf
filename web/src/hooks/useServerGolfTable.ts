import { useEffect, useRef, useState } from "react";
import { canOpen, openCard, type DrawSource, type Game, type GolfCard } from "@/game/engine";
import type { QueuedTurnAction, Stage, TableMotion, useGolfTable } from "./useGolfTable";
import type { RoomState } from "@/lib/golfApi";
import { useSound } from "@/context/SoundContext";

function motionKey(motion: TableMotion | null) {
  // HTTP and socket JSON use different key orders; identify the movement by its values.
  return motion && JSON.stringify([
    motion.kind, motion.card.id, motion.from, motion.to, motion.flip,
    motion.seat, motion.index, motion.source,
  ]);
}

interface TurnInput {
  id: number;
  key: string;
  source: DrawSource;
  deckCount: number;
  discardCount: number;
  cardId: string | null;
  observed: boolean;
  next: QueuedTurnAction | null;
  sent: boolean;
}

export function projectTable(state: RoomState) {
  const source = state.game!;
  const count = source.players.length;
  const mine = state.mySeat ?? 0;
  const seat = (absolute: number) => (absolute - mine + count) % count;
  const order = Array.from({ length: count }, (_, i) => (i + mine) % count);
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

export function useServerGolfTable(state: RoomState, command: (action: string, detail?: Record<string, unknown>) => Promise<boolean>, disabled: boolean, pending = false) {
  disabled = disabled || state.mySeat === null;
  const { game, motion, participants } = projectTable(state);
  const { play } = useSound();
  const previous = useRef<RoomState | null>(null);
  const openingKey = `${state.code}:${game.id}:${game.hole}:${state.mySeat}`;
  const [choices, setChoices] = useState({ key: openingKey, indices: [] as number[], sent: 0 });
  const latestChoices = useRef(choices);
  const sending = useRef(false);
  const updateChoices = (next: typeof choices) => { latestChoices.current = next; setChoices(next); };
  const openingGame = () => latestChoices.current.key === openingKey
    ? latestChoices.current.indices.reduce(openCard, game) : game;
  const turnKey = JSON.stringify([openingKey, game.players[0].cards.map(cell => [cell.card.id, cell.faceUp])]);
  const [turnInput, setTurnInput] = useState<TurnInput | null>(null);
  const latestInput = useRef(turnInput);
  const inputSerial = useRef(0);
  const updateInput = (next: TurnInput | null) => { latestInput.current = next; setTurnInput(next); };
  const currentInput = () => latestInput.current?.key === turnKey ? latestInput.current : null;
  const newInput = (source: DrawSource, arrived = false): TurnInput => ({
    id: ++inputSerial.current, key: turnKey, source,
    deckCount: game.deck.length - (!arrived && source === "deck" ? 1 : 0),
    discardCount: game.discard.length - (!arrived && source === "discard" ? 1 : 0),
    cardId: arrived ? game.drawn!.card.id : motion?.kind === "draw" ? motion.card.id
      : source === "discard" ? game.discard.at(-1)!.id : null,
    observed: motion?.kind === "draw", next: null, sent: false,
  });
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
    if (disabled || pending || state.stage !== "opening" || motion || sending.current) return;
    const selected = latestChoices.current;
    if (selected.key !== openingKey) return;
    const index = selected.indices[selected.sent];
    if (index === undefined || selected.indices.slice(0, selected.sent).some(i => !game.players[0].cards[i].faceUp)) return;
    // Send rapid selections in order, using the token returned for the previous flip.
    sending.current = true;
    updateChoices({ ...selected, sent: selected.sent + 1 });
    void command("reveal", { index }).then(ok => {
      sending.current = false;
      const current = latestChoices.current;
      updateChoices(!ok && current.key === openingKey ? { key: openingKey, indices: [], sent: 0 } : { ...current });
    });
  }, [choices, state, command, disabled, pending, openingKey]);
  useEffect(() => {
    const input = latestInput.current;
    if (!input) return;
    if (disabled || input.key !== turnKey || state.stage !== "playing" || game.turn !== 0 ||
      !["draw", "replace"].includes(game.phase)) {
      updateInput(null);
      return;
    }
    if (motion) {
      if (motion.kind !== "draw" || motion.seat !== 0 || motion.source !== input.source ||
        input.cardId && input.cardId !== motion.card.id) updateInput(null);
      else if (!input.observed) updateInput({ ...input, observed: true, cardId: motion.card.id });
      return;
    }
    if (game.phase !== "replace" || !game.drawn) {
      if (input.observed) updateInput(null);
      return;
    }
    if (game.drawn.source !== input.source || game.deck.length !== input.deckCount ||
      game.discard.length !== input.discardCount || input.cardId && input.cardId !== game.drawn.card.id) {
      updateInput(null);
      return;
    }
    if (!input.next || input.sent || pending) return;
    // The pickup has arrived. Send the queued move with this board's fresh token.
    updateInput({ ...input, sent: true });
    const action = input.next;
    void command(action.kind, action.kind === "replace" ? { index: action.index } : undefined).then(ok => {
      if (!ok && latestInput.current?.id === input.id) updateInput(null);
    });
  }, [turnInput, state, command, disabled, pending, turnKey]);
  const stage = state.stage as Stage;
  const available = !disabled && !pending && !motion;
  const canReveal = (index: number) => !disabled && !motion && stage === "opening" && canOpen(openingGame(), index);
  const canReplace = () => !disabled && stage === "playing" && game.turn === 0 && !currentInput()?.next &&
    (motion?.kind === "draw" && motion.seat === 0 || !motion && (
      game.phase === "replace" && !pending || game.phase === "draw" && !!currentInput()
    ));
  const queueTurn = (action: QueuedTurnAction) => {
    if (!canReplace()) return;
    if (action.kind === "toss" && (!available || game.phase !== "replace" || game.drawn?.source !== "deck")) return;
    const input = currentInput() ?? newInput(motion?.kind === "draw" ? motion.source : game.drawn!.source, !motion);
    if (action.kind === "toss" && input.source !== "deck") return;
    updateInput({ ...input, next: action });
  };
  const table: ReturnType<typeof useGolfTable> = {
    game, stage, motion, pickerSeat: game.starter,
    canReveal,
    canDraw: available && !currentInput() && stage === "playing" && game.turn === 0 && game.phase === "draw",
    canReplace: canReplace(),
    reveal: index => {
      if (!canReveal(index)) return;
      const indices = latestChoices.current.key === openingKey ? latestChoices.current.indices : [];
      const sent = latestChoices.current.key === openingKey ? latestChoices.current.sent : 0;
      updateChoices({ key: openingKey, indices: [...indices, index], sent });
      play("flip");
    },
    draw: source => {
      if (!available || currentInput() || stage !== "playing" || game.turn !== 0 || game.phase !== "draw" || !game[source].length) return;
      const input = newInput(source);
      updateInput(input);
      void command("draw", { source }).then(ok => {
        if (!ok && latestInput.current?.id === input.id) updateInput(null);
      });
    },
    replace: index => {
      if (Number.isInteger(index) && index >= 0 && index < 6) queueTurn({ kind: "replace", index });
    },
    toss: () => queueTurn({ kind: "toss" }),
    advance: () => { void command("advance"); }, restart: () => { void command("restart"); },
  };
  return { table, participants };
}
