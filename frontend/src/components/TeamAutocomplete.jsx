import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FLAG_EMOJI, GROUPS } from "../tournamentData";

const ALL_TEAMS = Object.values(GROUPS).flat();

function filterTeams(query, teams) {
  const q = query.trim().toLowerCase();
  if (!q) return teams.slice(0, 12);
  return teams.filter((t) => t.toLowerCase().includes(q)).slice(0, 12);
}

export default function TeamAutocomplete({
  value,
  onChange,
  disabled = false,
  placeholder = "— TBD —",
  teams = ALL_TEAMS,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const options = useMemo(() => filterTeams(query, teams), [query, teams]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  const commit = useCallback(
    (team) => {
      if (team) onChange?.(team);
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    },
    [onChange],
  );

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const choice = options[activeIndex];
      if (choice) commit(choice);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  if (disabled) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm">
        {value ? (
          <>
            <span className="text-base leading-none">
              {FLAG_EMOJI[value] || ""}
            </span>
            <span className="truncate">{value}</span>
          </>
        ) : (
          <span className="text-slate-400 italic">{placeholder}</span>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        aria-label={ariaLabel || "Select team"}
        className={`w-full flex items-center gap-2 px-2 py-1 text-sm rounded border text-left transition ${
          value
            ? "bg-white border-slate-200 hover:border-slate-400"
            : "bg-slate-50 border-dashed border-slate-300 text-slate-400 italic hover:border-slate-400"
        }`}
      >
        {value ? (
          <>
            <span className="text-base leading-none">
              {FLAG_EMOJI[value] || ""}
            </span>
            <span className="truncate flex-1">{value}</span>
          </>
        ) : (
          <span className="truncate flex-1">{placeholder}</span>
        )}
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type to search…"
            className="w-full px-2 py-1.5 text-sm border-b border-slate-200 outline-none focus:bg-slate-50"
          />
          <ul className="max-h-60 overflow-y-auto" role="listbox">
            {options.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-400 italic">
                No matches
              </li>
            )}
            {options.map((team, i) => (
              <li
                key={team}
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(team);
                }}
                className={`flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer ${
                  i === activeIndex
                    ? "bg-blue-50 text-blue-900"
                    : "hover:bg-slate-50"
                }`}
              >
                <span className="text-base leading-none">
                  {FLAG_EMOJI[team] || ""}
                </span>
                <span className="truncate">{team}</span>
              </li>
            ))}
          </ul>
          {value && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange?.(null);
                setOpen(false);
                setQuery("");
              }}
              className="w-full px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 border-t border-slate-200 text-left"
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
