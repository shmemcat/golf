import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFlag } from "@fortawesome/pro-solid-svg-icons/faFlag";
import { useSound } from "@/context/SoundContext";
import "@/styles/going-out.css";

export function GoingOutNotice({ holeKey, finalTurns, playerName }: {
  holeKey: string;
  finalTurns: boolean;
  playerName: string;
}) {
  const { play } = useSound();
  const sound = useRef(play);
  sound.current = play;
  // Restoring a table keeps its flag without replaying an old announcement.
  const previous = useRef({ holeKey, finalTurns });
  const [notice, setNotice] = useState<{ holeKey: string; playerName: string } | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = { holeKey, finalTurns };
    if (before.holeKey !== holeKey || !finalTurns) {
      setNotice(null);
    } else if (!before.finalTurns && playerName) {
      setNotice({ holeKey, playerName });
      sound.current("goingOut");
    }
  }, [holeKey, finalTurns, playerName]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return <div className="golf-going-out-announcer" role="status" aria-label="Going out" aria-live="polite" aria-atomic="true">
    {notice?.holeKey === holeKey && <div key={notice.holeKey} className="golf-going-out-notice">
      <FontAwesomeIcon icon={faFlag} aria-hidden="true" />
      <div>
        <strong>{notice.playerName} went out</strong>
        <span>Everyone else gets one last turn.</span>
      </div>
    </div>}
  </div>;
}
