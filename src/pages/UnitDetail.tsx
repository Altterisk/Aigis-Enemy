import { useState } from "react";
import type { ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import { useUnitDetail, useUnitInfluenceLabels } from "../data";
import { UnitImage, missileOnHitText } from "../components";
import type {
  Unit,
  UnitClass,
  UnitSkill,
  UnitAbility,
  SkillInfluence,
  AbilityInfluence,
  UnitInfluenceLabel,
  InfluenceExtend,
  SkillStage,
} from "../types";

function InfluenceLabel({ label }: { label?: UnitInfluenceLabel }) {
  if (!label) return null;
  return (
    <span className={`meaning${label.verified ? "" : " unverified"}`} title={label.note}>
      {" "}{label.name}{!label.verified && " (unverified)"}
    </span>
  );
}

// Known ExtendProperty keys, decoded (formulas verified -- see the
// aigis-unit-extraction notes): 効果時間 is in 60fps frames, 効果割合 a percent,
// 効果固定量 a flat amount, mulLim the % cap a scaling row can reach.
function extendText(k: string, v: string | number): string {
  switch (k) {
    case "効果時間": {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? `for ${(n / 60).toFixed(n % 60 ? 1 : 0)}s` : `${k}=${v}`;
    }
    case "効果割合": return `${v}%`;
    case "効果固定量": return `${v} flat`;
    case "重複番号": return `stack-id ${v}`;
    case "自身含む": return Number(v) ? "includes self" : "excludes self";
    case "mulLim": return `cap ${v}%`;
    case "永続": return Number(v) ? "permanent" : `${k}=${v}`;
    default: return `${k}=${v}`;
  }
}

function ExtendProps({ extend }: { extend?: InfluenceExtend }) {
  if (!extend) return null;
  return (
    <span className="params">
      {" "}{Object.entries(extend).map(([k, v]) => extendText(k, v)).join(", ")}
    </span>
  );
}

// One derived sentence fragment for a skill influence row: the multiplier /
// flat value read off mul3/add. Purely arithmetic (mul3 400 = x4.00), no
// per-id meaning invented -- the label name supplies the "what".
function skillRowValue(inf: SkillInfluence): string | null {
  if (inf.mul3 != null) {
    const base = `x${(inf.mul3 / 100).toFixed(2).replace(/\.?0+$/, "")}`;
    return inf.mul3_cap != null && inf.mul3_cap !== inf.mul3
      ? `${base} → x${(inf.mul3_cap / 100).toFixed(2).replace(/\.?0+$/, "")} at max level`
      : base;
  }
  return null;
}

function SkillInfluenceRow({
  inf, i, label,
}: { inf: SkillInfluence; i: number; label?: UnitInfluenceLabel }) {
  if (label?.hidden) return null;
  const parts = [
    `type ${inf.influence_type}`,
    inf.target != null ? `target ${inf.target}` : null,
    inf.mul != null ? `mul ${inf.mul}` : null,
    inf.mul2 != null ? `mul2 ${inf.mul2}` : null,
    inf.mul3 != null ? `mul3 ${inf.mul3}` : null,
    inf.add != null ? `add ${inf.add}` : null,
  ].filter(Boolean);
  const ts = inf.tick_scale;
  const value = skillRowValue(inf);
  return (
    <li key={i}>
      <code>{parts.join(" · ")}</code>
      {value && <span className="meaning"> {value}</span>}
      {ts && ts.per_sec != null && (
        <span className="meaning">
          {" "}{ts.direction && ts.direction < 0 ? "-" : "+"}
          {ts.per_sec >= 1
            ? `${ts.per_sec}/s`
            : `${ts.per_tick} per ${(((ts.interval_frames ?? 0) / 60)).toFixed(1)}s`}
          {ts.cap != null ? `, cap ${ts.cap}` : ""}
        </span>
      )}
      {inf.power_mul3 != null && (
        <span className="meaning unverified" title="unconfirmed pattern: Power fills this row's empty mul3">
          {" "}mul3≈Power {inf.power_mul3}{inf.power_mul3_max ? `..${inf.power_mul3_max}` : ""} (unverified)
        </span>
      )}
      {inf.missile && (
        <span className="meaning">
          {" "}missile: {inf.missile.splash ? `splash ${inf.missile.splash}` : ""}
          {inf.missile.slow ? ` slow ${inf.missile.slow[0]}%/${inf.missile.slow[1]}f` : ""}
          {inf.missile.deflectable ? " deflectable" : ""}
          {inf.missile.on_hit ? ` ${missileOnHitText(inf.missile.on_hit)}` : ""}
        </span>
      )}
      <InfluenceLabel label={label} />
      <ExtendProps extend={inf.extend} />
      {(inf.expression_human || inf.expression) && (
        <span className="expr" title={inf.expression}>
          {" "}if {inf.expression_human || inf.expression}
        </span>
      )}
      {(inf.activate_if_human || inf.activate_if) && (
        <span className="expr" title={inf.activate_if}>
          {" "}(applies when {inf.activate_if_human || inf.activate_if})
        </span>
      )}
    </li>
  );
}

function AbilityInfluenceRow({
  inf, i, label,
}: { inf: AbilityInfluence; i: number; label?: UnitInfluenceLabel }) {
  if (label?.hidden) return null;
  const parts = [
    `type ${inf.influence_type}`,
    inf.invoke != null ? `invoke ${inf.invoke}` : null,
    inf.target != null ? `target ${inf.target}` : null,
    inf.params && inf.params.length ? `[${inf.params.join(", ")}]` : null,
  ].filter(Boolean);
  return (
    <li key={i}>
      <code>{parts.join(" · ")}</code>
      <InfluenceLabel label={label} />
      <ExtendProps extend={inf.extend} />
      {(inf.command_human || inf.command) && (
        <span className="expr" title={inf.command}>
          {" "}if {inf.command_human || inf.command}
        </span>
      )}
      {(inf.activate_command_human || inf.activate_command) && (
        <span className="expr" title={inf.activate_command}>
          {" "}on {inf.activate_command_human || inf.activate_command}
        </span>
      )}
    </li>
  );
}

// ---- skill-text placeholder substitution ----------------------------------
// The game's skill text ships with unsubstituted tokens (<TIME>/<ATK>/...).
// Fill them from the data we have: a token's MATCHING influence row first
// (e.g. <ATK> from an influence-type-2 row's mul3, per its "ATK" label), the
// skill's Power/PowerMax otherwise (Power fills whichever token the text
// wires it into), <TIME> from Duration. HEURISTIC pairing -- every filled
// value is styled as derived, with the original token in the tooltip.
const TOKEN_INFLUENCES: Record<string, { types: number[]; field: "mul3" | "add" }> = {
  ATK: { types: [2, 3], field: "mul3" },
  DEF: { types: [4, 5], field: "mul3" },
  RNG: { types: [6], field: "mul3" },
  MDEF: { types: [34], field: "mul3" },
  AVOID: { types: [9], field: "mul3" },
  AREA: { types: [8], field: "mul3" },
  POW_R: { types: [8], field: "mul3" },
  NUM_TRG: { types: [22, 13], field: "add" },
  NUM_ATK: { types: [13], field: "add" },
  NUM_SHOT: { types: [7], field: "add" },
  NUM_BLOCK: { types: [12], field: "add" },
};
// tokens whose value is a count taken from `add` -- never power-filled.
const COUNT_TOKENS = new Set(["NUM_TRG", "NUM_ATK", "NUM_SHOT", "NUM_BLOCK"]);

function resolveToken(
  name: string,
  s: SkillStage
): { min: number; max?: number; source: string } | null {
  if (name === "TIME") {
    if (s.duration == null) return null;
    return { min: s.duration, max: s.duration_max, source: "Duration" };
  }
  const spec = TOKEN_INFLUENCES[name];
  if (spec) {
    const rows = (s.influences || []).filter(
      (r) => r.influence_type != null && spec.types.includes(r.influence_type)
    );
    // Only an UNGATED row's own value beats Power: rows gated by activate_if
    // are per-class-tier variants of a shared template (e.g. Bernard #10's
    // GetClassID()==880 DEF row carries mul3 240..300 while everyone else's
    // <DEF> is Power 130..170).
    const row = rows.find((r) => r[spec.field] != null && !r.activate_if);
    if (row) {
      const v = row[spec.field] as number;
      return {
        min: v,
        max: spec.field === "mul3" ? row.mul3_cap ?? undefined : undefined,
        source: `influence ${row.influence_type} ${spec.field}`,
      };
    }
    if (COUNT_TOKENS.has(name)) {
      // counts are never Power-filled; fall back to a gated row if that is
      // all there is (better than an unfilled token, tooltip shows source).
      const gated = rows.find((r) => r[spec.field] != null);
      if (!gated) return null;
      return {
        min: gated[spec.field] as number,
        source: `influence ${gated.influence_type} ${spec.field} (gated: ${gated.activate_if_human || gated.activate_if})`,
      };
    }
  }
  if (s.power == null) return null;
  return { min: s.power, max: s.power_max, source: "Power" };
}

function fmtTokenValue(v: number, asMultiplier: boolean): string {
  if (!asMultiplier) return String(v);
  const x = v / 100;
  return String(Math.round(x * 100) / 100);
}

// Substitute <TOKEN>s inside the skill text. A token directly followed by 倍
// is a multiplier (value/100); ％/秒/体/etc take the raw number. Unresolvable
// tokens stay as-is.
function SkillText({ s }: { s: SkillStage }) {
  const text = s.text || "";
  const parts = text.split(/(<[A-Z_]+>)/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^<([A-Z_]+)>$/);
        if (!m) return part;
        const resolved = resolveToken(m[1], s);
        if (!resolved) return part;
        const asMul = (parts[i + 1] || "").startsWith("倍");
        const min = fmtTokenValue(resolved.min, asMul);
        const max = resolved.max != null && resolved.max !== resolved.min
          ? fmtTokenValue(resolved.max, asMul) : null;
        return (
          <span
            key={i}
            className="ph-sub"
            title={`${part} ← ${resolved.source} (derived, unverified)`}
          >
            {max ? `${min}~${max}` : min}
          </span>
        );
      })}
    </>
  );
}

