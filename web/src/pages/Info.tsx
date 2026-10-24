import { Helmet } from "react-helmet-async";
import { PageLayout } from "@/components/ui/PageLayout";
import { MenuLink } from "@/components/Buttons";
import { Card } from "@/components/Card";
import { cardsHome } from "@/lib/links";

export function About() {
  return (
    <>
      <Helmet>
        <title>About | Golf</title>
      </Helmet>
      <PageLayout title="ABOUT">
        <div className="prose">
          <h2>A Little Golf, A Lot of Cards</h2>
          <p>
            Welcome to Six Card Golf. A small grid of cards, a few good swaps,
            and a reason to hope the next draw is a king.
          </p>
          <p>
            Golf is part of{" "}
            <a className="link" href={cardsHome}>
              Cards
            </a>
            , alongside Hearts and Euchre. Your account and profile travel with
            you.
          </p>
          <p>
            The clubhouse is open while we get the tables ready. For now, settle
            in, pick your theme, and learn the rules.
          </p>
          <p className="quiet-text">
            Made by{" "}
            <a className="link" href="https://shmem.dev/">
              shmem
            </a>
            . Typeset in Fraunces, with icons by Font Awesome and music by
            Alex Morgan.
          </p>
          <a
            className="link"
            href="https://bicyclecards.com/how-to-play/six-card-golf"
            target="_blank"
            rel="noreferrer"
          >
            Six Card Golf at Bicycle
          </a>
        </div>
        <div className="button-stack">
          <MenuLink to="/rules" name="Rules" />
          <MenuLink to="/" name="Home" />
        </div>
      </PageLayout>
    </>
  );
}
export function Leaderboard() {
  return (
    <>
      <Helmet>
        <title>Leaderboard | Golf</title>
      </Helmet>
      <PageLayout title="LEADERBOARD">
        <div className="prose">
          <h2>A Fresh Scorecard</h2>
          <div className="deck-preview">
            <Card rank="K" suit="C" />
            <Card />
          </div>
          <p>
            There aren’t any scores yet. The leaderboard will open when games
            are ready.
          </p>
        </div>
        <div className="button-stack">
          <MenuLink to="/rules" name="Learn the Rules" />
          <MenuLink to="/" name="Home" />
        </div>
      </PageLayout>
    </>
  );
}
export function NotFound() {
  return (
    <>
      <Helmet>
        <title>Page Not Found | Golf</title>
      </Helmet>
      <PageLayout title="LOST BALL">
        <p>That page is out of bounds.</p>
        <div className="button-stack">
          <MenuLink to="/" name="Home" />
        </div>
      </PageLayout>
    </>
  );
}
