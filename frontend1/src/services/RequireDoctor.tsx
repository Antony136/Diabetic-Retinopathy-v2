import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getAuthToken } from "./authStorage";
import { getRoleFromToken } from "./jwt";

export default function RequireDoctor({ children }: { children: ReactNode }) {
  const location = useLocation();
  const token = getAuthToken();
  const role = getRoleFromToken(token);

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (role === "admin") {
    return <Navigate to="/admin/overview" replace />;
  }

  return children;
}

