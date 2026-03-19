import { BrowserRouter } from "react-router-dom";
import Navbar from "../components/ui/Navbar";
import BottomNav from "../components/ui/BottomNav";
import AppRoutes from "./routes";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen font-body selection:bg-primary/30">
        <Navbar />
        <AppRoutes />
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
