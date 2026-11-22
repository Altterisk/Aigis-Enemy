import { useState, useEffect, createContext, useContext } from "react";
import { explanEn, familyOfCard, familyTitle, princeFamilies } from "../prince";
import type { PossessionBuffs, PrinceData, UnitIndexEntry, WarGodBlessings } from "../types";
import { both, evaluate, targetFacts } from "../condEval";
import type { ReactNode } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { tagName, useUnitDetail, useUnitInfluenceLabels, useLocalisation, useTexts, usePrinceTitles, useWarGodBlessings, usePossessionBuffs, useUnits, useMissiles, useAbilityConfigs, useUnitSpeech, unitImageUrl, unitAnimUrl, affectionStat, useExprNames } from "../data";
import { UnitImage, UnitIconLink, missileText, fillLabel, HumanText, fmtFrames, ColorCodedText, routerLink, plainConditionText } from "../components";
import { humanize, recipientPhrase } from "../humanize";
import { Breadcrumbs, Lightbox, Panel, StatRows, TabPanel, UrlTabs, tabParam } from "@altterisk/game-hub";
import type { RenderLink } from "@altterisk/game-hub";
import { searchParamsAdapter } from "@altterisk/game-hub/filters";
import { influenceSelectionRule } from "../influenceLabels";
import { ABILITY_EXTEND_PROSE, COMMAND_PROSE, EXPR_PROSE, EXTEND_PROSE, TICK_PROSE, buffCategory, mergeClauses, proseClause, recipient } from "../influenceProse";
import { useUiStore } from "../store";
import { LIST_META, NOT_FOUND_META, unitMeta } from "../meta";
import { usePageMeta } from "../usePageMeta";
import { altName, gameName, rarityName, useL, type Pick } from "../i18n";
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

