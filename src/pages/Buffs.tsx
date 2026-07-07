import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadJSONFile, useUnitInfluenceLabels, useLocalisation } from "../data";
import { HumanText, fmtFrames } from "../components";
import type { BuffRow, UnitInfluenceLabel } from "../types";

const STATS = [
  { k: "ATK", label: "ATK" },
  { k: "DEF", label: "DEF" },
  { k: "HP", label: "HP" },
  { k: "MR", label: "MR" },
  { k: "RNG", label: "Range" },
  { k: "PAD_REDUCTION", label: "PAD Reduction" },
  { k: "CDR", label: "Skill CD Reduction" },
  { k: "ATK_DEBUFF", label: "ATK debuff" },
  { k: "DEF_DEBUFF", label: "DEF debuff" },
  { k: "MR_DEBUFF", label: "MR debuff" },
] as const;
type StatKey = (typeof STATS)[number]["k"];

const GROUP_PREVIEW = 10; // rows shown per type before "show all"

// skill mul3 values are normally "percent of base" TOTAL multipliers (130 =
// x1.3) -- EXCEPT 204/205 (UP-Consuming ATK/DEF buff), whose value is a
// percent to ADD (cap 80 = +80% = x1.8, not x0.8).
const SKILL_ADDITIVE_PCT = new Set([204, 205]);
// ability percent buffs are normally "+X%" ADDITIVE (stacks on top of
// 100%) -- EXCEPT ids whose own template is "→ {p1}%" (already a TOTAL
// percent-of-base multiplier, not a delta): Deployment Spot 134/135/136,
// Placement 207, Conqueror-type 197/198/199, Lukifer Death HP/ATK/DEF/MR
// buff 155/156/157/158. Bard 304-307 do NOT belong here -- their raw
// MulMax is additive (+X%) same as Sortie/Deployment; a bare, unboosted
// MulMax (e.g. a carrier with no boost skill at all) would otherwise
// render as a bogus "x0.25 debuff" instead of "+25%".
const ABILITY_MULTIPLIER_PCT = new Set([134, 135, 136, 155, 156, 157, 158, 197, 198, 199, 207]);

// skill 14 (Set PAD): sets PAD to a flat frame count, lower is better --
// the opposite direction/shape of every other group on this page.
const isSetPad = (r: BuffRow) => r.ns === "skill" && r.t === 14;

// "_DEBUFF" stats are enemy-facing reductions; PAD_REDUCTION/CDR are ALLY
// buffs but still phrased as a reduction -- none of these are ever shown
// as a multiplier, always a plain "-X%".
const isReduction = (r: BuffRow) =>
  r.stat.endsWith("_DEBUFF") || r.stat === "PAD_REDUCTION" || r.stat === "CDR";

function fmtValue(r: BuffRow): string {
  if (isSetPad(r)) return `→ ${fmtFrames(r.v)}`;
  if (r.fl) return `+${r.v.toLocaleString()} flat`;
  const asMultiplier =
    (r.ns === "skill" && !SKILL_ADDITIVE_PCT.has(r.t)) ||
    (r.ns === "ability" && ABILITY_MULTIPLIER_PCT.has(r.t));
  if (asMultiplier && !isReduction(r)) {
    return `x${(r.v / 100).toFixed(2).replace(/\.?0+$/, "")}`;
  }
  return isReduction(r) ? `-${r.v}%` : `+${r.v}%`;
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadJSONFile<BuffRow[]>("buff_index").then(setRows).catch(() => setFailed(true));
  }, []);

  const labelOf = (nsK: string, t: number): UnitInfluenceLabel | undefined =>
    (nsK === "skill" ? labels?.skill : labels?.ability)?.[String(t)];

  // display names for rows carrying a `grp` override.
  const GRP_NAME: Record<string, string> = {
    sortie_atk: "Sortie ATK Buff", deploy_atk: "Deployment ATK Buff",
    sortie_def: "Sortie DEF Buff", deploy_def: "Deployment DEF Buff",
    war_god_blessing_atk: "War God Blessing ATK Buff",
    war_god_blessing_def: "War God Blessing DEF Buff",
  };
  const groupKey = (r: BuffRow) => r.grp ?? `${r.ns}:${r.t}`;

  // every group for the selected stat, each ranked by cap value, one row
  // per unit (its best), biggest groups first.
  const groups = useMemo(() => {
    const by = new Map<string, BuffRow[]>();
    (rows || []).forEach((r) => {
      if (r.stat !== stat) return;
      const k = groupKey(r);
      let list = by.get(k);
      if (!list) by.set(k, (list = []));
      list.push(r);
    });
    return [...by.entries()]
      .map(([k, list]) => {
        const grp = list[0].grp;
        const nsK = list[0].ns;
        const t = list[0].t;
        const seen = new Set<number>();
        const ranked = list
          .sort((a, b) => (isSetPad(a) ? a.v - b.v : b.v - a.v))
          .filter((r) => {
            if (seen.has(r.u)) return false;
            seen.add(r.u);
            return true;
          });
        return { k, grp, nsK, t, ranked };
      })
      .sort((a, b) => b.ranked.length - a.ranked.length);
  }, [rows, stat]);

  if (failed) {
    return <p className="muted">buff_index.json not found — re-run export_units.py.</p>;
  }
  if (!rows) return <p className="loading">Loading buff index…</p>;

  const toggleExpanded = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  return (
    <div className="buffs-page">
      <h2>Buff ranking</h2>
      <p className="muted small">
        Ally buffs and enemy debuffs, one ranked list per effect type (values
        are only comparable within a type), ranked by the buff&apos;s cap — its
        max achievable value. Hover a value for the raw params. Self-only,
        1st-barrack, token-targeted and specific-unit rows are excluded.
      </p>

      <div className="toolbar buff-toolbar">
        {STATS.map((s) => (
          <button
            key={s.k}
            className={`stat-tab${s.k === stat ? " active" : ""}${s.k.endsWith("_DEBUFF") ? " debuff-tab" : ""}`}
            onClick={() => setStat(s.k)}
          >
            {s.label}
          </button>
        ))}
        <span className="count">{groups.length} effect types</span>
      </div>
      <div className="buff-groups">
        {groups.map((g) => {
          const lab = g.grp ? undefined : labelOf(g.nsK, g.t);
          const isExpanded = expanded.has(g.k);
          const shown = isExpanded ? g.ranked : g.ranked.slice(0, GROUP_PREVIEW);
          return (
            <section key={g.k} className="buff-group">
              <header className="buff-group-head">
                <span className="buff-group-title">
                  {g.grp ? GRP_NAME[g.grp] || g.grp : lab?.name || `type ${g.t}`}
                </span>
                <span className="buff-group-meta">
                  {g.grp ? g.nsK : `${g.nsK} ${g.t}`} · {g.ranked.length} units
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
                      <td className="muted small">
                        {typeof r.tgt === "string" ? <HumanText text={r.tgt} /> : (r.tgt ?? "-")}
                      </td>
                      <td className="muted small">{loc?.classes[r.s] || r.s}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {g.ranked.length > GROUP_PREVIEW && (
                <button className="buff-more" onClick={() => toggleExpanded(g.k)}>
                  {isExpanded ? "collapse" : `expand (${g.ranked.length})`}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