// Collapsible influence-row list: raw config rows are verification material,
// not reading material -- fold them behind a toggle by default.
function InfluenceToggle({ count, children }: { count: number; children: ReactNode }) {
  if (!count) return null;
  return (
    <details className="inf-toggle">
      <summary>{count} influence row{count !== 1 ? "s" : ""}</summary>
      {children}
    </details>
  );
}

// A stage's badge: how it is reached. Charge steps get a step counter so a
// staged charge skill reads as a progression, swaps as "next use".
function StageBadge({ s, chargePos }: { s: SkillStage; chargePos?: [number, number] }) {
  if (s.via === "charge") {
    return (
      <span className="via-badge via-badge--charge">
        charge{chargePos ? ` ${chargePos[0]}/${chargePos[1]}` : "d"}
      </span>
    );
  }
  if (s.via === "swap") return <span className="via-badge">next use</span>;
  return null;
}

function SkillStageRow({
  s, i, labels, abilityLabels, chargePos,
}: {
  s: SkillStage; i: number;
  labels: Record<string, UnitInfluenceLabel>; abilityLabels: Record<string, UnitInfluenceLabel>;
  chargePos?: [number, number];
}) {
  // only tokens that could NOT be substituted are worth flagging
  const unresolved = [...new Set((s.text || "").match(/<[A-Z_]+>/g) || [])]
    .filter((t) => !resolveToken(t.slice(1, -1), s));
  const nInf = (s.influences?.length || 0) + (s.linked_ability_influences?.length || 0);
  return (
    <tr key={s.id}>
      <td className="unit-class-name-cell">
        {s.name} <span className="muted small">#{s.id}</span>
        {i > 0 && <StageBadge s={s} chargePos={chargePos} />}
      </td>
      <td className="skill-text">
        <SkillText s={s} />
        {unresolved.length > 0 && (
          <div className="muted small">unresolved placeholders: {unresolved.join(" ")}</div>
        )}
        <InfluenceToggle count={nInf}>
          {s.influences && s.influences.length > 0 && (
            <ul className="effects">
              {s.influences.map((inf, j) => (
                <SkillInfluenceRow
                  inf={inf} i={j} key={j}
                  label={inf.influence_type != null ? labels[String(inf.influence_type)] : undefined}
                />
              ))}
            </ul>
          )}
          {s.linked_ability_influences && s.linked_ability_influences.length > 0 && (
            <ul className="effects">
              {s.linked_ability_influences.map((inf, j) => (
                <AbilityInfluenceRow
                  inf={inf} i={j} key={j}
                  label={inf.influence_type != null ? abilityLabels[String(inf.influence_type)] : undefined}
                />
              ))}
            </ul>
          )}
        </InfluenceToggle>
      </td>
      <td>{s.power != null ? `${s.power}${s.power_max ? `..${s.power_max}` : ""}` : "-"}</td>
      <td>{s.duration != null ? `${s.duration}${s.duration_max ? `..${s.duration_max}` : ""}` : "-"}</td>
      <td>{s.cooldown ?? "-"}</td>
      <td>{i === 0 ? s.level_max ?? "-" : "-"}</td>
    </tr>
  );
}

