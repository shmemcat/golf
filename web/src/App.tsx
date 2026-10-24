import { Suspense, lazy, useEffect, type ReactNode } from "react";
import { HelmetProvider } from "react-helmet-async";
import { MotionConfig } from "framer-motion";
import { Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { SoundProvider } from "@/context/SoundContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Home from "@/pages/Home";
import { Play, CreateGame, JoinGame } from "@/pages/Play";
import Rules from "@/pages/Rules";
import User from "@/pages/User";
import Options from "@/pages/Options";
import { About, Leaderboard, NotFound } from "@/pages/Info";
const Profile = lazy(() => import("@/pages/Profile"));

export function Providers({ children }: { children: ReactNode }) {
  return (
    <HelmetProvider>
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          <AuthProvider>
            <SoundProvider>{children}</SoundProvider>
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
    <>
      <a className="skip-link" href="#page-content">
        Skip to content
      </a>
      <Suspense
        fallback={
          <main id="page-content" className="loading-page" role="status">
            Loading your profile…
          </main>
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play" element={<Play />} />
          <Route path="/game/create" element={<CreateGame />} />
          <Route path="/game/join" element={<JoinGame />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/about" element={<About />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/user" element={<User />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/options" element={<Options />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
