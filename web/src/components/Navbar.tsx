import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMoon } from "@fortawesome/pro-solid-svg-icons/faMoon";
import { faSunBright } from "@fortawesome/pro-solid-svg-icons/faSunBright";
import { faVolume } from "@fortawesome/pro-solid-svg-icons/faVolume";
import { faVolumeSlash } from "@fortawesome/pro-solid-svg-icons/faVolumeSlash";
import { faMusicNote } from "@fortawesome/pro-solid-svg-icons/faMusicNote";
import { faMusicNoteSlash } from "@fortawesome/pro-solid-svg-icons/faMusicNoteSlash";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useSound } from "@/context/SoundContext";
import { GolfLogo } from "./GolfLogo";
import styles from "@/styles/buttons.module.css";
import { ProfileIcon } from "./ProfileIcon";
export function Navbar() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Main navigation" className="site-nav">
      {pathname === "/" ? (
        <span />
      ) : (
        <Link to="/" className="nav-home" aria-label="Golf home">
          <GolfLogo
            size={23}
            variant="brand"
            style={{
              width: "var(--nav-logo-size, 23px)",
              height: "var(--nav-logo-size, 23px)",
            }}
          />
          <span className="navhearts">GOLF</span>
        </Link>
      )}
      <NavActions />
    </nav>
  );
}

function NavActions() {
  const { user } = useAuth();
  const { resolvedTheme, toggle } = useTheme();
  const sound = useSound();
  const [open, setOpen] = useState(false);
  const [themeBouncing, setThemeBouncing] = useState(false);
  const [soundBouncing, setSoundBouncing] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const toggleSound = () => {
    if (sound.muted && sound.volume === 0) sound.setVolume(0.15);
    sound.setMuted(!sound.muted);
  };
  const toggleMusic = () => {
    if (!sound.music && sound.musicVolume === 0) sound.setMusicVolume(0.15);
    sound.setMusic(!sound.music);
  };
  const changeSoundVolume = (value: number) => {
    sound.setVolume(value);
    if ((value === 0) !== sound.muted) sound.setMuted(value === 0);
  };
  const changeMusicVolume = (value: number) => {
    sound.setMusicVolume(value);
    if (value > 0 !== sound.music) sound.setMusic(value > 0);
  };
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        wrap.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="nav-actions">
      <div ref={wrap} className={styles.soundButtonWrap} data-modal-open={open}>
        <button
          type="button"
          className="icon-button"
          aria-label="Sound and music settings"
          aria-expanded={open}
          aria-controls="sound-settings"
          onClick={() => {
            setSoundBouncing(
              !window.matchMedia("(prefers-reduced-motion: reduce)").matches
            );
            setOpen(!open);
          }}
        >
          <FontAwesomeIcon
            className={styles.navIconBounce}
            data-bouncing={soundBouncing}
            onAnimationEnd={() => setSoundBouncing(false)}
            icon={sound.muted && !sound.music ? faMusicNoteSlash : faMusicNote}
          />
        </button>
        {open && (
          <div
            id="sound-settings"
            className={styles.volumeModalDrop}
            role="group"
            aria-label="Sound and music"
          >
            <div className={styles.volumeModalInner}>
              <div className={styles.volumeRow}>
                <button
                  type="button"
                  className={styles.volumeRowIcon}
                  aria-label="Toggle sound effects"
                  aria-pressed={!sound.muted}
                  onClick={toggleSound}
                >
                  <FontAwesomeIcon
                    icon={sound.muted ? faVolumeSlash : faVolume}
                  />
                </button>
                <input
                  aria-label="Sound effects volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={sound.volume}
                  className={styles.volumeSlider}
                  onChange={(e) => changeSoundVolume(Number(e.target.value))}
                />
              </div>
              <div className={styles.volumeRow}>
                <button
                  type="button"
                  className={styles.volumeRowIcon}
                  aria-label="Toggle music"
                  aria-pressed={sound.music}
                  onClick={toggleMusic}
                >
                  <FontAwesomeIcon
                    icon={sound.music ? faMusicNote : faMusicNoteSlash}
                  />
                </button>
                <input
                  aria-label="Music volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={sound.musicVolume}
                  className={styles.volumeSlider}
                  onChange={(e) => changeMusicVolume(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label={
          resolvedTheme === "dark" ? "Use light theme" : "Use dark theme"
        }
        onClick={() => {
          setThemeBouncing(
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches
          );
          toggle();
        }}
      >
        <FontAwesomeIcon
          className={styles.navIconBounce}
          data-bouncing={themeBouncing}
          onAnimationEnd={() => setThemeBouncing(false)}
          icon={resolvedTheme === "dark" ? faMoon : faSunBright}
        />
      </button>
      <Link
        to={user ? "/profile" : "/user"}
        className="nav-user"
        aria-label={user ? "Your account" : "Guest account"}
      >
        <ProfileIcon name={user?.profile_icon} />
        <span>{user?.name ?? "Guest"}</span>
      </Link>
    </div>
  );
}
