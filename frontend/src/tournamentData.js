// Static tournament data. Keep in sync with backend/tournament_data.py.
// The frontend needs FLAG_EMOJI and FIFA_RANKINGS for display + tiebreaker;
// GROUPS is convenient for tab labels and team validation.

export const GROUPS = {
  A: ["Mexico", "South Africa", "South Korea", "Czechia"],
  B: ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
  C: ["Brazil", "Morocco", "Haiti", "Scotland"],
  D: ["United States", "Paraguay", "Australia", "Turkey"],
  E: ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
  F: ["Netherlands", "Japan", "Sweden", "Tunisia"],
  G: ["Belgium", "Egypt", "Iran", "New Zealand"],
  H: ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
  I: ["France", "Senegal", "Iraq", "Norway"],
  J: ["Argentina", "Algeria", "Austria", "Jordan"],
  K: ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};

export const GROUP_LETTERS = Object.keys(GROUPS);

export const FLAG_EMOJI = {
  "Mexico": "🇲🇽", "South Africa": "🇿🇦", "South Korea": "🇰🇷", "Czechia": "🇨🇿",
  "Canada": "🇨🇦", "Bosnia and Herzegovina": "🇧🇦", "Qatar": "🇶🇦", "Switzerland": "🇨🇭",
  "Brazil": "🇧🇷", "Morocco": "🇲🇦", "Haiti": "🇭🇹",
  "Scotland": "🏴\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}",
  "United States": "🇺🇸", "Paraguay": "🇵🇾", "Australia": "🇦🇺", "Turkey": "🇹🇷",
  "Germany": "🇩🇪", "Curaçao": "🇨🇼", "Ivory Coast": "🇨🇮", "Ecuador": "🇪🇨",
  "Netherlands": "🇳🇱", "Japan": "🇯🇵", "Sweden": "🇸🇪", "Tunisia": "🇹🇳",
  "Belgium": "🇧🇪", "Egypt": "🇪🇬", "Iran": "🇮🇷", "New Zealand": "🇳🇿",
  "Spain": "🇪🇸", "Cape Verde": "🇨🇻", "Saudi Arabia": "🇸🇦", "Uruguay": "🇺🇾",
  "France": "🇫🇷", "Senegal": "🇸🇳", "Iraq": "🇮🇶", "Norway": "🇳🇴",
  "Argentina": "🇦🇷", "Algeria": "🇩🇿", "Austria": "🇦🇹", "Jordan": "🇯🇴",
  "Portugal": "🇵🇹", "DR Congo": "🇨🇩", "Uzbekistan": "🇺🇿", "Colombia": "🇨🇴",
  "England": "🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}",
  "Croatia": "🇭🇷", "Ghana": "🇬🇭", "Panama": "🇵🇦",
};

export const FIFA_RANKINGS = {
  Spain: 1, Argentina: 2, France: 3, England: 4,
  Brazil: 5, Portugal: 6, Netherlands: 7, Belgium: 8,
  Germany: 9, Croatia: 10, Morocco: 11, Colombia: 13,
  "United States": 14, "South Korea": 22, Ecuador: 23,
  Austria: 24, Australia: 26, Canada: 27, Norway: 29,
  Panama: 30, Senegal: 19, Japan: 18, Switzerland: 17,
  Tunisia: 40, Egypt: 34, Algeria: 35, Uruguay: 16,
  "Saudi Arabia": 60, "Cape Verde": 68, Iran: 20,
  Ghana: 72, "Ivory Coast": 42, "South Africa": 61,
  Czechia: 37, Sweden: 33, Turkey: 38,
  "Bosnia and Herzegovina": 65, Paraguay: 39, Iraq: 63,
  Jordan: 66, Uzbekistan: 50, "DR Congo": 58,
  Haiti: 84, Scotland: 36, "New Zealand": 86,
  "Curaçao": 82, Qatar: 51,
};

export function fifaRank(team) {
  return FIFA_RANKINGS[team] ?? 999;
}

export function flagFor(team) {
  return FLAG_EMOJI[team] ?? "";
}

// Reconstructs the 6-fixture round-robin order used by backend/tournament_data.py.
//   MD1: 1v2, 3v4
//   MD2: 1v3, 4v2
//   MD3: 4v1, 2v3
// Returns [{ team_a, team_b, matchday }, …]. Kept in sync manually with the
// backend; only used by the admin panel which can't hit /predictions routes.
export function buildGroupFixtures(letter) {
  const teams = GROUPS[letter];
  if (!teams || teams.length !== 4) return [];
  const [t1, t2, t3, t4] = teams;
  return [
    { team_a: t1, team_b: t2, matchday: 1 },
    { team_a: t3, team_b: t4, matchday: 1 },
    { team_a: t1, team_b: t3, matchday: 2 },
    { team_a: t4, team_b: t2, matchday: 2 },
    { team_a: t4, team_b: t1, matchday: 3 },
    { team_a: t2, team_b: t3, matchday: 3 },
  ];
}
