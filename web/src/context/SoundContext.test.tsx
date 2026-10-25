import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SoundProvider, useSound } from "./SoundContext";
import { writeStorage } from "@/lib/storage";
import type { HowlOptions } from "howler";
import { installMusicLocks } from "@/test/musicLocks";

vi.mock("howler", () => ({
  Howl: class {
    level = 1;
    active = false;
    unlock?: () => void;
    play = vi.fn(() => {
      this.active = true;
      return 1;
    });
    pause = vi.fn(() => {
      this.active = false;
    });
    volume = vi.fn((value: number) => {
      this.level = value;
    });
    playing = () => this.active;
    unload = vi.fn(() => {
      this.active = false;
    });
    once = vi.fn((_event: string, callback: () => void) => {
      this.unlock = callback;
    });
    constructor(public options: HowlOptions) {
      this.level = options.volume ?? 1;
      tracks.push(this);
    }
  },
}));

let tracks: {
  options: HowlOptions;
  level: number;
  active: boolean;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  unload: ReturnType<typeof vi.fn>;
  unlock?: () => void;
}[];

let players: TestAudio[];
class TestAudio {
  volume = 1;
  loop = false;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  constructor(public src: string) {
    players.push(this);
  }
}
const renderSound = () =>
  renderHook(useSound, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SoundProvider>{children}</SoundProvider>
    ),
  });
const musicSources = [
  "/sounds/backgroundmusic.mp3",
  "/sounds/alex-morgan-jazz-restaurant-music-556244.mp3",
  "/sounds/alex-morgan-jazz-dinner-restaurant-music-556236.mp3",
  "/sounds/alex-morgan-jazz-bar-restaurant-music-564253.mp3",
  "/sounds/alex-morgan-cocktail-jazz-556233.mp3",
  "/sounds/alex-morgan-jazz-cocktail-lounge-music-556246.mp3",
  "/sounds/alex-morgan-jazz-rainy-lounge-music-556235.mp3",
];
const finishTrack = () => {
  const current = tracks.at(-1)!;
  current.active = false;
  act(() => current.options.onend?.(1));
};
const trackSource = () => (tracks.at(-1)!.options.src as string[])[0];

beforeEach(() => {
  players = [];
  tracks = [];
  vi.stubGlobal("Audio", TestAudio);
  installMusicLocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Music across tabs", () => {
   it("plays in one tab and hands off when its music is disabled", async () => {
      writeStorage("golf.music.v1", true);
      const first = renderSound();
      renderSound();
      expect(tracks[0].active).toBe(true);
      expect(tracks[1].play).not.toHaveBeenCalled();
      await act(async () => first.result.current.setMusic(false));
      expect(tracks[0].active).toBe(false);
      expect(tracks[1].active).toBe(true);
   });

   it("hands off when the owner closes and skips a closed waiting tab", async () => {
      writeStorage("golf.music.v1", true);
      const first = renderSound();
      const waiting = renderSound();
      renderSound();
      waiting.unmount();
      await act(async () => first.unmount());
      expect(tracks[1].play).not.toHaveBeenCalled();
      expect(tracks[2].active).toBe(true);
   });

   it("keeps queued track and unlock callbacks silent after losing ownership", () => {
      writeStorage("golf.music.v1", true);
      renderSound();
      const first = tracks[0];
      first.active = false;
      act(() => first.options.onplayerror?.(1, "Autoplay blocked"));
      act(() => window.dispatchEvent(new Event("pagehide")));
      act(() => first.unlock?.());
      expect(first.play).toHaveBeenCalledOnce();
      finishTrack();
      expect(tracks.at(-1)!.play).not.toHaveBeenCalled();
   });

   it("pauses a delayed play event after the page leaves", () => {
      writeStorage("golf.music.v1", true);
      renderSound();
      const current = tracks[0];
      act(() => window.dispatchEvent(new Event("pagehide")));
      current.active = true;
      act(() => current.options.onplay?.(1));
      expect(current.active).toBe(false);
   });
});

