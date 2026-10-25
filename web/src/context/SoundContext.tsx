import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Howl } from "howler";
import { asset } from "@/lib/assets";
import { readStorage, writeStorage } from "@/lib/storage";
type Sound = "select" | "deal" | "flip" | "slide" | "start" | "round" | "win" | "pop" | "goingOut";
const FILES: Record<Sound, string[]> = {
  select: ["card-place-1", "card-place-2"],
  deal: ["card-fan-1", "card-fan-2"],
  flip: ["card-place-1", "card-place-2"],
  slide: Array.from({ length: 8 }, (_, index) => `card-slide-${index + 1}`),
  start: ["trump-chosen-chime"],
  round: ["round-end"],
  win: ["game-end"],
  pop: ["pop"],
  goingOut: ["going-out"],
};
const MUSIC_VOLUME_KEY = "golf.music-volume.v1";
const clampVolume = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.15;
function readVolume(key: string, fallback: number): number {
  const value = readStorage<unknown>(key, fallback);
  return typeof value === "number" && Number.isFinite(value)
    ? clampVolume(value)
    : fallback;
}
const Context = createContext<{
  muted: boolean;
  setMuted: (v: boolean) => void;
  music: boolean;
  setMusic: (v: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
  musicVolume: number;
  setMusicVolume: (v: number) => void;
  play: (s: Sound) => void;
} | null>(null);
export function SoundProvider({ children }: { children: ReactNode }) {
  const [muted, setMutedState] = useState(
    () => readStorage<unknown>("golf.muted.v1", false) === true
  );
  const [music, setMusicState] = useState(
    () => readStorage<unknown>("golf.music.v1", false) === true
  );
  const [volume, setVolumeState] = useState(() =>
    readVolume("golf.volume.v1", 0.15)
  );
  const [musicVolume, setMusicVolumeState] = useState(() => {
    const previous = readStorage<unknown>("golf.volume.v1", null);
    const fallback =
      typeof previous === "number" && Number.isFinite(previous)
        ? clampVolume(previous) * 0.35
        : 0.15;
    return readVolume(MUSIC_VOLUME_KEY, fallback);
  });
  const track = useRef<Howl | null>(null);
  const musicEnabled = useRef(music);
  musicEnabled.current = music;
  const play = useCallback(
    (sound: Sound) => {
      if (muted) return;
      const files = FILES[sound];
      const file = files[Math.floor(Math.random() * files.length)];
      const audio = new Audio(asset(`sounds/${file}.mp3`));
      audio.volume = volume;
      void audio.play().catch(() => {});
    },
    [muted, volume]
  );
  useEffect(() => {
    // Decode once and loop the audio buffer without a media-element restart.
    const audio = new Howl({
      src: [asset("sounds/backgroundmusic.mp3")],
      loop: true,
      preload: true,
      onplayerror: () => {
        audio.once("unlock", () => {
          if (musicEnabled.current && !audio.playing()) audio.play();
        });
      },
    });
    track.current = audio;
    return () => {
      audio.unload();
      track.current = null;
    };
  }, []);
  useEffect(() => {
    track.current?.volume(musicVolume);
  }, [musicVolume]);
  useEffect(() => {
    const audio = track.current;
    if (!audio) return;
    if (music) audio.play();
    else audio.pause();
  }, [music]);
  useEffect(() => {
    // Persist the migrated music level before the effects slider changes.
    writeStorage(MUSIC_VOLUME_KEY, musicVolume);
  }, [musicVolume]);
  const setMuted = (value: boolean) => {
    setMutedState(value);
    writeStorage("golf.muted.v1", value);
  };
  const setMusic = (value: boolean) => {
    setMusicState(value);
    writeStorage("golf.music.v1", value);
  };
  const setVolume = (value: number) => {
    const next = clampVolume(value);
    setVolumeState(next);
    writeStorage("golf.volume.v1", next);
  };
  const setMusicVolume = (value: number) => {
    setMusicVolumeState(clampVolume(value));
  };
  return (
    <Context.Provider
      value={{
        muted,
        setMuted,
        music,
        setMusic,
        volume,
        setVolume,
        musicVolume,
        setMusicVolume,
        play,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSound() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing SoundProvider");
  return value;
}
