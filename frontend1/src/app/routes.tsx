import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";

// Lazy-loaded pages
const Dashboard = lazy(() => import("../features/dashboard/Dashboard"));
const Screening = lazy(() => import("../features/screening/Screening"));
const Records = lazy(() => import("../features/records/Records"));
const Triage = lazy(() => import("../features/triage/Triage"));
const Settings = lazy(() => import("../features/settings/Settings"));
const Profile = lazy(() => import("../features/profile/Profile"));
const Notifications = lazy(() => import("../features/notifications/Notifications"));

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
        <Route path="/" element={<Dashboard />} />
        <Route path="/screening" element={<Screening />} />
        <Route path="/records" element={<Records />} />
        <Route path="/triage" element={<Triage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/notifications" element={<Notifications />} />
      </Routes>
    </Suspense>
  );
}
