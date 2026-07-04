import { useState } from "react";
import type { ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import { useUnitDetail, useUnitInfluenceLabels, useLocalisation, usePrinceTitles } from "../data";
import { UnitImage, missileText, fillLabel } from "../components";
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
  if (label.marker || !label.name) {
    // user-marked (test unit / fodder / NPC-only / ...) or note-only: no
    // label text, the note rides in the tooltip.
    return label.note ? (
      <span className="meaning unverified" title={label.note}> (marked)</span>
    ) : null;
  }
  return (
    <span className={`meaning${label.verified ? "" : " unverified"}`} title={label.note}>
      {" "}{label.name}{!label.verified && " (unverified)"}
    </span>
  );
}

// ---- ExtendProperty decoding ----------------------------------------------
// Unified English for every recurring key found by a full scan of
// SkillInfluenceConfig + AbilityConfig extends (2026-07-04). Time values are
// 60fps engine frames. Keys not listed fall through raw (k=v) -- never
// silently dropped.
function frames(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return `${v}f`;
  return `${(n / 60).toFixed(n % 60 ? 1 : 0)}s`;
}

// damage-school words used by 属性/反撃攻撃属性/対象属性 values.
const SCHOOL: Record<string, string> = {
  "物理": "physical", "魔法": "magic", "貫通": "true (piercing)",
};
// counter functions used by cntType (literal readings of the function names).
function counterText(v: string): string {
  return v
    .replace(/GetDefeatsCountOfEnemyByAssasinPlayer\(\$?UnitId?\)?/g, "enemies assassinated by this unit")
    .replace(/GetDefeatsCountOfEnemyByPlayer\(\$UnitId\)/g, "enemies defeated by this unit")
    .replace(/GetDefeatsCountOfEnemyByPlayer\(\)/g, "enemies defeated by player units")
    .replace(/GetDefeatsCount[Oo]fEnemyByToken\(\)/g, "enemies defeated by tokens")
    .replace(/GetDefeatsCountOfPlayer\(\$UnitId\)/g, "this unit defeated")
    .replace(/GetDefeatsCountOfPlayer\(\)/g, "allied units defeated");
}

