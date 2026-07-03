import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useUnits } from "../data";
import { UnitImage } from "../components";
import type { UnitIndexEntry } from "../types";

const PAGE = 60;

export default function UnitList() {
  const { loading, units } = useUnits();

  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState("all");
  const [ranged, setRanged] = useState("all");
  const [page, setPage] = useState(0);

  const rarityOpts = useMemo(() => {
    const s = new Set<string>();
    (units || []).forEach((u) => s.add(u.rarity));
    return [...s].sort();
  }, [units]);

  const filtered = useMemo(() => {
    if (!units) return [] as UnitIndexEntry[];
    const term = q.trim().toLowerCase();
    return units.filter((u) => {
      if (rarity !== "all" && u.rarity !== rarity) return false;
      if (ranged !== "all" && String(u.ranged) !== ranged) return false;
      if (term) {
        const hay = [String(u.id), u.name || "", u.class || ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [units, q, rarity, ranged]);

  const resetPage =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(0);
    };

  if (loading) return <p className="loading">Loading units…</p>;

  const pages = Math.ceil(filtered.length / PAGE);
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder="Search id / name / class"
          value={q}
          onChange={(e) => resetPage(setQ)(e.target.value)}
        />
        <select value={rarity} onChange={(e) => resetPage(setRarity)(e.target.value)}>
          <option value="all">all rarities</option>
          {rarityOpts.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select value={ranged} onChange={(e) => resetPage(setRanged)(e.target.value)}>
          <option value="all">melee + ranged</option>
          <option value="true">ranged</option>
          <option value="false">melee</option>
        </select>
        <span className="count">{filtered.length.toLocaleString()} units</span>
      </div>

      <div className="enemy-grid">
        {shown.map((u) => (
          <Link to={`/units/${u.id}`} className="enemy-tile" key={u.id}>
            <UnitImage kind="icon" id={u.dot_id} className="unit-icon-thumb" alt={String(u.id)} />
            <div className="enemy-tile-body">
              <div className="enemy-tile-id">
                #{u.id} {u.name || "(unnamed)"}
              </div>
              <div className="enemy-tile-attr">
                {u.rarity} · {u.class || "?"} {u.ranged ? "(ranged)" : ""}
              </div>
              <div className="muted small">
                HP {(u.hp ?? 0).toLocaleString()} · ATK {(u.atk ?? 0).toLocaleString()} ·
                {" "}DEF {(u.def ?? 0).toLocaleString()}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {pages > 1 && (
        <div className="pager">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ‹ prev
          </button>
          <span className="muted small">page {page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            next ›
          </button>
        </div>
      )}
    </div>
  );
}
