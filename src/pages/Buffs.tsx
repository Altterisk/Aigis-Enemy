import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadJSONFile, useUnitInfluenceLabels, useLocalisation } from "../data";
import type { BuffRow, UnitInfluenceLabel } from "../types";

const STATS = ["ATK", "DEF", "HP", "MR"] as const;
type Stat = (typeof STATS)[number];

// Buff ranking: HP/ATK/DEF/MR buffs from skills and abilities, ranked by raw
// value. Self-only rows are excluded at export (a skill's self ATK row is
// that skill's own modifier, not a comparable buff). Values are RAW: skill
// mul3 450 = ×4.5, ability p1 usually a percent — the effect column names
// the exact type so semantics stay checkable.
export default function Buffs() {
  const [rows, setRows] = useState<BuffRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const labels = useUnitInfluenceLabels();
  const loc = useLocalisation();
  const [stat, setStat] = useState<Stat>("ATK");
  const [ns, setNs] = useState<"all" | "skill" | "ability">("all");
  const [type, setType] = useState("all");

  useEffect(() => {
    loadJSONFile<BuffRow[]>("buff_index").then(setRows).catch(() => setFailed(true));
  }, []);

  const labelOf = (nsK: string, t: number): UnitInfluenceLabel | undefined =>
    (nsK === "skill" ? labels?.skill : labels?.ability)?.[String(t)];

  // effect types present for the selected stat (for the optional narrower filter)
  const typeOpts = useMemo(() => {
    const seen = new Map<string, number>();
    (rows || []).forEach((r) => {
      if (r.stat !== stat) return;
      if (ns !== "all" && r.ns !== ns) return;
      const k = `${r.ns}:${r.t}`;
      seen.set(k, (seen.get(k) || 0) + 1);
    });
    return [...seen.entries()]
      .map(([k, c]) => {
        const [nsK, t] = k.split(":");
        return { k, c, name: labelOf(nsK, Number(t))?.name || `type ${t}`, nsK, t };
      })
      .sort((a, b) => b.c - a.c);
  }, [rows, stat, ns, labels]);

  const ranked = useMemo(() => {
    const seen = new Set<string>();
    return (rows || [])
      .filter((r) => r.stat === stat)
      .filter((r) => ns === "all" || r.ns === ns)
      .filter((r) => type === "all" || `${r.ns}:${r.t}` === type)
      .sort((a, b) => b.v - a.v)
      .filter((r) => {
        const k = `${r.u}:${r.ns}:${r.t}:${r.s}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 150);
  }, [rows, stat, ns, type]);

  if (failed) {
    return <p className="muted">buff_index.json not found — re-run export_units.py.</p>;
  }
  if (!rows) return <p className="loading">Loading buff index…</p>;

  return (
    <div>
      <h2>Buff ranking</h2>
      <p className="muted small">
        HP / ATK / DEF / MR buffs from skills and abilities, ranked by raw value
        (skill mul3: 450 = ×4.5; ability p1: usually percent — the effect column
        names the exact type). Self-only rows are excluded.
      </p>
      <div className="toolbar unit-toolbar">
        {STATS.map((s) => (
          <button
            key={s}
            className={`stat-tab${s === stat ? " active" : ""}`}
            onClick={() => { setStat(s); setType("all"); }}
          >
            {s}
          </button>
        ))}
        <select value={ns} onChange={(e) => { setNs(e.target.value as typeof ns); setType("all"); }}>
          <option value="all">skills + abilities</option>
          <option value="skill">skills only</option>
          <option value="ability">abilities only</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">all effect types</option>
          {typeOpts.map((o) => (
            <option key={o.k} value={o.k}>{o.nsK} {o.t} — {o.name} ({o.c})</option>
          ))}
        </select>
        <span className="count">{ranked.length} rows</span>
      </div>
      <table className="grid unit-detail-table">
        <thead>
          <tr><th>#</th><th>Value</th><th>Unit</th><th>Effect</th><th>Source</th></tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => {
            const lab = labelOf(r.ns, r.t);
            return (
              <tr key={`${r.u}-${r.ns}-${r.t}-${r.s}`}>
                <td className="num">{i + 1}</td>
                <td className="num"><strong>{r.v.toLocaleString()}</strong></td>
                <td><Link to={`/units/${r.u}`}>#{r.u} {r.n}</Link></td>
                <td className="small">{r.ns} {r.t} — {lab?.name || "?"}</td>
                <td className="muted small">{loc?.classes[r.s] || r.s}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
