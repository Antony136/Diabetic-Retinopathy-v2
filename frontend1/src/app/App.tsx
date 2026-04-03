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

function AppChrome() {
  const location = useLocation();
  const isAuthRoute =
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/register") ||
    location.hash.startsWith("#/login") ||
    location.hash.startsWith("#/register");

  return (
    <div className="min-h-screen font-body selection:bg-primary-bright/30 relative">
      <CustomCursor />
      <ParticleBackground />
      {!isAuthRoute && <Navbar />}
      <AppRoutes />
      {!isAuthRoute && <BottomNav />}
    </div>
  );
}

export default function App() {
  const [loaderDone, setLoaderDone] = useState(false);

  const handleLoaderComplete = useCallback(() => {
    setLoaderDone(true);
  }, []);

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
    <HashRouter>
      <Loader onComplete={handleLoaderComplete} />
      {loaderDone && <AppChrome />}
    </HashRouter>
  );
}
