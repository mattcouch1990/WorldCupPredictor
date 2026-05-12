import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function RequireAuth({ children }) {
  const { token, loading } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center text-slate-400 text-sm">
        Loading…
      </div>
    );
  }

  return children;
}
