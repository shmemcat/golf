import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { PageLayout } from "@/components/ui/PageLayout";
import { Button, MenuLink } from "@/components/Buttons";
import { useSound } from "@/context/SoundContext";
import { readStorage, writeStorage } from "@/lib/storage";
import styles from "@/styles/play-menu.module.css";

export function Play() {
  return (
    <>
      <Helmet>
        <title>Play | Golf</title>
      </Helmet>
      <PageLayout title="PLAY">
        <div className={styles.grid}>
          <Link to="/game/create" className={styles.choice}>
            <span className={styles.choiceLabel}>Create Game</span>
            <span className={styles.choiceDesc}>Set up your next round</span>
          </Link>
          <Link to="/game/join" className={styles.choice}>
            <span className={styles.choiceLabel}>Join Game</span>
            <span className={styles.choiceDesc}>Meet friends at the table</span>
          </Link>
        </div>
        <p className="quiet-text">Games are coming soon. Have a look around!</p>
        <div className="button-stack">
          <MenuLink to="/" name="Home" />
        </div>
      </PageLayout>
    </>
  );
}

export function CreateGame() {
  const { play } = useSound();
  const [players, setPlayers] = useState(() => {
    const saved = readStorage<unknown>("golf.players.v1", 2);
    return saved === 3 || saved === 4 ? saved : 2;
  });
  return (
    <>
      <Helmet>
        <title>Create Game | Golf</title>
      </Helmet>
      <PageLayout title="CREATE GAME">
        <div className="setup-body">
          <fieldset>
            <legend>Players</legend>
            <div className="segmented">
              {[2, 3, 4].map((n) => (
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
          <p className="setup-detail">
            Six cards each · Nine holes · Lowest score wins
          </p>
          <p className="notice" id="create-notice">
            The table is still being prepared. You’ll be able to start a game
            here soon.
          </p>
          <div className="button-stack">
            <Button
              name="Create Game"
              disabled
              aria-describedby="create-notice"
            />
            <MenuLink to="/play" name="Back" />
          </div>
        </div>
      </PageLayout>
    </>
  );
}

export function JoinGame() {
  return (
    <>
      <Helmet>
        <title>Join Game | Golf</title>
      </Helmet>
      <PageLayout title="JOIN GAME">
        <div className="setup-body">
          <p>There’s a seat for you soon.</p>
          <p className="notice" id="join-notice">
            Once online games are ready, enter a friend’s lobby code here to
            join their table.
          </p>
          <label className="field-label" htmlFor="lobby-code">
            Lobby Code
          </label>
          <input
            id="lobby-code"
            className="lobby-code"
            placeholder="Coming soon"
            disabled
            aria-describedby="join-notice"
          />
          <div className="button-stack">
            <Button name="Join Game" disabled aria-describedby="join-notice" />
            <MenuLink to="/play" name="Back" />
          </div>
        </div>
      </PageLayout>
    </>
  );
}
