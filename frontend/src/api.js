// Centralised fetch wrapper. Every component goes through these helpers so
// JWT handling and 401 redirects live in exactly one place.

const TOKEN_KEY = "wc2026_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
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
    res = await fetch(path, {
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
