import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/pro-solid-svg-icons/faRobot";
import { Button } from "@/components/Buttons";
import { ProfileIcon } from "@/components/ProfileIcon";
import { Tooltip } from "@/components/Tooltip";
import "@/styles/game-over.css";

export interface FinalPlayer {
  name: string;
  score: number;
  icon?: string;
  isBot?: boolean;
}

export function GameOverBlock({ players, onPlayAgain, mySeatIndex = 0, notice, penaltyNotice, waiting = false, waitingForHost = false, visibilityToggle }: {
  players: FinalPlayer[];
  onPlayAgain: () => void;
  mySeatIndex?: number;
  notice?: ReactNode;
  penaltyNotice?: ReactNode;
  waiting?: boolean;
  waitingForHost?: boolean;
  visibilityToggle?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [hostHintOpen, setHostHintOpen] = useState(false);
  const navigate = useNavigate();
  const standings = players.map((player, seat) => ({ ...player, seat })).sort((a, b) => a.score - b.score);
  const lowest = standings[0].score;
  const winners = standings.filter(player => player.score === lowest);
  const tied = winners.length > 1;
  const title = tied ? "It's a tie!" : winners[0].seat === mySeatIndex ? "You won!" : `${winners[0].name} won!`;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    element.querySelector<HTMLElement>(".golf-host-waiting, button:not(:disabled)")?.focus({ preventScroll: true });
    return () => element.close();
  }, []);

  return <dialog ref={dialog} id="golf-game-results" className="golf-game-over" aria-labelledby="golf-game-over-title"
    onCancel={event => event.preventDefault()}>
    <h2 id="golf-game-over-title" className="golf-game-over-title">{title}</h2>
    {penaltyNotice}
    <table className="golf-final-score-table" aria-label="Final scores">
      <thead><tr><th scope="col">Player</th><th scope="col">Score</th></tr></thead>
      <tbody>{standings.map(player => <tr key={player.seat}
        data-current={player.seat === mySeatIndex}
        data-winner={player.score === lowest}>
        <td><span className="golf-final-player">
          {player.isBot ? <FontAwesomeIcon icon={faRobot} /> : <ProfileIcon name={player.icon} />}
          <span>{player.name}</span>
        </span></td>
        <td>{player.score}</td>
      </tr>)}</tbody>
    </table>
    {notice && <div className="golf-game-over-notice">{notice}</div>}
    <div className="golf-game-over-actions">
      {waitingForHost ? <Tooltip content="Only the host can start a new game." portal={false}
        open={hostHintOpen} onOpenChange={setHostHintOpen}>
        <span className="golf-host-waiting" tabIndex={0}
          onClick={event => { event.preventDefault(); setHostHintOpen(true); }}>
          <Button name="Waiting for host…" disabled />
        </span>
      </Tooltip> : <Button name={waiting ? "Starting game…" : "Play Again"} disabled={waiting} onClick={onPlayAgain} />}
      <Button name="Create New Game" onClick={() => navigate("/game/create")} />
      <Button name="Home" onClick={() => navigate("/")} />
    </div>
    {visibilityToggle}
  </dialog>;
}
