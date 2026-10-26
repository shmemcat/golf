import { useEffect, useRef, useState } from "react";
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

export function useGolfTable(playerCount: number, persist = false) {
  const [saved] = useState(() => persist ? readLocalGame() : null);
  const [game, setGame] = useState(() => saved?.game ?? createGame(playerCount));
  const [stage, setStage] = useState<Stage>(saved?.stage ?? "dealing");
  const [motion, setMotion] = useState<TableMotion | null>(saved?.motion ?? null);
  const [openingBusy, setOpeningBusy] = useState(saved?.openingBusy ?? false);
  const [pickerTick, setPickerTick] = useState(saved?.pickerTick ?? 0);
  const { play } = useSound();
  const sound = useRef(play);
  sound.current = play;

  useEffect(() => {
    if (persist) saveLocalGame({ game, stage, motion, openingBusy, pickerTick });
  }, [persist, game, stage, motion, openingBusy, pickerTick]);

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
      if (pickerTick === lastTick) setStage("announcing");
      else { setPickerTick(tick => tick + 1); sound.current("select"); }
    }, 75 + Math.pow(pickerTick / lastTick, 2) * 185);
    return () => clearTimeout(timer);
  }, [stage, pickerTick, game.players.length, game.starter]);

  useEffect(() => {
    if (stage !== "announcing") return;
    sound.current("start");
    const timer = window.setTimeout(() => {
      setGame(startPlay);
      setStage("playing");
    }, 1100);
    return () => clearTimeout(timer);
  }, [stage]);

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
      if (motion.kind === "draw") setGame(current => drawCard(current, motion.source));
      if (motion.kind === "place") setGame(current => replaceCard(current, motion.index));
      if (motion.kind === "toss") setGame(discardDraw);
      if (motion.kind === "upcard") {
        setGame(turnUpDeck);
        setStage(game.hole === 1 ? "picking" : "announcing");
      }
      setMotion(null);
      sound.current("select");
    }, FLIGHT_MS);
    return () => clearTimeout(timer);
  }, [motion, game]);

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

  const humanTurn = stage === "playing" && game.turn === 0 && !motion;
  return {
    game, stage, motion, pickerSeat: pickerTick % game.players.length,
    canReveal: (index: number) => stage === "opening" && !openingBusy && canOpen(game, index),
    canDraw: humanTurn && game.phase === "draw",
    canReplace: humanTurn && game.phase === "replace",
    reveal(index: number) {
      if (stage !== "opening" || openingBusy || !canOpen(game, index)) return;
      setGame(current => openCard(current, index));
      setOpeningBusy(true);
      sound.current("flip");
    },
    draw(source: DrawSource) {
      if (!humanTurn || game.phase !== "draw" || !game[source].length) return;
      setMotion(drawing(game, source));
      sound.current("slide");
    },
    replace(index: number) {
      if (!humanTurn || game.phase !== "replace") return;
      setMotion(discarding(game, index));
      sound.current("slide");
    },
    toss() {
      if (!humanTurn || game.phase !== "replace" || game.drawn?.source !== "deck") return;
      setMotion(tossing(game));
      sound.current("slide");
    },
    advance() {
      if (game.phase !== "round-over") return;
      setGame(nextHole(game)); setStage("dealing"); setPickerTick(0);
    },
    restart() {
      setGame(createGame(playerCount)); setStage("dealing"); setPickerTick(0); setMotion(null);
    },
  };
}
