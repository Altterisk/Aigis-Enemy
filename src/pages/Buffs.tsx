import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadJSONFile, useUnitInfluenceLabels, useLocalisation, useUnits } from "../data";
import { HumanText, UnitIconLink, fmtFrames } from "../components";
import type { BuffRow, InfluenceSelectionRule, UnitInfluenceLabel } from "../types";
import { influenceSelectionRule } from "../influenceLabels";

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
  { k: "PAD_DEBUFF", label: "Enemy PAD increase" },
  { k: "DMG_AMP", label: "Enemy damage taken" },
] as const;
// non-stat effect categories (second tab row): innate abilities + effects
// granted to allies, each row carrying its application condition. Token-
// sourced rows are attributed to the owner (source column names the token).
const EFFECTS = [
  { k: "MAKAI", label: "Makai" },
  { k: "TENKAI", label: "Tenkai" },
  { k: "WEATHER", label: "Weather" },
  { k: "DEEPSEA", label: "Deep Sea" },
  { k: "STATUS", label: "Status Ailments" },
  { k: "STEALTH", label: "Stealth" },
  { k: "TAUNT", label: "Taunt" },
  { k: "EVASION", label: "Evasion" },
  { k: "NULLIFY", label: "Nullification" },
  { k: "INVULN", label: "Invulnerability" },
  { k: "BARRIER", label: "Barrier" },
  { k: "LIMIT", label: "Deploy Limit" },
  { k: "HPCUT", label: "HP Cut" },
  { k: "TIMESTOP", label: "Time Stop" },
] as const;
type StatKey = (typeof STATS)[number]["k"] | (typeof EFFECTS)[number]["k"];

const TARGET_SCOPE_OPTIONS = [
  { value: "range", label: "In range / nearby" },
  { value: "all", label: "All" },
  { value: "self", label: "Self" },
  { value: "enemy", label: "Enemies" },
];

function targetScopeMatches(target: string, scope: string): boolean {
  const text = target.toLowerCase();
  if (scope === "range") return /in range|nearby|within range|enemy_in_range/.test(text);
  if (scope === "all") return /^all\b/.test(text);
  if (scope === "self") return /^self\b/.test(text);
  return text.includes("enemy");
}

