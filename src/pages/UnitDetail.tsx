import { useState, useEffect, createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useUnitDetail, useUnitInfluenceLabels, useLocalisation, useTexts, usePrinceTitles, useMissiles, useAbilityConfigs, useUnitSpeech, unitImageUrl, unitAnimUrl } from "../data";
import { UnitImage, missileText, fillLabel, HumanText, fmtFrames, ColorCodedText } from "../components";
import { influenceSelectionRule } from "../influenceLabels";
import type {
  Unit,
  UnitClass,
  UnitSkill,
  UnitAbility,
  SkillInfluence,
  AbilityInfluence,
  UnitInfluenceLabel,
  InfluenceSelectionRule,
  InfluenceExtend,
  SkillStage,
  Missile,
  AffectionBonus,
  UnitSpeech,
  SpeechScene,
} from "../types";

const SELECTION_RULE_TEXT: Record<InfluenceSelectionRule, string> = {
  highest_value: "highest value applies",
  highest_duration: "longest duration applies; value does not decide the winner",
  forced_priority: "forced priority: replaces the existing further-healing effect even when lower",
  additive: "stacks additively with the same buff family",
  additive_then_sortie_multiplicative: "adds with this buff family, then multiplies with sortie HP buffs",
  highest_within_stack_id: "highest value applies within the same stack ID",
  shared_healing_slot: "shares one healing-received slot with skill 233 / ability 220; they do not stack",
  new_instance: "creates a new instance instead of replacing an existing one",
  replaces_existing: "replaces an existing instance from this effect family",
};

function SelectionRule({
  rule, groupChangeFunction,
}: {
  rule?: InfluenceSelectionRule; groupChangeFunction?: number;
}) {
  if (!rule) return null;
  const raw = rule === "forced_priority" && groupChangeFunction != null
    ? ` Type_ChangeFunction ${groupChangeFunction} selects forced-priority mode ${groupChangeFunction & 3}.`
    : "";
  return (
    <span className={`selection-rule selection-rule--${rule}`} title={`${SELECTION_RULE_TEXT[rule]}.${raw}`}>
      {SELECTION_RULE_TEXT[rule]}
      {rule === "forced_priority" && groupChangeFunction != null
        ? ` (group mode ${groupChangeFunction})` : ""}
    </span>
  );
}

// published missiles.json lookup, provided once at the page root so deeply
// nested rows (ExtendProps, CommandFacts -- both several components removed
// from the page's useMissiles() call) can resolve a raw missile id without
// prop-drilling it through every intermediate component.
const MissilesContext = createContext<Record<string, Missile> | null>(null);

// published ability_configs.json lookup (every AbilityConfig._ConfigID's
// resolved influence rows), provided once at the page root so ability
// influence type 189 ("Grant ability") can resolve its raw config id
// without a per-row backend lookup.
const AbilityConfigsContext = createContext<Record<string, AbilityInfluence[]> | null>(null);

// JP->EN description maps (data/texts.json, machine-translated), keyed by the
// raw JP text so any component holding the JP string can look its translation
// up directly.
type TextMaps = { skill: Record<string, string>; ability: Record<string, string>; cls: Record<string, string> };
const TextsContext = createContext<TextMaps>({ skill: {}, ability: {}, cls: {} });

// ---- "Command" script decoding (client-side, so iterating doesn't need a
// re-export) ---------------------------------------------------------------
// Two ids are literally named "Command" -- UnitSpecialty type 34 and
// ability type 72 -- whose ENTIRE meaning rides in a raw engine script
// instead of numeric params. Surveyed every distinct script across all real
// carriers (76 UnitSpecialty rows / 55 distinct ability-72 commands); only
// a handful of verbs are actually used, decoded below. Never invented --
// each verb's argument meaning comes from its own name/units in the string.
type CommandFact =
  | { kind: "hit_effect"; style: string; effect: string; gate?: string }
  | { kind: "missile_override"; tiers: Record<string, number>; gate?: string }
  | { kind: "on_death_explosion"; trigger: string; range?: number; missile?: number; effect?: string; sound?: string }
  // 2nd param on both slow/damage fields is a FIXED radius override, NOT
  // doubled like the Revenge/MissileShot Range fields -- 0/absent uses the
  // unit's own attack range (verified on Uesugi Kenshin's slow field and
  // Ulyxes/Rouyu's damage fields).
  | { kind: "slow_field"; percent?: number; range?: number }
  | { kind: "damage_field"; mode: "damageattack" | "damageratio"; amount?: number; range?: number; interval_f?: number }
  | { kind: "missile_shot"; missile?: number; shots?: number; shot_delay_f?: number; target_max?: number; atk_amp_pct?: number; range?: number }
  | { kind: "other"; verb: string; params?: number[] };

function toNum(v?: string): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}
function commandKv(args: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)\s*=\s*"?([^",()]+)"?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(args))) out[m[1]] = m[2];
  return out;
}

function decodeSpecialtyCommand(cmd?: string | null): CommandFact[] {
  if (!cmd) return [];
  const out: CommandFact[] = [];
  const gate = /if\(\s*(.*?)\s*\)\s*\{/.exec(cmd)?.[1];
  const hitFx = /SetHitEffect\(\s*"Style=([^"]*)"\s*,\s*"Effect=([^"]*)"\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = hitFx.exec(cmd))) out.push({ kind: "hit_effect", style: m[1], effect: m[2], gate });
  const setMissile = /SetMissile\(\s*((?:"cc\d+=\d+"\s*,?\s*)+)\)/g;
  while ((m = setMissile.exec(cmd))) {
    const tiers: Record<string, number> = {};
    const ccPair = /cc(\d+)=(\d+)/g;
    let cm: RegExpExecArray | null;
    while ((cm = ccPair.exec(m[1]))) tiers[`cc${cm[1]}`] = Number(cm[2]);
    out.push({ kind: "missile_override", tiers, gate });
  }
  return out;
}

function decodeAbilityCommand(cmd?: string | null): CommandFact[] {
  if (!cmd) return [];
  const out: CommandFact[] = [];
  const revenge = /DoUnit_RegistCommand\(\s*"(On\w+)"\s*,\s*"?DoUnitAction_Revenge\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = revenge.exec(cmd))) {
    const kv = commandKv(m[2]);
    // Range is displayed at HALF its raw value in-game (verified on both
    // on-deploy and on-death missile-range commands).
    const rawRange = toNum(kv.Range);
    out.push({
      kind: "on_death_explosion", trigger: m[1], range: rawRange != null ? rawRange * 2 : undefined,
      missile: toNum(kv.Missile), effect: kv.Effect, sound: kv.Sound,
    });
  }
  const createField = /DoUnitAction_CreateField\(\s*"(\w+)"\s*,\s*([^)]*)\)/g;
  while ((m = createField.exec(cmd))) {
    const mode = m[1];
    const nums = m[2].split(",").map((s) => s.trim()).filter(Boolean).map(Number);
    if (mode === "slow") {
      // 2nd param = fixed range override, 0/absent = unit's own attack range.
      out.push({ kind: "slow_field", percent: nums[0], range: nums[1] || undefined });
    } else if (mode === "damageattack" || mode === "damageratio") {
      // 2nd param = fixed range override, 0/absent = unit's own attack
      // range (same as slow's 2nd param).
      out.push({
        kind: "damage_field", mode,
        amount: nums[0], range: nums[1] || undefined, interval_f: nums[2],
      });
    } else {
      out.push({ kind: "other", verb: mode, params: nums });
    }
  }
  const missileShot = /DoUnitAction_MissileShot\(([^)]*)\)/g;
  while ((m = missileShot.exec(cmd))) {
    const kv = commandKv(m[1]);
    // Range is displayed at HALF its raw value in-game (same doubling as
    // on_death_explosion above).
    const rawRange = toNum(kv.Range);
    out.push({
      kind: "missile_shot", missile: toNum(kv.Missile), shots: toNum(kv.ShotNum),
      shot_delay_f: toNum(kv.ShotDelay), target_max: toNum(kv.TargetMax),
      atk_amp_pct: toNum(kv.AttackAmp), range: rawRange != null ? rawRange * 2 : undefined,
    });
  }
  return out;
}

// resolves a raw missile id against the published missiles.json lookup --
// the decode is client-side, but the missile facts live only in
// Missile.atb, so a small published table is needed for anything beyond
// the bare id.
function missileRef(mid: number | undefined, missiles?: Record<string, Missile> | null): string {
  if (mid == null) return "?";
  const info = missiles?.[String(mid)];
  return info ? `#${mid} (${missileText(info)})` : `#${mid}`;
}

