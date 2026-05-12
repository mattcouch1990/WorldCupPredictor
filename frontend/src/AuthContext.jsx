import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as api from "./api";

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => api.getToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(api.getToken()));

  const refreshUser = useCallback(async () => {
    try {
      const me = await api.getMe();
      setUser(me);
      return me;
    } catch (err) {
      if (err.status === 401) {
        api.setToken(null);
        setTokenState(null);
        setUser(null);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    refreshUser().finally(() => setLoading(false));
  }, [token, refreshUser]);

  const login = useCallback(async (email, passcode) => {
    const res = await api.login(email, passcode);
    api.setToken(res.access_token);
    setTokenState(res.access_token);
    const me = await api.getMe();
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(() => {
    api.setToken(null);
    setTokenState(null);
    setUser(null);
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }, []);

  const isProfileComplete = Boolean(user?.real_name && user?.team_name);

  const value = {
    token,
    user,
    loading,
    isProfileComplete,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
