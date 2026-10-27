import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { GolfTableView } from "./GamePage";
import { HoleRecordDialog, type HoleRecord } from "@/components/game/HoleRecordDialog";
import { scoreGrid, type Game, type Rank, type Suit } from "@/game/engine";
import { BOT_NAMES } from "@/game/seats";
import type { useGolfTable } from "@/hooks/useGolfTable";

const HANDS: Rank[][][] = [
  [["K", "5", "2", "K", "5", "A"], ["7", "2", "K", "7", "A", "3"], ["4", "K", "8", "4", "3", "2"], ["3", "3", "K", "3", "3", "2"], ["9", "A", "5", "9", "2", "K"], ["6", "2", "4", "6", "5", "A"]],
  [["2", "K", "4", "2", "K", "3"], ["5", "5", "A", "5", "5", "K"], ["8", "3", "2", "8", "K", "A"], ["6", "A", "K", "6", "2", "4"], ["K", "2", "3", "K", "4", "A"], ["4", "4", "2", "4", "4", "A"]],
  [["K", "K", "2", "K", "K", "A"], ["9", "5", "K", "9", "2", "3"], ["A", "3", "4", "2", "5", "K"], ["6", "4", "8", "A", "5", "2"], ["7", "2", "4", "7", "K", "A"], ["8", "3", "5", "Q", "A", "2"]],
];

function sampleRecords(count: number): HoleRecord[] {
  const suits: Suit[] = ["S", "H", "C", "D"];
  return HANDS.map((hands, hole) => {
    const wentOut = hole === 1 ? 0 : Math.min(hole === 0 ? 3 : 0, count - 1);
    const players = hands.slice(0, count).map((ranks, seat) => {
      const cards = ranks.map((rank, cell) => ({ id: `record-${hole}-${seat}-${cell}`, rank, suit: suits[(cell + seat) % 4] }));
      return { name: seat === 0 ? "You" : BOT_NAMES[seat - 1], isBot: seat !== 0, cards,
        score: scoreGrid(cards.map(card => ({ card, faceUp: true }))) };
    });
    const penalty = players.some((player, seat) => seat !== wentOut && player.score <= players[wentOut].score);
    return { hole: hole + 1, wentOut, players: players.map((player, seat) => ({ ...player,
      score: player.score + (penalty && seat === wentOut ? 10 : 0), penalty: penalty && seat === wentOut ? 10 : undefined,
    })) };
  });
}

export default function HoleRecordPreview() {
  const [params] = useSearchParams();
  const requested = Number(params.get("players") ?? 6);
  const count = Number.isInteger(requested) && requested >= 2 && requested <= 6 ? requested : 6;
  const records = useMemo(() => sampleRecords(count), [count]);
  const [recordOpen, setRecordOpen] = useState(params.get("view") !== "results");
  const [advanced, setAdvanced] = useState(false);
  const latest = records[records.length - 1];
  const noop = () => {};
  const game: Game = {
    id: "hole-record-preview", hole: advanced ? 4 : 3, starter: 0, turn: count - 1,
    phase: advanced ? "draw" : "round-over", finalTurns: advanced ? null : [], drawn: null,
    history: records.map(record => record.players.map(player => player.score)),
    players: latest.players.map((player, seat) => ({
      score: records.reduce((total, record) => total + record.players[seat].score, 0),
      cards: player.cards.map((card, cell) => ({ card, faceUp: !advanced || [0, 4].includes(cell) })),
    })),
    deck: Array.from({ length: 28 }, (_, index) => ({ id: `preview-deck-${index}`, rank: "K", suit: "S" })),
    discard: [{ id: "preview-discard", rank: "6", suit: "C" }],
  };
  const table: ReturnType<typeof useGolfTable> = {
    game, stage: "playing", motion: null, pickerSeat: 0,
    canReveal: () => false, canDraw: false, canReplace: false,
    reveal: noop, draw: noop, replace: noop, toss: noop,
    advance: () => setAdvanced(true), restart: noop,
  };
  return <>
    <Helmet><title>Hole record preview · Golf</title></Helmet>
    <GolfTableView count={count} selection="backing" table={table}
      previewHideResults={params.get("view") !== "results"}
      onOpenHoleRecord={() => setRecordOpen(true)} />
    {recordOpen && <HoleRecordDialog records={records} onClose={() => setRecordOpen(false)} />}
  </>;
}
