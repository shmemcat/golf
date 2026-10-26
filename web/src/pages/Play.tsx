import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/ui/PageLayout";
import { Button, MenuLink } from "@/components/Buttons";
import { LoginWarning } from "@/components/LoginWarning";
import { ActiveGameModal } from "@/components/ActiveGameModal";
import { useActiveGameSession } from "@/hooks/useActiveGameSession";
import { useSound } from "@/context/SoundContext";
import { useAuth } from "@/context/AuthContext";
import { golfPost, newRequestId, type RoomState } from "@/lib/golfApi";
import { readStorage, writeStorage } from "@/lib/storage";
import styles from "@/styles/play-menu.module.css";
import containers from "@/styles/containers.module.css";

export function Play() {
  const navigate = useNavigate();
  const active = useActiveGameSession();
  const { session, checking, busy } = active;
  const blocked = !!session || checking || busy;
  return (
    <>
      <Helmet>
        <title>Play | Golf</title>
      </Helmet>
      <PageLayout title="PLAY">
        <div className={styles.grid}>
          <Link to="/game/create" className={styles.choice} aria-disabled={blocked || undefined} tabIndex={blocked ? -1 : undefined}
            onClick={event => { if (blocked) event.preventDefault(); }}>
            <span className={styles.choiceLabel}>Create Game</span>
            <span className={styles.choiceDesc}>Play with bots<br />or invite friends</span>
          </Link>
          <Link to="/game/join" className={styles.choice} aria-disabled={blocked || undefined} tabIndex={blocked ? -1 : undefined}
            onClick={event => { if (blocked) event.preventDefault(); }}>
            <span className={styles.choiceLabel}>Join Game</span>
            <span className={styles.choiceDesc}>
                           Enter a lobby code <br />to join a friend
                           </span>
          </Link>
        </div>
        <div className="button-stack">
          <MenuLink to="/" name="Home" />
        </div>
        <SessionStatus active={active} />
      </PageLayout>
      {session && <ActiveGameModal key={session.key}
        title={session.type === "solo" ? "Game In Progress" : session.playing ? "Multiplayer Game In Progress" : "Lobby In Progress"}
        message={session.type === "solo" ? "You have a game active. Do you wish to continue playing?"
          : session.playing ? "You have a multiplayer game in progress. Rejoin?"
          : session.room?.game?.phase === "game-over" ? "Your online group is between games. Rejoin?"
          : "You have an active lobby. Rejoin?"}
        continueLabel={session.type === "solo" ? "Continue" : "Rejoin"}
        leaveLabel={session.type === "solo" ? "Concede" : "Leave"}
        confirmMessage={session.type === "solo" ? session.localId
          ? "Are you sure you wish to concede? Your progress in this game will be lost."
          : "Are you sure you wish to concede? Only finished games count toward your statistics."
          : session.playing ? "Are you sure you want to leave the game? Your seat will be removed. Only finished games count toward your statistics. If one player remains, they’ll return to the open lobby to invite others."
          : "Are you sure you want to leave the lobby?"}
        busy={busy} leaveDisabled={!!session.room && !active.online}
        error={active.leaveError || (!active.online && session.room ? "You’re offline. Reconnect to leave, or rejoin your table." : "")}
        onContinue={() => navigate(session.destination)} onLeave={() => void active.leave()} />}
    </>
  );
}

function SessionStatus({ active }: { active: ReturnType<typeof useActiveGameSession> }) {
  if (active.session) return null;
  if (active.checking) return <p role="status">Checking for an active game…</p>;
  return null;
}

