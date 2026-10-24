import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCards } from "@fortawesome/pro-regular-svg-icons/faCards";
import { Navbar } from "@/components/Navbar";
import { GolfLogo } from "@/components/GolfLogo";
import { MenuLink } from "@/components/Buttons";
import containers from "@/styles/containers.module.css";
import { cardsHome } from "@/lib/links";
export default function Home() {
  return (
    <>
      <Helmet>
        <title>Golf</title>
      </Helmet>
      <main className={containers["content-border-container-menu"]}>
        <Navbar />
        <motion.div
          id="page-content"
          tabIndex={-1}
          className={containers["index-container"]}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className={containers["title-container"]}>
            <GolfLogo
              size={240}
              style={{
                marginTop: "-100px",
                transform: "translateY(-32px)",
                display: "block",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            />
            <h1 style={{ marginTop: "-180px", transform: "translateY(-8px)" }}>
              GOLF
            </h1>
          </div>
          <div className={containers["menu-button-container"]}>
            <MenuLink to="/play" name="Play" />
            <MenuLink to="/leaderboard" name="Leaderboard" />
            <MenuLink to="/rules" name="Rules" />
            <MenuLink to="/about" name="About" />
          </div>
        </motion.div>
        <motion.a
          className={containers["cards-hub-link"]}
          href={cardsHome}
          aria-label="Cards home"
          title="Cards home"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <FontAwesomeIcon icon={faCards} />
        </motion.a>
      </main>
    </>
  );
}
