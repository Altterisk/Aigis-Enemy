import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadJSONFile, useUnitInfluenceLabels, useLocalisation } from "../data";
import type { BuffRow, UnitInfluenceLabel } from "../types";

const STATS = [
  { k: "ATK", label: "ATK" },
  { k: "DEF", label: "DEF" },
  { k: "HP", label: "HP" },
  { k: "MR", label: "MR" },
  { k: "RNG", label: "Range" },
  { k: "ATK_DEBUFF", label: "ATK debuff" },
  { k: "DEF_DEBUFF", label: "DEF debuff" },
  { k: "MR_DEBUFF", label: "MR debuff" },
] as const;
type StatKey = (typeof STATS)[number]["k"];

const GROUP_PREVIEW = 10; // rows shown per type before "show all"

// skill mul3 values are normally "percent of base" TOTAL multipliers (130 =
// x1.3) -- EXCEPT 204/205 (UP-Consuming ATK/DEF buff), whose own note says
// "value is percent to ADD" (user-confirmed 2026-07-05: cap 80 = +80% =
// x1.8, not x0.8).
const SKILL_ADDITIVE_PCT = new Set([204, 205]);
// ability percent buffs are normally "+X%" ADDITIVE (stacks on top of
// 100%) -- EXCEPT ids whose own template is "→ {p1}%" (already a TOTAL
// percent-of-base multiplier, not a delta): Deployment Spot 134/135/136,
// Placement 207, Conqueror-type 197/198/199, Bard 304-307 (user 2026-07-05:
// "these should be x1.6 for example, not +... same with conqueror type atk
// buff"; bard modifier "is based on base, so 200% of base 50% is 100%").
const ABILITY_MULTIPLIER_PCT = new Set([134, 135, 136, 197, 198, 199, 207, 304, 305, 306, 307]);

function fmtValue(r: BuffRow): string {
  if (r.fl) return `+${r.v.toLocaleString()} flat`;
  const asMultiplier =
    (r.ns === "skill" && !SKILL_ADDITIVE_PCT.has(r.t)) ||
    (r.ns === "ability" && ABILITY_MULTIPLIER_PCT.has(r.t));
  if (asMultiplier && !r.stat.endsWith("_DEBUFF")) {
    return `x${(r.v / 100).toFixed(2).replace(/\.?0+$/, "")}`;
  }
  return r.stat.endsWith("_DEBUFF") ? `-${r.v}%` : `+${r.v}%`;
}

function rawTitle(r: BuffRow): string | undefined {
  const bits: string[] = [];
  if (r.p) bits.push(`raw: ${r.p.map((x) => x ?? 0).join(" / ")}`);
  if (r.mod?.length) bits.push(`includes modifier: ${r.mod.join(", ")}`);
  return bits.length ? bits.join(" — ") : undefined;
}

// Buff ranking, grouped by effect type (values are only comparable within
// one type), ranked by the buff's CAP. Taxonomy follows the wiki Buff
// System page; self-only, token-targeted and specific-unit buffs excluded.
export default function Buffs() {
  const [rows, setRows] = useState<BuffRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const labels = useUnitInfluenceLabels();
  const loc = useLocalisation();
  const [stat, setStat] = useState<StatKey>("ATK");
  const [ns, setNs] = useState<"all" | "skill" | "ability">("all");
  const [type, setType] = useState("all");

  useEffect(() => {
    loadJSONFile<BuffRow[]>("buff_index").then(setRows).catch(() => setFailed(true));
  }, []);

  const labelOf = (nsK: string, t: number): UnitInfluenceLabel | undefined =>
    (nsK === "skill" ? labels?.skill : labels?.ability)?.[String(t)];

  // per-type groups for the selected stat, each ranked by cap value,
  // one row per unit (its best), biggest groups first.
  const groups = useMemo(() => {
    const by = new Map<string, BuffRow[]>();
    (rows || []).forEach((r) => {
      if (r.stat !== stat) return;
      if (ns !== "all" && r.ns !== ns) return;
      const k = `${r.ns}:${r.t}`;
      if (type !== "all" && k !== type) return;
      let list = by.get(k);
      if (!list) by.set(k, (list = []));
      list.push(r);
    });
    return [...by.entries()]
      .map(([k, list]) => {
        const [nsK, t] = k.split(":");
        const seen = new Set<number>();
        const ranked = list
          .sort((a, b) => b.v - a.v)
          .filter((r) => {
            if (seen.has(r.u)) return false;
            seen.add(r.u);
            return true;
          });
        return { k, nsK, t: Number(t), ranked };
      })
      .sort((a, b) => b.ranked.length - a.ranked.length);
  }, [rows, stat, ns, type]);

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
        return { k, c, nsK, t: Number(t) };
      })
      .sort((a, b) => b.c - a.c);
  }, [rows, stat, ns]);

  if (failed) {
    return <p className="muted">buff_index.json not found — re-run export_units.py.</p>;
  }
  if (!rows) return <p className="loading">Loading buff index…</p>;

  const single = type !== "all";

  return (
    <div className="buffs-page">
      <h2>Buff ranking</h2>
      <p className="muted small">
        Ally buffs and enemy debuffs, one ranked list per effect type (values
        are only comparable within a type), ranked by the buff&apos;s cap — its
        max achievable value. Hover a value for the raw params. Self-only,
        1st-barrack, token-targeted and specific-unit rows are excluded.
      </p>
      <div className="toolbar unit-toolbar buff-toolbar">
        {STATS.map((s) => (
          <button
            key={s.k}
            className={`stat-tab${s.k === stat ? " active" : ""}${s.k.endsWith("_DEBUFF") ? " debuff-tab" : ""}`}
            onClick={() => { setStat(s.k); setType("all"); }}
          >
            {s.label}
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
            <option key={o.k} value={o.k}>
              {o.nsK} {o.t} — {labelOf(o.nsK, o.t)?.name || "?"} ({o.c})
            </option>
          ))}
        </select>
        <span className="count">{groups.length} effect types</span>
      </div>
      <div className="buff-groups">
        {groups.map((g) => {
          const lab = labelOf(g.nsK, g.t);
          const shown = single ? g.ranked : g.ranked.slice(0, GROUP_PREVIEW);
          return (
            <section key={g.k} className="buff-group">
              <header className="buff-group-head">
                <span className="buff-group-title">
                  {lab?.name || `type ${g.t}`}
                </span>
                <span className="buff-group-meta">
                  {g.nsK} {g.t} · {g.ranked.length} units
                  {lab && !lab.verified && <em className="unverified"> unverified</em>}
                </span>
              </header>
              <table className="grid buff-table">
                <thead>
                  <tr><th>#</th><th>Cap</th><th>Unit</th><th>Target</th><th>Source</th></tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={`${r.u}-${i}`}>
                      <td className="num muted">{i + 1}</td>
                      <td className="num buff-val" title={rawTitle(r)}>
                        <strong>{fmtValue(r)}</strong>
                        {r.mod?.length ? <span className="buff-mod">*</span> : null}
                      </td>
                      <td><Link to={`/units/${r.u}`}>#{r.u} {r.n}</Link></td>
                      <td className="muted small">{r.tgt ?? "-"}</td>
                      <td className="muted small">{loc?.classes[r.s] || r.s}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!single && g.ranked.length > GROUP_PREVIEW && (
                <button className="buff-more" onClick={() => setType(g.k)}>
                  show all {g.ranked.length}
                </button>
              )}
            </section>
          );
        })}
      </div>
      {single && (
        <button className="buff-more" onClick={() => setType("all")}>
          back to all types
        </button>
      )}
    </div>
  );
}
