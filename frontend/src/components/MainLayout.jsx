import { useCallback, useEffect, useState } from "react";
import { Outlet, useOutletContext } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { getLockStatus } from "../api";
import LockBanner from "./LockBanner";
import ProfileModal from "./ProfileModal";
import TabBar from "./TabBar";

const ROUND_LABELS = {
  groups: "Group stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  FINAL: "Final",
};

export function useLockStatus() {
  return useOutletContext().lockStatus;
}

export function useReloadLockStatus() {
  return useOutletContext().reloadLockStatus;
}

export default function MainLayout() {
  const { user, isProfileComplete, logout } = useAuth();
  const [lockStatus, setLockStatus] = useState(null);

  const reloadLockStatus = useCallback(async () => {
    try {
      const data = await getLockStatus();
      const map = {};
      for (const row of data.rounds) map[row.round] = row;
      setLockStatus(map);
    } catch {
      setLockStatus({});
    }
  }, []);

  useEffect(() => {
    reloadLockStatus();
  }, [reloadLockStatus]);

  const groupsLocked = lockStatus?.groups?.locked;

  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚽</span>
            <span className="font-semibold tracking-tight">WC2026 Predictions</span>
          </div>
          {user && (
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span className="hidden sm:inline">
                {user.team_name || user.email}
              </span>
              <button
                type="button"
                onClick={logout}
                className="text-slate-500 hover:text-slate-800 text-sm"
              >
                Log out
              </button>
            </div>
          )}
        </div>
        <TabBar />
        {groupsLocked && (
          <LockBanner message="Predictions locked — Group stage has kicked off." />
        )}
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <Outlet context={{ lockStatus: lockStatus || {}, reloadLockStatus }} />
      </main>

      {user && !isProfileComplete && <ProfileModal />}
    </div>
  );
}