describe("Independent audio controls", () => {
  it.each(["pop", "goingOut"] as const)("plays %s from Golf's sound library at the effects volume and respects mute", sound => {
    const { result } = renderSound();
    act(() => result.current.setVolume(0.4));
    act(() => result.current.play(sound));
    expect(players).toHaveLength(1);
    expect(players[0].src).toBe(sound === "pop" ? "/sounds/pop.mp3" : "/sounds/going-out.mp3");
    expect(players[0].volume).toBe(0.4);
    expect(players[0].play).toHaveBeenCalledOnce();
    act(() => result.current.setMuted(true));
    act(() => result.current.play(sound));
    expect(players).toHaveLength(1);
  });

  it("changes music and effects volume independently during playback", () => {
    const { result } = renderSound();
    const music = tracks[0];
    act(() => {
      result.current.setMusic(true);
      result.current.setMusicVolume(0.25);
      result.current.setVolume(0.8);
    });
    act(() => result.current.play("deal"));
    expect(music.level).toBe(0.25);
    expect(players.at(-1)!.volume).toBe(0.8);

    act(() => result.current.setVolume(0.4));
    expect(music.level).toBe(0.25);
    act(() => result.current.setMusicVolume(0.6));
    act(() => result.current.play("slide"));
    expect(music.level).toBe(0.6);
    expect(players.at(-1)!.volume).toBe(0.4);
    expect(music.play).toHaveBeenCalledTimes(1);
  });

  it("preserves the old music level across reloads after effects change", () => {
    writeStorage("golf.volume.v1", 0.6);
    writeStorage("golf.music.v1", true);
    const first = renderSound();
    expect(first.result.current.musicVolume).toBeCloseTo(0.21);
    act(() => first.result.current.setVolume(0.1));
    first.unmount();

    const second = renderSound();
    expect(second.result.current.volume).toBe(0.1);
    expect(second.result.current.musicVolume).toBeCloseTo(0.21);
    act(() => second.result.current.setMusicVolume(0.55));
    second.unmount();
    expect(renderSound().result.current.musicVolume).toBe(0.55);
  });

  it("mutes effects and music independently", () => {
    const { result } = renderSound();
    const music = tracks[0];
    act(() => {
      result.current.setMuted(true);
      result.current.setMusic(true);
    });
    act(() => result.current.play("deal"));
    expect(music.play).toHaveBeenCalled();
    expect(players).toHaveLength(0);

    act(() => {
      result.current.setMusic(false);
      result.current.setMuted(false);
    });
    act(() => result.current.play("deal"));
    expect(music.pause).toHaveBeenCalled();
    expect(players).toHaveLength(1);
    expect(players[0].play).toHaveBeenCalled();
  });
});

