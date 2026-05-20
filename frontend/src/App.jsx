import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import MainLayout from "./components/MainLayout";
import RequireAuth from "./components/RequireAuth";
import AdminPanel from "./pages/AdminPanel";
import GroupTab from "./pages/GroupTab";
import KnockoutTab from "./pages/KnockoutTab";
import LeaderboardTab from "./pages/LeaderboardTab";
import Login from "./pages/Login";

function LoginGate() {
  const { token } = useAuth();
  return token ? <Navigate to="/" replace /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginGate />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <MainLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/group/A" replace />} />
            <Route path="group/:letter" element={<GroupTab />} />
            <Route path="knockout" element={<KnockoutTab />} />
            <Route path="leaderboard" element={<LeaderboardTab />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
