import { useCallback, useEffect, useRef, useState } from "react";
import { useSound } from "@/context/SoundContext";
import { readLocalGame, saveLocalGame } from "@/lib/localGame";
import { BOT_NAMES } from "@/game/seats";
import {
  botSource, canOpen, createGame, discardDraw, drawCard, nextHole, openCard,
  openOpponents, replaceCard, replacementIndex, startPlay, turnUpDeck,
  type DrawSource, type Game, type GolfCard,
} from "@/game/engine";

export type Stage = "dealing" | "opening" | "opponents" | "upcard" | "picking" | "announcing" | "playing";
export interface TableMotion {
  kind: "draw" | "discard" | "place" | "toss" | "upcard";
  card: GolfCard;
  from: string;
  to: string;
  flip: boolean;
  seat: number;
  index: number;
  source: DrawSource;
}
export type QueuedTurnAction = { kind: "replace"; index: number } | { kind: "toss" };
export const FLIGHT_MS = 600;
export const FLIP_MS = 560;
export const DEAL_MS = 900;
export const OPPONENTS_MS = 750;
export const BOT_DRAW_MS = 1000;
const BOT_REPLACE_MS = 800;

function drawing(game: Game, source: DrawSource): TableMotion {
  return { kind: "draw", card: game[source][game[source].length - 1], from: source,
    to: `drawn-${game.turn}`, flip: source === "deck", seat: game.turn, source, index: -1 };
}
function discarding(game: Game, index: number): TableMotion {
  const cell = game.players[game.turn].cards[index];
  return { kind: "discard", card: cell.card, from: `card-${game.turn}-${index}`, to: "discard",
    flip: !cell.faceUp, seat: game.turn, index, source: game.drawn!.source };
}
function tossing(game: Game): TableMotion {
  return { kind: "toss", card: game.drawn!.card, from: `drawn-${game.turn}`, to: "discard",
    flip: false, seat: game.turn, index: -1, source: "deck" };
}

