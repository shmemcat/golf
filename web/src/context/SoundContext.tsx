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
import { requestMusicPlayback } from "@/lib/musicPlayback";
type Sound =
  | "turn"
  | "playerJoin"
  | "select"
  | "deal"
  | "flip"
  | "slide"
  | "start"
  | "round"
  | "win"
  | "pop"
  | "goingOut"
  | "notification";
const FILES: Record<Sound, string[]> = {
  turn: ["sound-on"],
  playerJoin: ["join-ding"],
  select: ["card-place-1", "card-place-2"],
  deal: ["card-fan-1", "card-fan-2"],
  flip: ["card-place-1", "card-place-2"],
  slide: Array.from({ length: 8 }, (_, index) => `card-slide-${index + 1}`),
  start: ["trump-chosen-chime"],
  round: ["round-end"],
  win: ["game-end"],
  pop: ["pop"],
  goingOut: ["going-out"],
  notification: ["notification"],
};
const MUSIC_FILES = [
  "backgroundmusic.mp3",
  "alex-morgan-jazz-restaurant-music-556244.mp3",
  "alex-morgan-jazz-dinner-restaurant-music-556236.mp3",
  "alex-morgan-jazz-bar-restaurant-music-564253.mp3",
  "alex-morgan-cocktail-jazz-556233.mp3",
  "alex-morgan-jazz-cocktail-lounge-music-556246.mp3",
  "alex-morgan-jazz-rainy-lounge-music-556235.mp3",
];
function shuffleMusic(previous?: string): string[] {
  const files = [...MUSIC_FILES];
  for (let index = files.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [files[index], files[other]] = [files[other], files[index]];
  }
  // Avoid repeating the last song when a new round begins.
  if (files[0] === previous) {
    const other = 1 + Math.floor(Math.random() * (files.length - 1));
    [files[0], files[other]] = [files[other], files[0]];
  }
  return files;
}
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
  const ownsMusic = useRef(false);
  const musicId = useRef<number | undefined>(undefined);
  const resumeMusic = useCallback(() => {
    const audio = track.current;
    if (audio && !audio.playing()) {
      musicId.current = audio.play(musicId.current);
    }
  }, []);
  const musicEnabled = useRef(music);
  musicEnabled.current = music;
  const musicLevel = useRef(musicVolume);
  musicLevel.current = musicVolume;
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
    let remaining: string[] = [];
    let previous: string | undefined;
    const loadNextTrack = (): Howl => {
      if (remaining.length === 0) remaining = shuffleMusic(previous);
      const file = remaining.shift()!;
      previous = file;
      musicId.current = undefined;
      const audio = new Howl({
        src: [asset(`sounds/${file}`)],
        loop: false,
        preload: true,
        volume: musicLevel.current,
        onplay: () => {
          if (
            track.current !== audio ||
            !ownsMusic.current ||
            !musicEnabled.current
          ) {
            audio.pause();
          }
        },
        onend: () => {
          if (track.current !== audio) return;
          audio.unload();
          const next = loadNextTrack();
          if (musicEnabled.current && ownsMusic.current) {
            musicId.current = next.play();
          }
        },
        onplayerror: () => {
          audio.once("unlock", () => {
            if (
              track.current === audio &&
              musicEnabled.current &&
              ownsMusic.current &&
              !audio.playing()
            ) musicId.current = audio.play(musicId.current);
          });
        },
      });
      track.current = audio;
      return audio;
    };
    loadNextTrack();
    return () => {
      track.current?.unload();
      track.current = null;
    };
  }, []);
  useEffect(() => {
    track.current?.volume(musicVolume);
  }, [musicVolume]);
  useEffect(() => {
    if (!music) return;
    return requestMusicPlayback((owner) => {
      ownsMusic.current = owner;
      if (owner) resumeMusic();
      else track.current?.pause();
    });
  }, [music, resumeMusic]);
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
