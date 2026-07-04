import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadJSONFile, useUnitInfluenceLabels, useLocalisation } from "../data";
import type { BuffRow, UnitInfluenceLabel } from "../types";

// Buff ranking: every labeled skill/ability influence row with a concrete
// value (skill mul3 / ability param 1), grouped by effect type -- pick an
// effect and see which units carry the highest value. Values are RAW (a
// skill mul3 of 450 = x4.5, an ability p1 usually a percent) -- interpret
// with the effect's template semantics.
export default function Buffs() {
  const [rows, setRows] = useState<BuffRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const labels = useUnitInfluenceLabels();
  const loc = useLocalisation();
  const [ns, setNs] = useState<"skill" | "ability">("skill");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    loadJSONFile<BuffRow[]>("buff_index").then(setRows).catch(() => setFailed(true));
  }, []);

  const labelOf = (nsK: "skill" | "ability", t: number): UnitInfluenceLabel | undefined =>
    (nsK === "skill" ? labels?.skill : labels?.ability)?.[String(t)];

  // effect types available in the selected namespace, with usage counts
  const typeOpts = useMemo(() => {
    const counts = new Map<number, number>();
    (rows || []).forEach((r) => {
      if (r.ns === ns) counts.set(r.t, (counts.get(r.t) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([t, c]) => ({ t, c, name: labelOf(ns, t)?.name || `type ${t}` }))
      .filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.c - a.c);
  }, [rows, ns, labels, q]);

  const ranked = useMemo(() => {
    if (!type) return [];
    const tN = Number(type);
    const seen = new Set<string>();
    return (rows || [])
      .filter((r) => r.ns === ns && r.t === tN)
      .sort((a, b) => b.v - a.v)
      .filter((r) => {
        // one row per unit+slot (dedupe repeated stages)
        const k = `${r.u}:${r.s}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 100);
  }, [rows, ns, type]);

  if (failed) {
    return <p className="muted">buff_index.json not found — re-run export_units.py.</p>;
  }
  if (!rows) return <p className="loading">Loading buff index…</p>;

  const lab = type ? labelOf(ns, Number(type)) : undefined;

  return (
    <div>
      <h2>Buff ranking</h2>
      <p className="muted small">
        pick an effect type to rank units by its raw value (skill mul3: 450 = ×4.5;
        ability param 1: usually a percent — see the effect's own template semantics).
      </p>
      <div className="toolbar unit-toolbar">
        <select value={ns} onChange={(e) => { setNs(e.target.value as "skill" | "ability"); setType(""); }}>
          <option value="skill">skill effects</option>
          <option value="ability">ability effects</option>
        </select>
        <input
          placeholder="filter effect names"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">— pick an effect ({typeOpts.length}) —</option>
          {typeOpts.map((o) => (
            <option key={o.t} value={String(o.t)}>{o.t} — {o.name} ({o.c})</option>
          ))}
        </select>
      </div>
      {type && (
        <>
          {lab?.note && <p className="muted small">{lab.note}</p>}
          <table className="grid unit-detail-table">
            <thead>
              <tr><th>#</th><th>Value</th><th>Unit</th><th>Source</th></tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={`${r.u}-${r.s}`}>
                  <td className="num">{i + 1}</td>
                  <td className="num"><strong>{r.v.toLocaleString()}</strong></td>
                  <td><Link to={`/units/${r.u}`}>#{r.u} {r.n}</Link></td>
                  <td className="muted">{loc?.classes[r.s] || r.s}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
