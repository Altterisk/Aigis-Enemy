import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadJSONFile, useExprNames, useUnitInfluenceLabels, useLocalisation, useUnits } from "../data";
import { humanize } from "../humanize";
import { CheckboxGroup, FilterChip, FilterRow, GroupCard } from "@altterisk/game-hub";
import { HumanText, UnitIconLink, fmtFrames } from "../components";
import type { BuffRow, InfluenceSelectionRule, UnitInfluenceLabel } from "../types";
import { influenceSelectionRule } from "../influenceLabels";
import { groupName } from "../buffGroups";
import { gameName, getLang, useL } from "../i18n";

// ally stat buffs, then enemy-facing stat effects (the picker's first two rows)
const STATS = [
  { k: "ATK", label: "ATK", ja: "攻撃力" },
  { k: "DEF", label: "DEF", ja: "防御力" },
  { k: "HP", label: "HP", ja: "HP" },
  { k: "MR", label: "MR", ja: "魔法耐性" },
  { k: "RNG", label: "Range", ja: "射程" },
  { k: "PAD_REDUCTION", label: "PAD Reduction", ja: "攻撃後の待ち時間短縮" },
  { k: "CDR", label: "Skill CD Reduction", ja: "スキル再使用時間短縮" },
] as const;
const DEBUFFS = [
  { k: "ATK_DEBUFF", label: "ATK debuff", ja: "攻撃力低下" },
  { k: "DEF_DEBUFF", label: "DEF debuff", ja: "防御力低下" },
  { k: "MR_DEBUFF", label: "MR debuff", ja: "魔法耐性低下" },
  { k: "PAD_DEBUFF", label: "Enemy PAD increase", ja: "敵の攻撃後の待ち時間増加" },
  { k: "DMG_AMP", label: "Enemy damage taken", ja: "敵の被ダメージ増加" },
] as const;
// non-stat effect categories (third picker row): innate abilities + effects
// granted to allies, each row carrying its application condition. Token-
// sourced rows are attributed to the owner (source column names the token).
const EFFECTS = [
  { k: "MAKAI", label: "Makai", ja: "魔界" },
  { k: "TENKAI", label: "Tenkai", ja: "天界" },
  { k: "WEATHER", label: "Weather", ja: "天候" },
  { k: "DEEPSEA", label: "Deep Sea", ja: "水中" },
  { k: "STATUS", label: "Status Ailments", ja: "状態異常" },
  { k: "STEALTH", label: "Stealth", ja: "隠密" },
  { k: "TAUNT", label: "Taunt", ja: "挑発" },
  { k: "EVASION", label: "Evasion", ja: "回避" },
  { k: "NULLIFY", label: "Nullification", ja: "ダメージ無効化" },
  { k: "INVULN", label: "Invulnerability", ja: "無敵" },
  { k: "BARRIER", label: "Barrier", ja: "バリア" },
  { k: "OVERHEAL", label: "Overheal", ja: "オーバーヒール" },
  { k: "LIMIT", label: "Deploy Limit", ja: "出撃数" },
  { k: "HPCUT", label: "HP Cut", ja: "HP割合ダメージ" },
  { k: "TIMESTOP", label: "Time Stop", ja: "時間停止" },
] as const;
type StatKey = (typeof STATS)[number]["k"] | (typeof DEBUFFS)[number]["k"] | (typeof EFFECTS)[number]["k"];
const PICKER_ROWS: { label: string; ja: string; tabs: readonly { k: StatKey; label: string; ja: string }[] }[] = [
  { label: "Stats", ja: "ステータス", tabs: STATS },
  { label: "Debuffs", ja: "デバフ", tabs: DEBUFFS },
  { label: "Effects", ja: "効果", tabs: EFFECTS },
];
// active colour for the enemy-facing stat reductions
const DEBUFF_CHIP_COLOR = "#f7768e";

const TARGET_SCOPE_OPTIONS = [
  { value: "range", label: "In range / nearby", ja: "射程内・周囲" },
  { value: "all", label: "All", ja: "全体" },
  { value: "self", label: "Self", ja: "自身" },
  { value: "enemy", label: "Enemies", ja: "敵" },
];