// Row plan for a skill's stages. LONG swap chains stay fully listed; only a
// long run of consecutive CHARGE steps (a staged charge skill, e.g. 20 charge
// tiers) is collapsed to its first and final step with the middle hidden
// behind an expander.
type StagePlanItem =
  | { kind: "stage"; s: SkillStage; i: number; chargePos?: [number, number] }
  | { kind: "gap"; stages: { s: SkillStage; i: number; chargePos: [number, number] }[] };

function planStages(stages: SkillStage[]): StagePlanItem[] {
  // annotate charge runs: index within the run + run length
  const items: StagePlanItem[] = [];
  let i = 0;
  while (i < stages.length) {
    if (stages[i].via !== "charge") {
      items.push({ kind: "stage", s: stages[i], i });
      i++;
      continue;
    }
    let end = i;
    while (end + 1 < stages.length && stages[end + 1].via === "charge") end++;
    const run = stages.slice(i, end + 1);
    const withPos = run.map((s, k) => ({
      s, i: i + k, chargePos: [k + 1, run.length] as [number, number],
    }));
    if (run.length <= 3) {
      withPos.forEach((x) => items.push({ kind: "stage", ...x }));
    } else {
      items.push({ kind: "stage", ...withPos[0] });
      items.push({ kind: "gap", stages: withPos.slice(1, -1) });
      items.push({ kind: "stage", ...withPos[withPos.length - 1] });
    }
    i = end + 1;
  }
  return items;
}