function extendText(k: string, v: string | number): string {
  switch (k) {
    // durations / intervals (frames @60fps)
    case "効果時間": case "持続時間": return `for ${frames(v)}`;
    case "インターバル": case "Interval": case "間隔": return `every ${frames(v)}`;
    case "ディレイ": return `delay ${frames(v)}`;
    case "自動発動時間": return `auto-trigger after ${frames(v)}`;
    case "移動時間": return `move time ${frames(v)}`;
    case "爆撃間隔フレーム": return `bombardment every ${frames(v)}`;
    // amounts / caps
    case "効果割合": return `${v}%`;
    case "効果固定量": return `${v} flat`;
    case "mulLim": return `cap ${v}%`;
    case "addLim": return `flat cap ${v}`;
    case "Add": return `+${v} per count`;
    case "Max": return `cap ${v}`;
    case "MulAdd": return `+${v}%/count`;
    case "MulMax": case "MulMaxBase": return `cap ${v}%`;
    case "MulMaxAdd": return `cap +${v}%/level`;
    case "上昇": return `gain ${v}`;
    case "上限": return `cap ${v}`;
    case "減衰": return `decay ${v}`;
    case "exMul": return `exMul ${v}%`;
    case "exAdd": return `exAdd ${v}`;
    case "ダメージ倍率": return `damage x${Number(v) / 100}`;
    case "攻撃待ち割合": return `attack-wait ${v}%`;
    case "移動速度": return `move speed ${v}`;
    // per-stat flat buff quads (Medic 275 / placement buffs)
    case "攻撃力加算値": return `ATK +${v} flat`;
    case "防御力加算値": return `DEF +${v} flat`;
    case "魔法耐性加算値": return `MR +${v} flat`;
    case "射程加算値": return `range +${v}`;
    case "攻撃力加算最大値": return `ATK cap ${v}`;
    case "防御力加算最大値": return `DEF cap ${v}`;
    case "魔法耐性加算最大値": return `MR cap ${v}`;
    case "射程加算最大値": return `range cap ${v}`;
    // catalyst (312) gain sources
    case "自身が敵撃破時増加量": return `+${v} on own kill`;
    case "味方が敵撃破時増加量": return `+${v} on ally kill`;
    case "味方が撃破された時増加量": return `+${v} when ally defeated`;
    case "味方トークンが撃破された時増加量": return `+${v} when ally token defeated`;
    // flags
    case "自身含む": return Number(v) ? "includes self" : "excludes self";
    case "重複番号": return `stack-id ${v}`;
    case "永続": return Number(v) ? "permanent" : `${k}=${v}`;
    case "射程範囲内のみ": return "within range only";
    case "増減反転": return "inverted (decreases)";
    case "IgnoreSelf": return "ignores self";
    case "位置入れ替え": return "swaps position";
    case "条件一致のみ": return "only while condition met";
    case "スキル発動": return "during skill";
    case "オーラ": return "aura";
    // enumerated values
    case "cntType": return `counts: ${counterText(String(v))}`;
    case "種別": {
      const KIND: Record<string, string> = {
        "攻撃力上昇": "ATK up", "攻撃力": "ATK", "防御力": "DEF",
        "魔法耐性": "MR", "最大HP": "max HP",
      };
      return `type: ${KIND[String(v)] || v}`;
    }
    case "属性": return `school: ${SCHOOL[String(v)] || v}`;
    case "反撃攻撃属性": return `counter school: ${SCHOOL[String(v)] || v}`;
    case "対象属性": return `vs ${SCHOOL[String(v)] || v}`;
    case "対象": {
      const TGT: Record<string, string> = { "敵全体": "all enemies", "射程内敵": "enemies in range" };
      return `target: ${TGT[String(v)] || v}`;
    }
    case "優先対象": {
      const PRI: Record<string, string> = { "防御力": "DEF", "攻撃力": "ATK", "最大HP": "max HP" };
      return `priority: ${PRI[String(v)] || v}`;
    }
    case "優先方向": return String(v) === "降順" ? "highest first" : `order: ${v}`;
    case "スキル系オプション": {
      const OPT: Record<string, string> = {
        "発動中増加なし": "no gain during skill", "終了時増加クリア": "cleared on skill end",
      };
      return OPT[String(v)] || `option: ${v}`;
    }
    case "オプション": {
      const OPT: Record<string, string> = {
        "ダメージ無効化": "damage nullify", "魔界の影響無効化": "Makai immunity",
        "天候の影響無効化": "weather immunity",
      };
      return OPT[String(v)] || `option: ${v}`;
    }
    // references
    case "ミサイルID": case "ミサイルID1": case "ミサイルID2": case "Missile": return `missile ${v}`;
    case "ミサイル反撃時ID": return `counter missile ${v}`;
    case "Factor": return `factor ${v}`;
    case "Range": case "射程": return `range ${v}`;
    case "攻撃種別": return `attack style: ${v}`;
    case "爆撃最大数": return `max hits ${v}`;
    case "計算種別": return `calc type ${v}`;
    case "補間": return `interp ${v}`;
    case "爆撃開始距離": return `start distance ${v}`;
    // cosmetics (grouped, kept short)
    case "演出": case "エフェクト": case "エフェクト名": case "Effect": case "Sound":
    case "反撃ヒットエフェクト": case "開始エフェクト": case "終了エフェクト":
    case "変身開始エフェクト": case "変身終了エフェクト": case "ヒットエフェクト":
      return `fx: ${v}`;
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
// ids whose `add` is a reference/flag handled elsewhere, not a plain value:
// 49 skill swap (chain UI), 122 linked ability, 121 (ability config ref),
// 21 missile (resolved into `missile`), 173/177 tick-scale direction.
const SKILL_ADD_REF = new Set([21, 49, 121, 122, 173, 177]);

function skillRowValue(inf: SkillInfluence): string | null {
  if (inf.mul3 != null) {
    const base = `x${(inf.mul3 / 100).toFixed(2).replace(/\.?0+$/, "")}`;
    const capped = inf.mul3_cap != null && inf.mul3_cap !== inf.mul3
      ? `${base} → x${(inf.mul3_cap / 100).toFixed(2).replace(/\.?0+$/, "")} at max level`
      : base;
    return inf.power_filled ? `${capped} (Power)` : capped;
  }
  if (inf.influence_type === 122 && inf.add != null) {
    return `grants the linked ability effects below (config #${inf.add})`;
  }
  if (inf.add != null && inf.influence_type != null && !SKILL_ADD_REF.has(inf.influence_type)) {
    return `value ${inf.add}`;
  }
  return null;
}

function SkillInfluenceRow({
  inf, i, label,
}: { inf: SkillInfluence; i: number; label?: UnitInfluenceLabel }) {
  if (label?.hidden) return null;
  const parts = [
    `type ${inf.influence_type}`,
    inf.tag ? `tag ${inf.tag}` : null,
    inf.target != null ? `target ${inf.target}` : null,
    inf.mul != null ? `mul ${inf.mul}` : null,
    inf.mul2 != null ? `mul2 ${inf.mul2}` : null,
    inf.mul3 != null ? `mul3 ${inf.mul3}${inf.power_filled ? " (Power)" : ""}` : null,
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
      {inf.missile && (
        <span className="meaning"> missile: {missileText(inf.missile)}</span>
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

// regen-style abilities where a per-second rate can be computed:
// id -> [param index of the amount, param index of the frame interval].
const ABILITY_RATE_PARAMS: Record<number, [number, number]> = {
  30: [0, 1],   // Regenerate HP: p1 / p2f
  67: [0, 1],   // Reincarnate (regeneration): p1 HP / p2f
  77: [0, 1],   // HP regen (allies): p1 / p2f
  277: [0, 2],  // Grants HP regen: p1 / p3f
};

function abilityRate(inf: AbilityInfluence): string | null {
  const spec = inf.influence_type != null ? ABILITY_RATE_PARAMS[inf.influence_type] : null;
  if (!spec) return null;
  const amount = inf.params?.[spec[0]] || 0;
  const frames = inf.params?.[spec[1]] || 0;
  if (!amount || !frames) return null;
  return `≈${Math.round((amount * 60) / frames)}/s`;
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
  // the humanized value line: label's template filled with actual params.
  const filled = label?.tpl ? fillLabel(label.tpl, inf.params) : null;
  const rate = abilityRate(inf);
  return (
    <li key={i}>
      <code>{parts.join(" · ")}</code>
      <InfluenceLabel label={label} />
      {filled && <span className="meaning"> {filled}</span>}
      {rate && <span className="dot-calc"> {rate}</span>}
      {inf.missiles && Object.entries(inf.missiles).map(([mid, m]) => (
        <span className="meaning" key={mid}> missile {mid}: {missileText(m)}</span>
      ))}
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

// `token` is the full token INCLUDING its brackets ("<ATK>" or "[ATK]").
function resolveToken(
  token: string,
  s: SkillStage
): { min: number; max?: number; source: string } | null {
  const rowValue = (row: SkillInfluence, field: "mul3" | "add", why: string) => ({
    min: row[field] as number,
    max: field === "mul3" ? row.mul3_cap ?? undefined : undefined,
    source: `influence ${row.influence_type} ${field}${row.power_filled ? " (Power)" : ""}${why}`,
  });

  // 1) a row TAGGED with this exact token (Tag0/TagDiff, the game's own
  // wiring) is authoritative. Ungated rows win over activate_if-gated
  // per-tier template variants.
  const tagged = (s.influences || []).filter((r) => r.tag === token && r.mul3 != null);
  const tagRow = tagged.find((r) => !r.activate_if) || tagged[0];
  if (tagRow) {
    return rowValue(tagRow, "mul3", tagRow.activate_if
      ? ` (gated: ${tagRow.activate_if_human || tagRow.activate_if})` : ", tagged");
  }

  const name = token.slice(1, -1);
  if (name === "TIME") {
    if (s.duration == null) return null;
    return { min: s.duration, max: s.duration_max, source: "Duration" };
  }
  // 2) type-mapped fallback. Power is already integrated into mul3 at export
  // (power_filled rows), so one uniform read covers both fixed and
  // Power-driven rows. Ungated rows only -- gated rows are per-class-tier
  // variants of a shared template (e.g. Bernard #10's GetClassID()==880 DEF
  // row 240..300 vs everyone's 130..170).
  const spec = TOKEN_INFLUENCES[name];
  if (spec) {
    const rows = (s.influences || []).filter(
      (r) => r.influence_type != null && spec.types.includes(r.influence_type)
    );
    const row = rows.find((r) => r[spec.field] != null && !r.activate_if);
    if (row) return rowValue(row, spec.field, "");
    if (COUNT_TOKENS.has(name)) {
      // counts are never Power-filled; a gated row is better than an
      // unfilled token (tooltip shows the gate).
      const gated = rows.find((r) => r[spec.field] != null);
      if (!gated) return null;
      return rowValue(gated, spec.field,
        ` (gated: ${gated.activate_if_human || gated.activate_if})`);
    }
  }
  // 3) last resort: the raw Power field (no longer displayed anywhere else).
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
  // both token styles occur in the game text: <ATK> and [ATK]
  const parts = text.split(/(<[A-Z_]+>|\[[A-Z_]+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^(<[A-Z_]+>|\[[A-Z_]+\])$/);
        if (!m) return part;
        const resolved = resolveToken(part, s);
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
  s, i, labels, abilityLabels, chargePos, inlined,
}: {
  s: SkillStage; i: number;
  labels: Record<string, UnitInfluenceLabel>; abilityLabels: Record<string, UnitInfluenceLabel>;
  chargePos?: [number, number];
  inlined?: Set<number>;
}) {
  // swap targets NOT shown as a stage below (e.g. the AW skill swapping back
  // to the base skill, or a charge chain cycling to its origin).
  const externalSwaps = (s.swaps_to || []).filter((id) => !inlined?.has(id));
  // only tokens that could NOT be substituted are worth flagging
  const unresolved = [...new Set((s.text || "").match(/<[A-Z_]+>|\[[A-Z_]+\]/g) || [])]
    .filter((t) => !resolveToken(t, s));
  const nInf = (s.influences?.length || 0) + (s.linked_ability_influences?.length || 0);
  return (
    <tr key={s.id}>
      <td className="unit-class-name-cell">
        {s.name_en || s.name}
        {s.name_en && s.name && <div className="muted small">{s.name}</div>}
        <span className="muted small"> #{s.id}</span>
        {i > 0 && <StageBadge s={s} chargePos={chargePos} />}
        {externalSwaps.length > 0 && (
          <div className="muted small">
            → swaps to skill {externalSwaps.map((id) => `#${id}`).join(", ")}
          </div>
        )}
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
            <>
              <div className="muted small linked-ability-head">
                linked ability effects (granted by the type-122 row):
              </div>
              <ul className="effects">
                {s.linked_ability_influences.map((inf, j) => (
                  <AbilityInfluenceRow
                    inf={inf} i={j} key={j}
                    label={inf.influence_type != null ? abilityLabels[String(inf.influence_type)] : undefined}
                  />
                ))}
              </ul>
            </>
          )}
        </InfluenceToggle>
      </td>
      <td>{s.duration != null ? `${s.duration}${s.duration_max ? ` → ${s.duration_max}` : ""}` : "-"}</td>
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
  const inlined = new Set(skill.stages.map((s) => s.id));
  return (
    <section>
      <h3>
        {label}: {skill.name_en || skill.name}
        {skill.name_en && skill.name && <span className="muted small"> {skill.name}</span>}
        {" "}<span className="muted small">#{skill.id}</span>
      </h3>
      <table className="grid unit-detail-table">
        <thead>
          <tr>
            <th>Name</th><th>Effect</th>
            <th>Duration</th><th>Cooldown</th><th>Max Level</th>
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
                  chargePos={item.chargePos} inlined={inlined}
                />
              );
            }
            if (expandGaps) {
              return item.stages.map((x) => (
                <SkillStageRow
                  key={`s${x.s.id}-${x.i}`}
                  s={x.s} i={x.i}
                  labels={labels} abilityLabels={abilityLabels}
                  chargePos={x.chargePos} inlined={inlined}
                />
              ));
            }
            return (
              <tr key={`gap${k}`} className="stage-gap-row">
                <td colSpan={5}>
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
            <td className="unit-class-name-cell">
              {ability.name_en || ability.name}
              {ability.name_en && ability.name && <div className="muted small">{ability.name}</div>}
              <span className="muted small"> #{ability.id}</span>
            </td>
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

// ability 188 "Gain ranged atk" (invoke inherent · target self, p1 = range,
// user-confirmed): a melee unit that carries it attacks at that range --
// surface it in the stat box. Class-attribute rows apply to their own class;
// ability-level rows apply unit-wide.
function inherentRange(rows?: { influence_type?: number; invoke?: string | number; target?: string | number; params?: number[] }[] | null): number | null {
  for (const r of rows || []) {
    if (r.influence_type === 188 && r.invoke === "inherent" && r.target === "self" && r.params?.[0]) {
      return r.params[0];
    }
  }
  return null;
}

function StatsTable({ unit, classMap }: { unit: Unit; classMap?: Record<string, string> }) {
  const classes = unit.classes;
  if (classes.length === 0) return null;
  const unitRange188 =
    inherentRange(unit.abilities.default?.influences) ??
    inherentRange(unit.abilities.awakened?.influences);
  return (
    <>
      <table className="grid unit-stat-table">
        <thead>
          <tr>
            <th>Icon</th><th>Class</th><th>Lv</th>
            <th>HP</th><th>ATK</th><th>DEF</th><th>MR</th>
            <th>Range/Block</th><th>Targets</th><th>Atk attr</th><th>Atk speed</th>
            <th>Cost</th><th>AFF bonus</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((cl, ci) => {
            const first = cl.stats[0];
            const last = cl.stats[cl.stats.length - 1];
            const range188 = inherentRange(cl.class_ability_influences) ?? unitRange188;
            return (
              <tr key={cl.class_id}>
                <td>
                  <UnitImage kind="icon" id={unit.dot_id} tier={Math.max(0, cl.cc - 1)} className="unit-icon-thumb" />
                </td>
                <td className="unit-class-name-cell" title={cl.name}>
                  {cl.name ? (
                    <Link to={`/units?class=${encodeURIComponent(cl.name)}`}>
                      {classMap?.[cl.name] || cl.name}
                    </Link>
                  ) : "?"}{" "}
                  <span className="muted small">(tier {cl.cc})</span>
                </td>
                <td className="num">
                  {first && last ? (first.level === last.level ? first.level : `${first.level}–${last.level}`) : "-"}
                </td>
                <td className="num">{statRange(cl.stats.map((s) => s.hp))}</td>
                <td className="num">{statRange(cl.stats.map((s) => s.atk))}</td>
                <td className="num">{statRange(cl.stats.map((s) => s.def))}</td>
                <td className="num">{cl.magic_resistance ?? unit.magic_resistance ?? 0}</td>
                <td>
                  {cl.ranged
                    ? cl.range ?? "?"
                    : `${cl.range ?? "melee"} (block ${cl.block ?? "-"})`}
                  {!cl.ranged && range188 != null && (
                    <span className="meaning" title="attacks at range: ability 188 (Gain ranged atk, inherent · self)">
                      {" "}· range {range188}
                    </span>
                  )}
                </td>
                <td className="num">{cl.max_target ?? "-"}</td>
                <td>{cl.attack_attribute ?? "-"}</td>
                <td>
                  {cl.attack_interval != null
                    ? `${cl.attack_interval}f (${(cl.attack_interval / 60).toFixed(2)}s)`
                    : "?"}
                </td>
                <td>{cl.cost_min} → {cl.cost_max}</td>
                {ci === 0 && (
                  <td rowSpan={classes.length} className="aff-cell">
                    {unit.affection_bonuses && unit.affection_bonuses.length > 0
                      ? unit.affection_bonuses.join(", ")
                      : "-"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function ClassAttributes({
  classes, labels, classMap,
}: { classes: UnitClass[]; labels: Record<string, UnitInfluenceLabel>; classMap?: Record<string, string> }) {
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
              <td className="unit-class-name-cell" title={cl.name}>
                {cl.name ? (
                  <Link to={`/units?class=${encodeURIComponent(cl.name)}`}>
                    {classMap?.[cl.name] || cl.name}
                  </Link>
                ) : null}
                {cl.name && classMap?.[cl.name] && (
                  <div className="muted small">{cl.name}</div>
                )}
              </td>
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
  const loc = useLocalisation();
  const princeTitles = usePrinceTitles();
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

  // art tiers with an actual local file (exported as art_tiers); fall back
  // to the class-chain guess when the export predates the field.
  const maxCc = Math.max(0, ...unit.classes.map((c) => c.cc));
  const artTiers = unit.art_tiers ?? [0, ...[1, 2, 3].filter((t) => t + 1 <= maxCc)];

  const allTokens = unit.classes.flatMap((c) => c.tokens);
  const displayName = unit.name_en || unit.name || "(unnamed)";

  return (
    <div className="detail unit-page">
      <Link to="/units" className="back">← units</Link>

      <aside className="unit-infobox">
        <div className={`unit-infobox-banner rarity-${unit.rarity_id}`}>{displayName}</div>
        <UnitImage kind="art" id={unit.dot_id} tier={tier} fallbackKind="icon" className="unit-art-img" alt={displayName} />
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
          <span className="meta-chip">{unit.rarity}</span>
          <span className="meta-chip">{unit.gender}</span>
          {unit.faction && (
            <Link className="meta-chip" to={`/units?tag=${encodeURIComponent(unit.faction)}`} title={unit.faction}>
              {loc?.races[unit.faction] || unit.faction}
            </Link>
          )}
          {unit.race && (
            <span className="meta-chip" title={unit.race}>{loc?.races[unit.race] || unit.race}</span>
          )}
          {unit.big_race && (
            <span className="meta-chip" title={unit.big_race}>{loc?.races[unit.big_race] || unit.big_race}</span>
          )}
          {(unit.identity_tags || []).map((t) => (
            <Link className="meta-chip" to={`/units?tag=${encodeURIComponent(t)}`} key={t} title={t}>
              {loc?.tags[t] || t}
            </Link>
          ))}
          {unit.genus && (
            <Link className="meta-chip" to={`/units?tag=${encodeURIComponent(unit.genus)}`} title={unit.genus}>
              {loc?.tags[unit.genus] || unit.genus}
            </Link>
          )}
        </div>
      </aside>

      <h2>
        #{unit.id} {displayName}
        {unit.name_en && unit.name && (
          <span className="muted" style={{ fontSize: 14 }}> {unit.name}</span>
        )}
        {unit.npc && <span className="badge"> NPC/test</span>}
      </h2>

      {unit.prince && princeTitles && princeTitles.length > 1 && (
        <details className="prince-titles">
          <summary>
            Prince titles ({princeTitles.length}) — titles change his skills / abilities / stats
          </summary>
          <ul className="stage-links">
            {princeTitles.map((t) => (
              <li key={t.id}>
                {t.id === unit.id ? (
                  <strong>{t.name_en || t.name}{t.level ? ` (Lv ${t.level})` : ""} ← current</strong>
                ) : (
                  <Link to={`/units/${t.id}`}>
                    {t.name_en || t.name}{t.level ? ` (Lv ${t.level})` : ""}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section>
        <h3>Stats</h3>
        <StatsTable unit={unit} classMap={loc?.classes} />
        <p className="muted small">stat values exclude affection bonuses</p>
      </section>

      <SkillBlock label="Base skill" skill={unit.skills.base} labels={skillLabels} abilityLabels={abilityLabels} />
      <SkillBlock label="Class-evolved skill" skill={unit.skills.class_evolved} labels={skillLabels} abilityLabels={abilityLabels} />
      <SkillBlock label="Awakened skill" skill={unit.skills.awakened} labels={skillLabels} abilityLabels={abilityLabels} />

      <AbilityBlock label="Ability" ability={unit.abilities.default} labels={abilityLabels} />
      {/* heroes/AW-start units carry the SAME ability in both slots -- show once */}
      {unit.abilities.awakened?.id !== unit.abilities.default?.id && (
        <AbilityBlock
          label={unit.abilities.awaken_ability_level
            ? `Level ${unit.abilities.awaken_ability_level} ability`
            : "Awakened ability"}
          ability={unit.abilities.awakened}
          labels={abilityLabels}
        />
      )}

      <ClassAttributes classes={unit.classes} labels={abilityLabels} classMap={loc?.classes} />

      {allTokens.length > 0 && (
        <section>
          <h3>Tokens</h3>
          {allTokens.map((t, i) => (
            <div key={i} className="unit-token-card">
              <div className="meta token-head">
                <UnitImage kind="icon" id={t.unit} className="unit-icon-thumb" alt={String(t.unit)} />
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
              {t.skills?.base && (
                <SkillBlock label="Token skill" skill={t.skills.base}
                  labels={skillLabels} abilityLabels={abilityLabels} />
              )}
              {t.skills?.class_evolved && (
                <SkillBlock label="Token skill (evolved)" skill={t.skills.class_evolved}
                  labels={skillLabels} abilityLabels={abilityLabels} />
              )}
              {t.skills?.awakened && (
                <SkillBlock label="Token skill (awakened)" skill={t.skills.awakened}
                  labels={skillLabels} abilityLabels={abilityLabels} />
              )}
              {t.abilities?.default && (
                <AbilityBlock label="Token ability" ability={t.abilities.default} labels={abilityLabels} />
              )}
              {t.abilities?.awakened && (
                <AbilityBlock label="Token ability (awakened)" ability={t.abilities.awakened} labels={abilityLabels} />
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