describe("Shuffled music playlist", () => {
  it("starts with a shuffled track and releases it when the provider unmounts", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { unmount } = renderSound();
    expect(tracks[0].options).toMatchObject({
      src: [musicSources[1]],
      loop: false,
      preload: true,
    });
    expect(tracks[0].play).not.toHaveBeenCalled();
    unmount();
    expect(tracks[0].unload).toHaveBeenCalledOnce();
  });

  it("plays all seven tracks once per round, then reshuffles and keeps playing", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.999);
    writeStorage("golf.music.v1", true);
    renderSound();
    const firstRound = [trackSource()];
    for (let index = 1; index < musicSources.length; index++) {
      finishTrack();
      firstRound.push(trackSource());
    }
    random.mockReturnValue(0);
    finishTrack();
    const secondRound = [trackSource()];
    for (let index = 1; index < musicSources.length; index++) {
      finishTrack();
      secondRound.push(trackSource());
    }
    expect([...firstRound].sort()).toEqual([...musicSources].sort());
    expect([...secondRound].sort()).toEqual([...musicSources].sort());
    expect(secondRound).not.toEqual(firstRound);
    expect(secondRound[0]).not.toBe(firstRound.at(-1));
    expect(tracks).toHaveLength(14);
    for (const track of tracks) expect(track.play).toHaveBeenCalledOnce();
    for (const track of tracks.slice(0, -1)) {
      expect(track.unload).toHaveBeenCalledOnce();
      expect(track.active).toBe(false);
    }
    expect(tracks.at(-1)!.active).toBe(true);
  });

  it("avoids an immediate repeat when the next shuffle starts with the last song", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.999);
    writeStorage("golf.music.v1", true);
    renderSound();
    for (let index = 1; index < musicSources.length; index++) finishTrack();
    const lastSong = trackSource();
    random.mockReturnValueOnce(0).mockReturnValue(0.999);
    finishTrack();
    expect(trackSource()).not.toBe(lastSong);
    const nextRound = [trackSource()];
    for (let index = 1; index < musicSources.length; index++) {
      finishTrack();
      nextRound.push(trackSource());
    }
    expect([...nextRound].sort()).toEqual([...musicSources].sort());
  });

  it("pauses and resumes the current song without resetting the rotation", async () => {
    writeStorage("golf.music.v1", true);
    const { result } = renderSound();
    finishTrack();
    const current = tracks.at(-1)!;
    act(() => result.current.setMusic(false));
    expect(current.pause).toHaveBeenCalledOnce();
    await act(async () => result.current.setMusic(true));
    expect(tracks).toHaveLength(2);
    expect(current.play).toHaveBeenCalledTimes(2);
    finishTrack();
    expect(new Set(tracks.map(track => (track.options.src as string[])[0])).size).toBe(3);
  });

  it("uses the latest music volume for subsequent songs without changing effects", () => {
    writeStorage("golf.music.v1", true);
    const { result } = renderSound();
    act(() => {
      result.current.setMusicVolume(0.6);
      result.current.setVolume(0.3);
    });
    finishTrack();
    expect(tracks.at(-1)!.level).toBe(0.6);
    act(() => result.current.play("deal"));
    expect(players.at(-1)!.volume).toBe(0.3);
    act(() => result.current.setMusicVolume(0.2));
    expect(tracks.at(-1)!.level).toBe(0.2);
  });

  it("keeps music paused if a queued end event arrives after disabling it", async () => {
    writeStorage("golf.music.v1", true);
    const { result } = renderSound();
    act(() => result.current.setMusic(false));
    finishTrack();
    expect(tracks.at(-1)!.play).not.toHaveBeenCalled();
    await act(async () => result.current.setMusic(true));
    expect(tracks.at(-1)!.play).toHaveBeenCalledOnce();
  });

  it("ignores stale end and unlock callbacks after changing tracks or unmounting", () => {
    writeStorage("golf.music.v1", true);
    const { unmount } = renderSound();
    const first = tracks[0];
    act(() => first.options.onplayerror?.(1, "Autoplay blocked"));
    finishTrack();
    act(() => {
      first.options.onend?.(1);
      first.unlock?.();
    });
    expect(tracks).toHaveLength(2);
    expect(first.play).toHaveBeenCalledOnce();
    const current = tracks.at(-1)!;
    act(() => current.options.onplayerror?.(1, "Autoplay blocked"));
    unmount();
    act(() => {
      current.options.onend?.(1);
      current.unlock?.();
    });
    expect(tracks).toHaveLength(2);
    expect(current.unload).toHaveBeenCalledOnce();
    expect(current.play).toHaveBeenCalledOnce();
  });

  it("retries blocked playback after unlocking without layering music", () => {
    writeStorage("golf.music.v1", true);
    renderSound();
    const music = tracks[0];
    music.active = false;
    act(() => music.options.onplayerror?.(1, "Autoplay blocked"));
    act(() => music.unlock?.());
    expect(music.play).toHaveBeenCalledTimes(2);
    act(() => music.unlock?.());
    expect(music.play).toHaveBeenCalledTimes(2);
  });

  it("keeps music off if it was disabled before playback unlocked", () => {
    writeStorage("golf.music.v1", true);
    const { result } = renderSound();
    const music = tracks[0];
    music.active = false;
    act(() => music.options.onplayerror?.(1, "Autoplay blocked"));
    act(() => result.current.setMusic(false));
    act(() => music.unlock?.());
    expect(music.play).toHaveBeenCalledTimes(1);
  });
});

it("plays Hearts’ notification clip for inactivity reminders", () => {
  const { result } = renderSound();
  act(() => result.current.play("notification"));
  expect(players.at(-1)?.src).toBe("/sounds/notification.mp3");
});
