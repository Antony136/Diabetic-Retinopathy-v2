import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import RequireAuth from "../features/auth/RequireAuth";
import RequireAdmin from "../services/RequireAdmin";
import RequireDoctor from "../services/RequireDoctor";
import { getAuthToken } from "../services/authStorage";
import { getRoleFromToken } from "../services/jwt";

// Lazy-loaded pages
const Login = lazy(() => import("../features/auth/Login"));
const Register = lazy(() => import("../features/auth/Register"));
const Dashboard = lazy(() => import("../features/dashboard/Dashboard"));
const Screening = lazy(() => import("../features/screening/Screening"));
const Records = lazy(() => import("../features/records/Records"));
const Triage = lazy(() => import("../features/triage/Triage"));
const Settings = lazy(() => import("../features/settings/Settings"));
const Profile = lazy(() => import("../features/profile/Profile"));
const Notifications = lazy(() => import("../features/notifications/Notifications"));
const AdminDashboard = lazy(() => import("../features/admin/AdminDashboard"));

function RoleHome() {
  const role = getRoleFromToken(getAuthToken());
  if (role === "admin") return <Navigate to="/admin/overview" replace />;
  return <Dashboard />;
}

export default function AppRoutes() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <RoleHome />
            </RequireAuth>
          }
        />

        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <Navigate to="/admin/overview" replace />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/:section"
          element={
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          }
        />

        <Route
          path="/screening"
          element={
            <RequireDoctor>
              <Screening />
            </RequireDoctor>
          }
        />
        <Route
          path="/records"
          element={
            <RequireDoctor>
              <Records />
            </RequireDoctor>
          }
        />
        <Route
          path="/triage"
          element={
            <RequireDoctor>
              <Triage />
            </RequireDoctor>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireDoctor>
              <Settings />
            </RequireDoctor>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireDoctor>
              <Profile />
            </RequireDoctor>
          }
        />
        <Route
          path="/notifications"
          element={
            <RequireDoctor>
              <Notifications />
            </RequireDoctor>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
