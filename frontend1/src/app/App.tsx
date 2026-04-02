import { useEffect } from "react";
import { HashRouter } from "react-router-dom";
import { useLocation } from "react-router-dom";
import Navbar from "../components/ui/Navbar";
import BottomNav from "../components/ui/BottomNav";
import AppRoutes from "./routes";
import { syncAuthFromSecureStore } from "../services/authStorage";
import { getAuthToken } from "../services/authStorage";
import { getUserIdFromToken } from "../services/jwt";

function AppChrome() {
  const location = useLocation();
  const isAuthRoute =
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/register") ||
    location.hash.startsWith("#/login") ||
    location.hash.startsWith("#/register");

  return (
    <div className="min-h-screen font-body selection:bg-primary/30">
      {!isAuthRoute && <Navbar />}
      <AppRoutes />
      {!isAuthRoute && <BottomNav />}
    </div>
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
    <HashRouter>
      <AppChrome />
    </HashRouter>
  );
}
