import { useCallback, useEffect, useState } from "react";
import { HashRouter, useLocation } from "react-router-dom";
import Navbar from "../components/ui/Navbar";
import BottomNav from "../components/ui/BottomNav";
import AppRoutes from "./routes";
import { syncAuthFromSecureStore, getAuthToken } from "../services/authStorage";
import { getUserIdFromToken } from "../services/jwt";
import Loader from "../components/ui/Loader";
import CustomCursor from "../components/ui/CustomCursor";
import ParticleBackground from "../components/ui/ParticleBackground";
import { ThemeProvider } from "../contexts/ThemeContext";
import { AnimationProvider, useAnimation } from "../contexts/AnimationContext";

function AppChrome() {
  const location = useLocation();
  const isAuthRoute =
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/register") ||
    location.hash.startsWith("#/login") ||
    location.hash.startsWith("#/register");

  return (
    <div className="min-h-screen font-body selection:bg-primary-bright/30 relative text-text-primary">
      <CustomCursor />
      <ParticleBackground />
      {!isAuthRoute && <Navbar />}
      <AppRoutes />
      {!isAuthRoute && <BottomNav />}
    </div>
  );
}

import { MotionConfig } from "framer-motion";

function RootWithConfig() {
  const { animationsEnabled } = useAnimation();
  const [loaderDone, setLoaderDone] = useState(false);

  const handleLoaderComplete = useCallback(() => {
    setLoaderDone(true);
  }, []);

  return (
    <MotionConfig transition={animationsEnabled ? undefined : { duration: 0, delay: 0 }}>
      <HashRouter>
        <Loader onComplete={handleLoaderComplete} />
        {loaderDone && <AppChrome />}
      </HashRouter>
    </MotionConfig>
  );
}

export default function App() {
  useEffect(() => {
    void (async () => {
      await syncAuthFromSecureStore();
      const token = getAuthToken();
      const userId = getUserIdFromToken(token);
      if (userId && window.electronAPI?.setActiveDoctor) {
        try {
          await window.electronAPI.setActiveDoctor(userId);
        } catch {
          // ignore
        }
      }
    })();
  }, []);

  return (
    <ThemeProvider>
      <AnimationProvider>
        <RootWithConfig />
      </AnimationProvider>
    </ThemeProvider>
  );
}
