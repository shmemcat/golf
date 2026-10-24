import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { PageLayout } from "@/components/ui/PageLayout";
import { MenuLink, RulesButton } from "@/components/Buttons";
import { Card } from "@/components/Card";
import containers from "@/styles/containers.module.css";
const sections = ["Overview", "The Deal", "Your Turn", "Scoring"] as const;
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
                  Two to four players share a standard 52-card deck. Play nine
                  deals (“holes”); the lowest total wins.
                </p>
                <p>
                  Trade high cards for low ones. Matching ranks in a vertical
                  column cancel out.
                </p>
                <div className="rule-pair">
                  <Card rank="8" suit="S" />
                  <Card rank="8" suit="H" />
                  <span className="score-badge">0 points</span>
                </div>
              </>
            )}
            {section === "The Deal" && (
              <>
                <p>
                  Deal each player six cards face down in two rows of three.
                  Turn any two face up; don’t peek at the others.
                </p>
                <p>
                  The remaining deck is the stock. Turn up one card to begin the
                  discard pile.
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
                <p>Start left of the dealer and play clockwise.</p>
                <ol className="turn-steps">
                  <li>Draw from the stock or discard pile.</li>
                  <li>
                    Swap your draw for any grid card. Leave your new card face
                    up and discard the old one. Or discard your draw.
                  </li>
                </ol>
                <p>
                  The deal ends when someone has six face-up cards. Reveal and
                  score all grids.
                </p>
                <div className="deck-preview">
                  <Card />
                  <span className="pile-label">or</span>
                  <Card rank="K" suit="H" />
                </div>
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
                  A matching vertical pair scores zero, even two twos. Add each
                  deal to your scorecard.
                </p>
              </>
            )}
          </section>
        </div>
        <p className="rules-source">
          Based on{" "}
          <a
            className="link"
            href="https://bicyclecards.com/how-to-play/six-card-golf"
            target="_blank"
            rel="noreferrer"
          >
            Bicycle’s Six Card Golf rules
          </a>
          .
        </p>
        <div className="button-stack">
          <MenuLink to="/" name="Home" />
        </div>
      </PageLayout>
    </>
  );
}