function SkillBlock({
  label, skill, labels, abilityLabels,
}: {
  label: string; skill?: UnitSkill | null;
  labels: Record<string, UnitInfluenceLabel>; abilityLabels: Record<string, UnitInfluenceLabel>;
}) {
  const [expandGaps, setExpandGaps] = useState(false);
  if (!skill) return null;
  const plan = planStages(skill.stages);
  return (
    <section>
      <h3>{label}: {skill.name} <span className="muted small">#{skill.id}</span></h3>
      <table className="grid unit-detail-table">
        <thead>
          <tr>
            <th>Name</th><th>Effect</th>
            <th>Power</th><th>Duration</th><th>Cooldown</th><th>Max Level</th>
          </tr>
        </thead>
        <tbody>
          {plan.map((item, k) => {
            if (item.kind === "stage") {
              return (
                <SkillStageRow
                  key={`s${item.s.id}-${item.i}`}
                  s={item.s} i={item.i}
                  labels={labels} abilityLabels={abilityLabels}
                  chargePos={item.chargePos}
                />
              );
            }
            if (expandGaps) {
              return item.stages.map((x) => (
                <SkillStageRow
                  key={`s${x.s.id}-${x.i}`}
                  s={x.s} i={x.i}
                  labels={labels} abilityLabels={abilityLabels}
                  chargePos={x.chargePos}
                />
              ));
            }
            return (
              <tr key={`gap${k}`} className="stage-gap-row">
                <td colSpan={6}>
                  <button className="stage-gap-btn" onClick={() => setExpandGaps(true)}>
                    … {item.stages.length} intermediate charge steps (show all)
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function AbilityBlock({
  label, ability, labels,
}: { label: string; ability?: UnitAbility | null; labels: Record<string, UnitInfluenceLabel> }) {
  if (!ability) return null;
  return (
    <section>
      <h3>{label}</h3>
      <table className="grid unit-detail-table">
        <thead>
          <tr><th>Ability Name</th><th>Effect</th></tr>
        </thead>
        <tbody>
          <tr>
            <td className="unit-class-name-cell">{ability.name} <span className="muted small">#{ability.id}</span></td>
            <td className="skill-text">
              {ability.text}
              <InfluenceToggle count={ability.influences?.length || 0}>
                <ul className="effects">
                  {(ability.influences || []).map((inf, j) => (
                    <AbilityInfluenceRow
                      inf={inf} i={j} key={j}
                      label={inf.influence_type != null ? labels[String(inf.influence_type)] : undefined}
                    />
                  ))}
                </ul>
              </InfluenceToggle>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

// Compact stats: ONE row per class tier, each stat cell showing the Lv1 -> max
// range (rarity lives in the infobox banner, AFF bonuses below the table).
function statRange(vals: number[]): string {
  const min = vals[0];
  const max = vals[vals.length - 1];
  return min === max ? min.toLocaleString() : `${min.toLocaleString()} → ${max.toLocaleString()}`;
}

function StatsTable({ unit }: { unit: Unit }) {
  const classes = unit.classes;
  if (classes.length === 0) return null;
  return (
    <>
      <table className="grid unit-stat-table">
        <thead>
          <tr>
            <th>Icon</th><th>Class</th><th>Lv</th>
            <th>HP</th><th>ATK</th><th>DEF</th><th>MR</th>
            <th>Range/Block</th><th>Targets</th><th>Atk attr</th><th>Atk speed</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((cl) => {
            const first = cl.stats[0];
            const last = cl.stats[cl.stats.length - 1];
            return (
              <tr key={cl.class_id}>
                <td>
                  <UnitImage kind="icon" id={unit.dot_id} tier={Math.max(0, cl.cc - 1)} className="unit-icon-thumb" />
                </td>
                <td className="unit-class-name-cell">
                  {cl.name} <span className="muted small">(tier {cl.cc})</span>
                </td>
                <td className="num">
                  {first && last ? (first.level === last.level ? first.level : `${first.level}–${last.level}`) : "-"}
                </td>
                <td className="num">{statRange(cl.stats.map((s) => s.hp))}</td>
                <td className="num">{statRange(cl.stats.map((s) => s.atk))}</td>
                <td className="num">{statRange(cl.stats.map((s) => s.def))}</td>
                <td className="num">{cl.magic_resistance ?? unit.magic_resistance ?? 0}</td>
                <td>{cl.ranged ? cl.range ?? "?" : `${cl.range ?? "melee"} (block ${cl.block ?? "-"})`}</td>
                <td className="num">{cl.max_target ?? "-"}</td>
                <td>{cl.attack_attribute ?? "-"}</td>
                <td>
                  {cl.attack_interval != null
                    ? `${cl.attack_interval}f (${(cl.attack_interval / 60).toFixed(2)}s)`
                    : "?"}
                </td>
                <td>{cl.cost_min}..{cl.cost_max}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {unit.affection_bonuses && unit.affection_bonuses.length > 0 && (
        <p className="muted small">AFF bonus: {unit.affection_bonuses.join(", ")}</p>
      )}
    </>
  );
}

function ClassAttributes({
  classes, labels,
}: { classes: UnitClass[]; labels: Record<string, UnitInfluenceLabel> }) {
  // The per-tier text (Explanation) is the primary source of "class
  // attribute" info -- it carries mechanics even when there's no linked
  // ClassAbility1 config (e.g. #523's per-tier escalating aura %, which has
  // zero class_ability_influences on every tier but a fully-detailed
  // description each). Show any class with EITHER.
  const withContent = classes.filter(
    (cl) => cl.description || (cl.class_ability_influences && cl.class_ability_influences.length > 0)
  );
  if (withContent.length === 0) return null;
  return (
    <section>
      <h3>Class Attributes</h3>
      <table className="grid unit-detail-table">
        <thead>
          <tr><th>Class Name</th><th>Description</th></tr>
        </thead>
        <tbody>
          {withContent.map((cl) => (
            <tr key={cl.class_id}>
              <td className="unit-class-name-cell">{cl.name}</td>
              <td className="skill-text">
                {cl.description}
                <InfluenceToggle count={cl.class_ability_influences?.length || 0}>
                  <ul className="effects">
                    {(cl.class_ability_influences || []).map((inf, j) => (
                      <AbilityInfluenceRow
                        inf={inf} i={j} key={j}
                        label={inf.influence_type != null ? labels[String(inf.influence_type)] : undefined}
                      />
                    ))}
                  </ul>
                </InfluenceToggle>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const TIER_LABEL: Record<number, string> = { 0: "Base", 1: "AW", 2: "AW2A", 3: "AW2B" };

export default function UnitDetail() {
  const { id } = useParams();
  const unitId = Number(id);
  const { loading, unit } = useUnitDetail(unitId);
  const influenceLabels = useUnitInfluenceLabels();
  const [tier, setTier] = useState(0);

  if (loading) return <p className="loading">Loading…</p>;
  if (!unit) {
    return (
      <p>
        Unit #{unitId} not found (data file failed to load).{" "}
        <button className="stage-gap-btn" style={{ width: "auto" }} onClick={() => location.reload()}>
          retry
        </button>{" "}
        <Link to="/units">Back to units</Link>
      </p>
    );
  }

  const skillLabels = influenceLabels?.skill ?? {};
  const abilityLabels = influenceLabels?.ability ?? {};

  // Awakening tiers roughly track class-change tiers 2/3/4 (AW/AW2A/AW2B);
  // always offer base + whatever the class chain suggests exists.
  const maxCc = Math.max(0, ...unit.classes.map((c) => c.cc));
  const artTiers = [0, ...[1, 2, 3].filter((t) => t + 1 <= maxCc)];

  const allTokens = unit.classes.flatMap((c) => c.tokens);

  return (
    <div className="detail unit-page">
      <Link to="/units" className="back">← units</Link>

      <aside className="unit-infobox">
        <div className={`unit-infobox-banner rarity-${unit.rarity_id}`}>{unit.name || "(unnamed)"}</div>
        <UnitImage kind="art" id={unit.dot_id} tier={tier} fallbackKind="icon" className="unit-art-img" alt={unit.name || ""} />
        {artTiers.length > 1 && (
          <div className="unit-tier-tabs">
            {artTiers.map((t) => (
              <button
                key={t}
                className={t === tier ? "active" : ""}
                onClick={() => setTier(t)}
              >
                {TIER_LABEL[t]}
              </button>
            ))}
          </div>
        )}
        <div className="unit-infobox-meta">
          <span>{unit.rarity}</span>
          <span>{unit.gender}</span>
          {unit.faction && <span>{unit.faction}</span>}
          {unit.race && <span>{unit.race}</span>}
          {unit.big_race && <span>{unit.big_race}</span>}
          {(unit.identity_tags || []).map((t) => <span key={t}>{t}</span>)}
          {unit.genus && <span>{unit.genus}</span>}
        </div>
      </aside>

      <h2>#{unit.id} {unit.name || "(unnamed)"}</h2>

      <section>
        <h3>Stats</h3>
        <StatsTable unit={unit} />
      </section>

      <SkillBlock label="Base skill" skill={unit.skills.base} labels={skillLabels} abilityLabels={abilityLabels} />
      <SkillBlock label="Class-evolved skill" skill={unit.skills.class_evolved} labels={skillLabels} abilityLabels={abilityLabels} />
      <SkillBlock label="Awakened skill" skill={unit.skills.awakened} labels={skillLabels} abilityLabels={abilityLabels} />

      <AbilityBlock label="Ability" ability={unit.abilities.default} labels={abilityLabels} />
      <AbilityBlock
        label={unit.abilities.awaken_ability_level
          ? `Level ${unit.abilities.awaken_ability_level} ability`
          : "Awakened ability"}
        ability={unit.abilities.awakened}
        labels={abilityLabels}
      />

      <ClassAttributes classes={unit.classes} labels={abilityLabels} />

      {allTokens.length > 0 && (
        <section>
          <h3>Tokens</h3>
          {allTokens.map((t, i) => (
            <div key={i} className="unit-token-card">
              <div className="meta">
                <strong>{t.unit_name || `unit ${t.unit}`}</strong>
                <span>cost {t.cost}</span>
                <span>count {t.count}</span>
                <span>max deployed {t.deploy_max}</span>
                <span>recast {t.recast}</span>
              </div>
              {t.stats && t.stats.length > 0 && (
                <table className="grid unit-token-stat-table">
                  <thead>
                    <tr><th>Lv</th><th>HP</th><th>ATK</th><th>DEF</th></tr>
                  </thead>
                  <tbody>
                    {t.stats.map((s) => (
                      <tr key={s.level}>
                        <td>{s.level}</td>
                        <td className="num">{s.hp.toLocaleString()}</td>
                        <td className="num">{s.atk.toLocaleString()}</td>
                        <td className="num">{s.def.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </section>
      )}

      {unit.specials && unit.specials.length > 0 && (
        <section>
          <h3>Special properties</h3>
          <ul className="effects">
            {unit.specials.map((s, i) => (
              <li key={i}>
                <code>type {s.type} · value {s.value}</code>
                {s.params && s.params.length > 0 && (
                  <span className="params"> [{s.params.join(", ")}]</span>
                )}
                {s.command && <span className="expr" title={s.command}> {s.command}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
