import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SoundProvider, useSound } from "./SoundContext";
import { writeStorage } from "@/lib/storage";
import type { HowlOptions } from "howler";

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
    unload = vi.fn();
    once = vi.fn((_event: string, callback: () => void) => {
      this.unlock = callback;
    });
    constructor(public options: HowlOptions) {
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

beforeEach(() => {
  players = [];
  tracks = [];
  vi.stubGlobal("Audio", TestAudio);
});
afterEach(() => vi.unstubAllGlobals());

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

describe("Buffered music loop", () => {
  it("loads a looping buffer and releases it when the provider unmounts", () => {
    const { unmount } = renderSound();
    expect(tracks[0].options).toMatchObject({
      src: ["/sounds/backgroundmusic.mp3"],
      loop: true,
      preload: true,
    });
    unmount();
    expect(tracks[0].unload).toHaveBeenCalledOnce();
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