function commandFactText(f: CommandFact, missiles?: Record<string, Missile> | null): string {
  switch (f.kind) {
    case "hit_effect":
      return `hit effect: ${f.style} → ${f.effect}${f.gate ? ` (if ${f.gate})` : ""}`;
    case "missile_override":
      return `missile override per class tier: ${Object.entries(f.tiers).map(([k, v]) => `${k}=${missileRef(v, missiles)}`).join(", ")}${f.gate ? ` (if ${f.gate})` : ""}`;
    case "on_death_explosion":
      return `${f.trigger === "OnDead" ? "on death" : "on escape"}: explosion, range ${f.range ?? "?"}${f.missile ? `, missile ${missileRef(f.missile, missiles)}` : ""}`;
    case "slow_field":
      return `creates a field (range ${f.range ?? "unit's own range"}): slows enemies ${f.percent ?? "?"}%`;
    case "damage_field": {
      // both modes divide the raw amount by 100: damageattack is % of ATK,
      // damageratio is % of the enemy's max HP.
      const isAtk = f.mode === "damageattack";
      const pct = f.amount != null ? f.amount / 100 : f.amount;
      const base = isAtk ? "% ATK" : "% of enemy max HP";
      const perSec = pct != null && f.interval_f
        ? ` (${Math.round((pct * 60 / f.interval_f) * 100) / 100}${base}/s)` : "";
      return `creates a damage field (range ${f.range ?? "unit's own range"}): ${pct ?? "?"}${base} every ${fmtFrames(f.interval_f)}${perSec}`;
    }
    case "missile_shot":
      return `fires missile ${missileRef(f.missile, missiles)} ×${f.shots ?? 1}, delay ${f.shot_delay_f ?? "?"}f, up to ${f.target_max ?? "?"} targets, ${f.atk_amp_pct ?? 100}% ATK, range ${f.range ?? "?"}`;
    default:
      return `${f.verb}${f.params ? ` [${f.params.join(", ")}]` : ""}`;
  }
}

function CommandFacts({ cmd, kind }: { cmd?: string | null; kind: "specialty" | "ability" }) {
  const missiles = useContext(MissilesContext);
  if (!cmd) return null;
  const facts = kind === "specialty" ? decodeSpecialtyCommand(cmd) : decodeAbilityCommand(cmd);
  if (!facts.length) return <span className="expr" title={cmd}> {cmd}</span>;
  return (
    <>
      {facts.map((f, i) => (
        <span className="meaning" key={i} title={cmd}> {commandFactText(f, missiles)}</span>
      ))}
    </>
  );
}

function InfluenceLabel({ label, nameOverride }: { label?: UnitInfluenceLabel; nameOverride?: string }) {
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
      {" "}{nameOverride ?? label.name}{!label.verified && " (unverified)"}
    </span>
  );
}

// skill ids 2/3/4/5/89/90 (ATK/DEF buffs, Type-A/B/C): the static "Type-A/
// B/C" name only describes rows that target OTHER units -- a target=self
// row on these same ids is the unit's own self-buff, not a Type-anything.
// Override the displayed name in that case; the note/tooltip still
// explains the distinction.
const SELF_BUFF_NAME: Record<number, string> = {
  2: "Self ATK buff", 3: "Self ATK buff", 89: "Self ATK buff",
  4: "Self DEF buff", 5: "Self DEF buff", 90: "Self DEF buff",
};
function skillLabelName(inf: SkillInfluence): string | undefined {
  if (inf.target === "self" && inf.influence_type != null) {
    return SELF_BUFF_NAME[inf.influence_type];
  }
  return undefined;
}

// ---- ExtendProperty decoding ----------------------------------------------
// Unified English for every recurring key across SkillInfluenceConfig and
// AbilityConfig extends. Time values are 60fps engine frames. Keys not
// listed fall through raw (k=v) -- never silently dropped.
function frames(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return `${v}f`;
  return fmtFrames(n);
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
    .replace(/GetDefeatsCountOfPlayer\(\)/g, "allied units defeated")
    .replace(/\+/g, " and ");
}

// ids whose "mulLim" extend key holds a FRAME count, not a percent (the
// generic mulLim case below assumes percent, which is right almost
// everywhere else): 211 Conditional skill CD reduction and 212 Conditional
// skill duration increase both cap their gain in frames (e.g. mulLim=600 ->
// 10s, not 600%).
const FRAME_MULLIM_IDS = new Set([211, 212]);

const MISSILE_ID_KEYS = new Set(["ミサイルID", "ミサイルID1", "ミサイルID2", "Missile", "ミサイル反撃時ID"]);

const SKILL_OPTION_TEXT: Record<string, string> = {
  "発動中増加なし": "No Gain During Skill",
  "発動中減少なし": "No Decrease During Skill",
  "終了時増加クリア": "Cleared On Skill End",
};

const OPTION_TEXT: Record<string, string> = {
  "挑発": "Taunt",
  "隠密効果解除": "Removes Stealth",
  "魔界の影響無効化": "Makai Immunity",
  "ダメージ無効化": "Damage Nullify",
  "天候の影響無効化": "Weather Immunity",
  "水中の影響無効化": "Deep Sea Immunity",
  "地形ダメージ無効": "Terrain Damage Immunity",
};

const BARD_STAT_NAME: Record<number, string> = { 304: "HP", 305: "ATK", 306: "DEF", 307: "MR" };