function targetScopeMatches(target: string, scope: string): boolean {
  const text = target.toLowerCase();
  if (scope === "range") return /in range|nearby|within range|enemy_in_range/.test(text);
  if (scope === "all") return /^all\b/.test(text);
  if (scope === "self") return /^self\b/.test(text);
  return text.includes("enemy");
}

const GROUP_PREVIEW = 10; // rows shown per type before "show all"

const buffSelectionRule = (r: BuffRow): InfluenceSelectionRule | undefined =>
  r.ns === "special" ? undefined : influenceSelectionRule(r.ns, r.t);

const RULE_TEXT: Partial<Record<InfluenceSelectionRule, [string, string]>> = {
  highest_value: ["Highest value applies; these rows do not stack within the group.", "最も高い値が適用され、同じ種類の中では重複しません。"],
  highest_duration: ["Longest duration takes priority; effect value does not decide the winner.", "効果時間が最も長いものが優先され、効果量では決まりません。"],
  additive: ["Rows in this group stack additively.", "この種類は加算で重複します。"],
  additive_then_sortie_multiplicative: ["These add with each other, then multiply with sortie HP buffs.", "互いに加算され、その後出撃時HPバフと乗算されます。"],
  highest_within_stack_id: ["Only the highest value within the same stack ID applies.", "同じスタックIDの中で最も高い値だけが適用されます。"],
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
// The row's target with the condition narrowing it, as "target (condition)".
function rowTarget(row: BuffRow): string {
  const tgt = row.tgt == null ? "" : String(row.tgt);
  const restrict = row.tr ? humanize(row.tr) : null;
  if (!restrict) return tgt;
  return tgt ? `${tgt} (${restrict})` : restrict;
}

export default function Buffs() {
  const namesReady = useExprNames();
  const [rows, setRows] = useState<BuffRow[] | null>(null);
  const L = useL();
  const [failed, setFailed] = useState(false);
  const labels = useUnitInfluenceLabels();
  const loc = useLocalisation();
  const { units, byId } = useUnits();
  const unitName = (id: number, en?: string | null) => (getLang() === "ja" ? gameName(null, byId?.get(id)?.name) || en || "" : en || "");
  // selected tab lives in the URL so back/forward and shared links restore it
  const [params, setParams] = useSearchParams();
  const rawStat = params.get("stat") || "ATK";
  const stat: StatKey = ([...STATS, ...DEBUFFS, ...EFFECTS].some((s) => s.k === rawStat)
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
      const target = rowTarget(row);
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
  }, [rows, units, loc, stat, namesReady]);

  const targetMatches = (row: BuffRow): boolean => {
    const target = rowTarget(row);
    if (targetScope.length && !targetScope.some((scope) => targetScopeMatches(target, scope))) return false;
    const hasTag = (values: string[]) => values.some((value) => target.includes(`[[tag:${value}]]`));
    if (targetFaction.length && !hasTag(targetFaction)) return false;
    if (targetRace.length && !hasTag(targetRace)) return false;
    if (targetAttr.length && !hasTag(targetAttr)) return false;
    if (targetSeason.length && !hasTag(targetSeason)) return false;
    if (targetClass.length && !targetClass.some((value) => target.includes(`[[class:${value}]]`))) return false;
    return true;
  };

  // distinct units per category, with the target filters applied
  const unitCounts = useMemo(() => {
    const by = new Map<string, Set<number>>();
    (rows || []).forEach((r) => {
      if (!targetMatches(r)) return;
      let set = by.get(r.stat);
      if (!set) by.set(r.stat, (set = new Set()));
      set.add(r.u);
    });
    return by;
  }, [rows, targetScope, targetFaction, targetRace, targetAttr, targetSeason, targetClass]);
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
        // every value a unit reaches in this group (a skill stage can boost
        // an ability: "... + awakened skill stage 3 (name)" rows), shown as
        // tiers under the unit's best value
        const tiers = new Map<number, { label: string; r: BuffRow }[]>();
        list.forEach((r) => {
          const m = r.s.match(/ \+ (.+)$/);
          const label = m ? m[1] : "base";
          const cur = tiers.get(r.u) ?? [];
          if (!cur.some((x) => x.label === label && x.r.v === r.v)) cur.push({ label, r });
          tiers.set(r.u, cur);
        });
        tiers.forEach((cur) => cur.sort((a, b) => a.r.v - b.r.v));
        const ranked = list
          .sort((a, b) => rule === "highest_duration"
            ? (b.selection_priority ?? 0) - (a.selection_priority ?? 0)
            : (isSetPad(a) ? a.v - b.v : b.v - a.v))
          .filter((r) => {
            if (seen.has(r.u)) return false;
            seen.add(r.u);
            return true;
          });
        return { k, grp, nsK, t, rule, ranked, tiers };
      })
      .sort((a, b) => b.ranked.length - a.ranked.length);
  }, [rows, stat, targetScope, targetFaction, targetRace, targetAttr, targetSeason, targetClass]);

  if (failed) {
    return <p className="muted">{L("buff_index.json not found — re-run export_units.py.", "buff_index.json がありません — export_units.py を再実行してください。")}</p>;
  }
  if (!rows) return <p className="loading">{L("Loading buff index…", "バフ一覧を読み込み中…")}</p>;

  const toggleExpanded = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  return (
    <div className="buffs-page">
      <h2>{L("Buff ranking", "バフランキング")}</h2>
      <p className="muted small">
        {L("Ally buffs and enemy debuffs, one ranked list per effect type (values are only comparable within a type), ranked by the buff's cap — its max achievable value. Hover a value for the raw params. Self-only, 1st-barrack, token-targeted and specific-unit rows are excluded.", "味方へのバフと敵へのデバフを効果の種類ごとにランキング (値は同じ種類の中でのみ比較できます)。順位はバフの上限値です。値にカーソルを合わせると元のパラメータを表示します。自身のみ・所持効果・トークン対象・特定ユニット対象のものは除外しています。")}
      </p>

      {PICKER_ROWS.map((row) => (
        <FilterRow key={row.label} label={L(row.label, row.ja)}>
          {row.tabs.map((s) => (
            <FilterChip
              key={s.k}
              className="stat-tab"
              active={s.k === stat}
              count={unitCounts.get(s.k)?.size ?? 0}
              color={s.k.endsWith("_DEBUFF") ? DEBUFF_CHIP_COLOR : undefined}
              onClick={() => setStat(s.k)}
            >
              {L(s.label, s.ja)}
            </FilterChip>
          ))}
        </FilterRow>
      ))}
      <div className="hub-toolbar hub-toolbar--panel buff-toolbar">
        <button className="hub-btn hub-btn--sm" onClick={() => setShowTargetFilters(!showTargetFilters)}>
          {showTargetFilters ? L("hide target filters ▲", "対象の絞り込みを隠す ▲") : L("target filters ▼", "対象で絞り込み ▼")}
          {targetFilterCount ? ` (${targetFilterCount})` : ""}
        </button>
        <span className="hub-toolbar__end hub-muted hub-small">{L("{n} effect types", "効果 {n} 種", { n: groups.length })}</span>
        {showTargetFilters && (
          <div className="buff-target-panel">
            <CheckboxGroup className="filter-group" title={L("Scope", "範囲")} options={TARGET_SCOPE_OPTIONS.map((o) => ({ value: o.value, label: L(o.label, o.ja) }))} selected={targetScope} onToggle={(v) => toggleTarget("targetScope", targetScope, v)} />
            <CheckboxGroup className="filter-group" title={L("Affiliation", "所属")} options={targetOptions.factions} selected={targetFaction} onToggle={(v) => toggleTarget("targetFaction", targetFaction, v)} />
            <CheckboxGroup className="filter-group" title={L("Race", "種族")} options={targetOptions.races} selected={targetRace} onToggle={(v) => toggleTarget("targetRace", targetRace, v)} />
            <CheckboxGroup className="filter-group" title={L("Attribute", "属性")} options={targetOptions.attrs} selected={targetAttr} onToggle={(v) => toggleTarget("targetAttr", targetAttr, v)} />
            <CheckboxGroup className="filter-group" title={L("Season", "季節")} options={targetOptions.seasons} selected={targetSeason} onToggle={(v) => toggleTarget("targetSeason", targetSeason, v)} />
            <CheckboxGroup className="filter-group" title={L("Class", "クラス")} options={targetOptions.classes} selected={targetClass} onToggle={(v) => toggleTarget("targetClass", targetClass, v)} />
            {targetFilterCount > 0 && (
              <button
                className="hub-btn hub-btn--sm hub-btn--ghost"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  ["targetScope", "targetFaction", "targetRace", "targetAttr", "targetSeason", "targetClass"]
                    .forEach((key) => next.delete(key));
                  setParams(next, { replace: true });
                }}
              >
                {L("clear target filters", "対象の絞り込みを解除")}
              </button>
            )}
          </div>
        )}
      </div>
      {isEffect && (
        <p className="muted small">
          {L("Innate abilities and effects granted to allies (self-only skill rows included where they define the effect, e.g. invulnerability). Conditions and skill-gating are shown per row; token-granted effects list the owner, with the token named in the source column.", "固有の能力と味方に付与する効果 (無敵など、効果そのものを定める自身のみのスキルも含む)。条件とスキル発動中かどうかは行ごとに表示します。トークンが付与する効果は持ち主のユニットとして表示し、トークン名は出典の列にあります。")}
        </p>
      )}
      <div className={`hub-group-grid${isEffect ? " hub-group-grid--wide" : ""}`}>
        {groups.length === 0 && (
          <p className="muted">{L("No rows match this target filter.", "この対象の絞り込みに合うものがありません。")}</p>
        )}
        {groups.map((g) => {
          const lab = labelOf(g.nsK, g.t);
          const isExpanded = expanded.has(g.k);
          const shown = isExpanded ? g.ranked : g.ranked.slice(0, GROUP_PREVIEW);
          return (
            <GroupCard
              key={g.k}
              className="buff-group"
              title={g.grp ? groupName(g.grp, (t) => labelOf(g.nsK, t)?.name, g.t) : lab?.name || `type ${g.t}`}
              count={L("{n} units", "{n} ユニット", { n: g.ranked.length })}
              meta={<>
                {g.grp ? g.nsK : `${g.nsK} ${g.t}`}
                {lab && !lab.verified && <em className="unverified">{L(" unverified", " 未確認")}</em>}
              </>}
              note={g.rule && RULE_TEXT[g.rule] && L(RULE_TEXT[g.rule]![0], RULE_TEXT[g.rule]![1])}
            >
              <table className="grid buff-table hub-table--stack">
                <thead>
                  <tr>
                    <th>#</th><th>{isEffect ? L("Value", "値") : L("Cap", "上限")}</th><th>{L("Unit", "ユニット")}</th>
                    <th>{L("Target", "対象")}</th>{isEffect && <th>{L("Condition", "条件")}</th>}<th>{L("Source", "出典")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={`${r.u}-${i}`}>
                      <td data-label="#" className="num muted">{i + 1}</td>
                      <td data-label={isEffect ? "Value" : "Cap"} className="num buff-val" title={rawTitle(r)}>
                        <strong>{fmtValue(r)}</strong>
                        {r.mod?.length ? <span className="buff-mod">*</span> : null}
                        {(g.tiers.get(r.u)?.length ?? 0) > 1 && (
                          <div className="buff-tiers">
                            {g.tiers.get(r.u)!.map((x) => (
                              <div key={`${x.label}-${x.r.v}`} title={x.r.s}>
                                {fmtValue(x.r)} <span className="muted">{x.label}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {buffSelectionRule(r) === "highest_duration" && r.selection_priority != null && (
                          <span className="buff-priority">{L("priority:", "優先:")} {fmtFrames(r.selection_priority)}</span>
                        )}
                      </td>
                      <td data-label="Unit"><UnitIconLink id={r.u} name={unitName(r.u, r.n)} /></td>
                      <td data-label="Target" className="muted small">
                        {rowTarget(r) ? <HumanText text={rowTarget(r)} /> : "-"}
                      </td>
                      {isEffect && (
                        <td data-label="Condition" className="muted small buff-cond">
                          {r.cond ? <HumanText text={humanize(r.cond) || r.cond} /> : "-"}
                        </td>
                      )}
                      <td data-label="Source" className="muted small">{loc?.classes[r.s] || r.s}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {g.ranked.length > GROUP_PREVIEW && (
                <button className="buff-more" onClick={() => toggleExpanded(g.k)}>
                  {isExpanded ? L("collapse", "閉じる") : L("expand ({n})", "すべて表示 ({n})", { n: g.ranked.length })}
                </button>
              )}
            </GroupCard>
          );
        })}
      </div>
    </div>
  );
}
