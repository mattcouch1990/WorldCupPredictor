// Centralised fetch wrapper. Every component goes through these helpers so
// JWT handling and 401 redirects live in exactly one place.

// In production the SPA is served by the frontend nginx container, which
// proxies /api/* to the backend. In dev the Vite proxy handles bare paths
// like /auth, /tournament, etc. — so API_BASE must be empty there.
const API_BASE = import.meta.env.PROD ? "/api" : "";

const TOKEN_KEY = "wc2026_token";
const ADMIN_TOKEN_KEY = "wc2026_admin_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token) {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, { status, detail } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError("Network error", { status: 0, detail: err.message });
  }

  if (res.status === 401 && auth) {
    setToken(null);
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError("Unauthorized", { status: 401 });
  }

  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? payload.detail
        : payload || res.statusText;
    throw new ApiError(typeof detail === "string" ? detail : "Request failed", {
      status: res.status,
      detail,
    });
  }

  return payload;
}

// --- Auth ----------------------------------------------------------------

export function login(email, passcode) {
  return request("/auth/login", {
    method: "POST",
    body: { email, passcode },
    auth: false,
  });
}

export function getMe() {
  return request("/auth/me");
}

export function submitProfile(realName, teamName) {
  return request("/auth/profile", {
    method: "POST",
    body: { real_name: realName, team_name: teamName },
  });
}

// --- Tournament ----------------------------------------------------------

export function getLockStatus() {
  return request("/tournament/lock-status", { auth: false });
}

export function getGroupResults(group) {
  return request(`/tournament/results/group/${group}`);
}

export function getKnockoutResults() {
  return request("/tournament/results/knockout");
}

// --- Predictions ---------------------------------------------------------

export function getGroupPredictions(group) {
  return request(`/predictions/group/${group}`);
}

export function getAllGroupPredictions() {
  return request("/predictions/group/all");
}

export function patchGroupPrediction(group, teamA, teamB, goalsA, goalsB) {
  return request(`/predictions/group/${group}`, {
    method: "PATCH",
    body: {
      team_a: teamA,
      team_b: teamB,
      pred_goals_a: goalsA,
      pred_goals_b: goalsB,
    },
  });
}

export function getKnockoutPredictions() {
  return request("/predictions/knockout");
}

export function patchKnockoutPrediction(round, slotIndex, predictedTeam) {
  return request("/predictions/knockout", {
    method: "PATCH",
    body: {
      round,
      slot_index: slotIndex,
      predicted_team: predictedTeam,
    },
  });
}

export function getSpecialPredictions() {
  return request("/predictions/special");
}

export function patchSpecialPredictions(payload) {
  return request("/predictions/special", {
    method: "PATCH",
    body: payload,
  });
}

// --- Leaderboard ---------------------------------------------------------

export function getLeaderboard() {
  return request("/leaderboard", { auth: false });
}

// --- Admin --------------------------------------------------------------
// Uses a separate JWT (wc2026_admin_token) so admin sessions don't
// interfere with a logged-in user on the same browser.

async function adminFetch(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError("Network error", { status: 0, detail: err.message });
  }

  if (res.status === 401 || res.status === 403) {
    setAdminToken(null);
    if (window.location.pathname !== "/admin") {
      window.location.href = "/admin";
    }
    throw new ApiError("Admin unauthorized", { status: res.status });
  }

  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? payload.detail
        : payload || res.statusText;
    throw new ApiError(typeof detail === "string" ? detail : "Request failed", {
      status: res.status,
      detail,
    });
  }
  return payload;
}

export function adminLogin(password) {
  return fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  }).then(async (res) => {
    const text = await res.text();
    const payload = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const detail =
        payload && typeof payload === "object" && "detail" in payload
          ? payload.detail
          : res.statusText;
      throw new ApiError(typeof detail === "string" ? detail : "Login failed", {
        status: res.status,
        detail,
      });
    }
    return payload;
  });
}

export function getAdminGroupResults() {
  return adminFetch("/admin/results/group");
}

export function postAdminGroupResult(group, teamA, teamB, goalsA, goalsB) {
  return adminFetch("/admin/results/group", {
    method: "POST",
    body: {
      group,
      team_a: teamA,
      team_b: teamB,
      goals_a: goalsA,
      goals_b: goalsB,
    },
  });
}

export function getAdminKnockoutResults() {
  return adminFetch("/admin/results/knockout");
}

export function postAdminKnockoutResult(round, slotIndex, winningTeam) {
  return adminFetch("/admin/results/knockout", {
    method: "POST",
    body: {
      round,
      slot_index: slotIndex,
      winning_team: winningTeam,
    },
  });
}

export function postAdminLock(round) {
  return adminFetch(`/admin/lock/${round}`, { method: "POST" });
}

export function postAdminUnlock(round) {
  return adminFetch(`/admin/unlock/${round}`, { method: "POST" });
}

export function deleteAdminLockOverride(round) {
  return adminFetch(`/admin/lock/${round}`, { method: "DELETE" });
}

export function getAdminLockStatus() {
  return adminFetch("/admin/lock-status");
}

export function getAdminUsers() {
  return adminFetch("/admin/users");
}

export function postAdminUser(email) {
  return adminFetch("/admin/users", { method: "POST", body: { email } });
}

export function deleteAdminUser(userId) {
  return adminFetch(`/admin/users/${userId}`, { method: "DELETE" });
}

export function postAdminRecomputeScores() {
  return adminFetch("/admin/recompute-scores", { method: "POST" });
}

export function getAdminTopGoalscorer() {
  return adminFetch("/admin/top-goalscorer");
}

export function postAdminTopGoalscorer(name) {
  return adminFetch("/admin/top-goalscorer", {
    method: "POST",
    body: { name },
  });
}

export function getAdminTournamentGoals() {
  return adminFetch("/admin/tournament-goals");
}

export function postAdminTournamentGoals(total) {
  return adminFetch("/admin/tournament-goals", {
    method: "POST",
    body: { total },
  });
}
