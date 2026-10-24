import { Helmet } from "react-helmet-async";
import { PageLayout } from "@/components/ui/PageLayout";
import { MenuLink } from "@/components/Buttons";
import { Card } from "@/components/Card";
import { useTheme } from "@/context/ThemeContext";
import { useSound } from "@/context/SoundContext";

export default function Options() {
  const theme = useTheme();
  const sound = useSound();
  return (
    <>
      <Helmet>
        <title>Options | Golf</title>
      </Helmet>
      <PageLayout title="OPTIONS">
        <div className="options-body">
          <section>
            <h2>Appearance</h2>
            <div className="segmented">
              <button
                type="button"
                aria-pressed={theme.resolvedTheme === "light"}
                onClick={() =>
                  theme.resolvedTheme !== "light" && theme.toggle()
                }
              >
                Light
              </button>
              <button
                type="button"
                aria-pressed={theme.resolvedTheme === "dark"}
                onClick={() => theme.resolvedTheme !== "dark" && theme.toggle()}
              >
                Dark
              </button>
            </div>
          </section>
          <section className="audio-settings">
            <h2>Sound &amp; Music</h2>
            <label className="check-row">
              <input
                type="checkbox"
                checked={!sound.muted}
                onChange={(e) => {
                  if (e.target.checked && sound.volume === 0)
                    sound.setVolume(0.15);
                  sound.setMuted(!e.target.checked);
                }}
              />
              Sound Effects
            </label>
            <label className="slider-row">
              Effects Volume
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={sound.volume}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  sound.setVolume(value);
                  sound.setMuted(value === 0);
                }}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={sound.music}
                onChange={(e) => {
                  if (e.target.checked && sound.musicVolume === 0)
                    sound.setMusicVolume(0.15);
                  sound.setMusic(e.target.checked);
                }}
              />
              Background Music
            </label>
            <label className="slider-row">
              Music Volume
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={sound.musicVolume}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  sound.setMusicVolume(value);
                  sound.setMusic(value > 0);
                }}
              />
            </label>
          </section>
          <section>
            <h2>The Deck</h2>
            <div className="deck-preview">
              <Card rank="A" />
              <Card rank="Q" suit="H" />
              <Card />
            </div>
            <p className="quiet-text">Classic cards. A little Argyle.</p>
          </section>
        </div>
        <div className="button-stack">
          <MenuLink to="/user" name="Back" />
          <MenuLink to="/" name="Home" />
        </div>
      </PageLayout>
    </>
  );
}