function extendText(
  k: string, vRaw: string | number | (string | number)[], influenceType?: number,
  missiles?: Record<string, Missile> | null, extend?: InfluenceExtend
): string {
  // ミサイルID etc. can be a LIST (one id per hit/attribute, e.g. type 210
  // "between hit" -- [1115, 1115]), not always a scalar. Resolve EACH id
  // through the same missiles.json table as the Command decoder.
  if (MISSILE_ID_KEYS.has(k)) {
    const ids = Array.isArray(vRaw) ? vRaw : [vRaw];
    const prefix = k === "ミサイル反撃時ID" ? "counter missile" : "missile";
    return `${prefix} ${ids.map((id) => missileRef(Number(id), missiles)).join(", ")}`;
  }
  // スキル系オプション can carry multiple option strings at once -- translate
  // each individually rather than joining first and losing the per-item match.
  if (k === "スキル系オプション" && Array.isArray(vRaw)) {
    return vRaw.map((o) => SKILL_OPTION_TEXT[String(o)] || `option: ${o}`).join(", ");
  }
  // 属性 can carry multiple schools at once (e.g. type 210 alternating
  // physical/magic between hits) -- translate each individually rather than
  // joining first and losing the per-item match against SCHOOL.
  if (k === "属性" && Array.isArray(vRaw)) {
    return `school: ${vRaw.map((s) => SCHOOL[String(s)] || s).join("/")}`;
  }
  // オプション can also carry multiple option strings at once -- same
  // per-item translation issue as スキル系オプション above.
  if (k === "オプション" && Array.isArray(vRaw)) {
    return vRaw.map((o) => OPTION_TEXT[String(o)] || `option: ${o}`).join(", ");
  }
  // 対象属性 can carry multiple schools at once (e.g. "applies vs physical,
  // magic, and true damage") -- same per-item translation issue as 属性.
  if (k === "対象属性" && Array.isArray(vRaw)) {
    return `vs ${vRaw.map((s) => SCHOOL[String(s)] || s).join("/")}`;
  }
  // every OTHER key is scalar (multi-value extend lists like 属性/エフェクト are
  // rendered by their own array-aware callers, not this generic switch).
  const v: string | number = Array.isArray(vRaw) ? vRaw.join(",") : vRaw;
  if (k === "mulLim" && influenceType != null && FRAME_MULLIM_IDS.has(influenceType)) {
    return `cap ${frames(v)}`;
  }
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
    case "MulAdd": {
      const stat = influenceType != null ? BARD_STAT_NAME[influenceType] : undefined;
      return stat ? `${stat} +${v}%` : `+${v}%/count`;
    }
    case "MulMaxBase": return `base cap ${v}%`;
    case "MulMaxAdd": return Number(v) ? `for each target, cap +${v}%` : "";
    case "MulMax": return Number(v) && Number(extend?.MulMaxAdd) ? `max cap ${v}%` : "";
    case "上昇": return `gain ${Number(v) / 100}%`;
    case "上限": return `cap ${Number(v) / 100}%`;
    case "減衰": return `decay ${Number(v) / 100}%`;
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
    // inverted flips the trigger direction -- the stat increases with each
    // attack instead of over time (seen on ability 191's gradual-ATK effect).
    // 増減反転 (ability 191's trigger-direction flag) is folded into the
    // displayed name via abilityLabelName instead of shown here.
    case "増減反転": return "";
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
    // 天候 (skill influence 276) holds the weather's CfgTypeWeatherList
    // CfgName, the same identifier shown on the enemy pages.
    case "天候": return `weather: ${v}`;
    case "スキル系オプション": return SKILL_OPTION_TEXT[String(v)] || `option: ${v}`;
    case "オプション": return OPTION_TEXT[String(v)] || `option: ${v}`;
    // War God Blessing family: each applicable school is its own boolean flag
    // key (not a single 属性 list), e.g. {魔法:1, 物理:1, 貫通:1} together.
    case "魔法": return "applies to: Magic";
    case "物理": return "applies to: Physical";
    case "貫通": return "applies to: Piercing";
    // internal tag confirming this row belongs to the battle_god_bless
    // mechanic -- already implied by the activate_command, no user-facing text.
    case "戦神の加護用": return "";
    // references (ミサイルID/ミサイル反撃時ID/Missile handled above, before the switch)
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

function ExtendProps({ extend, influenceType }: { extend?: InfluenceExtend; influenceType?: number }) {
  const missiles = useContext(MissilesContext);
  if (!extend) return null;
  const text = Object.entries(extend)
    .map(([k, v]) => extendText(k, v, influenceType, missiles, extend))
    .filter(Boolean)
    .join(", ");
  if (!text) return null;
  return <span className="params"> {text}</span>;
}

// One derived sentence fragment for a skill influence row: the multiplier /
// flat value read off mul3/add. Purely arithmetic (mul3 400 = x4.00), no
// per-id meaning invented -- the label name supplies the "what".
// ids whose `add` is a reference/flag handled elsewhere, not a plain value:
// 49 skill swap (chain UI), 122 linked ability, 121 (ability config ref),
// 21 missile (resolved into `missile`), 173/177 tick-scale direction, 47
// animation change (add is an animation index, not a meaningful count).
const SKILL_ADD_REF = new Set([21, 47, 49, 121, 122, 173, 177]);

const fmtX = (v: number) => `x${(v / 100).toFixed(2).replace(/\.?0+$/, "")}`;

function skillRowValue(inf: SkillInfluence, label?: UnitInfluenceLabel): string | null {
  // id 51 (Regeneration): mul = tick interval (frames), add = HP per tick --
  // show the raw amount, the interval as frames+seconds, and the computed
  // per-second rate together.
  if (inf.influence_type === 51 && inf.add != null && inf.mul) {
    const perSec = Math.round((inf.add * 60) / inf.mul);
    return `${inf.add} HP / ${fmtFrames(inf.mul)} (${perSec} HP/s)`;
  }
  // ids 59/60 (Reduce enemy MR/DEF): mul is a two-way modifier, "reduce TO
  // mul% of normal" (mul=80 = -20%), not a raw reduction percent -- mul3 on
  // these rows is an unrelated Power-filled value.
  if ((inf.influence_type === 59 || inf.influence_type === 60) && inf.mul) {
    return `-${100 - inf.mul}%`;
  }
  // id 52 (Valkyrie UP modifier): mul is the multiplier directly (mul=200
  // matches carrier text "コスト回復2倍" = x2 cost recovery), never Power-filled.
  if (inf.influence_type === 52 && inf.mul) {
    return fmtX(inf.mul);
  }
  // id 116 (Ally magic damage amplification): mul is the multiplier directly
  // (Chibi Anri's フルエンチャント carries three rows gated by class-change
  // stage, mul=110/130/135, scaling up per evolution) -- was rendering
  // nothing at all since no tpl referenced mul.
  if (inf.influence_type === 116 && inf.mul) {
    return fmtX(inf.mul);
  }
  // ids 145/146 (Dancer ATK/DEF share modifier): mul3 is a multiplier of the
  // shared percent, add is a flat amount added to it -- either can be absent
  // or mul3 neutral (100), so only show whichever part actually changes it.
  if (inf.influence_type === 145 || inf.influence_type === 146) {
    const parts: string[] = [];
    if (inf.mul3 != null && inf.mul3 !== 100) parts.push(fmtX(inf.mul3));
    if (inf.add) parts.push(`+${inf.add} flat`);
    return parts.length ? parts.join(", ") : null;
  }
  // id 170 (Permanent PAD modification): PAD is set to add+1, not reduced by
  // add directly (Aleese (Swimsuit)'s add=5 sets PAD to 6).
  if (inf.influence_type === 170 && inf.add != null) {
    return `to ${inf.add + 1}`;
  }
  // id 14 (Set PAD): probably shares 170's add+1 offset, not yet
  // independently confirmed for this id.
  if (inf.influence_type === 14 && inf.add != null) {
    return `to ${fmtFrames(inf.add + 1)}`;
  }
  // ids 85/86/87 (ATK/DEF/Lose-HP with rarity): add is always the target
  // rarity id; the buff/loss amount is mul3 when Power-filled but some
  // carriers have no Power on this row at all, so show whichever is
  // actually present rather than a broken placeholder.
  if (inf.influence_type === 85 || inf.influence_type === 87) {
    return `${inf.mul3 != null ? fmtX(inf.mul3) : "?"} (rarity ${inf.add ?? "?"})`;
  }
  if (inf.influence_type === 86 && inf.mul != null) {
    return `-${inf.mul}% HP (rarity ${inf.add ?? "?"})`;
  }
  // ids 72/77/79/98 (multi-hit/critical/multi-target/true-damage chance): mul3 is a
  // multiplier of the base chance, add is a flat +percent on top -- either
  // field can be absent on a given row, and mul3=100 is a no-op multiplier,
  // so only show whichever part actually changes anything.
  if (inf.influence_type === 72 || inf.influence_type === 77 || inf.influence_type === 79 || inf.influence_type === 98) {
    const parts: string[] = [];
    if (inf.mul3 != null && inf.mul3 !== 100) parts.push(fmtX(inf.mul3));
    if (inf.add) parts.push(`+${inf.add}%`);
    return parts.length ? parts.join(" ") : null;
  }
  // id 25 (Skill duration increase): a non-neutral mul3 sets duration to a
  // percentage of normal. Flat-second rows retain a neutral mul3=100 and put
  // the actual increase in add, so add must take precedence in that shape.
  if (inf.influence_type === 25) {
    if (inf.add) return `+${inf.add}s`;
    if (inf.mul3 != null && inf.mul3 !== 100) {
      const capped = inf.mul3_cap != null && inf.mul3_cap !== inf.mul3
        ? `${inf.mul3}% → ${inf.mul3_cap}% at max level` : `${inf.mul3}%`;
      return `to ${capped} of normal`;
    }
    return null;
  }
  // id 56 (Time stop): mul is the scope, not a value -- 1000 = all enemies
  // (a global sentinel), -1 = enemies within range only. Prefix the
  // duration template with the resolved scope.
  if (inf.influence_type === 56 && label?.tpl != null) {
    const scope = inf.mul === 1000 ? "all enemies" : inf.mul === -1 ? "enemies within range" : `mul ${inf.mul}`;
    const rest = label.tpl
      .replace(/\{mul2\}/g, String(inf.mul2 ?? "?"))
      .replace(/\{mul2s\}/g, inf.mul2 != null ? fmtFrames(inf.mul2) : "?");
    return `${scope}, ${rest}`;
  }
  // per-type template. Placeholders: {mul3}/{mul2}/{mul}/{add} raw numbers;
  // {mul3f}/{mul2s}/{mulf}/{addf} = the same field as frames+seconds;
  // {mul3pct} = mul3 as a literal percent (NOT a x-multiplier) with the
  // level-up cap folded in when present; {x} = mul3/100 as a multiplier.
  // "" = suppress entirely (pure flags).
  if (label?.tpl != null) {
    if (label.tpl === "") return null;
    const mul3pct = inf.mul3 != null
      ? (inf.mul3_cap != null && inf.mul3_cap !== inf.mul3
        ? `${inf.mul3}% → ${inf.mul3_cap}% at max level`
        : `${inf.mul3}%`)
      : "?%";
    return label.tpl
      .replace(/\{mul3pct\}/g, mul3pct)
      .replace(/\{mul3f\}/g, inf.mul3 != null ? fmtFrames(inf.mul3) : "?")
      .replace(/\{mul3\}/g, String(inf.mul3 ?? "?"))
      .replace(/\{mul2s\}/g, inf.mul2 != null ? fmtFrames(inf.mul2) : "?")
      .replace(/\{mul2\}/g, String(inf.mul2 ?? "?"))
      .replace(/\{mulf\}/g, inf.mul != null ? fmtFrames(inf.mul) : "?")
      .replace(/\{mul\}/g, String(inf.mul ?? "?"))
      .replace(/\{addf\}/g, inf.add != null ? fmtFrames(inf.add) : "?")
      .replace(/\{add\}/g, String(inf.add ?? "?"))
      .replace(/\{x\}/g, inf.mul3 != null ? fmtX(inf.mul3) : "?");
  }
  if (inf.influence_type === 49) {
    // swap target 0 / absent = LIMITED USE: no skill remains after this one
    // finishes. Non-zero targets render via the chain UI.
    return inf.add ? null : "limited use — no skill after this finishes";
  }
  if (inf.mul3 != null) {
    const base = fmtX(inf.mul3);
    const capped = inf.mul3_cap != null && inf.mul3_cap !== inf.mul3
      ? `${base} → ${fmtX(inf.mul3_cap)} at max level`
      : base;
    return inf.power_filled ? `${capped} (Power)` : capped;
  }
  if (inf.influence_type === 122 && inf.add != null) {
    return `config #${inf.add}, effects below`;
  }
  if (inf.add != null && inf.influence_type != null && !SKILL_ADD_REF.has(inf.influence_type)) {
    return `value ${inf.add}`;
  }
  return null;
}

function SkillInfluenceRow({
  inf, i, label, siblings, groupChangeFunction,
}: {
  inf: SkillInfluence; i: number; label?: UnitInfluenceLabel;
  siblings?: SkillInfluence[]; groupChangeFunction?: number;
}) {
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
  const value = skillRowValue(inf, label);
  // id 203 (Max cost consumption) means two different things depending on
  // whether the same skill also carries 204/205 (UP-consuming ATK/DEF buff):
  // with them, it's the UP consumed to reach the buff's max; without them,
  // it's just the flat cost required to activate the skill at all.
  const nameOverride = inf.influence_type === 203
    ? (siblings?.some((s) => s.influence_type === 204 || s.influence_type === 205)
      ? "Max UP consumed for scaling buff"
      : "Flat cost to activate")
    : skillLabelName(inf);
  return (
    <li key={i}>
      <code>{parts.join(" · ")}</code>
      <InfluenceLabel label={label} nameOverride={nameOverride} />
      {value && <span className="meaning"> {value}</span>}
      <SelectionRule
        rule={influenceSelectionRule("skill", inf.influence_type, groupChangeFunction)}
        groupChangeFunction={groupChangeFunction}
      />
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
      <ExtendProps extend={inf.extend} influenceType={inf.influence_type ?? undefined} />
      {(inf.expression_human || inf.expression) && (
        <span className="expr" title={inf.expression}>
          {" "}if <HumanText text={inf.expression_human || inf.expression || ""} />
        </span>
      )}
      {(inf.activate_if_human || inf.activate_if) && (
        <span className="expr" title={inf.activate_if}>
          {" "}(applies when <HumanText text={inf.activate_if_human || inf.activate_if || ""} />)
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

// ability 70/71/82 (ATK/DEF/HP "buff"): the static "Sortie/Deployment"
// name doesn't say which one a given row actually is -- its OWN `invoke`
// field ("sortie" or "deployed") already says so directly.
const INVOKE_STAT_NAME: Record<number, string> = { 70: "ATK Buff", 71: "DEF Buff", 82: "HP Buff", 76: "MR Buff" };
function abilityLabelName(inf: AbilityInfluence): string | undefined {
  // id 191 (Gradual Attack Increase): extend key 増減反転=1 inverts the
  // trigger direction from "while not attacking" to "after each attack" --
  // fold that into the displayed name instead of a buried extend annotation.
  if (inf.influence_type === 191) {
    return inf.extend?.["増減反転"]
      ? "Gradual Attack Increase (after each attack)"
      : "Gradual Attack Increase (while not attacking)";
  }
  const base = inf.influence_type != null ? INVOKE_STAT_NAME[inf.influence_type] : undefined;
  if (!base) return undefined;
  const invoke = String(inf.invoke ?? "");
  const prefix = invoke === "sortie" ? "Sortie" : invoke === "deployed" ? "Deployment" : invoke;
  return `${prefix} ${base}`;
}

function AbilityInfluenceRow({
  inf, i, label, labelsMap,
}: {
  inf: AbilityInfluence; i: number; label?: UnitInfluenceLabel;
  labelsMap?: Record<string, UnitInfluenceLabel>;
}) {
  const missiles = useContext(MissilesContext);
  const abilityConfigs = useContext(AbilityConfigsContext);
  if (label?.hidden) return null;
  // "while in the 1st barrack" is a rare, notable invoke condition (the
  // possession-item-gated War God Blessing family, plus a handful of real
  // units) -- the whole type/invoke/name/value group is flagged in red
  // (below, at render) so it stands out from ordinary rows.
  const isBarrackInvoke = inf.invoke === "while in the 1st barrack";
  const parts: ReactNode[] = [
    `type ${inf.influence_type}`,
    inf.invoke != null ? `invoke ${inf.invoke}` : null,
    inf.target != null ? `target ${inf.target}` : null,
    inf.params && inf.params.length ? `[${inf.params.join(", ")}]` : null,
  ].filter((p): p is NonNullable<typeof p> => p != null);
  // id 34 (Prevent status ailment): p1=100 is full immunity, any other
  // value is a reduction percent instead -- two different sentences, not
  // just a number substitution.
  let filled: ReactNode | null;
  if (inf.influence_type === 34 && inf.params?.[0] != null) {
    filled = inf.params[0] === 100 ? "Status Immunity" : `Status Effect Reduction ${inf.params[0]}%`;
  } else if ((inf.influence_type === 28 || inf.influence_type === 29) && inf.params?.[1] != null) {
    // ids 28/29 (Weather ATK/Range mod): p2=100 is plain resist (immune to
    // the reduction from bad weather); p2>100 is a real buff during bad
    // weather instead of just resisting it; p2<100 is a real (lesser)
    // reduction still applying, not full immunity.
    const stat = inf.influence_type === 28 ? "ATK" : "range";
    const p2 = inf.params[1];
    filled = p2 === 100
      ? `immune to weather ${stat} reduction`
      : p2 > 100
        ? `${stat} +${p2 - 100}% during bad weather`
        : `${stat} -${100 - p2}% during bad weather`;
  } else if (inf.influence_type === 39 && inf.params?.[0] != null) {
    // id 39 (Nullify attack restriction): p1 is an enum, only 3 ("while not
    // using skill") is confirmed so far -- other values show as raw numbers.
    filled = inf.params[0] === 3 ? "while not using skill" : String(inf.params[0]);
  } else if ([12, 13, 14].includes(inf.influence_type ?? -1)) {
    // ids 12/13/14 (HP/ATK/DEF mod): p1 is percent-of-normal ONLY for
    // invoke=inherent, target=self (the unit's own stat, wired into the
    // stat box). Every other invoke (1st barrack, sortie, deployed, ...)
    // is a buff row instead, where the same p1 slot is an additive
    // percent -- same param, different meaning, distinguished by invoke.
    if (inf.invoke === "inherent" && inf.target === "self") {
      // export compaction drops an all-zero params array entirely -- a
      // MISSING p1 here is still a real p1=0 ("set to 0x"), not "no
      // modification" to skip (found on real carriers, e.g. Leona
      // (Bedwear)'s DEF mod row with no params at all).
      filled = `→ ${inf.params?.[0] ?? 0}%`;
    } else {
      filled = inf.params?.[0] != null ? `+${inf.params[0]}%` : null;
    }
  } else if (inf.influence_type === 76) {
    // id 76 (MR Buff, sortie/deployment family): unlike 70/71/82, the value
    // itself switches by invoke, not just the name -- p1 on sortie rows, p2
    // on deployed rows.
    const v = inf.invoke === "sortie" ? inf.params?.[0] : inf.invoke === "deployed" ? inf.params?.[1] : null;
    filled = v != null ? `+${v} flat` : null;
  } else if (inf.influence_type === 21) {
    // id 21 (Range): p1 (base flat range) and p2 (1st-barrack flat bonus)
    // are independent -- don't show "+0 flat" when p1 is unset.
    const parts: string[] = [];
    if (inf.params?.[0]) parts.push(`+${inf.params[0]} flat`);
    if (inf.params?.[1]) parts.push(`+${inf.params[1]} flat`);
    filled = parts.length ? parts.join(", ") : null;
  } else if (inf.influence_type === 122) {
    // id 122 (Reduce enemy MR): p1 (percent) and p2 (flat) are independent --
    // a row can carry either or both, so don't show "-0%" when p1 is unset.
    const parts: string[] = [];
    if (inf.params?.[0]) parts.push(`-${inf.params[0]}%`);
    if (inf.params?.[1]) parts.push(`-${inf.params[1]} flat`);
    filled = parts.length ? parts.join(", ") : null;
  } else if (inf.influence_type === 137) {
    // id 137 (Deployment Spot MR buff): p1 is percent (100 = neutral, hide
    // it), p2 is a flat addition -- either can be present independently.
    const parts: string[] = [];
    if (inf.params?.[0] != null && inf.params[0] !== 100) parts.push(`→ ${inf.params[0]}%`);
    if (inf.params?.[1]) parts.push(`+${inf.params[1]} flat`);
    filled = parts.length ? parts.join(", ") : null;
  } else if ([155, 156, 157, 158].includes(inf.influence_type ?? -1)) {
    // ids 155/156/157/158 (Lukifer Death HP/ATK/DEF/MR buff): the gain per
    // death is p1-100, an arithmetic expression that must be computed, not
    // shown literally.
    filled = inf.params?.[0] != null ? `gain ${inf.params[0] - 100}% per death` : null;
  } else if ([160, 161, 162, 163].includes(inf.influence_type ?? -1)) {
    // ids 160-163 (Perma HP/ATK/DEF/MR gain on condition): real carriers use
    // EITHER p1 (percent, paired with a mulLim extend cap) OR p2 (flat,
    // paired with an addLim extend cap) depending on the specific carrier --
    // class-ability rows and unit-ability rows have been observed using
    // different fields for the same id, so show whichever is actually set.
    const parts: string[] = [];
    if (inf.params?.[0]) parts.push(`+${inf.params[0]}%`);
    if (inf.params?.[1]) parts.push(`+${inf.params[1]} flat`);
    filled = parts.length ? parts.join(", ") : null;
  } else if ([164, 165, 166, 167].includes(inf.influence_type ?? -1)) {
    // ids 164-167 (Death Count based HP/ATK/DEF/MR buff): same either/or
    // shape as 160-163 (p1 percent + mulLim, or p2 flat + addLim), just with
    // a "per death" suffix.
    const parts: string[] = [];
    if (inf.params?.[0]) parts.push(`+${inf.params[0]}%`);
    if (inf.params?.[1]) parts.push(`+${inf.params[1]} flat`);
    filled = parts.length ? `${parts.join(", ")} per death` : null;
  } else if (inf.influence_type === 188 && inf.params?.[0] != null) {
    // id 188 (Gain ranged attack): p1 is the range, p2 is a Missile.atb id
    // (resolved against the published missiles table, not embedded server-side).
    const range = `range ${inf.params[0]}`;
    const m = inf.params[1] != null ? missiles?.[String(inf.params[1])] : null;
    filled = m ? `${range}, missile: ${missileText(m)}` : range;
  } else {
    // the humanized value line: label's template filled with actual params.
    // Every ability tpl references at least one {pN} placeholder, so a row
    // with no params at all has nothing real to fill in -- skip it rather
    // than rendering zeroed-out placeholders (e.g. "0% / 0f (0.0s)").
    filled = label?.tpl && inf.params && inf.params.length
      ? fillLabel(label.tpl, inf.params)
      : null;
  }
  const rate = abilityRate(inf);
  return (
    <li key={i}>
      <span className={isBarrackInvoke ? "barrack-invoke" : undefined}>
        <code>
          {parts.map((p, j) => (
            <span key={j}>{j > 0 && " · "}{p}</span>
          ))}
        </code>
        <InfluenceLabel label={label} nameOverride={abilityLabelName(inf)} />
        {filled && <span className="meaning"> {filled}</span>}
        <SelectionRule rule={influenceSelectionRule("ability", inf.influence_type, undefined, inf.params)} />
      </span>
      {rate && <span className="dot-calc"> {rate}</span>}
      {inf.missiles && Object.entries(inf.missiles).map(([mid, m]) => (
        <span className="meaning" key={mid}> missile {mid}: {missileText(m)}</span>
      ))}
      <ExtendProps extend={inf.extend} influenceType={inf.influence_type ?? undefined} />
      {inf.influence_type === 72 ? (
        <CommandFacts cmd={inf.command} kind="ability" />
      ) : (inf.command_human || inf.command) && (
        <span className="expr" title={inf.command}>
          {" "}if <HumanText text={inf.command_human || inf.command || ""} />
        </span>
      )}
      {(inf.no_change_condition_human || inf.no_change_condition) &&
        inf.no_change_condition !== inf.command && (
        <span className="expr" title={inf.no_change_condition}>
          {" "}{(inf.command_human || inf.command) ? "and" : "if"}{" "}
          <HumanText text={inf.no_change_condition_human || inf.no_change_condition || ""} />
        </span>
      )}
      {(inf.activate_command_human || inf.activate_command) && (
        <span className="expr" title={inf.activate_command}>
          {" "}on <HumanText text={inf.activate_command_human || inf.activate_command || ""} />
        </span>
      )}
      {inf.influence_type === 206 && inf.params?.length ? (
        <div className="muted small linked-ability-head">
          alternative units: {inf.params.map((pid, j) => (
            <span key={pid}>
              {j > 0 && ", "}
              <Link to={`/units/${pid}`}>unit #{pid}</Link>
            </span>
          ))}
        </div>
      ) : null}
      {inf.influence_type === 189 && inf.params?.[0] != null && (
        <>
          <div className="muted small linked-ability-head">
            grants the ability effects below (config #{inf.params[0]}):
          </div>
          <ul className="effects effects--granted">
            {(abilityConfigs?.[String(inf.params[0])] ?? []).map((g, j) => (
              <AbilityInfluenceRow
                inf={g} i={j} key={j} labelsMap={labelsMap}
                label={g.influence_type != null ? labelsMap?.[String(g.influence_type)] : undefined}
              />
            ))}
          </ul>
        </>
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
  NUM_TARGET: { types: [22, 13], field: "add" },
  NUM_ATK: { types: [13], field: "add" },
  NUM_SHOT: { types: [7], field: "add" },
  NUM_BLOCK: { types: [12], field: "add" },
};
// tokens whose value is a count taken from `add` -- never power-filled.
const COUNT_TOKENS = new Set(["NUM_TRG", "NUM_TARGET", "NUM_ATK", "NUM_SHOT", "NUM_BLOCK"]);

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

// Substitute <TOKEN>s inside a skill text. A token directly followed by 倍
// is a multiplier (value/100); ％/秒/体/etc take the raw number. Unresolvable
// tokens stay as-is. English translations keep the tokens verbatim (rendered
// as "<ATK>x"), so the multiplier signal comes from the JP original.
function TokenText({ text, s, jp }: { text: string; s: SkillStage; jp: string }) {
  // both token styles occur in the game text: <ATK> and [ATK]
  const parts = text.split(/(<[A-Z_]+>|\[[A-Z_]+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^(<[A-Z_]+>|\[[A-Z_]+\])$/);
        if (!m) return part;
        const resolved = resolveToken(part, s);
        if (!resolved) return part;
        const asMul = (parts[i + 1] || "").startsWith("倍") || jp.includes(part + "倍");
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

// Skill effect text: the machine-translated English (when the map has this
// JP text) with the JP original kept underneath, else the JP alone.
function SkillText({ s }: { s: SkillStage }) {
  const texts = useContext(TextsContext);
  const jp = s.text || "";
  const en = texts.skill[jp];
  if (!en) return <TokenText text={jp} s={s} jp={jp} />;
  return (
    <>
      <span title="machine translated"><TokenText text={en} s={s} jp={jp} /></span>
      <div className="muted small"><TokenText text={jp} s={s} jp={jp} /></div>
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
                  siblings={s.influences}
                  groupChangeFunction={s.group_change_function}
                />
              ))}
            </ul>
          )}
          {s.linked_ability_influences && s.linked_ability_influences.length > 0 && (
            <>
              <div className="muted small linked-ability-head">
                linked ability effects (granted by the type-122 row):
              </div>
              <ul className="effects effects--granted">
                {s.linked_ability_influences.map((inf, j) => (
                  <AbilityInfluenceRow
                    inf={inf} i={j} key={j} labelsMap={abilityLabels}
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
  const texts = useContext(TextsContext);
  if (!ability) return null;
  const abilityEn = ability.text ? texts.ability[ability.text] : undefined;
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
              {ability.text && (abilityEn ? (
                <>
                  <span title="machine translated">{abilityEn}</span>
                  <div className="muted small"><ColorCodedText text={ability.text} /></div>
                </>
              ) : (
                <ColorCodedText text={ability.text} />
              ))}
              <InfluenceToggle count={ability.influences?.length || 0}>
                <ul className="effects">
                  {(ability.influences || []).map((inf, j) => (
                    <AbilityInfluenceRow
                      inf={inf} i={j} key={j} labelsMap={labels}
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

// ability 188 "Gain ranged atk" (invoke inherent, target self, p1 = range):
// a melee unit that carries it attacks at that range -- surface it in the
// stat box. Class-attribute rows apply to their own class; ability-level
// rows apply unit-wide.
function inherentRange(rows?: { influence_type?: number; invoke?: string | number; target?: string | number; params?: number[] }[] | null): number | null {
  for (const r of rows || []) {
    if (r.influence_type === 188 && r.invoke === "inherent" && r.target === "self" && r.params?.[0]) {
      return r.params[0];
    }
  }
  return null;
}

// MR mod (15) and Cost reduction (10), invoke=inherent target=self: a flat
// number wired directly into the displayed stat (same treatment as HP/ATK/DEF
// below), not a side badge. Range (21) also has an inherent+self shape, added
// directly to the displayed range/block number.
// ids 70/71/76/82/81 (surveyed across every unit's real data) are NEVER
// invoke=inherent+target=self -- they're always sortie/deployed buffs to
// OTHER units ("all"), so they don't belong in this self-stat-mod table at
// all; they render as ordinary buff rows in the ability list instead.
const FLAT_MOD_ID: Record<"mr" | "range" | "cost", number> = { mr: 15, range: 21, cost: 10 };
function flatMod(
  rows: { influence_type?: number; invoke?: string | number; target?: string | number; params?: number[] }[] | null | undefined,
  kind: "mr" | "range" | "cost"
): number | null {
  const id = FLAT_MOD_ID[kind];
  for (const r of rows || []) {
    if (r.invoke === "inherent" && r.target === "self" && r.influence_type === id) {
      const v = r.params?.[0] ?? 0;
      // cost's ability is always a REDUCTION ("Cost reduction"): its raw
      // param is a positive magnitude to subtract, not add.
      return kind === "cost" ? -v : v;
    }
  }
  return null;
}

// HP/ATK/DEF mod (12/13/14), invoke=inherent, target=self: p1 is percent
// OF NORMAL, wired directly into the displayed stat number (not a side
// badge). A row that exists with no params is p1=0 (export compaction
// drops all-zero params) -- a real "set stat to 0x", e.g. Leona
// (Bedwear) and Chiyome (Steamy Kunoichi)'s DEF mod.
const HP_ATK_DEF_MOD_ID: Record<"hp" | "atk" | "def", number> = { hp: 12, atk: 13, def: 14 };
function hpAtkDefPct(
  rows: { influence_type?: number; invoke?: string | number; target?: string | number; params?: number[] }[] | null | undefined,
  kind: "hp" | "atk" | "def"
): number | null {
  const id = HP_ATK_DEF_MOD_ID[kind];
  for (const r of rows || []) {
    if (r.invoke === "inherent" && r.target === "self" && r.influence_type === id) {
      return r.params?.[0] ?? 0;
    }
  }
  return null;
}
// lib/unit.lua affbonus BonusType enum (stat bonuses).
const AFFBONUS_LABELS: Record<number, string> = { 1: "HP", 2: "ATK", 3: "DEF", 4: "Range", 6: "Speed" };
const AFFBONUS_KIND: Record<number, "hp" | "atk" | "def"> = { 1: "hp", 2: "atk", 3: "def" };
// special-attribute bonus types: applied at the raw value, no bloom scaling,
// no stat mod. 7/8 modify the skill itself at base (they shift the Platinum
// initial skill timer too -- see /costgen). Unknown types display raw.
const AFFBONUS_SPECIAL: Record<number, (raw: number) => string> = {
  5: (raw) => `MR +${raw}`,
  7: (raw) => `Skill duration +${raw}%`,
  8: (raw) => `Skill CD −${raw}%`,
  9: (raw) => `Physical evasion +${raw}%`,
  11: (raw) => `True Damage Chance +${raw}%`,
  13: (raw) => `Cost -${raw}`,
};

// affection bonus is exported raw (BonusType/BonusNum). Stat bonuses:
// full-bloom (max level > 50) scales *1.2, half-bloom *0.5, then the unit's
// own HP/ATK/DEF mod (12/13/14) applies on top, same as the stat box.
// Special-attribute types (5/7/8/9) bypass all of that.
function affBonusText(
  bonuses: AffectionBonus[] | undefined,
  full: boolean,
  pctFor: (kind: "hp" | "atk" | "def") => number | null
): string {
  if (!bonuses || bonuses.length === 0) return "-";
  return bonuses
    .map((b) => {
      const special = AFFBONUS_SPECIAL[b.type];
      if (special) return special(b.raw);
      const label = AFFBONUS_LABELS[b.type];
      if (!label) return `type${b.type} +${b.raw}`;
      let v = Math.floor(b.raw * (full ? 1.2 : 0.5) + 0.5);
      const kind = AFFBONUS_KIND[b.type];
      const pct = kind ? pctFor(kind) : null;
      if (pct != null) v = Math.floor((v * pct) / 100);
      return `${label} +${v}`;
    })
    .join(", ");
}

function applyPct(vals: number[], pct: number | null): number[] {
  // in-game stat display rounds down, not to nearest.
  return pct == null ? vals : vals.map((v) => Math.floor((v * pct) / 100));
}

function StatsTable({ unit, classMap }: { unit: Unit; classMap?: Record<string, string> }) {
  const classes = unit.classes;
  if (classes.length === 0) return null;
  // AFF bonus splits into a base-form group (cc0/cc1) and an awakened-form
  // group (cc>=2, when the unit has one) -- each uses its own full/half-bloom
  // flag (own max level) and its own HP/ATK/DEF mod.
  const awakenIdx = classes.findIndex((c) => c.cc >= 2);
  const baseGroup = awakenIdx === -1 ? classes : classes.slice(0, awakenIdx);
  const awGroup = awakenIdx === -1 ? [] : classes.slice(awakenIdx);
  const fullBloom = (group: UnitClass[]) =>
    group.length > 0 && Math.max(...group.map((c) => c.max_level ?? 0)) > 50;
  const baseFull = fullBloom(baseGroup);
  const awFull = fullBloom(awGroup);
  // tier 0 (cc0/cc1) uses the base (non-awakened) ability; tier 2+ (cc>=2)
  // uses the awakened ability -- promoting past cc1 requires awaken. No
  // cross-variant fallback: awakening REPLACES the active ability rather
  // than layering on it, so a class in one state must never borrow the
  // other variant's mod (e.g. #63 Barbastroff has no default ability at
  // all -- its cc0 Mage tier must show no range mod, not fall back to the
  // awakened-only ability's +40 flat range).
  const unitRange188 = (cc: number) =>
    inherentRange((cc >= 2 ? unit.abilities.awakened : unit.abilities.default)?.influences);
  const unitFlatMod = (kind: "mr" | "range" | "cost", cc: number) =>
    flatMod((cc >= 2 ? unit.abilities.awakened : unit.abilities.default)?.influences, kind);
  const unitHpAtkDefPct = (kind: "hp" | "atk" | "def", cc: number) =>
    hpAtkDefPct((cc >= 2 ? unit.abilities.awakened : unit.abilities.default)?.influences, kind);
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
            const range188 = inherentRange(cl.class_ability_influences) ?? unitRange188(cl.cc);
            const clFlatMod = (kind: "mr" | "range" | "cost") =>
              flatMod(cl.class_ability_influences, kind) ?? unitFlatMod(kind, cl.cc);
            const clHpAtkDefPct = (kind: "hp" | "atk" | "def") =>
              hpAtkDefPct(cl.class_ability_influences, kind) ?? unitHpAtkDefPct(kind, cl.cc);
            return (
              <tr key={cl.class_id}>
                <td>
                  <UnitImage kind="icon" id={unit.id} tier={Math.max(0, cl.cc - 1)} className="unit-icon-thumb" />
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
                <td className="num">{statRange(applyPct(cl.stats.map((s) => s.hp), clHpAtkDefPct("hp")))}</td>
                <td className="num">{statRange(applyPct(cl.stats.map((s) => s.atk), clHpAtkDefPct("atk")))}</td>
                <td className="num">{statRange(applyPct(cl.stats.map((s) => s.def), clHpAtkDefPct("def")))}</td>
                <td className="num">{(cl.magic_resistance ?? unit.magic_resistance ?? 0) + (clFlatMod("mr") ?? 0)}</td>
                <td>
                  {cl.ranged
                    ? cl.range != null ? cl.range + (clFlatMod("range") ?? 0) : "?"
                    : `${cl.range != null ? cl.range + (clFlatMod("range") ?? 0) : "melee"} (block ${cl.block ?? "-"})`}
                  {!cl.ranged && range188 != null && (
                    <span className="meaning" title="attacks at range: ability 188 (Gain ranged atk, inherent · self)">
                      {" "}· range {range188}
                    </span>
                  )}
                  {cl.missile && missileText(cl.missile) && (
                    <div className="muted small" title="the class's own missile">
                      {missileText(cl.missile)}
                    </div>
                  )}
                  {cl.deploy_slot === "melee or ranged" && (
                    <div className="muted small" title="ClassData.PlaceAttribute: deployable in either spot">
                      deployable: melee or ranged
                    </div>
                  )}
                </td>
                <td className="num">{cl.max_target ?? "-"}</td>
                <td>{cl.attack_attribute ?? "-"}</td>
                <td>
                  {cl.attack_interval != null
                    ? `${cl.attack_interval}f (${(cl.attack_interval / 60).toFixed(2)}s)`
                    : "?"}
                </td>
                <td>{(cl.cost_max ?? 0) + (clFlatMod("cost") ?? 0)} → {(cl.cost_min ?? 0) + (clFlatMod("cost") ?? 0)}</td>
                {ci === 0 && (
                  <td rowSpan={awakenIdx === -1 ? classes.length : awakenIdx} className="aff-cell">
                    {affBonusText(unit.affection_bonuses, baseFull, (kind) => unitHpAtkDefPct(kind, cl.cc))}
                  </td>
                )}
                {ci === awakenIdx && (
                  <td rowSpan={classes.length - awakenIdx} className="aff-cell">
                    {affBonusText(unit.affection_bonuses, awFull, (kind) => unitHpAtkDefPct(kind, cl.cc))}
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
  const texts = useContext(TextsContext);
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
                {cl.description && texts.cls[cl.description] ? (
                  <>
                    <span title="machine translated">{texts.cls[cl.description]}</span>
                    <div className="muted small">{cl.description}</div>
                  </>
                ) : (
                  cl.description
                )}
                <InfluenceToggle count={cl.class_ability_influences?.length || 0}>
                  <ul className="effects">
                    {(cl.class_ability_influences || []).map((inf, j) => (
                      <AbilityInfluenceRow
                        inf={inf} i={j} key={j} labelsMap={labels}
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

/** Gallery grid thumbnail; hides itself when the file doesn't exist. */
function GalleryThumb({ item, onOpen }: { item: GalleryItem; onOpen: () => void }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <button className={`gallery-thumb gallery-thumb--${item.kind}`} onClick={onOpen} title={item.label}>
      <img src={item.src} alt={item.label} loading="lazy" onError={() => setOk(false)} />
      <span className="gallery-thumb-label">{item.label}</span>
    </button>
  );
}

/** One viewable item in the art lightbox / gallery. */
export interface GalleryItem {
  label: string;
  src: string;
  kind: "art" | "icon" | "anim";
}

/** Fullscreen lightbox over a list of gallery items. Keeps its OWN cursor
 *  (never mutates the page behind it); ←/→ move between items, Escape or
 *  backdrop click closes. */
function ArtLightbox({ items, start, onClose }: {
  items: GalleryItem[];
  start: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(start);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  useEffect(() => setIdx(start), [start, items.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIdx((i) => (i + items.length - 1) % items.length);
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, items.length]);
  const cur = items[idx];
  if (!cur) return null;
  return (
    <div className="art-lightbox" onClick={onClose}>
      <div className="art-lightbox-body" onClick={(e) => e.stopPropagation()}>
        {broken[cur.src] ? (
          <div className="art-lightbox-img art-lightbox-none">no image</div>
        ) : (
          <img
            className={`art-lightbox-img${cur.kind === "anim" ? " art-lightbox-pixel" : ""}`}
            src={cur.src}
            alt={cur.label}
            onError={() => setBroken((b) => ({ ...b, [cur.src]: true }))}
          />
        )}
        <div className="art-lightbox-bar">
          <button className="art-lightbox-nav" aria-label="previous"
            onClick={() => setIdx((i) => (i + items.length - 1) % items.length)}>←</button>
          <span className="art-lightbox-label">{cur.label} <span className="muted small">{idx + 1}/{items.length}</span></span>
          <button className="art-lightbox-nav" aria-label="next"
            onClick={() => setIdx((i) => (i + 1) % items.length)}>→</button>
          <button className="art-lightbox-close" onClick={onClose} aria-label="close">✕</button>
        </div>
      </div>
    </div>
  );
}

// A plain `to="/units"` link always lands on the default (unfiltered,
// page 0) list, discarding whatever filters/page/search were active
// before navigating here. Going back in history instead returns to the
// exact previous URL (filters and all); fall back to a plain link only
// when there's no in-app history to go back to (e.g. a shared link opened
// directly on this page).
// status-screen quotes (unlock % from the card's own LoveEv1 thresholds) +
// the affection conversation scenes (scene 1 at 30, scene 2 at 100; extra
// scenes come from the unit's special harlem quest).
// A speech line: the machine translation, with the Japanese kept underneath
// (same convention as names and skill descriptions). Untranslated lines show
// the Japanese alone.
function SpeechText({ jp, en, className }: { jp: string; en?: string; className: string }) {
  if (!en) return <span className={className}>{jp}</span>;
  return (
    <span className={className}>
      <span title="machine translated">{en}</span>
      <span className="muted small speech-jp">{jp}</span>
    </span>
  );
}

function SpeechSceneBlock({ s }: { s: SpeechScene }) {
  return (
    <details className="dlg-section speech-scene">
      <summary>
        {s.scene != null ? `Scene ${s.scene}` : "Extra scene"}
        {s.at != null && <span className="dlg-trigger speech-scene-at">at {s.at}% affection</span>}
        {s.quest && <span className="dlg-trigger speech-scene-at">from its harlem quest</span>}
      </summary>
      {s.lines.map((l, i) =>
        l.name ? (
          <div className="dlg-line" key={i}>
            <div className="dlg-body">
              <div className="dlg-name" title={l.name_en ? l.name : undefined}>
                {l.name_en || l.name}
              </div>
              <SpeechText jp={l.text} en={l.text_en} className="dlg-text" />
            </div>
          </div>
        ) : (
          <div className="dlg-caption" key={i}>
            <SpeechText jp={l.text} en={l.text_en} className="dlg-caption-text" />
          </div>
        ))}
    </details>
  );
}

function SpeechSection({ speech }: { speech: UnitSpeech }) {
  return (
    <section>
      <h3>Quotes &amp; scenes</h3>
      {speech.quotes && speech.quotes.length > 0 && (
        <div className="quote-list">
          {speech.quotes.map((q, i) => (
            <div className="quote-row" key={i}>
              <span className="quote-at">{q.adjutant ? "adjutant" : `${q.at}%`}</span>
              <SpeechText jp={q.text} en={q.text_en} className="quote-text" />
            </div>
          ))}
          {(speech.quotes2 ?? []).map((t, i) => (
            <div className="quote-row" key={`f2-${i}`}>
              <span className="quote-at" title="second quote block (Flavor2) — when it shows is unverified">extra {i + 1}?</span>
              <SpeechText jp={t} en={speech.quotes2_en?.[i]} className="quote-text" />
            </div>
          ))}
        </div>
      )}
      {(speech.scenes ?? []).map((s, i) => <SpeechSceneBlock s={s} key={i} />)}
    </section>
  );
}

function BackToUnits({ children, className }: { children: ReactNode; className?: string }) {
  const navigate = useNavigate();
  const hasHistory = (window.history.state?.idx ?? 0) > 0;
  if (!hasHistory) return <Link to="/units" className={className}>{children}</Link>;
  return (
    <a href="/units" className={className} onClick={(e) => { e.preventDefault(); navigate(-1); }}>
      {children}
    </a>
  );
}

export default function UnitDetail() {
  const { id } = useParams();
  const unitId = Number(id);
  const { loading, unit } = useUnitDetail(unitId);
  const influenceLabels = useUnitInfluenceLabels();
  const loc = useLocalisation();
  const texts = useTexts();
  const princeTitles = usePrinceTitles();
  const missiles = useMissiles();
  const abilityConfigs = useAbilityConfigs();
  const speech = useUnitSpeech(unitId);
  const [tier, setTier] = useState(0);
  const [galleryAt, setGalleryAt] = useState<number | null>(null);

  if (loading) return <p className="loading">Loading…</p>;
  if (!unit) {
    return (
      <p>
        Unit #{unitId} not found (data file failed to load).{" "}
        <button className="stage-gap-btn" style={{ width: "auto" }} onClick={() => location.reload()}>
          retry
        </button>{" "}
        <BackToUnits>Back to units</BackToUnits>
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

  // gallery, grouped one section per art tier: that tier's splash art, face
  // icon and battle-sprite animations. Sprite pose names vary per unit
  // (Stand/Attack/Damage + skill-mode sets like Atk2/Std2/special_1); a
  // trailing _2.._4 whose remainder is itself a pose = that pose's per-tier
  // duplicate set. shd* poses are shadows — not shown. A unit with a single
  // AW2 path titles it "AW2"; dual paths get AW2A / AW2B. Missing files
  // hide themselves via onError.
  const tierTitle = (t: number) =>
    (t === 2 || t === 3) && !(artTiers.includes(2) && artTiers.includes(3))
      ? "AW2"
      : TIER_LABEL[t];
  const anims = (unit.anims ?? []).filter((a) => !a.startsWith("shd"));
  const POSE_ORDER = ["Stand", "Attack", "Damage"];
  // "pose~N" = that pose in tier BLOCK N-1 of the sprite archive (export
  // suffixes by block, so a pose that only exists from AW onward still
  // lands on the right tier); a bare name is block 0.
  const parsedAnims = anims.map((a) => {
    const m = a.match(/^(.*)~(\d)$/);
    return m
      ? { name: a, base: m[1], setIdx: Number(m[2]) - 1 }
      : { name: a, base: a, setIdx: 0 };
  });
  const animsFor = (setIdx: number) =>
    parsedAnims
      .filter((x) => x.setIdx === setIdx)
      .sort((x, y) =>
        (POSE_ORDER.indexOf(x.base) + 1 || 99) - (POSE_ORDER.indexOf(y.base) + 1 || 99) ||
        x.base.localeCompare(y.base))
      .map((x) => ({
        label: `Sprite — ${x.base}`,
        src: unitAnimUrl(unit.dot_id, x.name),
        kind: "anim" as const,
      }));
  const gallerySections: { title: string; items: GalleryItem[] }[] = artTiers.map((t, idx) => ({
    title: tierTitle(t),
    items: [
      { label: "Art", src: unitImageUrl("art", unit.dot_id, t), kind: "art" as const },
      { label: "Icon", src: unitImageUrl("icon", unit.dot_id, t), kind: "icon" as const },
      ...animsFor(idx),
    ],
  }));
  {
    // sprite sets beyond the known art tiers (rare) still get a section
    for (let s = artTiers.length; s <= 3; s++) {
      const extra = animsFor(s);
      if (extra.length) gallerySections.push({ title: `Set ${s + 1}`, items: extra });
    }
  }
  const galleryItems: GalleryItem[] = gallerySections.flatMap((s) =>
    s.items.map((it) => ({ ...it, label: `${it.label} — ${s.title}` })));

  const textMaps: TextMaps = {
    skill: texts.skill_texts,
    ability: texts.ability_texts,
    cls: texts.class_texts,
  };

  return (
    <MissilesContext.Provider value={missiles}>
    <AbilityConfigsContext.Provider value={abilityConfigs}>
    <TextsContext.Provider value={textMaps}>
    <div className="detail unit-page">
      <BackToUnits className="back">← units</BackToUnits>

      <aside className="unit-infobox">
        <div className={`unit-infobox-banner rarity-${unit.rarity_id}`}>{displayName}</div>
        <button
          className="unit-art-zoom"
          onClick={() => setGalleryAt(gallerySections
            .slice(0, Math.max(0, artTiers.indexOf(tier)))
            .reduce((n, s) => n + s.items.length, 0))}
          title="View full art"
        >
          <UnitImage kind="art" id={unit.id} tier={tier} fallbackKind="icon" className="unit-art-img" alt={displayName} />
        </button>
        {galleryAt !== null && (
          <ArtLightbox
            items={galleryItems}
            start={Math.max(0, galleryAt)}
            onClose={() => setGalleryAt(null)}
          />
        )}
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
          <Link className="meta-chip" to={`/units?rarity=${encodeURIComponent(unit.rarity.replace(/ Hero$/, ""))}`}>{unit.rarity}</Link>
          {unit.gender && (
            <Link className="meta-chip" to={`/units?gender=${encodeURIComponent(String(unit.gender))}`}>{unit.gender}</Link>
          )}
          {unit.faction && (
            <Link className="meta-chip" to={`/tags/${encodeURIComponent(unit.faction)}`} title={unit.faction}>
              {loc?.races[unit.faction] || unit.faction}
            </Link>
          )}
          {unit.race && (
            <Link className="meta-chip" to={`/tags/${encodeURIComponent(unit.race)}`} title={unit.race}>
              {loc?.races[unit.race] || unit.race}
            </Link>
          )}
          {unit.big_race && (
            <Link className="meta-chip" to={`/tags/${encodeURIComponent(unit.big_race)}`} title={unit.big_race}>
              {loc?.races[unit.big_race] || unit.big_race}
            </Link>
          )}
          {(unit.identity_tags || []).map((t) => (
            <Link className="meta-chip" to={`/tags/${encodeURIComponent(t)}`} key={t} title={t}>
              {loc?.tags[t] || t}
            </Link>
          ))}
          {unit.genus && (
            <Link className="meta-chip" to={`/tags/${encodeURIComponent(unit.genus)}`} title={unit.genus}>
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
                {s.name && <span className="meaning"> {s.name}</span>}
                {s.type === 34 ? (
                  <CommandFacts cmd={s.command} kind="specialty" />
                ) : s.command && <span className="expr" title={s.command}> {s.command}</span>}
              </li>
            ))}
          </ul>
        </section>
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

      <section>
        <h3>Gallery</h3>
        {gallerySections.map((sec, si) => {
          const offset = gallerySections.slice(0, si).reduce((n, s) => n + s.items.length, 0);
          return (
            <div key={sec.title} className="gallery-tier">
              <h4 className="gallery-tier-title">{sec.title}</h4>
              <div className="gallery-grid">
                {sec.items.map((item, i) => (
                  <GalleryThumb key={item.src} item={item} onOpen={() => setGalleryAt(offset + i)} />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {speech && <SpeechSection speech={speech} />}

      {allTokens.length > 0 && (
        <section>
          <h3>Tokens</h3>
          {allTokens.map((t, i) => (
            <div key={i} className="unit-token-card">
              <div className="meta token-head">
                {t.no_icon ? (
                  <div className="unit-img unit-img--missing unit-icon-thumb" />
                ) : (
                  <UnitImage kind="icon" id={t.unit} className="unit-icon-thumb" alt={String(t.unit)} />
                )}
                <strong>{t.unit_name || `unit ${t.unit}`}</strong>
                {t.class_name && (
                  <span className="muted" title={t.class_name}>
                    {loc?.classes[t.class_name] || t.class_name}
                  </span>
                )}
                <span>cost {t.cost}</span>
                <span>count {t.count}</span>
                <span>max deployed {t.deploy_max}</span>
                {t.total_max != null && <span>total max {t.total_max}</span>}
                <span>recast {t.recast}</span>
              </div>
              {t.stats && t.stats.length > 0 && (
                <table className="grid unit-token-stat-table">
                  <thead>
                    <tr>
                      <th>Lv</th><th>HP</th><th>ATK</th><th>DEF</th><th>MR</th>
                      <th>Range/Block</th><th>Targets</th><th>Atk attr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.stats.map((s, si) => (
                      <tr key={s.level}>
                        <td>{s.level}</td>
                        <td className="num">{s.hp.toLocaleString()}</td>
                        <td className="num">{s.atk.toLocaleString()}</td>
                        <td className="num">{s.def.toLocaleString()}</td>
                        {si === 0 && (
                          <>
                            <td className="num" rowSpan={t.stats!.length}>{t.magic_resistance ?? 0}</td>
                            <td rowSpan={t.stats!.length}>
                              {t.ranged
                                ? t.range ?? "?"
                                : `${t.range ?? "melee"} (block ${t.block ?? "-"})`}
                            </td>
                            <td className="num" rowSpan={t.stats!.length}>{t.max_target ?? "-"}</td>
                            <td rowSpan={t.stats!.length}>{t.attack_attribute ?? "-"}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {t.missile && (
                <div className="muted small">missile: {missileText(t.missile)}</div>
              )}
              {t.description && (
                <div className="skill-text">
                  {texts.class_texts[t.description] ? (
                    <>
                      <span title="machine translated">{texts.class_texts[t.description]}</span>
                      <div className="muted small">{t.description}</div>
                    </>
                  ) : (
                    t.description
                  )}
                </div>
              )}
              {t.class_ability_influences && t.class_ability_influences.length > 0 && (
                <InfluenceToggle count={t.class_ability_influences.length}>
                  <ul className="effects">
                    {t.class_ability_influences.map((inf, j) => (
                      <AbilityInfluenceRow
                        inf={inf} i={j} key={j} labelsMap={abilityLabels}
                        label={inf.influence_type != null ? abilityLabels[String(inf.influence_type)] : undefined}
                      />
                    ))}
                  </ul>
                </InfluenceToggle>
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

    </div>
    </TextsContext.Provider>
    </AbilityConfigsContext.Provider>
    </MissilesContext.Provider>
  );
}
