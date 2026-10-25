import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/Card";
import { FadingIndicator } from "@/components/game/FadingIndicator";
import { SELECTION_STYLES } from "@/game/selectionStyles";
import "@/styles/card-selection.css";
import "@/styles/card-styles.css";

export default function CardStyles() {
  return (
    <div className="golf-style-page">
      <Helmet><title>Card Selection Styles | Golf</title></Helmet>
      <Navbar />
      <main id="page-content">
        <div className="golf-style-heading">
          <h1>Card selection styles</h1>
          <p>Five ways to say “you can pick this card.” Hover or focus the two valid cards in each example.</p>
          <Link to="/game/single?players=6">Back to the table</Link>
        </div>
        {(["light", "dark"] as const).map(theme => (
          <section key={theme} className="golf-style-theme" data-preview-theme={theme} aria-label={`${theme} mode examples`}>
            <h2>{theme === "light" ? "Light mode" : "Dark mode"}</h2>
            <div className="golf-style-grid">
              {SELECTION_STYLES.map((style, index) => (
                <article key={style.id} data-selection-style={style.id} className="golf-style-example">
                  <h3><span>{index + 1}</span> {style.name}</h3>
                  <div className="golf-style-cards">
                    <div><button type="button" className="golf-style-card golf-selection" data-valid="true"
                      aria-label={`${theme}, ${style.name}: valid face-down card`}><Card /><FadingIndicator active className="golf-selection-indicator" /></button><span>Valid</span></div>
                    <div><button type="button" className="golf-style-card golf-selection" data-valid="true"
                      aria-label={`${theme}, ${style.name}: valid queen of hearts`}><Card rank="Q" suit="H" /><FadingIndicator active className="golf-selection-indicator" /></button><span>Valid</span></div>
                    <div><button type="button" className="golf-style-card golf-selection" disabled
                      aria-label={`${theme}, ${style.name}: unavailable face-down card`}><Card /></button><span>Idle</span></div>
                  </div>
                  <p>{style.description}</p>
                  <Link className="golf-style-try" to={`/game/single?players=6&selection=${style.id}`}>Try on the table</Link>
                </article>
              ))}
            </div>
          </section>
        ))}
        <p className="golf-style-note">The table currently uses 5 · Soft backing, with a four-second solid pause between gentle pulses. These are live examples of the same cards and selection styles used in the game.</p>
      </main>
    </div>
  );
}
