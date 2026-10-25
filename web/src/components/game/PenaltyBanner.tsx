import { scoreGrid, type Game } from "@/game/engine";
import "@/styles/penalty-banner.css";

export function PenaltyBanner({ game, name }: { game: Game; name: (seat: number) => string }) {
  if (game.phase !== "round-over" && game.phase !== "game-over") return null;
  const holeScores = game.history[game.hole - 1];
  if (!holeScores) return null;

  // Completed holes retain the last final turn, immediately before whoever went out.
  const wentOut = (game.turn + 1) % game.players.length;
  const scores = game.players.map(player => scoreGrid(player.cards));
  const lowest = scores.reduce((best, score, seat) => score < scores[best] ? seat : best, 0);
  if (scores[lowest] >= scores[wentOut] || holeScores[wentOut] !== scores[wentOut] + 10) return null;

  const lowerName = name(lowest);
  return <aside className="golf-penalty-banner" aria-label="Going-out penalty">
    <p className="golf-penalty-heading"><span>{name(wentOut)}</span>{" "}<span>+10 penalty</span></p>
    <p className="golf-penalty-description">
      {game.phase === "game-over" && <>Hole {game.hole}: </>}
      {name(wentOut)} went out with {scores[wentOut]}, but {lowerName === "You" ? "you" : lowerName} finished with {scores[lowest]}.
    </p>
  </aside>;
}