export function useGolfTable(playerCount: number, persist = false, resumeId?: string, fresh = false) {
  const [saved] = useState(() => persist && !fresh ? readLocalGame(resumeId) : null);
  const [game, setGame] = useState(() => saved?.game ?? createGame(playerCount));
  const [stage, setStage] = useState<Stage>(saved?.stage ?? "dealing");
  const [motion, setMotion] = useState<TableMotion | null>(saved?.motion ?? null);
  const [openingBusy, setOpeningBusy] = useState(saved?.openingBusy ?? false);
  const [pickerTick, setPickerTick] = useState(saved?.pickerTick ?? 0);
  const [queuedAction, setQueuedAction] = useState<QueuedTurnAction | null>(saved?.queuedAction ?? null);
  const queued = useRef(queuedAction);
  const inputMotion = useRef(motion);
  inputMotion.current = motion;
  const queueAction = (action: QueuedTurnAction | null) => { queued.current = action; setQueuedAction(action); };
  const { play } = useSound();
  const sound = useRef(play);
  sound.current = play;
  const beginPlaying = useCallback(() => {
    setGame(startPlay);
    setStage("playing");
    sound.current("start");
  }, []);

  useEffect(() => {
    if (persist) saveLocalGame({ game, stage, motion, openingBusy, pickerTick, queuedAction });
  }, [persist, game, stage, motion, openingBusy, pickerTick, queuedAction]);

  useEffect(() => {
    if (stage !== "dealing") return;
    const fan = window.setTimeout(() => sound.current("deal"), 0);
    const timer = window.setTimeout(() => setStage("opening"), DEAL_MS);
    return () => { clearTimeout(fan); clearTimeout(timer); };
  }, [stage]);

  useEffect(() => {
    if (!openingBusy) return;
    const timer = window.setTimeout(() => setOpeningBusy(false), FLIP_MS);
    return () => clearTimeout(timer);
  }, [openingBusy]);

  useEffect(() => {
    if (stage !== "opening" || game.players[0].cards.filter(card => card.faceUp).length !== 2) return;
    const timer = window.setTimeout(() => {
      setGame(openOpponents(game));
      setStage("opponents");
      sound.current("flip");
    }, FLIP_MS);
    return () => clearTimeout(timer);
  }, [game, stage]);

  useEffect(() => {
    if (stage !== "opponents") return;
    const timer = window.setTimeout(() => {
      setStage("upcard");
      setMotion({ kind: "upcard", card: game.deck[game.deck.length - 1], from: "deck", to: "discard",
        flip: true, seat: game.starter, index: -1, source: "deck" });
      sound.current("slide");
    }, OPPONENTS_MS);
    return () => clearTimeout(timer);
  }, [stage, game]);

  useEffect(() => {
    if (stage !== "picking") return;
    const lastTick = game.players.length * 2 + game.starter;
    const timer = window.setTimeout(() => {
      if (pickerTick + 1 >= lastTick) {
        setPickerTick(lastTick);
        beginPlaying();
      }
      else { setPickerTick(tick => tick + 1); sound.current("select"); }
    }, 75 + Math.pow(pickerTick / lastTick, 2) * 185);
    return () => clearTimeout(timer);
  }, [stage, pickerTick, game.players.length, game.starter, beginPlaying]);

  // Resume older saves without holding the highlighted starter's input.
  useEffect(() => {
    if (stage !== "announcing") return;
    beginPlaying();
  }, [stage, beginPlaying]);

  // Each flight commits only on arrival. A replacement discards first, then places.
  useEffect(() => {
    if (!motion) return;
    const timer = window.setTimeout(() => {
      if (motion.kind === "discard") {
        setMotion({ ...motion, kind: "place", card: game.drawn!.card,
          from: `drawn-${motion.seat}`, to: `card-${motion.seat}-${motion.index}`, flip: false });
        sound.current("slide");
        return;
      }
      if (motion.kind === "draw") {
        const drawn = drawCard(game, motion.source);
        setGame(drawn);
        const action = queued.current;
        if (motion.seat === 0 && action) {
          queueAction(null);
          setMotion(action.kind === "toss" ? tossing(drawn) : discarding(drawn, action.index));
          sound.current("select");
          sound.current("slide");
          return;
        }
      }
      if (motion.kind === "place") setGame(current => replaceCard(current, motion.index));
      if (motion.kind === "toss") setGame(discardDraw);
      if (motion.kind === "upcard") {
        setGame(turnUpDeck);
        if (game.hole === 1) setStage("picking");
        else beginPlaying();
      }
      setMotion(null);
      sound.current("select");
    }, FLIGHT_MS);
    return () => clearTimeout(timer);
  }, [motion, game, beginPlaying]);

  useEffect(() => {
    if (stage !== "playing" || motion || game.turn === 0 || !["draw", "replace"].includes(game.phase)) return;
    const timer = window.setTimeout(() => {
      const botName = BOT_NAMES[game.turn - 1];
      if (game.phase === "draw") setMotion(drawing(game, botSource(game, botName)));
      else if (game.drawn) {
        const index = replacementIndex(game, game.drawn.card, botName);
        setMotion(index < 0 && game.drawn.source === "deck" ? tossing(game) : discarding(game, Math.max(0, index)));
      }
      sound.current("slide");
    }, game.phase === "draw" ? BOT_DRAW_MS : BOT_REPLACE_MS);
    return () => clearTimeout(timer);
  }, [game, stage, motion]);

  useEffect(() => {
    if (game.phase === "round-over") sound.current("round");
    if (game.phase === "game-over") sound.current("win");
  }, [game.phase]);

  const humanTurn = stage === "playing" && game.turn === 0;
  const pickingUp = motion?.kind === "draw" && motion.seat === 0;
  return {
    game, stage, motion, pickerSeat: pickerTick % game.players.length,
    canReveal: (index: number) => stage === "opening" && canOpen(game, index),
    canDraw: humanTurn && !motion && game.phase === "draw",
    canReplace: humanTurn && !queuedAction && (pickingUp || !motion && game.phase === "replace"),
    reveal(index: number) {
      if (stage !== "opening" || !canOpen(game, index)) return;
      setGame(current => openCard(current, index));
      setOpeningBusy(true);
      sound.current("flip");
    },
    draw(source: DrawSource) {
      if (!humanTurn || inputMotion.current || game.phase !== "draw" || !game[source].length) return;
      inputMotion.current = drawing(game, source);
      setMotion(inputMotion.current);
      sound.current("slide");
    },
    replace(index: number) {
      if (!humanTurn || queued.current || !Number.isInteger(index) || index < 0 || index >= 6) return;
      if (inputMotion.current?.kind === "draw" && inputMotion.current.seat === 0) {
        queueAction({ kind: "replace", index });
        return;
      }
      if (inputMotion.current || game.phase !== "replace") return;
      inputMotion.current = discarding(game, index);
      setMotion(inputMotion.current);
      sound.current("slide");
    },
    toss() {
      if (!humanTurn || queued.current) return;
      if (inputMotion.current?.kind === "draw" && inputMotion.current.seat === 0 && inputMotion.current.source === "deck") {
        queueAction({ kind: "toss" });
        return;
      }
      if (inputMotion.current || game.phase !== "replace" || game.drawn?.source !== "deck") return;
      inputMotion.current = tossing(game);
      setMotion(inputMotion.current);
      sound.current("slide");
    },
    advance() {
      if (game.phase !== "round-over") return;
      queueAction(null);
      setGame(nextHole(game)); setStage("dealing"); setPickerTick(0);
    },
    restart() {
      queueAction(null);
      inputMotion.current = null;
      setGame(createGame(playerCount)); setStage("dealing"); setPickerTick(0); setMotion(null);
    },
  };
}
