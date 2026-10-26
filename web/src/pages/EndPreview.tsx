import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GolfTableView } from "./GamePage";
import { scoreGrid, type Game, type Rank, type Suit } from "@/game/engine";
import type { useGolfTable } from "@/hooks/useGolfTable";

// Example scores for inspecting the existing end screens, using the real table view.
function sampleEnding(final: boolean, penalty: boolean): Game {
  const hands: [Rank, Suit][][] = [
    [["K", "S"], ["K", "H"], ["K", "D"], ["K", "C"], ["A", "S"], ["2", "S"]],
    [["9", "S"], ["5", "H"], ["K", "C"], ["9", "H"], ["2", "D"], ["3", "C"]],
    [["A", "S"], ["3", "D"], ["4", "H"], ["2", "S"], ["5", "C"], ["K", "H"]],
    [["6", "S"], ["4", "D"], ["8", "C"], ["A", "H"], ["5", "S"], ["2", "C"]],
    [["7", "S"], ["2", "H"], ["4", "C"], ["7", "H"], ["K", "H"], ["A", "D"]],
    [["8", "S"], ["3", "H"], ["5", "D"], ["Q", "C"], ["A", "C"], ["2", "D"]],
  ];
  const hiddenAtEnd = [[1, 4], [1, 4], [0, 3, 5], [2], [1, 2, 4], [3, 5]];
  const cards = hands.map((hand, seat) => hand.map(([rank, suit], index) => ({
    faceUp: true, revealedAtEnd: seat !== (penalty ? 1 : 0) && hiddenAtEnd[seat].includes(index),
    card: { id: `example-${seat}-${index}`, rank, suit },
  })));
  const previous = [
    [5, 12, 8, 18, 9, 13], [8, 5, 14, 12, 6, 11], [3, 10, 15, 26, 7, 29],
    [4, 7, 6, 8, 12, 5], [3, 8, 5, 11, 8, 6], [7, 4, 6, 5, 9, 8],
    [4, 8, 5, 10, 11, 9], [5, 9, 3, 7, 12, 6],
  ];
  const scores = cards.map(scoreGrid);
  if (penalty) scores[1] += 10;
  const history = [...previous.slice(0, final ? 8 : 2), scores];
  return {
    id: "ending-preview",
    players: cards.map((hand, seat) => ({ cards: hand, score: history.reduce((sum, hole) => sum + hole[seat], 0) })),
    deck: Array.from({ length: 28 }, (_, index) => ({ id: `example-deck-${index}`, rank: "K", suit: "S" })),
    discard: [{ id: "example-discard", rank: "10", suit: "C" }],
    drawn: null, hole: final ? 9 : 3, starter: 0, turn: penalty ? 0 : 5,
    phase: final ? "game-over" : "round-over", finalTurns: [], history,
  };
}

export default function EndPreview() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const final = params.get("ending") === "game";
  const penalty = params.has("penalty");
  const ending = useMemo(() => sampleEnding(final, penalty), [final, penalty]);
  const [revealedEnding, setRevealedEnding] = useState<Game | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setRevealedEnding(ending), 1000);
    return () => window.clearTimeout(timer);
  }, [ending]);
  // Start with the last hidden cards so reloading also previews the reveal.
  const game: Game = revealedEnding === ending ? ending : {
    ...ending, phase: "draw", finalTurns: [ending.turn], history: ending.history.slice(0, -1),
    players: ending.players.map((player, seat) => ({
      ...player, score: player.score - ending.history.at(-1)![seat],
      cards: player.cards.map(cell => ({ ...cell, faceUp: !cell.revealedAtEnd })),
    })),
  };
  const noop = () => {};
  const table: ReturnType<typeof useGolfTable> = {
    game, stage: "playing", motion: null, pickerSeat: 0,
    canReveal: () => false, canDraw: false, canReplace: false,
    reveal: noop, draw: noop, replace: noop, toss: noop,
    advance: () => navigate(`/game/end-preview?ending=game${penalty ? "&penalty" : ""}`),
    restart: () => navigate("/game/single?players=6"),
  };
  return <>
    <Helmet><title>{final ? "Game end" : "Round end"} preview · Golf</title></Helmet>
    <GolfTableView count={6} selection="backing" table={table} />
  </>;
}
