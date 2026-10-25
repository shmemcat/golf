import { Helmet } from "react-helmet-async";
import { PageLayout } from "@/components/ui/PageLayout";
import { MenuLink } from "@/components/Buttons";
import { Sparkle } from "@/components/Sparkle";
import { cardsHome } from "@/lib/links";

export function About() {
  return (
    <>
      <Helmet>
        <title>About | Golf</title>
      </Helmet>
      <PageLayout title="ABOUT">
        <article className="prose about-body">
          <p>
            Welcome to my <strong className="bold">Golf</strong> web app! I’m{" "}
            <strong className="bold">Emily</strong>, aka{" "}
            <strong className="bold">
              <span className="sparkle-container">
                <Sparkle className="sparkle-svg" />
                <Sparkle className="sparkle-svg" />
                <Sparkle className="sparkle-svg" />
                <Sparkle className="sparkle-svg" />
                <Sparkle className="sparkle-svg" />
                <span className="sparkle">shmemcat</span>
              </span>
            </strong>
            . If my family has a group over and we want to get a card game
            in, we always go for Golf! It's easy to learn and quick to play. We
            have some house rules that differ from the classic Bicycle rules,
            but we think that makes it more fun.
          </p>
          <p>
            Golf is part of{" "}
            <a className="link" href={cardsHome}>
              Cards
            </a>
            , alongside Hearts and Euchre. Find the code on{" "}
            <a
              className="link"
              href="https://github.com/shmemcat/golf"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            .
          </p>
          <p>
            Credit for this snazzy music you’re listening to
            <br />
            goes to{" "}
            <a
              className="link"
              href="https://pixabay.com/users/alex-morgan-54692529/"
              target="_blank"
              rel="noreferrer"
            >
              alex-morgan
            </a>
            !
          </p>
        </article>
        <div className="button-stack">
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
