import { NavLink, useLocation } from "react-router-dom";
import { ADMIN_NAV_ITEMS, DOCTOR_NAV_ITEMS } from "../../utils/constants";
import { getAuthToken } from "../../services/authStorage";
import { getRoleFromToken } from "../../services/jwt";

export default function BottomNav() {
  const location = useLocation();
  const role = getRoleFromToken(getAuthToken());
  const items = role === "admin" ? ADMIN_NAV_ITEMS : DOCTOR_NAV_ITEMS;

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 p-1.5 mb-6 bg-black/60 backdrop-blur-xl rounded-none mx-auto w-fit border border-white/10 font-mono text-[10px] font-medium tracking-widest uppercase">
      {items.map((item) => {
        const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center justify-center px-5 py-2.5 transition-all duration-300 ease-out border ${
              isActive
                ? "border-[#C87CFF]/50 text-[#C87CFF] bg-[#C87CFF]/10 shadow-[0_0_15px_rgba(200,124,255,0.2)]"
                : "border-transparent text-white/40 hover:text-white/70 hover:border-white/10"
            }`}
          >
            <span
              className="material-symbols-outlined text-lg"
              style={
                isActive
                  ? { fontVariationSettings: "'FILL' 1" }
                  : undefined
              }
            >
              {item.icon}
            </span>
            <span className="mt-0.5">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