export function CreateGame() {
  const { user } = useAuth();
  const [mode, setMode] = useState("bot");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(newRequestId);
  const { play } = useSound();
  const navigate = useNavigate();
  const active = useActiveGameSession();
  const [players, setPlayers] = useState(() => {
    const saved = readStorage<unknown>("golf.players.v1", 2);
    return typeof saved === "number" &&
      Number.isInteger(saved) &&
      saved >= 2 &&
      saved <= 6
      ? saved
      : 2;
  });
  if (active.session && !busy) return <Navigate to="/play" replace />;
  return (
    <>
      <Helmet>
        <title>Create Game | Golf</title>
      </Helmet>
      <PageLayout title="CREATE GAME">
        <div className={`setup-body ${styles.createSetup}`}>
          <fieldset>
            <legend>Game Type</legend>
            <div className={`${containers["create-button-container"]} ${styles.gameType}`}>
              <label>
                <input type="radio" name="gameType" value="bot" checked={mode === "bot"}
                  onChange={() => { setMode("bot"); play("select"); }} />
                <span>Versus Bots</span>
              </label>
              <label>
                <input type="radio" name="gameType" value="multiplayer" checked={mode === "multiplayer"}
                  onChange={() => { setMode("multiplayer"); play("select"); }} />
                <span>Online</span>
              </label>
            </div>
          </fieldset>
          {mode === "multiplayer" && !user && <label className="field-label">Your name<input value={name} maxLength={24} placeholder="Guest" onChange={e => setName(e.target.value)} /></label>}
          <fieldset>
            <legend>Players</legend>
            <div className="segmented">
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={players === n}
                  onClick={() => {
                    setPlayers(n);
                    writeStorage("golf.players.v1", n);
                    play("select");
                  }}
                >
                  {n} Players
                </button>
              ))}
            </div>
          </fieldset>
          <p className="setup-detail">{mode === "bot" ? `Single player · You and ${players - 1} ${players === 2 ? "bot" : "bots"}` : `A private table for ${players} players`}</p>
          {error && <p role="alert" className="inline-error">{error}</p>}
          <SessionStatus active={active} />
          <div className="button-stack">
            <Button
              name={busy ? "Creating…" : "Create Game"}
              disabled={busy || active.checking || !!active.session}
              onClick={async () => {
                if (busy || active.checking || active.session) return;
                play("select");
                if (mode === "bot") { navigate(`/game/single?players=${players}`); return; }
                setBusy(true); setError("");
                try {
                  const { state } = await golfPost<{ state: RoomState }>("/lobbies", { players, requestId, name });
                  navigate(`/game/lobby/${state.code}`);
                } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t create your lobby."); }
                finally { setBusy(false); }
              }}
            />
            <LoginWarning />
            <MenuLink to="/play" name="Back" />
          </div>
        </div>
      </PageLayout>
    </>
  );
}

export function JoinGame() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useActiveGameSession();
  if (active.session && !busy) return <Navigate to="/play" replace />;
  return (
    <>
      <Helmet>
        <title>Join Game | Golf</title>
      </Helmet>
      <PageLayout title="JOIN GAME">
        <form className={`setup-body ${styles.joinSetup}`} onSubmit={async event => {
          event.preventDefault();
          if (busy || active.checking || active.session) return;
          setBusy(true); setError("");
          try {
            const { state } = await golfPost<{ state: RoomState }>("/lobbies/join", { code: code.trim().toUpperCase(), name });
            navigate(`/game/lobby/${state.code}`);
          } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t join this lobby."); }
          finally { setBusy(false); }
        }}>
          <h2>Enter the lobby code</h2>
          <p id="lobby-code-hint" className={styles.joinHint}>
            The game host can provide you with a code, or simply visit the game lobby link.
          </p>
          <label className="sr-only" htmlFor="lobby-code">
            Lobby Code
          </label>
          <input
            id="lobby-code"
            className={`lobby-code ${styles.joinCode}`}
            placeholder="Lobby Code" aria-describedby="lobby-code-hint" required maxLength={6} minLength={6} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            value={code} onChange={e => setCode(e.target.value.toUpperCase())}
          />
          {!user && <label className={styles.joinName}>Your name<input value={name} maxLength={24} placeholder="Guest" onChange={e => setName(e.target.value)} /></label>}
          {error && <p role="alert" className="inline-error">{error}</p>}
          <SessionStatus active={active} />
          <LoginWarning />
          <div className="button-stack">
            <Button name={busy ? "Joining…" : "Join Game"} type="submit" disabled={busy || active.checking || !!active.session || code.trim().length !== 6} />
            <MenuLink to="/play" name="Back" />
          </div>
        </form>
      </PageLayout>
    </>
  );
}
