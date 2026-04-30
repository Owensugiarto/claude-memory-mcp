import { Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";
import { SessionsPage } from "@/pages/sessions";
import { SessionViewPage } from "@/pages/session-view";
import { SearchPage } from "@/pages/search";
import { StatsPage } from "@/pages/stats";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<SessionsPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="sessions/:sessionId" element={<SessionViewPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="stats" element={<StatsPage />} />
      </Route>
    </Routes>
  );
}
