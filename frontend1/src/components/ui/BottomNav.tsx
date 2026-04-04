import { NavLink, useLocation } from "react-router-dom";
import { ADMIN_NAV_ITEMS, DOCTOR_NAV_ITEMS } from "../../utils/constants";
import { getAuthToken } from "../../services/authStorage";
import { getRoleFromToken } from "../../services/jwt";

export default function BottomNav() {
  const location = useLocation();
  const role = getRoleFromToken(getAuthToken());
  const items = role === "admin" ? ADMIN_NAV_ITEMS : DOCTOR_NAV_ITEMS;

  return (
    <nav className="fixed top-[73px] bottom-0 left-0 z-50 flex flex-col items-center gap-2 py-8 bg-surface-container-lowest/80 backdrop-blur-2xl border-r border-border font-mono text-[10px] font-bold tracking-widest uppercase w-24">
      {items.map((item) => {
        const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={`relative flex flex-col items-center justify-center w-full py-5 transition-all duration-300 ease-out active:scale-[0.85] ${
              isActive
                ? "text-primary-bright bg-primary-bright/10 shadow-[inset_4px_0_0_#8b5cf6]"
                : "text-text-variant hover:text-text-primary hover:bg-surface-container-high/50"
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