function TargetCheckboxGroup({
  title, options, selected, onToggle,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div className="filter-group">
      <div className="filter-group-title">{title}</div>
      <div className="filter-group-options">
        {options.map((option) => (
          <label key={option.value} className={`cg-pill${selected.includes(option.value) ? " on" : ""}`}>
            <input
              type="checkbox"
              value={option.value}
              checked={selected.includes(option.value)}
              onChange={() => onToggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

const GROUP_PREVIEW = 10; // rows shown per type before "show all"

const buffSelectionRule = (r: BuffRow): InfluenceSelectionRule | undefined =>
  r.ns === "special" ? undefined : influenceSelectionRule(r.ns, r.t);

const RULE_TEXT: Partial<Record<InfluenceSelectionRule, string>> = {
  highest_value: "Highest value applies; these rows do not stack within the group.",
  highest_duration: "Longest duration takes priority; effect value does not decide the winner.",
  additive: "Rows in this group stack additively.",
  additive_then_sortie_multiplicative: "These add with each other, then multiply with sortie HP buffs.",
  highest_within_stack_id: "Only the highest value within the same stack ID applies.",
};

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
const ABILITY_MULTIPLIER_PCT = new Set([134, 135, 136, 155, 156, 157, 158, 197, 198, 199, 207,
  221]);

// skill 14 (Set PAD): sets PAD to a flat frame count, lower is better --
// the opposite direction/shape of every other group on this page.
const isSetPad = (r: BuffRow) => r.ns === "skill" && r.t === 14;

// "_DEBUFF" stats are enemy-facing reductions; PAD_REDUCTION/CDR are ALLY
// buffs but still phrased as a reduction -- none of these are ever shown
// as a multiplier, always a plain "-X%". PAD_DEBUFF is the exception among
// the enemy-facing stats: it LENGTHENS enemy post-attack delay, so it keeps
// the "+X%" form.
const isReduction = (r: BuffRow) =>
  r.stat !== "PAD_DEBUFF" &&
  (r.stat.endsWith("_DEBUFF") || r.stat === "PAD_REDUCTION" || r.stat === "CDR");

function fmtValue(r: BuffRow): string {
  // effect rows carry an explicit value kind
  if (r.vk === "flag") return "✓";
  if (r.vk === "sec") return r.v >= 9999 ? "∞ (permanent)" : `${r.v}s`;
  if (r.vk === "flat") return `${r.v.toLocaleString()} flat`;
  if (r.vk === "pct") return `${r.v}%`;
  // Dancer share: the value is a percent of the SOURCE unit's own stat,
  // added flat to everyone in range -- not a percent of the target's stat.
  if (r.vk === "share") return `${r.v}% of own ${r.stat}`;
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
  const { units } = useUnits();
  // selected tab lives in the URL so back/forward and shared links restore it
  const [params, setParams] = useSearchParams();
  const rawStat = params.get("stat") || "ATK";
  const stat: StatKey = ([...STATS, ...EFFECTS].some((s) => s.k === rawStat)
    ? rawStat : "ATK") as StatKey;
  const setStat = (k: StatKey) => {
    const next = new URLSearchParams(params);
    if (k === "ATK") next.delete("stat"); else next.set("stat", k);
    setParams(next, { replace: true });
  };
  const csv = (key: string): string[] => {
    const value = params.get(key);
    return value ? value.split(",").filter(Boolean) : [];
  };
  const targetScope = csv("targetScope");
  const targetFaction = csv("targetFaction");
  const targetRace = csv("targetRace");
  const targetAttr = csv("targetAttr");
  const targetSeason = csv("targetSeason");
  const targetClass = csv("targetClass");
  const targetFilterCount = targetScope.length + targetFaction.length + targetRace.length
    + targetAttr.length + targetSeason.length + targetClass.length;
  const [showTargetFilters, setShowTargetFilters] = useState(false);
  const toggleTarget = (key: string, selected: string[], value: string) => {
    const next = new URLSearchParams(params);
    const values = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    if (values.length) next.set(key, values.join(",")); else next.delete(key);
    setParams(next, { replace: true });
  };
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const isEffect = EFFECTS.some((e) => e.k === stat);

  useEffect(() => {
    loadJSONFile<BuffRow[]>("buff_index").then(setRows).catch(() => setFailed(true));
  }, []);

  const labelOf = (nsK: string, t: number): UnitInfluenceLabel | undefined =>
    (nsK === "skill" ? labels?.skill : labels?.ability)?.[String(t)];

  const targetOptions = useMemo(() => {
    const tagValues = new Set<string>();
    const classValues = new Set<string>();
    (rows || []).forEach((row) => {
      if (row.stat !== stat) return;
      const target = String(row.tgt ?? "");
      for (const match of target.matchAll(/\[\[tag:([^\]]+)\]\]/g)) tagValues.add(match[1]);
      for (const match of target.matchAll(/\[\[class:([^\]]+)\]\]/g)) classValues.add(match[1]);
    });
    const factions = new Set<string>();
    const races = new Set<string>();
    const attrs = new Set<string>();
    const seasons = new Set<string>();
    (units || []).forEach((unit) => {
      if (unit.faction && tagValues.has(unit.faction)) factions.add(unit.faction);
      if (unit.race && tagValues.has(unit.race)) races.add(unit.race);
      (unit.identity_tags || []).forEach((tag) => {
        if (tagValues.has(tag)) attrs.add(tag);
      });
      if (unit.genus && tagValues.has(unit.genus)) seasons.add(unit.genus);
    });
    const options = (values: Set<string>, translations?: Record<string, string>) =>
      [...values]
        .map((value) => ({ value, label: translations?.[value] || value }))
        .sort((a, b) => a.label.localeCompare(b.label));
    return {
      factions: options(factions, loc?.races),
      races: options(races, loc?.races),
      attrs: options(attrs, loc?.tags),
      seasons: options(seasons, loc?.tags),
      classes: options(classValues, loc?.classes),
    };
  }, [rows, units, loc, stat]);

  const targetMatches = (row: BuffRow): boolean => {
    const target = String(row.tgt ?? "");
    if (targetScope.length && !targetScope.some((scope) => targetScopeMatches(target, scope))) return false;
    const hasTag = (values: string[]) => values.some((value) => target.includes(`[[tag:${value}]]`));
    if (targetFaction.length && !hasTag(targetFaction)) return false;
    if (targetRace.length && !hasTag(targetRace)) return false;
    if (targetAttr.length && !hasTag(targetAttr)) return false;
    if (targetSeason.length && !hasTag(targetSeason)) return false;
    if (targetClass.length && !targetClass.some((value) => target.includes(`[[class:${value}]]`))) return false;
    return true;
  };

  // display names for rows carrying a `grp` override.
  const GRP_NAME: Record<string, string> = {
    sortie_atk: "Sortie ATK Buff", deploy_atk: "Deployment ATK Buff",
    sortie_def: "Sortie DEF Buff", deploy_def: "Deployment DEF Buff",
    war_god_blessing_atk: "War God Blessing ATK Buff",
    war_god_blessing_def: "War God Blessing DEF Buff",
    bard_hp_stack_1: "Bard HP Buff (stack 1)",
    bard_atk_stack_1: "Bard ATK Buff (stack 1)",
    bard_def_stack_1: "Bard DEF Buff (stack 1)",
    bard_mr_stack_1: "Bard MR Buff (stack 1)",
    bard_hp_stack_2: "Bard-like Token HP Buff (stack 2)",
    bard_atk_stack_2: "Bard-like Token ATK Buff (stack 2)",
    bard_def_stack_2: "Bard-like Token DEF Buff (stack 2)",
    bard_mr_stack_2: "Bard-like Token MR Buff (stack 2)",
    makai_reduction: "Makai Effect Reduction (ability 73/74/75)",
    makai_immunity: "Makai Adaptation (ability 112/113)",
    tenkai_reduction: "Tenkai Effect Reduction (ability 181/182/183)",
    tenkai_immunity: "Tenkai Immunity (ability 184/185/186)",
    special_stealth: "Stealth (special property 16)",
    special_limit: "Doesn't count against deployment limit (special property 13)",
    missile_timestop: "100% slow missile (time stop on hit)",
    field_hpcut: "Max-HP damage field",
  };
  const groupName = (
    grp: string,
    nsK: BuffRow["ns"],
    t: number,
  ): string => {
    const known = GRP_NAME[grp];
    if (known) return known;
    const stack = /^ability_(\d+)_stack_(\d+)$/.exec(grp);
    if (stack) {
      const name = labelOf(nsK, t)?.name || `ability ${t}`;
      return `${name} (stack ${stack[2]})`;
    }
    return grp;
  };
  const groupKey = (r: BuffRow) => r.grp ?? `${r.ns}:${r.t}`;

  // every group for the selected stat, each ranked by cap value, one row
  // per unit (its best), biggest groups first.
  const groups = useMemo(() => {
    const by = new Map<string, BuffRow[]>();
    (rows || []).forEach((r) => {
      if (r.stat !== stat || !targetMatches(r)) return;
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
        // Functional groups can combine legacy/new ids (e.g. sortie ATK
        // ability 13 + 70); take the confirmed rule from any member rather
        // than depending on which id happened to be exported first.
        const rule = list
          .map(buffSelectionRule)
          .find((candidate) => candidate != null);
        const ranked = list
          .sort((a, b) => rule === "highest_duration"
            ? (b.selection_priority ?? 0) - (a.selection_priority ?? 0)
            : (isSetPad(a) ? a.v - b.v : b.v - a.v))
          .filter((r) => {
            if (seen.has(r.u)) return false;
            seen.add(r.u);
            return true;
          });
        return { k, grp, nsK, t, rule, ranked };
      })
      .sort((a, b) => b.ranked.length - a.ranked.length);
  }, [rows, stat, targetScope, targetFaction, targetRace, targetAttr, targetSeason, targetClass]);

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
        <button className="filter-toggle-btn buff-target-toggle" onClick={() => setShowTargetFilters(!showTargetFilters)}>
          {showTargetFilters ? "hide target filters ▲" : "target filters ▼"}
          {targetFilterCount ? ` (${targetFilterCount})` : ""}
        </button>
        <span className="count">{groups.length} effect types</span>
      </div>
      <div className="toolbar buff-toolbar buff-toolbar-effects">
        {EFFECTS.map((s) => (
          <button
            key={s.k}
            className={`stat-tab${s.k === stat ? " active" : ""}`}
            onClick={() => setStat(s.k)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {showTargetFilters && (
        <div className="filter-panel buff-target-panel">
          <TargetCheckboxGroup title="Scope" options={TARGET_SCOPE_OPTIONS} selected={targetScope} onToggle={(v) => toggleTarget("targetScope", targetScope, v)} />
          <TargetCheckboxGroup title="Affiliation" options={targetOptions.factions} selected={targetFaction} onToggle={(v) => toggleTarget("targetFaction", targetFaction, v)} />
          <TargetCheckboxGroup title="Race" options={targetOptions.races} selected={targetRace} onToggle={(v) => toggleTarget("targetRace", targetRace, v)} />
          <TargetCheckboxGroup title="Attribute" options={targetOptions.attrs} selected={targetAttr} onToggle={(v) => toggleTarget("targetAttr", targetAttr, v)} />
          <TargetCheckboxGroup title="Season" options={targetOptions.seasons} selected={targetSeason} onToggle={(v) => toggleTarget("targetSeason", targetSeason, v)} />
          <TargetCheckboxGroup title="Class" options={targetOptions.classes} selected={targetClass} onToggle={(v) => toggleTarget("targetClass", targetClass, v)} />
          {targetFilterCount > 0 && (
            <button
              className="filter-clear-btn"
              onClick={() => {
                const next = new URLSearchParams(params);
                ["targetScope", "targetFaction", "targetRace", "targetAttr", "targetSeason", "targetClass"]
                  .forEach((key) => next.delete(key));
                setParams(next, { replace: true });
              }}
            >
              clear target filters
            </button>
          )}
        </div>
      )}
      {isEffect && (
        <p className="muted small">
          Innate abilities and effects granted to allies (self-only skill rows
          included where they define the effect, e.g. invulnerability).
          Conditions and skill-gating are shown per row; token-granted effects
          list the owner, with the token named in the source column.
        </p>
      )}
      <div className={`buff-groups${isEffect ? " buff-groups-wide" : ""}`}>
        {groups.length === 0 && (
          <p className="muted">No rows match this target filter.</p>
        )}
        {groups.map((g) => {
          const lab = labelOf(g.nsK, g.t);
          const isExpanded = expanded.has(g.k);
          const shown = isExpanded ? g.ranked : g.ranked.slice(0, GROUP_PREVIEW);
          return (
            <section key={g.k} className="buff-group">
              <header className="buff-group-head">
                <span className="buff-group-title">
                  {g.grp ? groupName(g.grp, g.nsK, g.t) : lab?.name || `type ${g.t}`}
                </span>
                <span className="buff-group-meta">
                  {g.grp ? g.nsK : `${g.nsK} ${g.t}`} · {g.ranked.length} units
                  {lab && !lab.verified && <em className="unverified"> unverified</em>}
                </span>
              </header>
              {g.rule && RULE_TEXT[g.rule] && (
                <p className="buff-group-rule">{RULE_TEXT[g.rule]}</p>
              )}
              <table className="grid buff-table">
                <thead>
                  <tr>
                    <th>#</th><th>{isEffect ? "Value" : "Cap"}</th><th>Unit</th>
                    <th>Target</th>{isEffect && <th>Condition</th>}<th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={`${r.u}-${i}`}>
                      <td className="num muted">{i + 1}</td>
                      <td className="num buff-val" title={rawTitle(r)}>
                        <strong>{fmtValue(r)}</strong>
                        {r.mod?.length ? <span className="buff-mod">*</span> : null}
                        {buffSelectionRule(r) === "highest_duration" && r.selection_priority != null && (
                          <span className="buff-priority">priority: {fmtFrames(r.selection_priority)}</span>
                        )}
                      </td>
                      <td><UnitIconLink id={r.u} name={r.n} /></td>
                      <td className="muted small">
                        {typeof r.tgt === "string" ? <HumanText text={r.tgt} /> : (r.tgt ?? "-")}
                      </td>
                      {isEffect && (
                        <td className="muted small buff-cond">
                          {r.cond ? <HumanText text={r.cond} /> : "-"}
                        </td>
                      )}
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
