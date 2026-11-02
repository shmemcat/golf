import { useReducedMotion } from "./lib/motionPreference";
import { Suspense, lazy, useEffect, type ReactNode } from "react";
import { HelmetProvider } from "react-helmet-async";
import { MotionConfig } from "framer-motion";
import { Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { GearOverlay } from "@/components/SettingsGear";
import { AchievementNotifications } from "@/components/AchievementNotifications";
import { TurnSoundProvider } from "@/context/TurnSoundContext";
import { SoundProvider } from "@/context/SoundContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { CardBackProvider } from "@/context/CardBackContext";
import Home from "@/pages/Home";
import { Play, CreateGame, JoinGame } from "@/pages/Play";
import Rules from "@/pages/Rules";
import User from "@/pages/User";
import { About, NotFound } from "@/pages/Info";
const Leaderboard = lazy(() => import("@/pages/Leaderboard"));
const Options = lazy(() => import("@/pages/Options"));
const Profile = lazy(() => import("@/pages/Profile"));
const GamePage = lazy(() => import("@/pages/GamePage"));
const OnlineGame = lazy(() => import("@/pages/OnlineGame"));

export function Providers({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <HelmetProvider>
      <MotionConfig reducedMotion={reduced ? "always" : "never"}>
        <ThemeProvider>
          <AuthProvider>
            <CardBackProvider>
              <TurnSoundProvider>
                <SoundProvider>{children}</SoundProvider>
              </TurnSoundProvider>
            </CardBackProvider>
          </AuthProvider>
        </ThemeProvider>
      </MotionConfig>
    </HelmetProvider>
  );
}
export function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div style={{ position: "relative" }}>
      <a className="skip-link" href="#page-content">
        Skip to content
      </a>
      <Suspense
        fallback={
          <main id="page-content" className="loading-page" role="status">
            Loading…
          </main>
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play" element={<Play />} />
          <Route path="/game/create" element={<CreateGame />} />
          <Route path="/game/join" element={<JoinGame />} />
          <Route path="/game/single" element={<GamePage />} />
          <Route path="/game/multiplayer/:code" element={<OnlineGame />} />
          <Route path="/game/lobby/:code" element={<OnlineGame />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/about" element={<About />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/user" element={<User />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/options" element={<Options />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <GearOverlay />
      <AchievementNotifications />
    </div>
  );
}
