import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/pro-solid-svg-icons/faCopy";
import { faCheck } from "@fortawesome/pro-solid-svg-icons/faCheck";
import { faRobot } from "@fortawesome/pro-solid-svg-icons/faRobot";
import { faCrown } from "@fortawesome/pro-solid-svg-icons/faCrown";
import { Button, MenuLink } from "./Buttons";
import { ProfileIcon } from "./ProfileIcon";
import { PageLayout } from "./ui/PageLayout";
import { useSound } from "@/context/SoundContext";
import type { useGolfRoom } from "@/hooks/useGolfRoom";
import styles from "@/styles/lobby.module.css";

type Room = ReturnType<typeof useGolfRoom>;

function LobbySharing({ code }: { code: string }) {
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const url = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/game/lobby/${code}`;
  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); setError(""); }
    catch { setError("Copy didn’t work. Select and copy the field instead."); }
  };
  return <div className={styles.info}>
    {[["Code", code], ["URL", url]].map(([label, value]) => <div className={styles.copyRow} key={label}>
      <label htmlFor={`golf-lobby-${label}`}>{label}</label>
      <input id={`golf-lobby-${label}`} value={value} readOnly onFocus={event => event.currentTarget.select()} />
      <button type="button" className={styles.copyButton} aria-label={`Copy ${label}`} onClick={() => { void copy(value, label); }}>
        <FontAwesomeIcon icon={copied === label ? faCheck : faCopy} />
      </button>
    </div>)}
    <span className="sr-only" role="status">{copied && `${copied} copied.`}</span>
    {error && <p role="alert" className={styles.message}>{error}</p>}
  </div>;
}

export function LobbyRoom({ room }: { room: Room }) {
  const state = room.state!;
  const { play } = useSound();
  const navigate = useNavigate();
  const humanCount = state.seats.filter(player => !player.isBot).length;
  const lobbyCode = state.mode === "multiplayer" && state.stage === "lobby" && !state.closed ? state.code : null;
  const previousPlayers = useRef<{ code: string; count: number } | null>(null);
  useEffect(() => {
    const previous = previousPlayers.current;
    previousPlayers.current = lobbyCode ? { code: lobbyCode, count: humanCount } : null;
    if (lobbyCode && previous?.code === lobbyCode && humanCount > previous.count) play("playerJoin");
  }, [lobbyCode, humanCount, play]);
  const [preferBots, setPreferBots] = useState(state.seats.length < 2);
  const fillBots = state.seats.length < 2 || preferBots;
  const missing = state.capacity - state.seats.length;
  const leave = (action: "leave" | "close") => { void room.command(action).then(done => { if (done) navigate("/play"); }); };
  return <PageLayout title={state.closed ? "LOBBY CLOSED" : "GAME LOBBY"} contentClassName={styles.page} className={styles.body}>
    {state.closed ? <div className="button-stack"><p role="status">{state.closedReason === "not_enough_players" ? "There aren’t enough players to continue. The lobby has closed." : "The host closed this lobby."}</p><MenuLink to="/play" name="Back to Play" /><MenuLink to="/" name="Home" /></div> : <div className={styles.lobby}>
      {state.lobbyReason === "not_enough_players" && <p role="status" className={styles.message}>The game ended because there weren’t enough players. Your lobby is still open—invite someone to play again.</p>}
      <LobbySharing code={state.code} />
      <ol className={styles.seats} data-seats={state.capacity} aria-label="Players in lobby">
        {Array.from({ length: state.capacity }, (_, i) => {
          const player = state.seats[i];
          const mine = i === state.mySeat;
          return <li key={i} className={styles.seat} data-empty={!player} data-mine={mine} aria-label={`Seat ${i + 1}: ${player?.name || "Open seat"}${mine ? " (you)" : ""}`}>
            <span className={styles.seatIcon}>{player?.isBot ? <FontAwesomeIcon icon={faRobot} /> : <ProfileIcon name={player?.profileIcon || "user"} />}</span>
            <span className={styles.seatName} title={player?.name}>{player?.name || "Open seat"}</span>
            <small className={styles.seatStatus}>{player ? <>{i === 0 && <><FontAwesomeIcon icon={faCrown} /> Host{mine ? " · You" : ""}</>}{i !== 0 && (mine ? "You" : player.connected ? "Here" : "Joining…")}</> : "Waiting…"}</small>
          </li>;
        })}
      </ol>
      {room.error && <p role="alert" className={styles.message}>{room.error}{" "}<button type="button" className="link" onClick={room.retry}>Try again</button></p>}
      <div className={styles.start}>
        {!room.connected && <p role="status" className={styles.message}>Connecting… <button type="button" className="link" onClick={room.retry}>Retry</button></p>}
        {state.isHost ? <>
          {missing > 0 && <fieldset className={styles.options}>
            <legend>Empty seats</legend>
            <div>
              <label><input type="radio" name="emptySeats" checked={!fillBots} disabled={state.seats.length < 2} onChange={() => setPreferBots(false)} /> Just {state.seats.length} {state.seats.length === 1 ? "player" : "players"}</label>
              <label><input type="radio" name="emptySeats" checked={fillBots} onChange={() => setPreferBots(true)} /> Fill with bots</label>
            </div>
          </fieldset>}
          <Button name={room.pending ? "Starting…" : "Start Game"} disabled={room.pending || !room.connected || state.seats.length < 2}
            onClick={() => { void room.command("start", { fillBots }); }} />
        </> : <p role="status" className={styles.message}>Waiting for the host to start…</p>}
      </div>
      <div className={styles.actions} data-host={state.isHost}>
        <Button name="Leave Lobby" variant="secondary" disabled={room.pending} onClick={() => leave("leave")} />
        {state.isHost && <Button name="Close Lobby" disabled={room.pending} onClick={() => leave("close")} />}
        <div className={styles.home}><MenuLink to="/" name="Home" /></div>
      </div>
    </div>}
  </PageLayout>;
}
