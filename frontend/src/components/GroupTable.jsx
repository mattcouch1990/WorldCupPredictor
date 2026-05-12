import { flagFor } from "../tournamentData";

const POSITION_STYLE = {
  1: "border-l-4 border-emerald-500 bg-emerald-50",
  2: "border-l-4 border-emerald-500 bg-emerald-50",
  3: "border-l-4 border-amber-400 bg-amber-50",
  4: "border-l-4 border-transparent bg-white text-slate-400",
};

export default function GroupTable({ rows, title, variant = "predicted" }) {
  const headerClass =
    variant === "actual"
      ? "bg-sky-700 text-white"
      : "bg-emerald-700 text-white";

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
      <div className={`${headerClass} px-4 py-2 text-sm font-semibold tracking-tight`}>
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-xs uppercase">
            <tr>
              <th className="py-2 px-2 text-left">#</th>
              <th className="py-2 px-2 text-left">Team</th>
              <th className="py-2 px-2 text-center">P</th>
              <th className="py-2 px-2 text-center">W</th>
              <th className="py-2 px-2 text-center">D</th>
              <th className="py-2 px-2 text-center">L</th>
              <th className="py-2 px-2 text-center">GF</th>
              <th className="py-2 px-2 text-center">GA</th>
              <th className="py-2 px-2 text-center">GD</th>
              <th className="py-2 px-2 text-center">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const pos = index + 1;
              return (
                <tr
                  key={row.team}
                  className={`${POSITION_STYLE[pos] || ""} border-t border-slate-100`}
                >
                  <td className="py-2 px-2 font-semibold">{pos}</td>
                  <td className="py-2 px-2">
                    <span className="mr-2 align-middle">{flagFor(row.team)}</span>
                    <span className="align-middle">{row.team}</span>
                  </td>
                  <td className="py-2 px-2 text-center">{row.played}</td>
                  <td className="py-2 px-2 text-center">{row.wins}</td>
                  <td className="py-2 px-2 text-center">{row.draws}</td>
                  <td className="py-2 px-2 text-center">{row.losses}</td>
                  <td className="py-2 px-2 text-center">{row.goals_for}</td>
                  <td className="py-2 px-2 text-center">{row.goals_against}</td>
                  <td className="py-2 px-2 text-center">{row.goal_difference}</td>
                  <td className="py-2 px-2 text-center font-semibold">{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
