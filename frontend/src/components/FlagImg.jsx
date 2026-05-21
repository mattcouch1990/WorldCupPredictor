import { countryCodeFor } from "../tournamentData";

// Renders a team flag as a flagcdn.com image. We use images (not emoji) because
// subdivision flags (🏴󠁧󠁢󠁥󠁮󠁧󠁿 England, 🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scotland) fall back to a plain black
// flag in most Chromium font stacks, and regional-indicator pair rendering
// varies wildly across OS/browser combinations.
export function FlagImg({ team, className = "" }) {
  if (!team) return null;
  const code = countryCodeFor(team);
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      width="20"
      height="15"
      alt={team}
      loading="lazy"
      className={`inline-block align-middle ${className}`.trim()}
    />
  );
}

export default FlagImg;