// Names the Readable view puts in place of raw ids: class-change tier -> that
// tier's class name, token card id -> token name, skill id -> skill name.
interface UnitNames {
  tier: (cc: number) => string | undefined;
  unit: (id: number) => string | undefined;
  skill: (id: number) => string | undefined;
}
const UnitNamesContext = createContext<UnitNames | null>(null);

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
  const text = info ? missileText(info) : "";
  return text ? `#${mid} (${text})` : `#${mid}`;
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
    const isEmpty = (id: string | number) => !!missiles?.[String(id)]?.empty;
    const empties = ids.filter(isEmpty).length;
    if (ids.length > 1 && empties) {
      // per-shot list with blank slots: say how many actually fire
      const seq = ids.map((id) => (isEmpty(id) ? "∅" : `#${id}`)).join(" ");
      const real = [...new Set(ids.filter((id) => !isEmpty(id)).map(String))]
        .map((id) => missileRef(Number(id), missiles)).join(", ");
      return `${ids.length} shot slots: ${ids.length - empties} fire, ${empties} empty (∅) — ${seq}; ${prefix} ${real}`;
    }
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
    case "飛行敵含む": return Number(v) ? "flying enemies included" : "flying enemies not included";
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
    case "射程範囲内のみ": return Number(v) ? "counters ranged attackers at any distance" : "";
    case "最終ダメージ値を対象に": return Number(v) ? "based on the damage it takes" : "";
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
      {(humanize(inf.expression) || inf.expression) && (
        <span className="expr" title={inf.expression}>
          {" "}if <HumanText text={humanize(inf.expression) || inf.expression || ""} />
        </span>
      )}
      {(humanize(inf.activate_if) || inf.activate_if) && (
        <span className="expr" title={inf.activate_if}>
          {" "}(applies when <HumanText text={humanize(inf.activate_if) || inf.activate_if || ""} />)
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

// The value line of an ability influence row: the label's template filled
// with the row's params, or a per-id reading where the params need one.
function abilityRowValue(
  inf: AbilityInfluence, label?: UnitInfluenceLabel, missiles?: Record<string, Missile> | null,
): string | null {
  // id 34 (Prevent status ailment): p1=100 is full immunity, any other
  // value is a reduction percent instead -- two different sentences, not
  // just a number substitution.
  let filled: string | null;
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
  return filled;
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
  const filled = abilityRowValue(inf, label, missiles);
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
      ) : (humanize(inf.command) || inf.command) && (
        <span className="expr" title={inf.command}>
          {" "}if <HumanText text={humanize(inf.command) || inf.command || ""} />
        </span>
      )}
      {(humanize(inf.no_change_condition) || inf.no_change_condition) &&
        inf.no_change_condition !== inf.command && (
        <span className="expr" title={inf.no_change_condition}>
          {" "}{(humanize(inf.command) || inf.command) ? "and" : "if"}{" "}
          <HumanText text={humanize(inf.no_change_condition) || inf.no_change_condition || ""} />
        </span>
      )}
      {(humanize(inf.activate_command) || inf.activate_command) && (
        <span className="expr" title={inf.activate_command}>
          {" "}on <HumanText text={humanize(inf.activate_command) || inf.activate_command || ""} />
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

// ---- Readable view: influence rows composed into sentences ----------------
interface ProseClause {
  text: string; verified: boolean; note?: string; tag?: string; rule?: string;
  // ability rows: the effect without its condition, the condition, and the
  // class-change tier the row is limited to -- read by abilitySentences
  core?: string; cond?: string; tier?: number;
}
interface ProseSentence { lead?: string; clauses: ProseClause[] }

const COSMETIC_EXTEND = /^fx: /;

function extendSummary(
  extend: InfluenceExtend | undefined, influenceType: number | undefined, missiles?: Record<string, Missile> | null,
): string[] {
  if (!extend) return [];
  return Object.entries(extend)
    .map(([k, v]) => extendText(k, v, influenceType, missiles, extend))
    .filter((t) => t && !COSMETIC_EXTEND.test(t));
}

function tickScaleText(ts: SkillInfluence["tick_scale"]): string | null {
  if (!ts || ts.per_sec == null) return null;
  const sign = ts.direction && ts.direction < 0 ? "-" : "+";
  const rate = ts.per_sec >= 1
    ? `${ts.per_sec}/s`
    : `${ts.per_tick} per ${((ts.interval_frames ?? 0) / 60).toFixed(1)}s`;
  return `${sign}${rate}${ts.cap != null ? `, cap ${ts.cap}` : ""}`;
}

function withExtras(text: string, extras: (string | null | undefined)[]): string {
  const xs = extras.filter((x): x is string => !!x);
  return xs.length ? `${text} (${xs.join("; ")})` : text;
}

// a script that is just the constant 1 is always true: no condition to state
const realCondition = (raw?: string | null, human?: string | null): string | undefined =>
  !raw || /^\s*1\s*;?\s*$/.test(raw) ? undefined : human || raw;

function skillClause(
  inf: SkillInfluence, label: UnitInfluenceLabel | undefined, siblings: SkillInfluence[],
  groupChangeFunction: number | undefined, missiles?: Record<string, Missile> | null,
  skillNames?: Map<number, string>,
): ProseClause | null {
  if (label?.hidden || label?.marker) return null;
  const nameOverride = inf.influence_type === 203
    ? (siblings.some((s) => s.influence_type === 204 || s.influence_type === 205)
      ? "Max UP consumed for scaling buff"
      : "Flat cost to activate")
    : skillLabelName(inf);
  const name = nameOverride ?? label?.name ?? `influence ${inf.influence_type}`;
  // an expression of exactly IsOwnerUnit() narrows any target to the unit itself
  const ownerOnly = /^\s*IsOwnerUnit\(\);?\s*$/.test(inf.expression ?? "");
  const target = ownerOnly ? "self" : inf.target;
  const text = proseClause("skill", inf.influence_type, {
    target, v: skillRowValue(inf, label), name,
    mul: inf.mul, mul2: inf.mul2, mul3: inf.mul3, mul3_cap: inf.mul3_cap, add: inf.add,
    ref: inf.add != null ? skillNames?.get(inf.add) : undefined,
    expression: inf.expression,
    expressionHuman: humanize(inf.expression) || inf.expression,
    extend: inf.extend as Record<string, unknown> | undefined,
    skillName: (id) => skillNames?.get(id),
  });
  if (text == null) return null;
  const full = withExtras(text, [
    TICK_PROSE.has(inf.influence_type ?? -1) ? null : tickScaleText(inf.tick_scale),
    inf.missile ? (inf.influence_type === 21 || inf.influence_type === 165 ? missileText(inf.missile) : `missile: ${missileText(inf.missile)}`) : null,
    ...(EXTEND_PROSE.has(inf.influence_type ?? -1) ? [] : extendSummary(inf.extend, inf.influence_type, missiles)),
  ]);
  // a row's expression is evaluated per recipient, so on a group target it
  // filters which units receive the effect
  const self = String(target ?? "self") === "self";
  const cond = EXPR_PROSE.has(inf.influence_type ?? -1) || ownerOnly ? undefined
    : realCondition(inf.expression, humanize(inf.expression));
  // a plain unit-trait filter on a group target narrows the recipient itself
  const skillObj = recipient("skill", target).obj;
  const who = cond && !self && full.includes(skillObj) ? recipientPhrase(inf.expression, skillObj) : null;
  const gated = !cond ? full
    : who ? full.replace(skillObj, who)
    : self ? `${full} if ${cond}` : `${full} (only units where ${cond})`;
  const rule = influenceSelectionRule("skill", inf.influence_type, groupChangeFunction);
  return {
    text: gated, verified: !!label?.verified, note: label?.note,
    tag: buffCategory("skill", inf.influence_type, label?.name ?? undefined, target),
    rule: rule ? SELECTION_RULE_TEXT[rule] : undefined,
  };
}

// an activate_command that only picks the class-change tier
const tierOnly = (raw?: string | null): number | undefined => {
  const m = raw?.match(/^\s*GetClassChange\(\)\s*==\s*(\d+)\s*;?\s*$/);
  return m ? Number(m[1]) : undefined;
};

function abilityClause(
  inf: AbilityInfluence, label: UnitInfluenceLabel | undefined, missiles?: Record<string, Missile> | null,
  names?: UnitNames | null,
): ProseClause | null {
  if (label?.hidden || label?.marker) return null;
  const name = abilityLabelName(inf) ?? label?.name ?? `influence ${inf.influence_type}`;
  const text = proseClause("ability", inf.influence_type, {
    target: inf.target,
    // ability 72 is a script: its decoded facts are the whole effect
    v: inf.influence_type === 72
      ? decodeAbilityCommand(inf.command).map((f) => commandFactText(f, missiles)).join("; ") || humanize(inf.command) || inf.command || null
      : abilityRowValue(inf, label, missiles),
    name, params: inf.params, invoke: inf.invoke,
    commandHuman: humanize(inf.command) || inf.command,
    extend: inf.extend as Record<string, unknown> | undefined,
    unitName: names ? (id) => names.unit(id) : undefined,
  });
  if (text == null) return null;
  const missileNotes = inf.missiles
    ? Object.entries(inf.missiles).map(([mid, m]) => `missile ${mid}: ${missileText(m)}`) : [];
  let full = withExtras(text, [
    abilityRate(inf), ...missileNotes,
    ...(ABILITY_EXTEND_PROSE.has(inf.influence_type ?? -1) ? [] : extendSummary(inf.extend, inf.influence_type ?? undefined, missiles)),
  ]);
  // like a skill expression, the command filters recipients on a group target
  const cmd = inf.influence_type === 72 || COMMAND_PROSE.has(inf.influence_type ?? -1) ? null : realCondition(inf.command, humanize(inf.command));
  const self = String(inf.target ?? "self") === "self";
  // a filter of plain unit traits narrows the recipient itself:
  // "raises the ATK of Flying allies" rather than "of all allies (only units where ...)"
  const obj = recipient("ability", inf.target).obj;
  const narrow = (raw?: string | null): boolean => {
    const who = !self && full.includes(obj) ? recipientPhrase(raw, obj) : null;
    if (!who) return false;
    full = full.replace(obj, who);
    return true;
  };
  const narrowed = !!cmd && narrow(inf.command);
  const core = full;
  if (narrowed) { /* the filter is already in the recipient */ }
  else if (/^\s*!IsOwnerUnit\(\);?\s*$/.test(inf.command ?? "")) full += " (excluding itself)";
  else if (cmd && !(self && /^\s*IsOwnerUnit\(\);?\s*$/.test(inf.command ?? ""))) full += self ? ` if ${cmd}` : ` (only units where ${cmd})`;
  const ncc = humanize(inf.no_change_condition) || inf.no_change_condition;
  if (ncc && inf.no_change_condition !== inf.command && !(!narrowed && !cmd && narrow(inf.no_change_condition))) {
    full += ` ${cmd ? "and" : "if"} ${ncc}`;
  }
  // a tier-only activate condition becomes the sentence lead instead
  const tier = tierOnly(inf.activate_command);
  const act = tier != null ? undefined : realCondition(inf.activate_command, humanize(inf.activate_command));
  if (act) full += ` when ${act}`;
  // exactly one self condition: kept apart so abilitySentences can merge
  // rows that differ only in it
  const cond = full === `${core} if ${cmd}` ? cmd ?? undefined : full === `${core} when ${act}` ? act : undefined;
  const rule = influenceSelectionRule("ability", inf.influence_type, undefined, inf.params);
  return {
    core: full === core || cond ? core : undefined, cond, tier,
    text: full, verified: !!label?.verified, note: label?.note,
    tag: buffCategory("ability", inf.influence_type ?? undefined, label?.name ?? undefined, inf.target, inf.invoke),
    rule: rule ? SELECTION_RULE_TEXT[rule] : undefined,
  };
}

function durationLead(s: SkillStage): string | undefined {
  if (!s.duration || s.duration >= 9999) return undefined;
  return s.duration_max && s.duration_max !== s.duration
    ? `For ${s.duration}s (${s.duration_max}s at max skill level)`
    : `For ${s.duration}s`;
}

// Skill influence 277 is a timed event script: every row is one event fired at
// frame `add` (spawn an effect / deal rectangle damage). One skill can carry
// ~1000 of them, so they are shown as a single summary instead of row by row.
const TIMELINE_TYPE = 277;
const isTimelineRow = (inf: SkillInfluence) => inf.influence_type === TIMELINE_TYPE;

function timelineSummary(rows: SkillInfluence[]): string {
  const kinds = new Map<string, number>();
  let last = 0;
  for (const r of rows) {
    const k = String((r.extend as Record<string, unknown> | undefined)?.["種別"] ?? "?");
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
    last = Math.max(last, r.add ?? 0);
  }
  const KIND: Record<string, string> = { "エフェクト生成": "effect spawns", "矩形ダメージ": "rectangle hits" };
  const parts = [...kinds].map(([k, n]) => `${n} ${KIND[k] ?? k}`).join(", ");
  return `scripted timeline: ${rows.length} events (${parts}) over ${last}f (${(last / 60).toFixed(1)}s)`;
}

function skillStageSentences(
  s: SkillStage, labels: Record<string, UnitInfluenceLabel>, abilityLabels: Record<string, UnitInfluenceLabel>,
  missiles?: Record<string, Missile> | null, skillNames?: Map<number, string>,
  abilityConfigs?: Record<string, AbilityInfluence[]> | null,
): ProseSentence[] {
  const rows = s.influences || [];
  const groups = new Map<string, ProseClause[]>();
  const abilityClauses = (list: AbilityInfluence[]) => list
    .map((inf) => abilityClause(inf, inf.influence_type != null ? abilityLabels[String(inf.influence_type)] : undefined, missiles))
    .filter((c): c is ProseClause => !!c);
  const timeline = rows.filter(isTimelineRow);
  if (timeline.length) groups.set("", [{ text: timelineSummary(timeline), verified: false }]);
  for (const inf of rows) {
    if (isTimelineRow(inf)) continue;
    const key = humanize(inf.activate_if) || inf.activate_if || "";
    // skill 122 grants an ability config: its rows read under this row's own condition
    if (inf.influence_type === 122 && inf.add && abilityConfigs) {
      const granted = abilityClauses(abilityConfigs[String(inf.add)] ?? []);
      if (granted.length) groups.set(key, [...(groups.get(key) ?? []), ...granted]);
      continue;
    }
    const c = skillClause(inf, inf.influence_type != null ? labels[String(inf.influence_type)] : undefined,
      rows, s.group_change_function, missiles, skillNames);
    if (!c) continue;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  if (!abilityConfigs) {
    const linked = abilityClauses(s.linked_ability_influences || []);
    if (linked.length) groups.set("", [...(groups.get("") ?? []), ...linked]);
  }
  const out: ProseSentence[] = [];
  const base = groups.get("");
  if (base?.length) out.push({ lead: durationLead(s), clauses: mergeClauses(base) });
  for (const [cond, clauses] of groups) if (cond) out.push({ lead: `When ${cond}`, clauses: mergeClauses(clauses) });
  return out;
}

const INVOKE_LEAD: Record<string, string> = {
  sortie: "While in the sortie team",
  deployed: "While deployed",
  placement: "When placed",
  "while in the 1st barrack": "While in the 1st barrack",
};

const CC_LABEL: Record<number, string> = { 0: "base", 1: "CC", 2: "AW", 3: "AW2A", 4: "AW2B" };

// "team count with identity [[tag:X]] >= 5" and the like
const TEAM_COUNT = /^team count (?:with identity|of race|of genus|assigned to) (.+?) (==|>=) (\d+)$/;
const NUM = /\d+(?:\.\d+)?/g;

// the unit glued to the at-th number ("s" in "20s", "%"), so an alternative keeps it
function unitAfter(core: string, at: number): string {
  let k = -1;
  let tail = "";
  core.replace(/(\d+(?:\.\d+)?)(s\b|%)?/g, (m, _n, u) => { if (++k === at) tail = u ?? ""; return m; });
  return tail;
}

// Rows that say the same thing with one number changed, under different
// conditions, read as one clause: a per-unit team-count ladder becomes
// "N for each X in the team", and skill-state variants hang off the base row.
function mergeVariants(clauses: ProseClause[]): ProseClause[] {
  const shape = (c: ProseClause) => (c.core ? `${c.core.replace(NUM, "#")}|${c.verified}|${c.tag ?? ""}` : null);
  const out: ProseClause[] = [];
  const used = new Set<number>();
  clauses.forEach((c, i) => {
    if (used.has(i)) return;
    const key = shape(c);
    const group = key == null ? [i]
      : clauses.map((x, j) => (!used.has(j) && shape(x) === key ? j : -1)).filter((j) => j >= 0);
    if (group.length < 2) { used.add(i); out.push(c); return; }
    const items = group.map((j) => clauses[j]);
    const nums = items.map((x) => x.core!.match(NUM) ?? []);
    const diff = nums[0].map((_, k) => k).filter((k) => nums.some((n) => n[k] !== nums[0][k]));
    if (diff.length !== 1) { used.add(i); out.push(c); return; }
    const at = diff[0];
    const swap = (core: string, v: string) => { let k = -1; return core.replace(NUM, (m) => (++k === at ? v : m)); };
    // team-count ladder: value = step x count at every rung
    const ladder = items.map((x, j) => {
      const m = x.cond?.match(TEAM_COUNT);
      return m ? { who: m[1], n: Number(m[3]), v: Number(nums[j][at]) } : null;
    });
    if (ladder.every((l) => l && l.who === ladder[0]!.who)) {
      const rungs = ladder as { who: string; n: number; v: number }[];
      const step = rungs[0].v / rungs[0].n;
      if (rungs.every((r) => r.v === step * r.n)) {
        const max = Math.max(...rungs.map((r) => r.n));
        group.forEach((j) => used.add(j));
        out.push({ ...c, text: `${swap(c.core!, String(step))} for each ${rungs[0].who} in the team (up to ${max})`, core: undefined, cond: undefined });
        return;
      }
    }
    // skill-state variants: the row with no condition (or "its skill is not
    // active") is the base, the others are alternatives under their condition
    const base = items.findIndex((x) => !x.cond || x.cond === "its skill is not active");
    if (base < 0 || items.some((x, j) => j !== base && !x.cond)) { used.add(i); out.push(c); return; }
    const alts = items.filter((_, j) => j !== base)
      .map((x) => `${x.core!.match(NUM)![at]}${unitAfter(x.core!, at)} if ${x.cond}`);
    group.forEach((j) => used.add(j));
    // the alternatives go right after the number they replace
    const baseCore = items[base].core!;
    let k = -1;
    const text = baseCore.replace(/(\d+(?:\.\d+)?)(s\b|%)?/g, (m) => (++k === at ? `${m} (${alts.join("; ")})` : m));
    out.push({ ...items[base], text, core: undefined, cond: undefined });
  });
  return out;
}

function abilitySentences(
  rows: AbilityInfluence[], labels: Record<string, UnitInfluenceLabel>, missiles?: Record<string, Missile> | null,
  abilityConfigs?: Record<string, AbilityInfluence[]> | null, names?: UnitNames | null,
): ProseSentence[] {
  const groups = new Map<string, ProseClause[]>();
  for (const inf of rows) {
    // ability 189 grants another config: its rows read as what the recipients gain
    if (inf.influence_type === 189 && inf.params?.[0] && abilityConfigs?.[String(inf.params[0])]) {
      const who = recipient("ability", inf.target).obj;
      const granted = abilityConfigs[String(inf.params[0])]
        .map((g) => abilityClause(g, g.influence_type != null ? labels[String(g.influence_type)] : undefined, missiles, names))
        .filter((g): g is ProseClause => !!g);
      if (granted.length) {
        const key = String(inf.invoke ?? "");
        const cmd = realCondition(inf.command, humanize(inf.command));
        const head = `${who} gain${cmd ? ` (only units where ${cmd})` : ""}: `;
        groups.set(key, [...(groups.get(key) ?? []),
          { ...granted[0], text: head + granted[0].text }, ...granted.slice(1)]);
        continue;
      }
    }
    const c = abilityClause(inf, inf.influence_type != null ? labels[String(inf.influence_type)] : undefined, missiles, names);
    if (!c) continue;
    const key = `${inf.invoke ?? ""}|${c.tier ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups].map(([key, clauses]) => {
    const [invoke, tierRaw] = key.split("|");
    const invokeLead = invoke === "inherent" || invoke === "" ? undefined : INVOKE_LEAD[invoke] ?? `Invoke "${invoke}"`;
    let lead = invokeLead;
    if (tierRaw !== "") {
      const tier = Number(tierRaw);
      const cls = names?.tier(tier);
      const as = cls ? `as ${cls} (${CC_LABEL[tier] ?? `tier ${tier}`})` : `at class-change tier ${CC_LABEL[tier] ?? tier}`;
      lead = invokeLead ? `${invokeLead}, ${as}` : capitalize(as);
    }
    return { lead, clauses: mergeClauses(mergeVariants(clauses)) };
  });
}

function capitalize(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function ReadableSentences({ sentences }: { sentences: ProseSentence[] }) {
  if (!sentences.length) return null;
  return (
    <ul className="prose-lines">
      {sentences.map((sen, i) => (
        <li key={i}>
          {sen.lead && <span className="prose-lead"><HumanText text={sen.lead} />: </span>}
          {sen.clauses.map((c, j) => (
            <span key={j} className={c.verified ? undefined : "prose-unverified"} title={c.note}>
              {j > 0 && "; "}
              <HumanText text={j === 0 && !sen.lead ? capitalize(c.text) : c.text} />
              {(c.tag || c.rule) && (
                <span className="prose-tag" title={c.rule ? `${capitalize(c.rule)}.` : undefined}>
                  {c.tag ?? "stacking"}
                </span>
              )}
            </span>
          ))}
          .
        </li>
      ))}
    </ul>
  );
}

// The two influence views under a skill/ability text, switched by the
// page-wide Readable / Game details toggles.
function InfluenceViews({ sentences, count, children }: { sentences: ProseSentence[]; count: number; children: ReactNode }) {
  const readable = useUiStore((st) => st.influenceReadable);
  const details = useUiStore((st) => st.influenceDetails);
  return (
    <>
      {readable && <ReadableSentences sentences={sentences} />}
      {details && count > 0 && <div className="inf-details">{children}</div>}
    </>
  );
}

function InfluenceViewToggles() {
  const readable = useUiStore((st) => st.influenceReadable);
  const details = useUiStore((st) => st.influenceDetails);
  const toggle = useUiStore((st) => st.toggleInfluenceView);
  const L = useL();
  return (
    <div className="inf-view-toggles" role="group" aria-label={L("Effect views", "効果の表示")}>
      <button type="button" aria-pressed={readable} onClick={() => toggle("influenceReadable")}>{L("Readable", "わかりやすく")}</button>
      <button type="button" aria-pressed={details} onClick={() => toggle("influenceDetails")}>{L("Game details", "ゲームデータ")}</button>
    </div>
  );
}

// ---- skill-text placeholder substitution ----------------------------------
// The game's skill text ships with unsubstituted tokens (<TIME>/<ATK>/...).
// Fill them from the data we have: a token's MATCHING influence row first
// (e.g. <ATK> from an influence-type-2 row's mul3, per its "ATK" label), the
// skill's Power/PowerMax otherwise (Power fills whichever token the text
// wires it into), <TIME> from Duration. HEURISTIC pairing -- every filled
// value is styled as derived, with the original token in the tooltip.
// 141/142 = permanent ATK/DEF modification; a stage's timed ATK/DEF row
// (2/3, 4/5) takes precedence over them regardless of row order.
// `fallback` types (89/90 Type-C conditional, 228/229 race-conditional ATK/DEF
// buffs) are read only when the stage's Power is neutral (100), so they never
// replace a real Power value.
const PERMANENT_STAT_TYPES = new Set([141, 142]);
const TOKEN_INFLUENCES: Record<string, { types: number[]; field: "mul3" | "add"; fallback?: number[] }> = {
  ATK: { types: [2, 3, 141], field: "mul3", fallback: [89, 228] },
  DEF: { types: [4, 5, 142], field: "mul3", fallback: [90, 229] },
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
      ? ` (gated: ${plainConditionText(humanize(tagRow.activate_if) || tagRow.activate_if || "")})` : ", tagged");
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
    // A self row tagged "[X]" belongs to the "[X]" token; an "<X>" token
    // names the other row (allies/tokens) unless that is the only candidate.
    const typed = (s.influences || [])
      .filter((r) => r.influence_type != null && spec.types.includes(r.influence_type));
    const unclaimed = token.startsWith("<")
      ? typed.filter((r) => !(r.tag === `[${name}]` && r.target === "self"))
      : typed;
    // Every typed row is claimed by "[X]": an "<X>" token then reads the
    // fallback (ally/conditional) rows before reusing the claimed self row.
    if (token.startsWith("<") && !unclaimed.length && typed.length && spec.fallback) {
      const fbRow = (s.influences || []).find((r) => r.influence_type != null
        && (spec.fallback || []).includes(r.influence_type)
        && r[spec.field] != null && !r.activate_if);
      if (fbRow) return rowValue(fbRow, spec.field, "");
    }
    const rows = (unclaimed.length ? unclaimed : typed)
      .sort((a, b) => Number(PERMANENT_STAT_TYPES.has(a.influence_type!))
        - Number(PERMANENT_STAT_TYPES.has(b.influence_type!)));
    const row = rows.find((r) => r[spec.field] != null && !r.activate_if);
    if (row) return rowValue(row, spec.field, "");
    const gatedValue = (candidates: SkillInfluence[]) => {
      const gated = candidates.find((r) => r[spec.field] != null);
      return gated ? rowValue(gated, spec.field,
        ` (gated: ${plainConditionText(humanize(gated.activate_if) || gated.activate_if || "")})`) : null;
    };
    if (COUNT_TOKENS.has(name)) {
      // counts are never Power-filled; a gated row is better than an
      // unfilled token (tooltip shows the gate).
      return gatedValue(rows);
    }
    // A neutral Power (100) would render a meaningless "1x": prefer the
    // fallback types, then a gated row (tooltip shows the gate).
    const neutralPower = s.power == null
      || (s.power === 100 && (s.power_max == null || s.power_max === 100));
    if (neutralPower && spec.fallback) {
      const fb = (s.influences || []).filter(
        (r) => r.influence_type != null && (spec.fallback || []).includes(r.influence_type));
      const fbRow = fb.find((r) => r[spec.field] != null && !r.activate_if);
      if (fbRow) return rowValue(fbRow, spec.field, "");
      const gated = gatedValue(rows) || gatedValue(fb);
      if (gated) return gated;
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
      <span title="machine translated / 機械翻訳"><TokenText text={en} s={s} jp={jp} /></span>
      <div className="muted small"><TokenText text={jp} s={s} jp={jp} /></div>
    </>
  );
}

// A stage's badge: how it is reached. Charge steps get a step counter so a
// staged charge skill reads as a progression, swaps as "next use".
function StageBadge({ s, chargePos }: { s: SkillStage; chargePos?: [number, number] }) {
  const L = useL();
  if (s.via === "charge") {
    return (
      <span className="via-badge via-badge--charge">
        {chargePos ? L("charge {a}/{b}", "チャージ {a}/{b}", { a: chargePos[0], b: chargePos[1] }) : L("charged", "チャージ")}
      </span>
    );
  }
  if (s.via === "swap") return <span className="via-badge">{L("next use", "次回使用")}</span>;
  return null;
}

function SkillStageRow({
  s, i, labels, abilityLabels, chargePos, inlined, skillNames,
}: {
  s: SkillStage; i: number;
  labels: Record<string, UnitInfluenceLabel>; abilityLabels: Record<string, UnitInfluenceLabel>;
  chargePos?: [number, number];
  inlined?: Set<number>;
  skillNames?: Map<number, string>;
}) {
  // swap targets NOT shown as a stage below (e.g. the AW skill swapping back
  // to the base skill, or a charge chain cycling to its origin).
  const externalSwaps = (s.swaps_to || []).filter((id) => !inlined?.has(id));
  // only tokens that could NOT be substituted are worth flagging
  const unresolved = [...new Set((s.text || "").match(/<[A-Z_]+>|\[[A-Z_]+\]/g) || [])]
    .filter((t) => !resolveToken(t, s));
  const nInf = (s.influences?.length || 0) + (s.linked_ability_influences?.length || 0);
  const missiles = useContext(MissilesContext);
  const abilityConfigs = useContext(AbilityConfigsContext);
  const L = useL();
  return (
    <tr key={s.id}>
      <td className="unit-class-name-cell">
        {gameName(s.name_en, s.name)}
        {altName(s.name_en, s.name) && <div className="muted small">{s.name}</div>}
        <span className="muted small"> #{s.id}</span>
        {i > 0 && <StageBadge s={s} chargePos={chargePos} />}
        {externalSwaps.length > 0 && (
          <div className="muted small">
            {L("→ swaps to skill {ids}", "→ スキル {ids} に切り替え", { ids: externalSwaps.map((id) => `#${id}`).join(", ") })}
          </div>
        )}
      </td>
      <td className="skill-text">
        <SkillText s={s} />
        {unresolved.length > 0 && (
          <div className="muted small">{L("unresolved placeholders:", "未解決のプレースホルダー:")} {unresolved.join(" ")}</div>
        )}
        <InfluenceViews count={nInf} sentences={skillStageSentences(s, labels, abilityLabels, missiles, skillNames, abilityConfigs)}>
          {s.influences && s.influences.length > 0 && (
            <ul className="effects">
              {s.influences.map((inf, j) => isTimelineRow(inf) ? null : (
                <SkillInfluenceRow
                  inf={inf} i={j} key={j}
                  label={inf.influence_type != null ? labels[String(inf.influence_type)] : undefined}
                  siblings={s.influences}
                  groupChangeFunction={s.group_change_function}
                />
              ))}
              {s.influences.some(isTimelineRow) && (
                <li>
                  <details>
                    <summary>{timelineSummary(s.influences.filter(isTimelineRow))}</summary>
                    <pre className="small">{s.influences.filter(isTimelineRow).map((r) => {
                      const { 種別: kind, ...rest } = (r.extend ?? {}) as Record<string, unknown>;
                      return `${r.add ?? 0}f ${String(kind ?? "?")} ${JSON.stringify(rest)}`;
                    }).join("\n")}</pre>
                  </details>
                </li>
              )}
            </ul>
          )}
          {s.linked_ability_influences && s.linked_ability_influences.length > 0 && (
            <>
              <div className="muted small linked-ability-head">
                {L("linked ability effects (granted by the type-122 row):", "連動アビリティの効果 (タイプ122の行で付与):")}
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
        </InfluenceViews>
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
  const L = useL();
  if (!skill) return null;
  const plan = planStages(skill.stages);
  const inlined = new Set(skill.stages.map((s) => s.id));
  const skillNames = new Map(skill.stages.map((s) => [s.id, gameName(s.name_en, s.name) || `skill #${s.id}`]));
  return (
    <Panel
      actions={<InfluenceViewToggles />}
      title={(
        <>
          {label}: {gameName(skill.name_en, skill.name)}
          {altName(skill.name_en, skill.name) && <span className="muted small"> {skill.name}</span>}
          {" "}<span className="muted small">#{skill.id}</span>
        </>
      )}
    >
      <table className="grid unit-detail-table">
        <thead>
          <tr>
            <th>{L("Name", "名前")}</th><th>{L("Effect", "効果")}</th>
            <th>{L("Duration", "効果時間")}</th><th>{L("Cooldown", "再使用時間")}</th><th>{L("Max Level", "最大レベル")}</th>
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
                  chargePos={item.chargePos} inlined={inlined} skillNames={skillNames}
                />
              );
            }
            if (expandGaps) {
              return item.stages.map((x) => (
                <SkillStageRow
                  key={`s${x.s.id}-${x.i}`}
                  s={x.s} i={x.i}
                  labels={labels} abilityLabels={abilityLabels}
                  chargePos={x.chargePos} inlined={inlined} skillNames={skillNames}
                />
              ));
            }
            return (
              <tr key={`gap${k}`} className="stage-gap-row">
                <td colSpan={5}>
                  <button className="stage-gap-btn" onClick={() => setExpandGaps(true)}>
                    {L("… {n} intermediate charge steps (show all)", "… 途中のチャージ段階 {n} 件 (すべて表示)", { n: item.stages.length })}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function AbilityBlock({
  label, ability, labels,
}: { label: string; ability?: UnitAbility | null; labels: Record<string, UnitInfluenceLabel> }) {
  const texts = useContext(TextsContext);
  const missiles = useContext(MissilesContext);
  const abilityConfigs = useContext(AbilityConfigsContext);
  const names = useContext(UnitNamesContext);
  const L = useL();
  if (!ability) return null;
  const abilityEn = ability.text ? texts.ability[ability.text] : undefined;
  return (
    <Panel title={label} actions={<InfluenceViewToggles />}>
      <table className="grid unit-detail-table">
        <thead>
          <tr><th>{L("Ability Name", "アビリティ名")}</th><th>{L("Effect", "効果")}</th></tr>
        </thead>
        <tbody>
          <tr>
            <td className="unit-class-name-cell">
              {gameName(ability.name_en, ability.name)}
              {altName(ability.name_en, ability.name) && <div className="muted small">{ability.name}</div>}
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
              <InfluenceViews count={ability.influences?.length || 0} sentences={abilitySentences(ability.influences || [], labels, missiles, abilityConfigs, names)}>
                <ul className="effects">
                  {(ability.influences || []).map((inf, j) => (
                    <AbilityInfluenceRow
                      inf={inf} i={j} key={j} labelsMap={labels}
                      label={inf.influence_type != null ? labels[String(inf.influence_type)] : undefined}
                    />
                  ))}
                </ul>
              </InfluenceViews>
            </td>
          </tr>
        </tbody>
      </table>
    </Panel>
  );
}

// War God Blessing rows that can reach this unit. A row's three
// expressions are evaluated per class tier against the unit's facts; team /
// battle conditions stay unknown (null), so a row is listed unless every tier
// is ruled out. p4 is the stack key: rows sharing it do not stack.
const BLESSING_GROUPS: [number | null, string, string][] = [
  [10001, "Class", "クラス"], [11001, "Attribute", "属性"], [12001, "Sortie", "出撃"], [null, "Other", "その他"],
];
// a stray ";" before ")", "&&" or "||" in a few rows would break the
// expression parser
const cleanExpr = (x?: string | null) => (x || "").replace(/;\s*(?=\)|&&|\|\|)/g, "");

interface BlessingMatch {
  row: WarGodBlessings["rows"][number];
  always: boolean;          // no team / battle condition left
  tiers: number[] | null;   // cc tiers it reaches, null = every tier
}

function blessingMatches(unit: Unit, data: WarGodBlessings): BlessingMatch[] {
  const out: BlessingMatch[] = [];
  for (const row of data.rows) {
    const per = unit.classes.map((cl) => {
      const ctx = { skillActive: false, skillId: null, skillUnknown: true, classChange: cl.cc,
        target: targetFacts(unit, cl), possession: true };
      return both(both(evaluate(cleanExpr(row.activate_command), ctx), evaluate(cleanExpr(row.command), ctx)),
        evaluate(cleanExpr(row.no_change_condition), ctx));
    });
    if (per.every((t) => t === false)) continue;
    const reached = unit.classes.filter((_, i) => per[i] !== false).map((cl) => cl.cc);
    out.push({
      row,
      always: per.some((t) => t === true),
      tiers: reached.length === unit.classes.length ? null : [...new Set(reached)],
    });
  }
  return out;
}

function BlessingPanel({
  matches, items, labels,
}: { matches: BlessingMatch[]; items: Record<string, string>; labels: Record<string, UnitInfluenceLabel> }) {
  const missiles = useContext(MissilesContext);
  const abilityConfigs = useContext(AbilityConfigsContext);
  const names = useContext(UnitNamesContext);
  const L = useL();
  if (!matches.length) {
    return <Panel title={L("War God Blessing", "戦神の加護")}><p className="muted">{L("No War God Blessing can buff this unit.", "このユニットを強化できる戦神の加護はありません。")}</p></Panel>;
  }
  return (
    <>
      <p className="muted small blessing-intro">
        {L("War God Blessing (戦神の加護) items whose buff can reach this unit. A blessing works while the item is owned and its conditions hold; rows sharing a stack key (p4) do not stack, only the highest applies.", "このユニットに効果が届く戦神の加護。アイテムを所持し条件を満たす間に有効です。スタックキー (p4) が同じ行は重複せず、最も高いものだけが適用されます。")}
      </p>
      {BLESSING_GROUPS.map(([key, titleEn, titleJa]) => {
        const title = L(titleEn, titleJa);
        const inGroup = matches.filter((m) =>
          key == null ? !BLESSING_GROUPS.some(([k]) => k != null && k === m.row.params?.[3]) : m.row.params?.[3] === key);
        if (!inGroup.length) return null;
        const byItem = new Map<string, BlessingMatch[]>();
        for (const m of inGroup) byItem.set(m.row.item, [...(byItem.get(m.row.item) || []), m]);
        return (
          <Panel key={title} title={L("{t} blessings ({n})", "{t}の加護 ({n})", { t: title, n: byItem.size })} actions={<InfluenceViewToggles />}>
            <table className="grid unit-detail-table blessing-table">
              <thead><tr><th>{L("Blessing", "加護")}</th><th>{L("Effect", "効果")}</th></tr></thead>
              <tbody>
                {[...byItem.entries()].map(([item, ms]) => {
                  const rows = ms.map((m) => m.row);
                  const tiers = ms.find((m) => m.tiers)?.tiers;
                  return (
                    <tr key={item}>
                      <td className="unit-class-name-cell">
                        {items[item] || item}
                        <div className="muted small">{item.replace("battle_god_bless_", "#")}</div>
                        {ms.every((m) => m.always) && <span className="badge sky">{L("always", "常時")}</span>}
                      </td>
                      <td className="skill-text">
                        {tiers && (
                          <div className="muted small">
                            {L("Only at:", "対象:")} {tiers.map((cc) => names?.tier(cc) || `tier ${cc}`).join(", ")}
                          </div>
                        )}
                        <InfluenceViews count={rows.length} sentences={abilitySentences(rows, labels, missiles, abilityConfigs, names)}>
                          <ul className="effects">
                            {rows.map((inf, j) => (
                              <AbilityInfluenceRow
                                inf={inf} i={j} key={j} labelsMap={labels}
                                label={inf.influence_type != null ? labels[String(inf.influence_type)] : undefined}
                              />
                            ))}
                          </ul>
                        </InfluenceViews>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        );
      })}
    </>
  );
}

// 【所持効果】 possession effects (ability invoke 7, "while in the 1st
// barrack"): owning the carrier applies the row to every unit its conditions
// select. Evaluated per class tier of THIS unit like the blessings above, with
// the carrier as the row's owner (IsOwnerUnit).
type PossessionRow = PossessionBuffs["rows"][number];
interface PossessionMatch { row: PossessionRow; always: boolean; tiers: number[] | null }

function possessionMatches(unit: Unit, data: PossessionBuffs): PossessionMatch[] {
  const out: PossessionMatch[] = [];
  for (const row of data.rows) {
    const per = unit.classes.map((cl) => {
      const ctx = { skillActive: false, skillId: null, skillUnknown: true, classChange: cl.cc,
        target: targetFacts(unit, cl), ownerId: row.u, possession: true };
      return both(both(evaluate(cleanExpr(row.activate_command), ctx), evaluate(cleanExpr(row.command), ctx)),
        evaluate(cleanExpr(row.no_change_condition), ctx));
    });
    if (per.every((t) => t === false)) continue;
    const reached = unit.classes.filter((_, i) => per[i] !== false).map((cl) => cl.cc);
    out.push({
      row,
      always: per.some((t) => t === true),
      tiers: reached.length === unit.classes.length ? null : [...new Set(reached)],
    });
  }
  return out;
}

const possessionSlot = (L: Pick): Record<string, string> => ({ default: L("Ability", "アビリティ"), awakened: L("Awakened ability", "覚醒アビリティ") });

// Stat rows a possession effect can carry: ability 12/13/14 = HP/ATK/DEF %
// (value p1), 15/21 = MR/Range flat (1st-barrack value p2). Other types
// (UP recovery, ...) are not stats and stay out of the totals.
const POSSESSION_STATS: { type: number; stat: string; param: number; pct: boolean }[] = [
  { type: 12, stat: "HP", param: 0, pct: true },
  { type: 13, stat: "ATK", param: 0, pct: true },
  { type: 14, stat: "DEF", param: 0, pct: true },
  { type: 15, stat: "MR", param: 1, pct: false },
  { type: 21, stat: "Range", param: 1, pct: false },
];

// Per stat: rows sharing a stack key (influence type + p4) count once, at
// their highest value; the stack groups then add up. `sure` uses only rows
// with no condition left on every tier, `max` every row that can apply.
function possessionTotals(matches: PossessionMatch[]) {
  return POSSESSION_STATS.map((s) => {
    const sum = (ms: PossessionMatch[]) => {
      const best = new Map<number, number>();
      for (const m of ms) {
        if (m.row.influence_type !== s.type) continue;
        const v = m.row.params?.[s.param] ?? 0;
        const key = m.row.params?.[3] ?? 0;
        best.set(key, Math.max(best.get(key) ?? 0, v));
      }
      return [...best.values()].reduce((a, b) => a + b, 0);
    };
    return { ...s, sure: sum(matches.filter((m) => m.always && !m.tiers)), max: sum(matches) };
  }).filter((t) => t.max > 0);
}

function PossessionPanel({
  matches, labels, unitsById,
}: {
  matches: PossessionMatch[]; labels: Record<string, UnitInfluenceLabel>;
  unitsById: Map<number, UnitIndexEntry> | null;
}) {
  const missiles = useContext(MissilesContext);
  const abilityConfigs = useContext(AbilityConfigsContext);
  const names = useContext(UnitNamesContext);
  const L = useL();
  if (!matches.length) {
    return <Panel title={L("Possession buffs", "所持効果")}><p className="muted">{L("No unit's possession effect can buff this unit.", "このユニットを強化できる所持効果はありません。")}</p></Panel>;
  }
  const bySource = new Map<number, PossessionMatch[]>();
  for (const m of matches) bySource.set(m.row.u, [...(bySource.get(m.row.u) || []), m]);
  const sources = [...bySource.keys()].sort((a, b) => b - a);
  const totals = possessionTotals(matches);
  return (
    <Panel title={L("Possession buffs ({n} units)", "所持効果 ({n}ユニット)", { n: sources.length })} actions={<InfluenceViewToggles />}>
      <p className="muted small">
        {L("Units whose possession effect (【所持効果】) can buff this unit: it applies while the carrier is owned and kept in the 1st barrack. Rows sharing a stack key (p4) do not stack; only the highest applies.", "このユニットを強化できる【所持効果】を持つユニット。所持して第1兵舎に置いている間に有効です。スタックキー (p4) が同じ行は重複せず、最も高いものだけが適用されます。")}
      </p>
      {totals.length > 0 && (
        <div className="possession-totals">
          <span className="muted small">{L("Total with every carrier owned", "すべて所持した場合の合計")}</span>
          {totals.map((t) => (
            <span className="possession-total" key={t.stat}>
              <strong>{t.stat}</strong> +{t.sure}{t.pct ? "%" : ""}
              {t.max !== t.sure && (
                <span className="muted small">{L(" (up to +{v} with conditions)", " (条件込みで最大 +{v})", { v: `${t.max}${t.pct ? "%" : ""}` })}</span>
              )}
            </span>
          ))}
        </div>
      )}
      <table className="grid unit-detail-table possession-table">
        <thead><tr><th>{L("Unit", "ユニット")}</th><th>{L("Effect", "効果")}</th></tr></thead>
        <tbody>
          {sources.flatMap((id) => {
            const src = unitsById?.get(id);
            const slots = new Map<string, PossessionMatch[]>();
            for (const m of bySource.get(id)!) slots.set(m.row.slot, [...(slots.get(m.row.slot) || []), m]);
            return [...slots.entries()].map(([slot, ms], k) => {
              const rows = ms.map((m) => m.row);
              const tiers = ms.find((m) => m.tiers)?.tiers;
              return (
                <tr key={`${id}-${slot}`}>
                  {k === 0 && (
                    <td className="unit-class-name-cell" rowSpan={slots.size}>
                      <UnitIconLink id={id} name={gameName(src?.name_en, src?.name)} />
                      {src?.rarity && <div className="muted small">{rarityName(src.rarity)}</div>}
                    </td>
                  )}
                  <td className="skill-text">
                    {(slots.size > 1 || ms.every((m) => m.always) || tiers) && (
                      <div className="muted small possession-meta">
                        {[
                          slots.size > 1 ? (possessionSlot(L)[slot] || slot) : null,
                          ms.every((m) => m.always) ? <span className="badge sky" key="a">{L("always", "常時")}</span> : null,
                          tiers ? `${L("only at:", "対象:")} ${tiers.map((cc) => names?.tier(cc) || `tier ${cc}`).join(", ")}` : null,
                        ].filter(Boolean).map((x, i) => <span key={i}>{i > 0 && " · "}{x}</span>)}
                      </div>
                    )}
                    <InfluenceViews count={rows.length} sentences={abilitySentences(rows, labels, missiles, abilityConfigs, names)}>
                      <ul className="effects">
                        {rows.map((inf, j) => (
                          <AbilityInfluenceRow
                            inf={inf} i={j} key={j} labelsMap={labels}
                            label={inf.influence_type != null ? labels[String(inf.influence_type)] : undefined}
                          />
                        ))}
                      </ul>
                    </InfluenceViews>
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </Panel>
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
const positionLabels = (L: Pick): Record<string, string> => ({ melee: L("Melee", "近接"), ranged: L("Ranged", "遠距離"), omni: L("Omni (melee or ranged)", "両用 (近接・遠距離)"), anywhere: L("Anywhere (designated tile)", "指定地点 (任意のマスに配置可)") });
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

// affection bonus is exported raw (BonusType/BonusNum). Stat bonuses in
// slots 1/2: full-bloom (max level > 50) scales *1.2, half-bloom *0.5; the
// slot-3 (150% affection) bonus applies at its raw value. The unit's own
// HP/ATK/DEF mod (12/13/14) then applies on top, same as the stat box.
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
      let v = affectionStat(b, full);
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
  const L = useL();
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
            <th>{L("Icon", "アイコン")}</th><th>{L("Class", "クラス")}</th><th>Lv</th>
            <th>HP</th><th>{L("ATK", "攻撃力")}</th><th>{L("DEF", "防御力")}</th><th>{L("MR", "魔法耐性")}</th>
            <th>{L("Range/Block", "射程/ブロック")}</th><th>{L("Targets", "対象数")}</th><th>{L("Atk attr", "攻撃属性")}</th><th>{L("Atk speed", "攻撃間隔")}</th>
            <th>{L("Cost", "コスト")}</th><th>{L("AFF bonus", "好感度ボーナス")}</th>
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
                  <span className="muted small">{L("(tier {n})", "(段階 {n})", { n: cl.cc })}</span>
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
                    : `${cl.range != null ? cl.range + (clFlatMod("range") ?? 0) : L("melee", "近接")} (${L("block", "ブロック")} ${cl.block ?? "-"})`}
                  {!cl.ranged && range188 != null && (
                    <span className="meaning" title="attacks at range: ability 188 (Gain ranged atk, inherent · self)">
                      {" "}· {L("range", "射程")} {range188}
                    </span>
                  )}
                  {cl.missile && missileText(cl.missile) && (
                    <div className="muted small" title="the class's own missile">
                      {missileText(cl.missile)}
                    </div>
                  )}
                  {cl.deploy_slot === "melee or ranged" && (
                    <div className="muted small" title="ClassData.PlaceAttribute: deployable in either spot">
                      {L("deployable: melee or ranged", "配置: 近接・遠距離どちらも可")}
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
  const missiles = useContext(MissilesContext);
  const abilityConfigs = useContext(AbilityConfigsContext);
  const names = useContext(UnitNamesContext);
  // The per-tier text (Explanation) is the primary source of "class
  // attribute" info -- it carries mechanics even when there's no linked
  // ClassAbility1 config (e.g. #523's per-tier escalating aura %, which has
  // zero class_ability_influences on every tier but a fully-detailed
  // description each). Show any class with EITHER.
  const withContent = classes.filter(
    (cl) => cl.description || (cl.class_ability_influences && cl.class_ability_influences.length > 0)
  );
  const L = useL();
  if (withContent.length === 0) return null;
  return (
    <Panel title={L("Class Attributes", "クラス特性")} actions={<InfluenceViewToggles />}>
      <table className="grid unit-detail-table">
        <thead>
          <tr><th>{L("Class Name", "クラス名")}</th><th>{L("Description", "説明")}</th></tr>
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
                <InfluenceViews count={cl.class_ability_influences?.length || 0} sentences={abilitySentences(cl.class_ability_influences || [], labels, missiles, abilityConfigs, names)}>
                  <ul className="effects">
                    {(cl.class_ability_influences || []).map((inf, j) => (
                      <AbilityInfluenceRow
                        inf={inf} i={j} key={j} labelsMap={labels}
                        label={inf.influence_type != null ? labels[String(inf.influence_type)] : undefined}
                      />
                    ))}
                  </ul>
                </InfluenceViews>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
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

/** One viewable item in the gallery (and its lightbox). */
export interface GalleryItem {
  label: string;
  src: string;
  kind: "art" | "icon" | "anim";
}

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
  const L = useL();
  return (
    <details className="dlg-section speech-scene">
      <summary>
        {s.scene != null ? L("Scene {n}", "シーン {n}", { n: s.scene }) : L("Extra scene", "追加シーン")}
        {s.at != null && <span className="dlg-trigger speech-scene-at">{L("at {n}% affection", "好感度 {n}%", { n: s.at })}</span>}
        {s.quest && <span className="dlg-trigger speech-scene-at">{L("from its harlem quest", "交流クエストから")}</span>}
      </summary>
      {s.lines.map((l, i) =>
        l.name ? (
          <div className="dlg-line" key={i}>
            <div className="dlg-body">
              <div className="dlg-name" title={altName(l.name_en, l.name) || undefined}>
                {gameName(l.name_en, l.name)}
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
  const L = useL();
  return (
    <Panel title={L("Quotes & scenes", "台詞・シーン")}>
      {speech.quotes && speech.quotes.length > 0 && (
        <div className="quote-list">
          {speech.quotes.map((q, i) => (
            <div className="quote-row" key={i}>
              <span className="quote-at">{q.adjutant ? L("adjutant", "副官") : `${q.at}%`}</span>
              <SpeechText jp={q.text} en={q.text_en} className="quote-text" />
            </div>
          ))}
          {(speech.quotes2 ?? []).map((t, i) => (
            <div className="quote-row" key={`f2-${i}`}>
              <span className="quote-at" title={L("second quote block (Flavor2) — when it shows is unverified", "2つ目の台詞ブロック (Flavor2) — 表示条件は未確認")}>{L("extra {n}?", "追加 {n}?", { n: i + 1 })}</span>
              <SpeechText jp={t} en={speech.quotes2_en?.[i]} className="quote-text" />
            </div>
          ))}
        </div>
      )}
      {(speech.scenes ?? []).map((s, i) => <SpeechSceneBlock s={s} key={i} />)}
    </Panel>
  );
}

// A plain `to="/units"` link always lands on the default (unfiltered,
// page 0) list, discarding whatever filters/page/search were active
// before navigating here. Going back in history instead returns to the
// exact previous URL (filters and all); fall back to a plain link only
// when there's no in-app history to go back to (e.g. a shared link opened
// directly on this page).
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

// Where a Prince card sits among his titles: its family's levels, linked.
function PrinceBar({ unitId, data }: { unitId: number; data: PrinceData }) {
  const { forms } = princeFamilies(data);
  const fam = familyOfCard(forms, unitId);
  const L = useL();
  if (!fam) {
    return (
      <div className="prince-bar">
        <span>{L("Base Prince, no title equipped.", "称号なしの王子")}</span>
        <Link to="/prince">{L("All {n} title forms →", "称号 {n} 種すべて →", { n: forms.length })}</Link>
      </div>
    );
  }
  const row = fam.rows.find((r) => r.card === unitId)!;
  return (
    <div className="prince-bar">
      <span>
        {L("Prince title", "王子の称号")} <strong>{familyTitle(fam)}</strong>
        {fam.rows.length > 1 && <span className="muted">{L(" · Lv{a} of {b}", " · Lv{a} / {b}", { a: row.level, b: fam.rows.length })}</span>}
      </span>
      {fam.rows.length > 1 && (
        <span className="prince-bar-levels">
          {fam.rows.map((r) => r.card === unitId ? (
            <strong key={r.card} className="prince-level-link is-current" title={explanEn(r) || r.explan}>Lv{r.level}</strong>
          ) : (
            <Link key={r.card} to={`/units/${r.card}`} className="prince-level-link" title={explanEn(r) || r.explan}>Lv{r.level}</Link>
          ))}
        </span>
      )}
      <Link to="/prince">{L("All Prince titles →", "王子の称号一覧 →")}</Link>
    </div>
  );
}

// breadcrumb links: the Units crumb goes back to the previous list view
const crumbLink: RenderLink = ({ href, className, children }) =>
  href === "/units"
    ? <BackToUnits className={className}>{children}</BackToUnits>
    : routerLink({ href, className, children });

export default function UnitDetail() {
  useExprNames();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const unitId = Number(id);
  const { loading, unit } = useUnitDetail(unitId);
  const influenceLabels = useUnitInfluenceLabels();
  const loc = useLocalisation();
  const texts = useTexts();
  const princeTitles = usePrinceTitles();
  const blessings = useWarGodBlessings();
  const possession = usePossessionBuffs();
  const unitIndex = useUnits();
  const missiles = useMissiles();
  const abilityConfigs = useAbilityConfigs();
  const speech = useUnitSpeech(unitId);
  const [tier, setTier] = useState(0);
  const baseClass = unit?.classes[0]?.name;
  usePageMeta(loading ? LIST_META["/units"] : unit ? unitMeta(unit, baseClass && (loc?.classes[baseClass] || baseClass)) : NOT_FOUND_META);
  const [galleryAt, setGalleryAt] = useState<number | null>(null);
  const L = useL();

  if (loading) return <p className="loading">{L("Loading…", "読み込み中…")}</p>;
  if (!unit) {
    return (
      <p>
        {L("Unit #{id} not found (data file failed to load).", "ユニット #{id} が見つかりません (データの読み込みに失敗)。", { id: unitId })}{" "}
        <button className="stage-gap-btn" style={{ width: "auto" }} onClick={() => location.reload()}>
          {L("retry", "再試行")}
        </button>{" "}
        <BackToUnits>{L("Back to units", "ユニット一覧へ戻る")}</BackToUnits>
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
  const displayName = gameName(unit.name_en, unit.name) || L("(unnamed)", "(名前なし)");

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
        label: `${L("Sprite", "ドット")} — ${x.base}`,
        src: unitAnimUrl(unit.dot_id, x.name),
        kind: "anim" as const,
      }));
  const gallerySections: { title: string; items: GalleryItem[] }[] = artTiers.map((t, idx) => ({
    title: tierTitle(t),
    items: [
      { label: L("Art", "イラスト"), src: unitImageUrl("art", unit.dot_id, t), kind: "art" as const },
      { label: L("Icon", "アイコン"), src: unitImageUrl("icon", unit.dot_id, t), kind: "icon" as const },
      ...animsFor(idx),
    ],
  }));
  {
    // sprite sets beyond the known art tiers (rare) still get a section
    for (let s = artTiers.length; s <= 3; s++) {
      const extra = animsFor(s);
      if (extra.length) gallerySections.push({ title: L("Set {n}", "セット {n}", { n: s + 1 }), items: extra });
    }
  }
  const galleryItems = gallerySections.flatMap((s) =>
    s.items.map((it) => ({ srcs: [it.src], label: `${it.label} — ${s.title}` })));

  const textMaps: TextMaps = {
    skill: texts.skill_texts,
    ability: texts.ability_texts,
    cls: texts.class_texts,
  };

  const tierClass = new Map(unit.classes.map((c) => [c.cc, (c.name && loc?.classes?.[c.name]) || c.name]));
  const tokenName = new Map(unit.classes.flatMap((c) => c.tokens).map((t) => [t.unit, t.unit_name]));
  const skillName = new Map(Object.values(unit.skills ?? {}).flatMap((sk) => sk?.stages ?? [])
    .map((st) => [st.id, gameName(st.name_en, st.name)]));
  const unitNames: UnitNames = {
    tier: (cc) => tierClass.get(cc) ?? undefined,
    unit: (id) => tokenName.get(id) ?? undefined,
    skill: (id) => skillName.get(id) ?? undefined,
  };

  const blessingMatchList = blessings ? blessingMatches(unit, blessings) : [];
  const possessionMatchList = possession ? possessionMatches(unit, possession) : [];
  const possessionSources = new Set(possessionMatchList.map((m) => m.row.u)).size;
  const blessingItems = new Set(blessingMatchList.map((m) => m.row.item)).size;

  // the active tab lives in ?tab= (absent = stats); tabs with nothing to
  // show are hidden, and a ?tab= naming one of them falls back to stats
  const UNIT_TABS_WITH_HIDDEN = [
    { id: "stats", label: L("Stats", "ステータス") },
    { id: "skills", label: L("Skills", "スキル") },
    { id: "abilities", label: L("Abilities", "アビリティ") },
    { id: "tokens", label: L("Tokens", "トークン"), count: allTokens.length, hidden: allTokens.length === 0 },
    { id: "gallery", label: L("Gallery", "ギャラリー") },
    { id: "possession", label: L("Possession buffs", "所持効果"), count: possessionSources, hidden: possessionSources === 0 },
    { id: "blessing", label: L("War God Blessing", "戦神の加護"), count: blessingItems, hidden: blessingItems === 0 },
    { id: "quotes", label: L("Quotes", "台詞"), hidden: !speech },
  ];
  const [activeTab, selectTab] = tabParam(searchParamsAdapter(params, setParams), UNIT_TABS_WITH_HIDDEN);

  return (
    <MissilesContext.Provider value={missiles}>
    <AbilityConfigsContext.Provider value={abilityConfigs}>
    <TextsContext.Provider value={textMaps}>
    <UnitNamesContext.Provider value={unitNames}>
    <div className="detail unit-page">
      <Breadcrumbs
        renderLink={crumbLink}
        items={[unit.prince ? { label: L("Prince", "王子"), href: "/prince" } : { label: L("Units", "ユニット"), href: "/units" }, { label: displayName }]}
      />

      <aside className="unit-infobox">
        <div className={`unit-infobox-banner rarity-${unit.rarity_id}`}>{displayName}</div>
        <button
          className="unit-art-zoom"
          onClick={() => setGalleryAt(gallerySections
            .slice(0, Math.max(0, artTiers.indexOf(tier)))
            .reduce((n, s) => n + s.items.length, 0))}
          title={L("View full art", "イラストを拡大")}
        >
          <UnitImage kind="art" id={unit.id} tier={tier} fallbackKind="icon" className="unit-art-img" alt={displayName} />
        </button>
        <Lightbox
          items={galleryItems}
          index={galleryAt}
          onIndex={setGalleryAt}
          onClose={() => setGalleryAt(null)}
        />
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
        <dl className="unit-infobox-rows">
          <div><dt>ID</dt><dd>#{unit.id}</dd></div>
          <div>
            <dt>{L("Rarity", "レア度")}</dt>
            <dd><Link to={`/units?rarity=${encodeURIComponent(unit.rarity.replace(/ Hero$/, ""))}`}>{rarityName(unit.rarity)}</Link></dd>
          </div>
          {unit.gender && (
            <div>
              <dt>{L("Gender", "性別")}</dt>
              <dd><Link to={`/units?gender=${encodeURIComponent(String(unit.gender))}`}>{tagName(loc, String(unit.gender))}</Link></dd>
            </div>
          )}
          {unit.position && (
            <div>
              <dt>{L("Position", "配置")}</dt>
              <dd><Link to={`/units?position=${unit.position}`}>{positionLabels(L)[unit.position]}</Link></dd>
            </div>
          )}
          {(unit.implementation_date || unit.release_year) && (
            <div><dt>{L("Released", "実装日")}</dt><dd>{unit.implementation_date || unit.release_year}</dd></div>
          )}
          {unit.artist && (
            <div><dt>{L("Artist", "イラスト")}</dt><dd><Link to={`/artists?artist=${encodeURIComponent(unit.artist)}`}>{unit.artist}</Link></dd></div>
          )}
        </dl>
        <div className="unit-infobox-meta">
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
              {tagName(loc, t)}
            </Link>
          ))}
          {unit.genus && (
            <Link className="meta-chip" to={`/tags/${encodeURIComponent(unit.genus)}`} title={unit.genus}>
              {tagName(loc, unit.genus)}
            </Link>
          )}
        </div>
      </aside>

      <h2>
        #{unit.id} {displayName}
        {altName(unit.name_en, unit.name) && (
          <span className="muted" style={{ fontSize: 14 }}> {unit.name}</span>
        )}
        {unit.npc && <span className="badge"> {L("NPC/test", "NPC・テスト")}</span>}
      </h2>

      {unit.prince && princeTitles && <PrinceBar unitId={unit.id} data={princeTitles} />}

      <UrlTabs className="unit-tabs" tabs={UNIT_TABS_WITH_HIDDEN} active={activeTab} onChange={selectTab} label={L("Unit sections", "ユニットの項目")} idBase="unit" />

      {activeTab === "stats" && (
      <TabPanel tab="stats" idBase="unit">
      {/* CfgProhibitConfig.atb -- a team-editor rule, not an influence: the
          restricted unit carries nothing in its ability/class-ability rows. */}
      {unit.formation_exclusion && (
        <Panel title={L("Formation restriction", "編成制限")}>
          <StatRows
            columns={1}
            rows={[
              ...(unit.formation_exclusion.one_per_team
                ? [{ id: "one", label: L("Team limit", "編成上限"), value: L("Only one may be in a team.", "編成には1体まで。") }]
                : []),
              ...(unit.formation_exclusion.cards.length > 0
                ? [{
                    id: "cards",
                    label: L("Cannot be in the same team as", "同じ編成にできないユニット"),
                    value: unit.formation_exclusion.cards.map((c, i) => (
                      <span key={c.id}>
                        {i > 0 && ", "}
                        <Link to={`/units/${c.id}`} title={c.name || undefined}>
                          {gameName(c.name_en, c.name) || `#${c.id}`}
                        </Link>
                      </span>
                    )),
                  }]
                : []),
            ]}
          />
        </Panel>
      )}

      {unit.specials && unit.specials.length > 0 && (
        <Panel title={L("Special properties", "特殊な性質")}>
          <StatRows
            columns={1}
            rows={unit.specials.map((s, i) => ({
              id: String(i),
              label: <code>type {s.type}</code>,
              value: (
                <>
                  <code>value {s.value}</code>
                  {s.params && s.params.length > 0 && (
                    <span className="params"> [{s.params.join(", ")}]</span>
                  )}
                  {s.name && <span className="meaning"> {s.name}</span>}
                  {s.type === 34 ? (
                    <CommandFacts cmd={s.command} kind="specialty" />
                  ) : s.command && <span className="expr" title={s.command}> {s.command}</span>}
                </>
              ),
            }))}
          />
        </Panel>
      )}

      <Panel title={L("Stats", "ステータス")}>
        <StatsTable unit={unit} classMap={loc?.classes} />
        <p className="muted small">{L("stat values exclude affection bonuses", "ステータスは好感度ボーナスを含みません")}</p>
      </Panel>

      <ClassAttributes classes={unit.classes} labels={abilityLabels} classMap={loc?.classes} />
      </TabPanel>
      )}

      {activeTab === "skills" && (
      <TabPanel tab="skills" idBase="unit">
      <SkillBlock label={L("Base skill", "スキル")} skill={unit.skills.base} labels={skillLabels} abilityLabels={abilityLabels} />
      <SkillBlock label={L("Class-evolved skill", "クラスチェンジ後スキル")} skill={unit.skills.class_evolved} labels={skillLabels} abilityLabels={abilityLabels} />
      <SkillBlock label={L("Awakened skill", "スキル覚醒")} skill={unit.skills.awakened} labels={skillLabels} abilityLabels={abilityLabels} />
      </TabPanel>
      )}

      {activeTab === "abilities" && (
      <TabPanel tab="abilities" idBase="unit">
      <AbilityBlock label={L("Ability", "アビリティ")} ability={unit.abilities.default} labels={abilityLabels} />
      {/* heroes/AW-start units carry the SAME ability in both slots -- show once */}
      {unit.abilities.awakened?.id !== unit.abilities.default?.id && (
        <AbilityBlock
          label={unit.abilities.awaken_ability_level
            ? L("Level {n} ability", "Lv{n} アビリティ", { n: unit.abilities.awaken_ability_level })
            : L("Awakened ability", "覚醒アビリティ")}
          ability={unit.abilities.awakened}
          labels={abilityLabels}
        />
      )}
      </TabPanel>
      )}

      {activeTab === "gallery" && (
      <TabPanel tab="gallery" idBase="unit">
      <Panel title={L("Gallery", "ギャラリー")}>
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
      </Panel>
      </TabPanel>
      )}

      {activeTab === "possession" && possession && (
        <TabPanel tab="possession" idBase="unit">
          <PossessionPanel matches={possessionMatchList} labels={abilityLabels} unitsById={unitIndex.byId} />
        </TabPanel>
      )}

      {activeTab === "blessing" && blessings && (
        <TabPanel tab="blessing" idBase="unit">
          <BlessingPanel matches={blessingMatchList} items={blessings.items} labels={abilityLabels} />
        </TabPanel>
      )}

      {activeTab === "quotes" && speech && (
        <TabPanel tab="quotes" idBase="unit">
          <SpeechSection speech={speech} />
        </TabPanel>
      )}

      {activeTab === "tokens" && (
        <TabPanel tab="tokens" idBase="unit">
        <Panel title={L("Tokens", "トークン")}>
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
                <span>{L("cost", "コスト")} {t.cost}</span>
                <span>{L("count", "数")} {t.count}</span>
                <span>{L("max deployed", "最大出撃数")} {t.deploy_max}</span>
                {t.total_max != null && <span>{L("total max", "合計上限")} {t.total_max}</span>}
                <span>{L("recast", "再出撃時間")} {t.recast}</span>
              </div>
              {t.stats && t.stats.length > 0 && (
                <table className="grid unit-token-stat-table">
                  <thead>
                    <tr>
                      <th>Lv</th><th>HP</th><th>{L("ATK", "攻撃力")}</th><th>{L("DEF", "防御力")}</th><th>{L("MR", "魔法耐性")}</th>
                      <th>{L("Range/Block", "射程/ブロック")}</th><th>{L("Targets", "対象数")}</th><th>{L("Atk attr", "攻撃属性")}</th>
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
                                : `${t.range ?? L("melee", "近接")} (${L("block", "ブロック")} ${t.block ?? "-"})`}
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
                <div className="muted small">{L("missile:", "ミサイル:")} {missileText(t.missile)}</div>
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
                <InfluenceViews count={t.class_ability_influences.length} sentences={abilitySentences(t.class_ability_influences, abilityLabels, missiles, abilityConfigs, unitNames)}>
                  <ul className="effects">
                    {t.class_ability_influences.map((inf, j) => (
                      <AbilityInfluenceRow
                        inf={inf} i={j} key={j} labelsMap={abilityLabels}
                        label={inf.influence_type != null ? abilityLabels[String(inf.influence_type)] : undefined}
                      />
                    ))}
                  </ul>
                </InfluenceViews>
              )}
              {t.skills?.base && (
                <SkillBlock label={L("Token skill", "トークンのスキル")} skill={t.skills.base}
                  labels={skillLabels} abilityLabels={abilityLabels} />
              )}
              {t.skills?.class_evolved && (
                <SkillBlock label={L("Token skill (evolved)", "トークンのスキル (クラスチェンジ後)")} skill={t.skills.class_evolved}
                  labels={skillLabels} abilityLabels={abilityLabels} />
              )}
              {t.skills?.awakened && (
                <SkillBlock label={L("Token skill (awakened)", "トークンのスキル (覚醒)")} skill={t.skills.awakened}
                  labels={skillLabels} abilityLabels={abilityLabels} />
              )}
              {t.abilities?.default && (
                <AbilityBlock label={L("Token ability", "トークンのアビリティ")} ability={t.abilities.default} labels={abilityLabels} />
              )}
              {t.abilities?.awakened && (
                <AbilityBlock label={L("Token ability (awakened)", "トークンのアビリティ (覚醒)")} ability={t.abilities.awakened} labels={abilityLabels} />
              )}
            </div>
          ))}
        </Panel>
        </TabPanel>
      )}

    </div>
    </UnitNamesContext.Provider>
    </TextsContext.Provider>
    </AbilityConfigsContext.Provider>
    </MissilesContext.Provider>
  );
}
