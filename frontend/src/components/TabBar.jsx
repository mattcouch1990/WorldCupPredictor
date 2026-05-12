import { NavLink } from "react-router-dom";
import { GROUP_LETTERS } from "../tournamentData";

const navItemBase =
  "shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap";
const navItemInactive =
  "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300";
const navItemActive = "border-emerald-600 text-emerald-700";

function classFor({ isActive }) {
  return `${navItemBase} ${isActive ? navItemActive : navItemInactive}`;
}

export default function TabBar() {
  return (
    <nav className="bg-white border-b border-slate-200">
      <div className="flex overflow-x-auto no-scrollbar">
        {GROUP_LETTERS.map((letter) => (
          <NavLink key={letter} to={`/group/${letter}`} className={classFor}>
            Group {letter}
          </NavLink>
        ))}
        <NavLink to="/knockout" className={classFor}>
          Knockout
        </NavLink>
        <NavLink to="/leaderboard" className={classFor}>
          Leaderboard
        </NavLink>
      </div>
    </nav>
  );
}
