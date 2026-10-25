import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { PageLayout } from "@/components/ui/PageLayout";
import { MenuLink, RulesButton } from "@/components/Buttons";
import { Card } from "@/components/Card";
import containers from "@/styles/containers.module.css";
const sections = ["Overview", "The Deal", "Your Turn", "Going Out", "Scoring"] as const;
type Section = (typeof sections)[number];

export default function Rules() {
  const [section, setSection] = useState<Section>("Overview");
  return (
    <>
      <Helmet>
        <title>Rules | Golf</title>
      </Helmet>
      <PageLayout title="RULES">
        <div className={`${containers["rules-body-container"]} golf-rules`}>
          <nav
            className={containers["rules-button-container"]}
            aria-label="Rules sections"
          >
            {sections.map((name) => (
              <RulesButton
                key={name}
                name={name}
                selected={name === section}
                onClick={() => setSection(name)}
              />
            ))}
          </nav>
          <section
            className={`${containers["rules-text-body"]} rule-content`}
            aria-labelledby="rule-heading"
            aria-live="polite"
          >
            <h2 id="rule-heading">{section}</h2>
            {section === "Overview" && (
              <>
                <p>
                  Two to six players share two standard 52-card decks (104 cards
                  total). Play nine deals (“holes”); the lowest total wins.
                </p>
                <p>
                  Trade high cards for low ones. Matching ranks in a vertical
                  column cancel out, except paired twos, which score −4. Four
                  matching cards in an adjacent 2×2 block score −20 points,
                  except four twos, which score −28.
                </p>
                <figure className="deal-figure">
                  <div className="six-card-grid">
                    <Card />
                    <Card />
                    <Card rank="8" suit="S" />
                    <Card />
                    <Card />
                    <Card rank="8" suit="H" />
                  </div>
                  <figcaption>
                    Matching column:{" "}
                    <span className="score-badge">0 points</span>
                  </figcaption>
                </figure>
              </>
            )}
            {section === "The Deal" && (
              <>
                <p>
                  Shuffle both decks together. Deal each player six cards face
                  down in two rows of three. Turn one top card and one bottom
                  card face up, not in the same column; don’t peek at the others.
                </p>
                <p>
                  The remaining cards form the deck. Turn up one card to begin
                  the discard pile.
                </p>
                <figure className="deal-figure">
                  <div className="six-card-grid">
                    <Card rank="K" suit="C" />
                    <Card />
                    <Card />
                    <Card />
                    <Card rank="2" suit="H" />
                    <Card />
                  </div>
                  <figcaption>Your starting grid</figcaption>
                </figure>
              </>
            )}
            {section === "Your Turn" && (
              <>
                <p>The first starting player is chosen at random. Play clockwise;
                  the next player clockwise starts each new hole.</p>
                <ol className="turn-steps">
                  <li>Draw from the deck or discard pile.</li>
                  <li>
                    Swap your draw for any grid card. Leave your new card face
                    up and discard the old one. Or discard your draw.
                  </li>
                </ol>
                <p>Turn all six cards face up to go out and start the final round.</p>
                <div className="deck-preview">
                  <Card />
                  <span className="pile-label">or</span>
                  <Card rank="K" suit="H" />
                </div>
              </>
            )}
            {section === "Going Out" && (
              <>
                <p>
                  Turning all six cards face up is “going out”: you’re declaring
                  that you think you have the lowest score.
                </p>
                <p>
                  The rest of the table gets to take one more turn and then the
                  hole ends. Reveal and score all grids.
                </p>
                <p>
                  If another player finishes with a lower score, add 10 penalty
                  points to your score for that hole. Apply the penalty only once,
                  after everyone’s final turn. A tied lowest score has no penalty.
                </p>
              </>
            )}
            {section === "Scoring" && (
              <>
                <dl className="score-list">
                  {[
                    ["Ace", "1"],
                    ["Two", "−2"],
                    ["3–10", "Face value"],
                    ["Jack & Queen", "10"],
                    ["King", "0"],
                  ].map(([rank, score]) => (
                    <div key={rank}>
                      <dt>{rank}</dt>
                      <dd>{score}</dd>
                    </div>
                  ))}
                </dl>
                <p>
                  A matching vertical pair scores zero, except paired twos,
                  which score −4.
                </p>
                <p>
                  Four cards of the same rank in an adjacent 2×2 block score −20
                  points instead of the two matching columns’ usual scores.
                  Four twos score −28: their −8 card value plus the −20 block bonus.
                  Score the remaining two cards normally.
                </p>
                <figure className="deal-figure">
                  <div className="six-card-grid">
                    <Card rank="8" suit="S" />
                    <Card rank="8" suit="H" />
                    <Card rank="K" suit="C" />
                    <Card rank="8" suit="C" />
                    <Card rank="8" suit="D" />
                    <Card rank="3" suit="D" />
                  </div>
                  <figcaption>
                    Matching block:{" "}
                    <span className="score-badge">−20 points</span>
                    <br />
                    King (0) + 3 = 3. Grid total: −17 points.
                  </figcaption>
                </figure>
                <p className="quiet-text">Add each deal to your scorecard.</p>
              </>
            )}
          </section>
        </div>
        <div className="button-stack">
          <MenuLink to="/" name="Home" />
        </div>
      </PageLayout>
    </>
  );
}
