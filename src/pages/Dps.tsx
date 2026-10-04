// /dps -- single-unit DPS calculator with a step-by-step breakdown.
//
// Inputs: the unit (class tier, level, skill + stage, affection), the enemy's
// HP / DEF / MR, the unit's own conditional effects (ability 1 damage
// modifiers such as Archer vs flying, ability 22 true-damage chance, ability
// 83/110/161 conditional ATK), and BUFFERS: picking a unit as a buffer
// applies every buff_index row of its chosen class tier / skill that reaches
// the calculated unit (sortie/deployment ATK, other ATK, enemy DEF / MR
// debuff, enemy damage taken, PAD), plus the abilities it grants through
// ability 189 (ability_configs.json), each row with its own off switch.
//
// Conditions work like /costgen: every condition atom that appears in the
// unit's own effects, its selected skill or the picked buffs becomes ONE
// shared control -- a checkbox (enemy is flying, enemy race X, enemy tag X,
// blocking, ...) or a slider (enemy HP %, own HP %, counts). Atoms that are
// facts about the calculated unit (gender, class type, race, genus, faction,
// identity, prince, melee/ranged, rarity, owner) are decided from its data
// and get no control.
//
// Data meanings used here:
//  * base ATK = floor(stat x ATK mod%) + floor(affection x ATK mod%), the
//    same numbers the unit page's stat box shows (ATK mod = ability 13
//    inherent/self; affection type 2 raw x1.2 full bloom / x0.5 half).
//  * interval = classes[].attack_interval, full attack cycle @60fps.
//  * skill: ungated self type-2 row = self ATK (mul3_cap ?? mul3), type 7
//    add = hits, type 22 add = targets, 38/39/93 = magic/true/physical.
//  * ability 1: p1 = percent applied on hit, p2 = proc chance %.
//  * buff rows: `x` = target filter, `ax` = owner-side gate.
//  * DEF/MR debuff rows: v = percent of the stat removed (fl = flat).
//  * damage taken: skill 236 + ability 221 share one group, 235 is its own.
//  * stacking: within a buff group rows sharing an ability _Param4 stack key
//    keep only the highest; the group then follows its influenceLabels.ts
//    selection rule (ability 70 additive, Type-A/B/C highest, 235 new
//    instance); groups without a rule keep the highest.
//  * PAD = class.attack_wait; interval = class.attack_interval - attack_wait
//    + effective PAD. Skill 14 replaces PAD with `add` frames (an ally's Set
//    PAD over the unit's own, lowest within each); percent reductions
//    (ability 91/270/302) are each taken from that value and only the
//    strongest applies; ability 18 is a per-attack chance of PAD 0.
// NOT decoded (page controls, never decided in code): the physical damage
// floor, how separate buff groups combine (multiply vs add), ability 83's
// value shape, and how several damage modifiers combine.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadJSONFile, unitImageUrl, useAbilityConfigs, useUnitDetail, useUnits } from "../data";
import { influenceSelectionRule } from "../influenceLabels";
import type { AbilityInfluence, BuffRow, SkillStage, Unit, UnitClass, UnitSkill } from "../types";

type SlotKey = "none" | "base" | "class_evolved" | "awakened";
type Combine = "multiply" | "add";
type Tri = boolean | null;

const SLOT_LABEL: Record<SlotKey, string> = {
  none: "No skill",
  base: "Normal skill",
  class_evolved: "Class-change skill",
  awakened: "Awakened skill",
};
const CC_LABEL = ["Base", "CC", "AW", "2nd AW A", "2nd AW B"];

// ---------------------------------------------------------------- condition atoms

// facts about the calculated unit that conditions read
interface TargetFacts {
  unitId: number;
  classId: number;
  gender: number | null; // GetGender(): 1 = female, 0 = male
  rarityId: number;
  race: string | null;
  genus: string | null;
  faction: string | null;
  identities: string[];
  prince: boolean;
  slot: "melee" | "ranged" | null;
}

function targetFacts(u: Unit, cl: UnitClass): TargetFacts {
  const g = String(u.gender ?? "");
  return {
    unitId: u.id,
    classId: cl.class_id,
    gender: g === "Female" ? 1 : g === "Male" ? 0 : null,
    rarityId: u.rarity_id,
    race: u.race ?? null,
    genus: u.genus ?? null,
    faction: u.faction ?? null,
    identities: u.identity_tags ?? [],
    prince: !!u.prince,
    slot: cl.deploy_slot === "melee" ? "melee" : cl.deploy_slot === "ranged" ? "ranged" : null,
  };
}

// functions answered from the unit's data / the page's skill and class choice
const FACT_FNS = new Set([
  "IsOwnerUnit", "IsClassType", "IsCardID", "GetCardID", "GetGender", "IsGender", "IsRarity", "IsRaryty",
  "IsRace", "IsGenus", "IsAssign", "IsIdentitiy", "IsIdentity", "IsPrince", "IsVanguard", "IsRearguard",
  "IsToken", "IsServantToken", "IsEnemyUnit", "IsGuestUnit", "IsPlayerSupportUnit", "IsTeamUnit",
]);
const STATE_FNS = new Set(["IsInvokedSkill", "IsSkillID", "GetClassChange"]);
// one control per listed name (race / tag), the call is true if any is on
const MULTI_FNS: Record<string, string> = { IsEnemyRace: "race", IsEnemyElementAny: "tag" };

interface Control {
  key: string;
  kind: "toggle" | "slider";
  label: string;
  min?: number;
  max?: number;
  def: number | boolean;
}

function controlFor(name: string, args: string[]): Control[] {
  const multi = MULTI_FNS[name];
  if (multi) {
    return args.map((a) => ({
      key: `${multi}:${a}`, kind: "toggle", def: false,
      label: multi === "race" ? `Enemy race: ${a}` : `Enemy has tag: ${a}`,
    }));
  }
  const key = `${name}(${args.join(",")})`;
  switch (name) {
    case "IsEnemyFlight": return [{ key, kind: "toggle", def: false, label: "Enemy is flying" }];
    case "IsEnemyMagicType": return [{ key, kind: "toggle", def: false, label: "Enemy attacks with magic" }];
    case "IsBlockedEnemy":
    case "IsEnemyBlock": return [{ key: "blocking", kind: "toggle", def: false, label: "Blocking the enemy" }];
    case "GetEnemyHPRatio": return [{ key, kind: "slider", min: 0, max: 100, def: 100, label: "Enemy HP %" }];
    case "GetHPRatio": return [{ key, kind: "slider", min: 0, max: 100, def: 100, label: "Own HP %" }];
  }
  if (name.startsWith("Get")) return [{ key, kind: "slider", min: 0, max: 20, def: 0, label: `${name}(${args.join(", ")})` }];
  return [{ key, kind: "toggle", def: false, label: `${name}(${args.join(", ")})` }];
}

const CALL_RE = /([A-Za-z_]\w*)\s*\(\s*((?:"[^"]*"|[^()"])*)\)/g;
function splitArgs(raw: string): string[] {
  return raw.split(",").map((p) => p.trim().replace(/^"|"$/g, "")).filter(Boolean);
}

// the controls an expression needs (fact / state functions excluded)
function controlsOf(expr: string | null | undefined): Control[] {
  const out: Control[] = [];
  for (const m of (expr || "").matchAll(CALL_RE)) {
    const name = m[1];
    if (FACT_FNS.has(name) || STATE_FNS.has(name)) continue;
    out.push(...controlFor(name, splitArgs(m[2])));
  }
  return out;
}

interface EvalCtx {
  skillActive: boolean;
  skillId: number | null;
  skillUnknown?: boolean; // skill state not known -> IsInvokedSkill/IsSkillID can't tell
  classChange: number;
  target?: TargetFacts; // the unit a row is evaluated against
  ownerId?: number; // the row's owner unit id (IsOwnerUnit)
  targetIsEnemy?: boolean; // debuff / damage-taken rows target the enemy
  values?: Record<string, number | boolean>; // control values; absent = can't tell
}

type Val = number | string | boolean | null;

// Evaluates the game's condition expressions. Anything not answerable yields
// null ("cannot tell"), which propagates through !, &&, || and comparisons.
function evaluate(src: string, ctx: EvalCtx): Tri {
  const toks = src.replace(/;\s*$/g, "").replace(/;/g, " && ").match(/"[^"]*"|\d+|[A-Za-z_$][A-Za-z_0-9$]*|&&|\|\||<=|>=|==|!=|[()!,<>]/g) || [];
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  const truth = (v: Val): Tri => (v === null ? null : typeof v === "boolean" ? v : typeof v === "number" ? v !== 0 : !!v);

  const control = (name: string, args: string[]): Val => {
    if (!ctx.values) return null;
    const cs = controlFor(name, args);
    if (MULTI_FNS[name]) return cs.some((c) => ctx.values![c.key] ?? c.def);
    const c = cs[0];
    return (ctx.values[c.key] ?? c.def) as Val;
  };

  const call = (name: string, rawArgs: (number | string)[]): Val => {
    const strs = rawArgs.map(String);
    const nums = rawArgs.map(Number);
    switch (name) {
      case "IsInvokedSkill": return ctx.skillUnknown ? null : ctx.skillActive;
      case "IsSkillID": return ctx.skillUnknown ? null : ctx.skillId != null && nums.includes(ctx.skillId);
      case "GetClassChange": return ctx.classChange;
      case "IsEnemyUnit": if (ctx.targetIsEnemy) return true; break;
    }
    const t = ctx.target;
    if (FACT_FNS.has(name)) {
      if (!t) return null;
      switch (name) {
        case "IsOwnerUnit": return ctx.ownerId != null ? ctx.ownerId === t.unitId : null;
        case "IsClassType": return nums.includes(Math.floor(t.classId / 100));
        case "IsCardID": return nums.includes(t.unitId);
        case "GetCardID": return t.unitId;
        case "GetGender": return t.gender;
        case "IsGender": return t.gender == null ? null : t.gender === nums[0];
        case "IsRarity":
        case "IsRaryty": return nums.includes(t.rarityId);
        case "IsRace": return t.race != null && strs.includes(t.race);
        case "IsGenus": return t.genus != null && strs.includes(t.genus);
        case "IsAssign": return t.faction != null && strs.includes(t.faction);
        case "IsIdentitiy":
        case "IsIdentity": return strs.some((s) => t.identities.includes(s));
        case "IsPrince": return t.prince;
        case "IsVanguard": return t.slot == null ? null : t.slot === "melee";
        case "IsRearguard": return t.slot == null ? null : t.slot === "ranged";
        // the calculated unit is a deployed player card
        case "IsToken":
        case "IsServantToken":
        case "IsEnemyUnit":
        case "IsGuestUnit":
        case "IsPlayerSupportUnit": return false;
        case "IsTeamUnit": return true;
      }
      return null;
    }
    return control(name, strs);
  };

  const primary = (): Val => {
    const t = next();
    if (t === undefined) return null;
    if (t === "(") { const v = orExpr(); next(); return v; }
    if (/^\d+$/.test(t)) return Number(t);
    if (t.startsWith('"')) return t.slice(1, -1);
    if (peek() === "(") {
      next();
      const args: (number | string)[] = [];
      while (peek() !== undefined && peek() !== ")") {
        const a = next()!;
        if (a === ",") continue;
        args.push(a.startsWith('"') ? a.slice(1, -1) : /^\d+$/.test(a) ? Number(a) : a);
      }
      next();
      return call(t, args);
    }
    return null;
  };
  const cmp = (): Val => {
    const l = primary();
    const op = peek();
    if (op && ["<=", ">=", "==", "!=", "<", ">"].includes(op)) {
      next();
      const r = primary();
      if (l === null || r === null) return null;
      const a = Number(l);
      const b = Number(r);
      switch (op) {
        case "<=": return a <= b; case ">=": return a >= b; case "==": return a === b;
        case "!=": return a !== b; case "<": return a < b; default: return a > b;
      }
    }
    return l;
  };
  const unary = (): Val => {
    if (peek() === "!") { next(); const v = truth(unary()); return v === null ? null : !v; }
    return cmp();
  };
  const andExpr = (): Val => {
    let acc: Tri = truth(unary());
    while (peek() === "&&") {
      next();
      const r = truth(unary());
      acc = acc === false || r === false ? false : acc === null || r === null ? null : true;
    }
    return acc;
  };
  const orExpr = (): Val => {
    let acc: Tri = truth(andExpr());
    while (peek() === "||") {
      next();
      const r = truth(andExpr());
      acc = acc === true || r === true ? true : acc === null || r === null ? null : false;
    }
    return acc;
  };
  if (!toks.length) return true;
  return truth(orExpr());
}

const both = (a: Tri, b: Tri): Tri => (a === false || b === false ? false : a === null || b === null ? null : true);
const isAlways = (x?: string | null) => !x || !x.trim() || /^1;?$/.test(x.trim());

// ---------------------------------------------------------------- unit-side data

function abilityRows(u: Unit, cl: UnitClass): { src: string; r: AbilityInfluence }[] {
  const ab = cl.cc >= 2 ? u.abilities?.awakened : u.abilities?.default;
  return [
    ...(cl.class_ability_influences || []).map((r) => ({ src: "class attribute", r })),
    ...((ab?.influences || []) as AbilityInfluence[]).map((r) => ({ src: cl.cc >= 2 ? "awakened ability" : "ability", r })),
  ];
}

// ability 13 inherent/self ATK mod (percent of normal); class row wins
function atkModPct(u: Unit, cl: UnitClass): number | null {
  const pick = (rows: AbilityInfluence[] | undefined) =>
    (rows || []).find((r) => r.invoke === "inherent" && r.target === "self" && r.influence_type === 13);
  const ab = cl.cc >= 2 ? u.abilities?.awakened : u.abilities?.default;
  const r = pick(cl.class_ability_influences) ?? pick(ab?.influences as AbilityInfluence[] | undefined);
  return r ? r.params?.[0] ?? 0 : null;
}

function affectionAtk(u: Unit, cl: UnitClass): number {
  const b = (u.affection_bonuses || []).find((x) => x.type === 2);
  if (!b) return 0;
  const group = u.classes.filter((c) => (cl.cc >= 2 ? c.cc >= 2 : c.cc < 2));
  const full = Math.max(...group.map((c) => c.max_level ?? 0)) > 50;
  return Math.floor(b.raw * (full ? 1.2 : 0.5) + 0.5);
}

interface OwnEffect {
  key: string;
  src: string;
  type: number;
  label: string;
  cond: string;
  exprs: string[]; // raw conditions (command, activate_command)
  kind: "dmg" | "atk_pct" | "count" | "true_chance" | "pad_zero";
  // percent (dmg: total %, atk_pct: +%, count: +% per count, true_chance: chance %)
  value: number;
  chance?: number;
  cap?: number;
  countLabel?: string;
}

// extend caps sometimes arrive glued to the next key ("110cntType=...")
function extCap(v: unknown): number | undefined {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// what a count-based ability counts (extend cntType)
function counterText(v: unknown, fallback: string): string {
  const raw = String(v ?? "").replace(/^\d+cntType=/, "");
  if (!raw || /^\d+$/.test(raw)) return fallback;
  if (/^GetDefeatsCountOfPlayer\(\$UnitId\)$/.test(raw)) return "counts this unit's own deaths";
  if (/GetDefeatsCountOfPlayer\(\)\s*\+\s*GetDefeatsCountOfToken\(\)/.test(raw)) return "counts allied deaths (units + tokens)";
  if (/GetDefeatsCountOfEnemyByPlayer/.test(raw)) return "counts enemies defeated (units + tokens)";
  return `counts ${raw}`;
}

function ownEffects(u: Unit, cl: UnitClass): OwnEffect[] {
  const out: OwnEffect[] = [];
  abilityRows(u, cl).forEach(({ src, r }, i) => {
    const t = r.influence_type;
    if (r.target !== "self") return;
    const p = (r.params || []) as number[];
    const cond = [r.command_human, r.activate_command_human].filter(Boolean).join(" AND ") || "always";
    const exprs = [r.command, r.activate_command].filter((x): x is string => !isAlways(x));
    const key = `${src}-${i}`;
    if (t === 1) {
      out.push({ key, src, type: 1, label: "Damage modifier on hit", cond, exprs,
        kind: "dmg", value: p[0] ?? 100, chance: p[1] ?? 100 });
    } else if (t === 18) {
      out.push({ key, src, type: 18, label: "Attack again without PAD (chance)", cond, exprs, kind: "pad_zero", value: p[0] ?? 0 });
    } else if (t === 22) {
      out.push({ key, src, type: 22, label: "True damage chance", cond, exprs, kind: "true_chance", value: p[0] ?? 0 });
    } else if (t === 83) {
      out.push({ key, src, type: 83, label: "Conditional ATK buff (invisible)", cond, exprs, kind: "atk_pct", value: p[0] ?? 0 });
    } else if (t === 110) {
      // the command picks which allies count; the count itself is a slider
      out.push({ key, src, type: 110, label: "ATK per matching unit", cond: `counts units where: ${cond}`, exprs: [],
        kind: "count", value: p[0] ?? 0, cap: p[1], countLabel: "units" });
    } else if (t === 161) {
      const ext = (r.extend || {}) as Record<string, unknown>;
      out.push({ key, src, type: 161, label: "ATK per kill", cond: counterText(ext.cntType ?? ext.mulLim, cond), exprs: [],
        kind: "count", value: p[0] ?? 0, cap: extCap(ext.mulLim), countLabel: "kills" });
    } else if (t === 165) {
      // 165 is the ATK row (164 = HP, 166 = DEF)
      const ext = (r.extend || {}) as Record<string, unknown>;
      out.push({ key, src, type: 165, label: "ATK per death", cond: counterText(ext.cntType ?? ext.mulLim, cond), exprs: [],
        kind: "count", value: p[0] ?? 0, cap: extCap(ext.mulLim), countLabel: "deaths" });
    }
  });
  return out;
}

// Ability 210 lists one missile per shot (extend ミサイルID); a missile marked
// `empty` deals no damage and only pads the attack's timing. Returns the shot
// count and how many of them deal damage, for the rows active in `ctx`.
function shotPattern(u: Unit, cl: UnitClass, ctx: EvalCtx): { shots: number; damaging: number } | null {
  for (const { r } of abilityRows(u, cl)) {
    if (r.influence_type !== 210) continue;
    const ok = [r.command, r.activate_command].filter((x): x is string => !isAlways(x))
      .reduce<Tri>((acc, x) => both(acc, evaluate(x, ctx)), true);
    if (ok !== true) continue;
    const ids = (r.extend as Record<string, unknown> | undefined)?.["ミサイルID"];
    if (!Array.isArray(ids) || !ids.length) continue;
    const missiles = (r.missiles || {}) as Record<string, { empty?: boolean }>;
    // one shot per 属性 entry; ids past that count are ignored (Belladonna's
    // list ends in an extra ""), a blank id inside it is the normal missile
    const attrs = (r.extend as Record<string, unknown> | undefined)?.["属性"];
    const n = Array.isArray(attrs) && attrs.length ? attrs.length : ids.filter((id) => String(id).trim() !== "").length;
    if (!n) continue;
    const shots = Array.from({ length: n }, (_, i) => String(ids[i] ?? "").trim());
    return { shots: n, damaging: shots.filter((id) => !id || !missiles[id]?.empty).length };
  }
  return null;
}

interface SkillFacts {
  atkMul: number;
  hits: number | null;
  targets: number | null;

  attr: string | null;
  duration: number | null;
  cooldown: number | null;
}

function skillFacts(s: SkillStage | undefined, ctx: EvalCtx): SkillFacts {
  if (!s) return { atkMul: 1, hits: null, targets: null, attr: null, duration: null, cooldown: null };
  const live = (s.influences || []).filter((r) => !r.activate_if || evaluate(r.activate_if, ctx) === true);
  const self = (t: number) => live.filter((r) => r.influence_type === t && r.target === "self");
  const atkRows = self(2);
  const atk = atkRows.find((r) => r.tag === "[ATK]") ?? atkRows[0];
  const v = atk ? atk.mul3_cap ?? atk.mul3 : undefined;
  const has = (t: number) => live.some((r) => r.influence_type === t);
  return {
    atkMul: v != null ? v / 100 : 1,
    hits: self(7)[0]?.add ?? null,
    targets: self(22)[0]?.add ?? null,
    attr: has(39) ? "fixed damage" : has(38) ? "magical" : has(93) ? "physical" : null,
    duration: s.duration_max ?? s.duration ?? null,
    cooldown: s.cooldown ?? null,
  };
}

// ---------------------------------------------------------------- buffs

type Cat = "SORTIE" | "ATK" | "DEF_DEBUFF" | "MR_DEBUFF" | "DMG_AMP" | "PAD" | "GRANT";
const CATS: { k: Cat; label: string }[] = [
  { k: "SORTIE", label: "Sortie / deployment ATK" },
  { k: "ATK", label: "Other ATK buffs" },
  { k: "DEF_DEBUFF", label: "Enemy DEF debuff" },
  { k: "MR_DEBUFF", label: "Enemy MR debuff" },
  { k: "DMG_AMP", label: "Enemy damage taken" },
  { k: "PAD", label: "PAD (post-attack delay)" },
  { k: "GRANT", label: "Granted abilities" },
];
const isSortie = (r: BuffRow) => !!r.grp && /^(sortie|deploy)_atk$/.test(r.grp);
function catOf(r: BuffRow): Cat | null {
  if (r.stat === "ATK") return isSortie(r) ? "SORTIE" : "ATK";
  if (r.stat === "PAD_REDUCTION") return "PAD";
  if (r.stat === "DEF_DEBUFF" || r.stat === "MR_DEBUFF" || r.stat === "DMG_AMP") return r.stat;
  return null;
}
const enemySide = (r: BuffRow) => r.stat === "DEF_DEBUFF" || r.stat === "MR_DEBUFF" || r.stat === "DMG_AMP";
const SKILL_ADDITIVE_PCT = new Set([204]);
const ABILITY_MULTIPLIER_PCT = new Set([134, 135, 136, 155, 156, 157, 158, 197, 198, 199, 207, 221]);
const groupKey = (r: BuffRow, i: number) =>
  r.ns === "skill" && r.t === 235 ? `new_instance:${i}` // every 235 is its own instance
    : r.stat === "DMG_AMP" && (r.t === 236 || r.t === 221) ? "dmg_amp"
      : r.grp ?? `${r.stat}:${r.ns}:${r.t}`;
const stackKey = (r: BuffRow) => (r.ns === "ability" && r.p && r.p[3] ? `k${r.p[3]}` : null);

// ATK / damage-taken row -> total factor (or flat ATK)
function atkEffect(r: BuffRow): { factor: number; flat: number } {
  if (r.fl) return { factor: 1, flat: r.v };
  if (r.vk === "share") return { factor: 1, flat: 0 };
  const asTotal =
    (r.ns === "skill" && !SKILL_ADDITIVE_PCT.has(r.t)) || (r.ns === "ability" && ABILITY_MULTIPLIER_PCT.has(r.t));
  return { factor: asTotal ? r.v / 100 : 1 + r.v / 100, flat: 0 };
}
function fmtRowValue(r: BuffRow): string {
  if (r.stat === "DEF_DEBUFF" || r.stat === "MR_DEBUFF") return r.fl ? `-${r.v} flat` : `-${r.v}%`;
  if (r.stat === "PAD_REDUCTION") return r.ns === "skill" && r.t === 14 ? `set PAD to ${r.v}f` : `PAD -${r.v}%`;
  if (r.vk === "share") return `${r.v}% of buffer's ATK (not applied)`;
  const e = atkEffect(r);
  return r.fl ? `+${r.v} flat` : `x${Math.round(e.factor * 100) / 100}`;
}

// Combine rows into one factor per group: rows sharing an ability stack key
// keep the highest, then the group's selection rule decides (additive sums
// the percents, everything else keeps the highest).
function groupFactors(rows: BuffRow[], value: (r: BuffRow) => number): { key: string; f: number; rows: BuffRow[] }[] {
  const groups = new Map<string, BuffRow[]>();
  rows.forEach((r, i) => {
    const k = groupKey(r, i);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  });
  return [...groups.entries()].map(([key, list]) => {
    const byStack = new Map<string, BuffRow>();
    list.forEach((r, i) => {
      const k = stackKey(r) ?? `row${i}`;
      const cur = byStack.get(k);
      if (!cur || value(r) > value(cur)) byStack.set(k, r);
    });
    const kept = [...byStack.values()];
    const rule = influenceSelectionRule(kept[0].ns === "skill" ? "skill" : "ability", kept[0].t);
    const f = rule === "additive"
      ? 1 + kept.reduce((a, r) => a + (value(r) - 1), 0)
      : Math.max(...kept.map(value));
    return { key, f, rows: rule === "additive" ? kept : [kept.find((r) => value(r) === f) ?? kept[0]] };
  });
}

// ---------------------------------------------------------------- buffers

interface BufferSel {
  id: number;
  tier: number; // index into classes
  slot: SlotKey;
  stage: number;
  deployed: boolean;
  skillOn: boolean;
  off: Record<string, boolean>;
}

interface BufEffect {
  key: string;
  cat: Cat;
  label: string; // source text
  value: string;
  target: string;
  row?: BuffRow;
  grant?: OwnEffect; // granted ability, applied to the calculated unit
  needsDeploy: boolean;
  needsSkill: boolean;
  gate: string | null; // owner-side gate (raw)
  filter: string | null; // target filter (raw)
  toggle?: Control; // extra state the row needs (e.g. the unit is overhealed)
}

// ability 345 (ATK up for overhealed allies) needs the unit to be above max HP
const OVERHEALED: Control = { key: "overhealed", kind: "toggle", def: false, label: "Unit is overhealed (above max HP)" };

const SKILL_SLOT_RE = /^(base|class_evolved|awakened) skill(?: stage (\d+))?/;

function bufferSlotOk(s: string, bu: Unit, cl: UnitClass, b: BufferSel): { ok: boolean; skill: boolean } {
  // a token's rows (incl. the token's own skill) need the token deployed only
  if (s.startsWith("token ")) return { ok: true, skill: false };
  // an ability value boosted by one skill stage ("... + awakened skill stage 3 (name)")
  const tier = s.match(/ \+ (base|class_evolved|awakened) skill(?: stage (\d+))?/);
  const tierOk = !tier || (b.slot === tier[1] && b.stage === (tier[2] ? Number(tier[2]) - 1 : 0));
  if (s.startsWith("default ability")) return { ok: cl.cc < 2 && tierOk, skill: !!tier };
  if (s.startsWith("awakened ability")) return { ok: cl.cc >= 2 && tierOk, skill: !!tier };
  if (s.startsWith("class attribute (")) return { ok: s.startsWith(`class attribute (${cl.name})`) && tierOk, skill: !!tier };
  const m = s.match(SKILL_SLOT_RE);
  if (m) {
    const stage = m[2] ? Number(m[2]) - 1 : 0;
    return { ok: b.slot === m[1] && b.stage === stage, skill: true };
  }
  void bu;
  return { ok: false, skill: false };
}

function bufferEffects(
  b: BufferSel, bu: Unit, index: BuffRow[], configs: Record<string, AbilityInfluence[]> | null,
): BufEffect[] {
  const cl = bu.classes[Math.min(b.tier, bu.classes.length - 1)];
  if (!cl) return [];
  const out: BufEffect[] = [];
  index.forEach((r, i) => {
    if (r.u !== bu.id) return;
    const cat = catOf(r);
    if (!cat) return;
    const slot = bufferSlotOk(r.s, bu, cl, b);
    if (!slot.ok) return;
    out.push({
      key: `row${i}`, cat, label: r.s, value: fmtRowValue(r), target: r.tgt ? String(r.tgt) : "",
      row: r, needsDeploy: !/\(sortie\)( \+ |$)/.test(r.s), needsSkill: slot.skill,
      gate: r.ax ?? null, filter: r.x ?? null,
      toggle: r.ns === "ability" && r.t === 345 ? OVERHEALED : undefined,
    });
  });
  // ability 189 grants: class attribute + the tier's ability + the skill's linked rows
  const ab = cl.cc >= 2 ? bu.abilities?.awakened : bu.abilities?.default;
  const sk = b.slot === "none" ? null : (bu.skills as Record<string, UnitSkill | null | undefined>)[b.slot];
  const st = sk?.stages?.[b.stage];
  const sources: { src: string; r: AbilityInfluence; skill: boolean }[] = [
    ...(cl.class_ability_influences || []).map((r) => ({ src: `class attribute (${cl.name})`, r, skill: false })),
    ...((ab?.influences || []) as AbilityInfluence[]).map((r) => ({ src: cl.cc >= 2 ? "awakened ability" : "default ability", r, skill: false })),
    ...((st?.linked_ability_influences || []) as AbilityInfluence[]).map((r) => ({ src: `${b.slot} skill`, r, skill: true })),
  ];
  sources.forEach(({ src, r, skill }, gi) => {
    if (r.influence_type !== 189) return;
    const granted = configs?.[String(r.params?.[0])] ?? [];
    granted.forEach((g, j) => {
      const p = (g.params || []) as number[];
      const exprs = [g.command, g.activate_command].filter((x): x is string => !isAlways(x));
      const cond = [g.command_human, g.activate_command_human].filter((x) => x && x !== "1").join(" AND ") || "always";
      let eff: OwnEffect | null = null;
      if (g.influence_type === 1) {
        eff = { key: `g${gi}-${j}`, src: `granted by ${bu.name_en || bu.name}`, type: 1, label: "Damage modifier on hit",
          cond, exprs, kind: "dmg", value: p[0] ?? 100, chance: p[1] ?? 100 };
      } else if (g.influence_type === 18) {
        eff = { key: `g${gi}-${j}`, src: `granted by ${bu.name_en || bu.name}`, type: 18, label: "Attack again without PAD (chance)",
          cond, exprs, kind: "pad_zero", value: p[0] ?? 0 };
      } else if (g.influence_type === 22) {
        eff = { key: `g${gi}-${j}`, src: `granted by ${bu.name_en || bu.name}`, type: 22, label: "True damage chance",
          cond, exprs, kind: "true_chance", value: p[0] ?? 0 };
      }
      if (!eff) return;
      out.push({
        key: `grant${gi}-${j}`, cat: "GRANT", label: `${src} (${r.invoke}) grants ability ${g.influence_type}`,
        value: eff.kind === "dmg" ? `x${eff.value / 100}${eff.chance! < 100 ? ` (${eff.chance}% chance)` : ""}`
          : eff.kind === "pad_zero" ? `${eff.value}% no-PAD chance` : `${eff.value}% true damage`,
        target: [r.command_human, cond !== "always" ? `when ${cond}` : ""].filter(Boolean).join(" · ") || "all",
        grant: eff, needsDeploy: r.invoke !== "sortie", needsSkill: skill,
        gate: r.activate_command && !isAlways(r.activate_command) ? r.activate_command : null,
        filter: r.command && !isAlways(r.command) ? r.command : null,
      });
    });
  });
  return out;
}

// ---------------------------------------------------------------- page

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();
const fx = (n: number) => `x${Math.round(n * 1000) / 1000}`;

function NumInput({ label, value, set, max }: { label: string; value: number; set: (v: number) => void; max?: number }) {
  return (
    <label className="cg-ctl">{label}
      <input type="number" min={0} max={max} value={value} onChange={(e) => set(Number(e.target.value) || 0)} />
    </label>
  );
}

function Sel<T extends string>({ label, value, set, opts }: { label: string; value: T; set: (v: T) => void; opts: [T, string][] }) {
  return (
    <label className="cg-ctl">{label}
      <select value={value} onChange={(e) => set(e.target.value as T)}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function UnitSearch({ placeholder, onPick, exclude }: { placeholder: string; onPick: (id: number) => void; exclude?: Set<number> }) {
  const { units } = useUnits();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (units ?? [])
      .filter((x) => !(x as { npc?: boolean }).npc && !exclude?.has(x.id))
      .filter((x) => !q || (x.name_en ?? "").toLowerCase().includes(q) || (x.name ?? "").includes(query.trim()) || String(x.id) === q)
      .slice(0, 60);
  }, [units, query, exclude]);
  return (
    <div className="cg-search">
      <input ref={inputRef} placeholder={placeholder} value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { if (document.activeElement !== inputRef.current) setOpen(false); }, 150)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }} />
      {open && matches.length > 0 && (
        <div className="cg-search-drop">
          {matches.map((x) => (
            <button key={x.id} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick(x.id); setQuery(""); setOpen(false); }}>
              <img src={unitImageUrl("icon", x.id)} alt="" loading="lazy" />
              <span>{x.name_en || x.name} <span className="muted">#{x.id}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function skillOptions(u: Unit): [SlotKey, string][] {
  const sk = u.skills as Record<string, UnitSkill | null | undefined>;
  return [["none", SLOT_LABEL.none] as [SlotKey, string]].concat(
    (["base", "class_evolved", "awakened"] as const).filter((k) => sk[k])
      .map((k) => [k, `${SLOT_LABEL[k]} — ${sk[k]?.name_en || sk[k]?.name}`] as [SlotKey, string]));
}

// ---------------------------------------------------------------- share links

// the whole page setup, carried in the ?s= parameter of a shared link
interface ShareState {
  u?: number; c?: number; l?: "max" | "1"; sl?: SlotKey; st?: number; a?: boolean; iv?: string;
  e?: [number, number, number];
  pm?: "expected" | "always" | "never"; fp?: number; cb?: Combine; dc?: "highest" | "multiply";
  v?: Record<string, number | boolean>; oo?: Record<string, boolean>; oc?: Record<string, number>;
  b?: BufferSel[]; co?: Record<string, boolean>; sb?: boolean;
}

function encodeShare(st: ShareState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(st));
  let bin = "";
  bytes.forEach((x) => { bin += String.fromCharCode(x); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeShare(code: string): ShareState | null {
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as ShareState;
  } catch {
    return null;
  }
}

export default function Dps() {
  const [buffIndex, setBuffIndex] = useState<BuffRow[] | null>(null);
  useEffect(() => {
    loadJSONFile<BuffRow[]>("buff_index").then(setBuffIndex).catch(() => setBuffIndex([]));
  }, []);
  const configs = useAbilityConfigs();

  // unit
  const [unitId, setUnitId] = useState<number | null>(null);
  const { unit } = useUnitDetail(unitId ?? 0);
  const u: Unit | null = unitId != null ? unit : null;
  const [clsIdx, setClsIdx] = useState(0);
  const [level, setLevel] = useState<"max" | "1">("max");
  const [slot, setSlot] = useState<SlotKey>("none");
  const [stageIdx, setStageIdx] = useState(0);
  const [useAff, setUseAff] = useState(true);
  const [intervalOverride, setIntervalOverride] = useState("");

  // enemy
  const [eHp, setEHp] = useState(0);
  const [eDef, setEDef] = useState(0);
  const [eMr, setEMr] = useState(0);

  // model controls (not decoded)
  const [procMode, setProcMode] = useState<"expected" | "always" | "never">("expected");
  const [floorPct, setFloorPct] = useState(10);
  const [combine, setCombine] = useState<Combine>("multiply");
  const [dmgCombine, setDmgCombine] = useState<"highest" | "multiply">("highest");

  // condition controls, shared by every effect that uses them
  const [vals, setVals] = useState<Record<string, number | boolean>>({});
  const [ownOff, setOwnOff] = useState<Record<string, boolean>>({});
  const [ownCount, setOwnCount] = useState<Record<string, number>>({});

  // buffers
  const [buffers, setBuffers] = useState<BufferSel[]>([]);
  const [bufUnits, setBufUnits] = useState<Record<number, Unit>>({});
  const [catOn, setCatOn] = useState<Record<Cat, boolean>>(
    { SORTIE: true, ATK: true, DEF_DEBUFF: true, MR_DEBUFF: true, DMG_AMP: true, PAD: true, GRANT: true });
  const [selfBuff, setSelfBuff] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // a shared link: apply everything now except the unit-dependent choices,
  // which wait for the unit (and its class list) to load
  const [params, setParams] = useSearchParams();
  const restore = useRef<ShareState | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const code = params.get("s");
    const st = code ? decodeShare(code) : null;
    if (!st) return;
    restore.current = st;
    if (st.u != null) setUnitId(st.u);
    if (st.l) setLevel(st.l);
    if (st.a != null) setUseAff(st.a);
    if (st.e) { setEHp(st.e[0]); setEDef(st.e[1]); setEMr(st.e[2]); }
    if (st.pm) setProcMode(st.pm);
    if (st.fp != null) setFloorPct(st.fp);
    if (st.cb) setCombine(st.cb);
    if (st.dc) setDmgCombine(st.dc);
    if (st.v) setVals(st.v);
    if (st.b) setBuffers(st.b);
    if (st.co) setCatOn((cur) => ({ ...cur, ...st.co }));
    if (st.sb != null) setSelfBuff(st.sb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    buffers.forEach((b) => {
      if (bufUnits[b.id]) return;
      loadJSONFile<Unit>(`unit/${b.id}`).then((x) => setBufUnits((cur) => ({ ...cur, [b.id]: x }))).catch(() => undefined);
    });
  }, [buffers, bufUnits]);

  const classes = u?.classes ?? [];
  const cl: UnitClass | undefined = classes[Math.min(clsIdx, Math.max(classes.length - 1, 0))];

  useEffect(() => {
    const r = restore.current && restore.current.u === unitId ? restore.current : null;
    setSlot(r?.sl ?? "none");
    setStageIdx(r?.st ?? 0);
    setIntervalOverride(r?.iv ?? "");
    setOwnOff(r?.oo ?? {});
    setOwnCount(r?.oc ?? {});
  }, [unitId]);
  useEffect(() => {
    if (!classes.length) return;
    const r = restore.current && restore.current.u === u?.id ? restore.current : null;
    setClsIdx(r?.c != null ? Math.min(r.c, classes.length - 1) : classes.length - 1);
    if (r) restore.current = null;
  }, [u?.id, classes.length]);

  const shareLink = () => {
    const st: ShareState = {
      u: unitId ?? undefined, c: clsIdx, l: level, sl: slot, st: stageIdx, a: useAff,
      iv: intervalOverride || undefined, e: [eHp, eDef, eMr],
      pm: procMode, fp: floorPct, cb: combine, dc: dmgCombine,
      v: vals, oo: ownOff, oc: ownCount, b: buffers, co: catOn, sb: selfBuff,
    };
    const code = encodeShare(st);
    setParams({ s: code }, { replace: true });
    const url = `${window.location.origin}${window.location.pathname}#/dps?s=${code}`;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, done);
    else done();
  };

  const skills = (u?.skills ?? {}) as Partial<Record<Exclude<SlotKey, "none">, UnitSkill | null>>;
  const skill = slot === "none" ? null : skills[slot] ?? null;
  const stages = skill?.stages ?? [];
  const stage = stages[Math.min(stageIdx, Math.max(stages.length - 1, 0))];
  const tFacts = u && cl ? targetFacts(u, cl) : undefined;

  const ownCtx = (withSkill: boolean, values?: Record<string, number | boolean>): EvalCtx => ({
    skillActive: withSkill && !!stage,
    skillId: withSkill ? stage?.id ?? null : null,
    classChange: cl?.cc ?? 0,
    target: tFacts,
    ownerId: u?.id,
    values,
  });
  const own = u && cl ? ownEffects(u, cl) : [];

  // buffer list incl. the calculated unit itself (its own buffs on itself)
  const allBuffers = (withSkill: boolean): { b: BufferSel; bu: Unit; self: boolean }[] => {
    const list = buffers.filter((b) => bufUnits[b.id]).map((b) => ({ b, bu: bufUnits[b.id], self: false }));
    if (selfBuff && u) {
      list.unshift({
        b: { id: u.id, tier: clsIdx, slot: withSkill ? slot : "none", stage: stageIdx, deployed: true, skillOn: withSkill && !!stage, off: {} },
        bu: u, self: true,
      });
    }
    return list;
  };

  // is one buffer effect live for the calculated unit? (values absent =
  // conditions unknown -> null)
  const effectState = (e: BufEffect, b: BufferSel, bu: Unit, values?: Record<string, number | boolean>): Tri => {
    if (e.needsDeploy && !b.deployed) return false;
    if (e.needsSkill && !b.skillOn) return false;
    const extra: Tri = e.toggle ? (values ? !!(values[e.toggle.key] ?? e.toggle.def) : null) : true;
    if (extra === false) return false;
    const bcl = bu.classes[Math.min(b.tier, bu.classes.length - 1)];
    const sk = b.slot === "none" ? null : (bu.skills as Record<string, UnitSkill | null | undefined>)[b.slot];
    const gate = e.gate ? evaluate(e.gate, {
      skillActive: b.skillOn, skillId: sk?.stages?.[b.stage]?.id ?? null, classChange: bcl?.cc ?? 0,
      target: targetFacts(bu, bcl), ownerId: bu.id, values,
    }) : true;
    const enemy = e.row ? enemySide(e.row) : false;
    const reach = e.filter ? evaluate(e.filter, {
      skillActive: false, skillId: null, classChange: cl?.cc ?? 0,
      target: enemy ? undefined : tFacts, ownerId: bu.id, targetIsEnemy: enemy, values,
    }) : true;
    return both(both(gate, reach), extra);
  };

  // every condition control the setup needs, deduplicated by key
  const controls = (() => {
    const seen = new Map<string, Control>();
    const add = (cs: Control[]) => cs.forEach((c) => { if (!seen.has(c.key)) seen.set(c.key, c); });
    own.forEach((e) => e.exprs.forEach((x) => add(controlsOf(x))));
    (stage?.influences || []).forEach((r) => add(controlsOf(r.activate_if)));
    if (buffIndex) {
      allBuffers(true).forEach(({ b, bu }) => {
        bufferEffects(b, bu, buffIndex, configs).forEach((e) => {
          if (b.off[e.key] || !catOn[e.cat]) return;
          if (effectState(e, b, bu) === false) return;
          if (e.toggle) add([e.toggle]);
          add(controlsOf(e.gate));
          add(controlsOf(e.filter));
          e.grant?.exprs.forEach((x) => add(controlsOf(x)));
        });
      });
    }
    return [...seen.values()];
  })();
  const valueOf = (c: Control) => vals[c.key] ?? c.def;

  // ------------------------------------------------------------ computation

  const calc = (withSkill: boolean) => {
    if (!u || !cl) return null;
    const ctx = ownCtx(withSkill, vals);
    const steps: { label: string; value: string; note?: string; em?: boolean }[] = [];
    const stats = cl.stats || [];
    const st = level === "1" ? stats[0] : stats[stats.length - 1];
    if (!st) return null;
    const mod = atkModPct(u, cl);
    const baseAtk = mod != null ? Math.floor((st.atk * mod) / 100) : st.atk;
    steps.push({ label: `Lv${st.level} ATK`, value: String(baseAtk), note: mod != null ? `${st.atk} x ATK mod ${mod}%` : undefined });
    let atk = baseAtk;
    if (useAff) {
      const raw = affectionAtk(u, cl);
      const aff = mod != null ? Math.floor((raw * mod) / 100) : raw;
      if (aff) { atk += aff; steps.push({ label: "Affection ATK", value: `+${aff}` }); }
    }

    // live buffer rows + grants
    const live: BuffRow[] = [];
    const ownRows = new Set<BuffRow>();
    const grants: OwnEffect[] = [];
    if (buffIndex) {
      allBuffers(withSkill).forEach(({ b, bu, self }) => {
        bufferEffects(b, bu, buffIndex, configs).forEach((e) => {
          if (b.off[e.key] || !catOn[e.cat]) return;
          if (effectState(e, b, bu, vals) !== true) return;
          if (e.row) { live.push(e.row); if (self) ownRows.add(e.row); }
          if (e.grant) grants.push(e.grant);
        });
      });
    }
    const rowsOf = (...cats: Cat[]) => live.filter((r) => cats.includes(catOf(r)!));

    const factors: { label: string; f: number }[] = [];
    let flat = 0;
    const facts = withSkill ? skillFacts(stage, ctx) : null;
    if (facts && facts.atkMul !== 1) factors.push({ label: "Skill self ATK", f: facts.atkMul });

    const dmgMods: { label: string; f: number }[] = [];
    let trueChance = 0;
    let padZero = 0;
    const effectsOn = [...own.filter((e) => !ownOff[e.key]), ...grants];
    // conditional ATK rows of one ability type replace each other: of the
    // rows whose condition holds, only the highest applies (Ovie's HP tiers)
    const bestPct = new Map<number, OwnEffect>();
    for (const e of effectsOn) {
      const ok = e.exprs.reduce<Tri>((acc, x) => both(acc, evaluate(x, ctx)), true);
      if (ok !== true) continue;
      if (e.kind === "atk_pct") {
        const cur = bestPct.get(e.type);
        if (!cur || e.value > cur.value) bestPct.set(e.type, e);
      } else if (e.kind === "count") {
        const n = ownCount[e.key] ?? 0;
        let v = e.value * n;
        if (e.cap != null) v = Math.min(v, e.cap);
        if (v) factors.push({ label: `Ability ${e.type} (${n} ${e.countLabel})`, f: 1 + v / 100 });
      } else if (e.kind === "pad_zero") {
        padZero = Math.max(padZero, e.value); // several sources: the highest chance
      } else if (e.kind === "true_chance") {
        trueChance = Math.min(100, trueChance + e.value);
      } else {
        const ch = (e.chance ?? 100) / 100;
        const full = e.value / 100;
        const f = ch >= 1 || procMode === "always" ? full : procMode === "never" ? 1 : 1 + (full - 1) * ch;
        dmgMods.push({ label: `${e.src.startsWith("granted") ? e.src : "Ability 1"} (${e.cond}${ch < 1 ? `, ${e.chance}% chance` : ""})`, f });
      }
    }

    for (const e of bestPct.values()) {
      factors.push({ label: `Ability ${e.type} (${e.cond})`, f: 1 + e.value / 100 });
    }

    // ATK buffs
    const atkRows = rowsOf("SORTIE", "ATK");
    flat += atkRows.filter((r) => r.fl).reduce((a, r) => a + r.v, 0);
    for (const g of groupFactors(atkRows.filter((r) => !r.fl), (r) => atkEffect(r).factor)) {
      if (g.f !== 1) factors.push({ label: g.rows.map((r) => `${r.n} — ${r.s}`).join(" + "), f: g.f });
    }

    let mult = 1;
    if (combine === "multiply") factors.forEach((x) => (mult *= x.f));
    else mult = 1 + factors.reduce((a, x) => a + (x.f - 1), 0);
    factors.forEach((x) => steps.push({ label: x.label, value: fx(x.f) }));
    if (factors.length > 1) steps.push({ label: `Combined (${combine})`, value: fx(mult) });
    let atkFinal = Math.floor(atk * mult);
    if (flat) { atkFinal += flat; steps.push({ label: "Flat ATK buffs", value: `+${flat}` }); }
    steps.push({ label: "Effective ATK", value: String(atkFinal), em: true });

    let dmgMod = 1;
    if (dmgMods.length) {
      if (dmgCombine === "multiply") {
        dmgMods.forEach((d) => { dmgMod *= d.f; steps.push({ label: d.label, value: fx(d.f) }); });
      } else {
        const best = dmgMods.reduce((a, d) => (d.f > a.f ? d : a));
        dmgMod = best.f;
        steps.push({ label: best.label, value: fx(best.f), note: dmgMods.length > 1 ? `highest of ${dmgMods.length}` : undefined });
      }
    }
    const atkHit = atkFinal * dmgMod;

    // enemy side
    const reduce = (c: Cat, base: number) => {
      const rows = rowsOf(c);
      const flatOff = rows.filter((r) => r.fl).reduce((a, r) => a + r.v, 0);
      const gs = groupFactors(rows.filter((r) => !r.fl), (r) => r.v);
      const pct = combine === "multiply"
        ? gs.reduce((a, g) => a * (1 - g.f / 100), 1)
        : Math.max(0, 1 - gs.reduce((a, g) => a + g.f, 0) / 100);
      return Math.max(0, base * pct - flatOff);
    };
    const def = reduce("DEF_DEBUFF", eDef);
    const mr = reduce("MR_DEBUFF", eMr);
    const attr = facts?.attr ?? String(cl.attack_attribute ?? "physical");
    let normal: number;
    if (attr === "physical") {
      if (def !== eDef) steps.push({ label: "Enemy DEF after debuffs", value: fmt(def), note: `from ${eDef}` });
      normal = Math.max(atkHit - def, atkHit * (floorPct / 100));
      steps.push({ label: "Physical hit", value: fmt(normal), note: `max(ATK - DEF, ATK x ${floorPct}%)`, em: true });
    } else if (attr === "magical") {
      if (mr !== eMr) steps.push({ label: "Enemy MR after debuffs", value: fmt(mr), note: `from ${eMr}` });
      normal = atkHit * (1 - Math.min(mr, 100) / 100);
      steps.push({ label: "Magic hit", value: fmt(normal), note: "ATK x (1 - MR%)", em: true });
    } else if (attr === "fixed damage") {
      normal = atkHit;
      steps.push({ label: "True-damage hit", value: fmt(normal), note: "ignores DEF and MR", em: true });
    } else {
      normal = 0;
      steps.push({ label: `Attribute "${attr}"`, value: "0", note: "does not deal damage" });
    }
    let perHit = normal;
    if (trueChance > 0 && normal > 0 && attr !== "fixed damage") {
      const c = procMode === "always" ? 1 : procMode === "never" ? 0 : trueChance / 100;
      perHit = normal * (1 - c) + atkHit * c;
      steps.push({ label: `True damage chance ${trueChance}%`, value: fmt(perHit), note: procMode === "expected" ? "expected value" : procMode });
    }
    const amp = groupFactors(rowsOf("DMG_AMP"), (r) => atkEffect(r).factor).reduce((a, g) => a * g.f, 1);
    if (amp !== 1) { perHit *= amp; steps.push({ label: "Enemy damage taken", value: fx(amp) }); }

    // PAD
    let hits = facts?.hits ?? 1;
    let targets = facts?.targets ?? cl.max_target ?? 1;
    let hitsNote: string | undefined;
    // empty shots: of each target's shots only the non-empty missiles deal
    // damage (Silky: 15 shots per target, 9 damaging); targets are unchanged
    const pattern = withSkill && facts?.hits ? shotPattern(u, cl, ctx) : null;
    if (pattern && pattern.damaging < pattern.shots) {
      hitsNote = `${pattern.shots} shots, ${pattern.damaging} deal damage (ability 210)`;
      hits = (hits * pattern.damaging) / pattern.shots;
    }
    let interval = intervalOverride !== "" ? Number(intervalOverride) : cl.attack_interval ?? 0;
    // PAD, as Aigis.exe computes it (attack-wait getter 0x56a1f0 + 0x56a460):
    //  1. W = class AttackWait; a Set PAD (skill 14) REPLACES it -- an ally's
    //     (party) Set PAD wins over the unit's own, lowest within each side.
    //  2. every percent reduction is computed from W on its own, and only the
    //     strongest applies: PAD = min(W, W x (100 - p) / 100 for each p).
    //  3. ability 18: chance per attack for PAD = 0 (highest chance counts).
    const padRows = rowsOf("PAD");
    const wait = cl.attack_wait;
    if ((padRows.length || padZero > 0) && wait != null && interval > 0) {
      let pad = wait;
      const setOf = (rows: BuffRow[]) => rows.filter((r) => r.ns === "skill" && r.t === 14).map((r) => r.v);
      const party = setOf(padRows.filter((r) => !ownRows.has(r)));
      const mine = setOf(padRows.filter((r) => ownRows.has(r)));
      const sets = party.length ? party : mine;
      if (sets.length) {
        pad = Math.min(...sets);
        steps.push({ label: "Set PAD", value: `${pad}f`,
          note: `replaces ${wait}f${sets.length > 1 ? `, lowest of ${sets.length}` : ""}${party.length && mine.length ? ", ally's overrides own" : ""}` });
      }
      const reds = padRows.filter((r) => !(r.ns === "skill" && r.t === 14));
      if (reds.length) {
        const best = reds.reduce((a, r) => (r.v > a.v ? r : a));
        const before = pad;
        pad = Math.min(pad, Math.trunc((pad * Math.max(0, 100 - best.v)) / 100));
        steps.push({ label: `PAD -${best.v}% (${best.n})`, value: `${pad}f`,
          note: `from ${before}f${reds.length > 1 ? `; strongest of ${reds.length}, reductions do not stack` : ""}` });
      }
      if (padZero > 0) {
        const c = procMode === "always" ? 1 : procMode === "never" ? 0 : padZero / 100;
        const before = pad;
        pad = pad * (1 - c);
        steps.push({ label: `No-PAD chance ${padZero}%`, value: `${fmt(pad)}f`, note: `from ${before}f, ${procMode === "expected" ? "expected value" : procMode}` });
      }
      interval = interval - wait + pad;
    }
    const dps = interval > 0 ? (perHit * hits * 60) / interval : 0;
    steps.push({ label: "Hits per attack", value: fmt(hits), note: hitsNote });
    steps.push({ label: "Attack interval", value: `${interval}f (${(interval / 60).toFixed(2)}s)` });
    steps.push({ label: "DPS per target", value: fmt(dps), em: true });
    return { steps, dps, targets, facts, perHit, atkFinal, interval };
  };

  const resNo = calc(false);
  const resSkill = stage ? calc(true) : null;
  const ttk = (r: ReturnType<typeof calc>) => (r && r.dps > 0 && eHp > 0 ? `${fmt(eHp / r.dps)}s` : "-");
  const ownMatch = (e: OwnEffect): Tri =>
    e.exprs.reduce<Tri>((acc, x) => both(acc, evaluate(x, ownCtx(!!stage, vals))), true);
  const patchBuffer = (id: number, fn: (b: BufferSel) => BufferSel) =>
    setBuffers((cur) => cur.map((b) => (b.id === id ? fn(b) : b)));
  const addBuffer = (id: number) => {
    if (buffers.some((b) => b.id === id)) return;
    loadJSONFile<Unit>(`unit/${id}`).then((x) => {
      setBufUnits((cur) => ({ ...cur, [id]: x }));
      const sk = x.skills as Record<string, UnitSkill | null | undefined>;
      const slot0: SlotKey = sk.awakened ? "awakened" : sk.base ? "base" : "none";
      setBuffers((cur) => cur.some((b) => b.id === id) ? cur : [...cur, {
        id, tier: Math.max(0, x.classes.length - 1), slot: slot0, stage: 0, deployed: true, skillOn: slot0 !== "none", off: {},
      }]);
    }).catch(() => undefined);
  };

  const renderEffects = (b: BufferSel, bu: Unit, isSelf: boolean) => {
    if (!buffIndex) return null;
    const effs = bufferEffects(b, bu, buffIndex, configs);
    const shown = effs.filter((e) => showAll || effectState(e, b, bu) !== false);
    if (!shown.length) return <p className="muted small">No buffs from this setup reach the selected unit.</p>;
    return (
      <table className="dps-own">
        <tbody>
          {shown.map((e) => {
            const st = effectState(e, b, bu, vals);
            const on = !b.off[e.key] && catOn[e.cat];
            return (
              <tr key={e.key} className={st !== true || !on ? "dps-na" : ""}>
                <td>
                  <input type="checkbox" checked={!b.off[e.key]} disabled={isSelf}
                    onChange={(ev) => patchBuffer(b.id, (x) => ({ ...x, off: { ...x.off, [e.key]: !ev.target.checked } }))} />
                </td>
                <td><span className="dps-badge">{CATS.find((c) => c.k === e.cat)?.label}</span></td>
                <td><strong>{e.value}</strong></td>
                <td className="small">{e.label}<div className="muted">{e.target}</div></td>
                <td className="small">{st === true ? "applies" : st === false ? "not now" : "?"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="dps-page">
      <header className="dps-title">
        <div className="dps-title-row">
          <h2>DPS calculator</h2>
          <button className="dps-share" onClick={shareLink} disabled={unitId == null}
            title="Copy a link that restores this whole setup">
            {copied ? "Link copied" : "Share"}
          </button>
        </div>
        <p className="muted small">
          Not decoded, so left as model options: the physical damage floor, how separate buff groups combine, and how
          several damage modifiers combine.
        </p>
      </header>
      <div className="dps-layout">
      <div className="dps-main">

      {/* ------------------------------------------------ unit */}
      <section className="dps-section">
        <h3>Unit</h3>
        <UnitSearch placeholder="pick unit (name / id)…" onPick={setUnitId} />
        {unitId != null && !u && <div className="loading">loading…</div>}
        {u && cl && (
          <>
            <div className="cg-card-head">
              <img src={unitImageUrl("icon", u.id)} alt="" />
              <div>
                <strong>{u.name_en || u.name}</strong> <span className="muted">#{u.id}</span>
                <div className="muted small">
                  {cl.name} · {String(cl.attack_attribute)} · {cl.max_target ?? 1} target(s) · interval {cl.attack_interval}f
                  {cl.attack_wait != null && ` (PAD ${cl.attack_wait}f)`}
                </div>
              </div>
            </div>
            <div className="cg-ctl-group">
              <label className="cg-ctl">Class
                <select value={clsIdx} onChange={(e) => setClsIdx(Number(e.target.value))}>
                  {classes.map((c, i) => <option key={c.class_id} value={i}>{CC_LABEL[c.cc] ?? `cc${c.cc}`} — {c.name}</option>)}
                </select>
              </label>
              <Sel label="Level" value={level} set={setLevel}
                opts={[["max", `max (${cl.stats[cl.stats.length - 1]?.level})`], ["1", "1"]]} />
              <Sel label="Skill" value={slot} set={(v) => { setSlot(v); setStageIdx(0); }} opts={skillOptions(u)} />
              {stages.length > 1 && (
                <label className="cg-ctl">Stage
                  <select value={stageIdx} onChange={(e) => setStageIdx(Number(e.target.value))}>
                    {stages.map((s, i) => <option key={s.id} value={i}>{i + 1}: {s.name_en || s.name}</option>)}
                  </select>
                </label>
              )}
              <label className={`cg-pill${useAff ? " on" : ""}`}>
                <input type="checkbox" checked={useAff} onChange={(e) => setUseAff(e.target.checked)} />
                Max affection ATK
              </label>
              <label className="cg-ctl">Attack interval (f)
                <input type="number" min={1} value={intervalOverride !== "" ? intervalOverride : cl.attack_interval ?? 0}
                  onChange={(e) => setIntervalOverride(e.target.value)} />
              </label>
            </div>
          </>
        )}
      </section>

      {/* ------------------------------------------------ enemy + model */}
      <section className="dps-section">
        <h3>Enemy</h3>
        <div className="cg-ctl-group">
          <NumInput label="HP" value={eHp} set={setEHp} />
          <NumInput label="DEF" value={eDef} set={setEDef} />
          <NumInput label="MR %" value={eMr} set={setEMr} max={100} />
        </div>
        <details className="dps-model">
          <summary className="small">Model options (not decoded)</summary>
          <div className="cg-ctl-group">
            <Sel label="Chance procs" value={procMode} set={setProcMode}
              opts={[["expected", "expected value"], ["always", "always proc"], ["never", "never proc"]]} />
            <label className="cg-ctl" title="Physical hits deal at least this percent of ATK.">Min dmg % of ATK
              <input type="number" min={0} max={100} value={floorPct} onChange={(e) => setFloorPct(Number(e.target.value) || 0)} />
            </label>
            <Sel label="Buff groups" value={combine} set={setCombine} opts={[["multiply", "multiply"], ["add", "add percents"]]} />
            <Sel label="Damage modifiers" value={dmgCombine} set={setDmgCombine}
              opts={[["highest", "highest only"], ["multiply", "multiply"]]} />
          </div>
        </details>
      </section>

      {/* ------------------------------------------------ conditions */}
      {u && cl && (
        <section className="dps-section">
          <h3>Conditions</h3>
          {controls.length === 0 && <p className="muted small">No conditions in the current setup.</p>}
          <div className="dps-conds">
            {controls.filter((c) => c.kind === "slider").map((c) => (
              <label key={c.key} className="cg-slider">
                <span>{c.label}: <b>{Number(valueOf(c))}</b></span>
                <input type="range" min={c.min} max={c.max} value={Number(valueOf(c))}
                  onChange={(e) => setVals({ ...vals, [c.key]: Number(e.target.value) })} />
              </label>
            ))}
            {controls.filter((c) => c.kind === "toggle").map((c) => (
              <label key={c.key} className="cg-toggle">
                <input type="checkbox" checked={!!valueOf(c)} onChange={(e) => setVals({ ...vals, [c.key]: e.target.checked })} />
                {c.label}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------ own effects */}
      {u && cl && (
        <section className="dps-section">
          <h3>Unit's own conditional effects</h3>
          {own.length === 0 && <p className="muted small">No conditional damage / ATK effects on this class tier.</p>}
          {own.length > 0 && (
            <table className="dps-own">
              <thead><tr><th>Use</th><th>Effect</th><th>Value</th><th>Condition</th><th>Active</th></tr></thead>
              <tbody>
                {own.map((e) => {
                  const m = ownMatch(e);
                  return (
                    <tr key={e.key} className={m === false || ownOff[e.key] ? "dps-na" : ""}>
                      <td><input type="checkbox" checked={!ownOff[e.key]} onChange={(ev) => setOwnOff({ ...ownOff, [e.key]: !ev.target.checked })} /></td>
                      <td>{e.label} <span className="muted small">({e.src}, ability {e.type})</span></td>
                      <td>
                        {e.kind === "dmg" && `x${e.value / 100}${e.chance != null && e.chance < 100 ? ` (${e.chance}% chance)` : ""}`}
                        {e.kind === "atk_pct" && `+${e.value}%`}
                        {e.kind === "true_chance" && `${e.value}% true damage`}
                        {e.kind === "pad_zero" && `${e.value}% chance PAD = 0`}
                        {e.kind === "count" && (() => {
                          const maxN = e.cap != null && e.value > 0 ? Math.ceil(e.cap / e.value) : 20;
                          const n = ownCount[e.key] ?? 0;
                          return (
                            <label className="cg-slider">
                              <span>+{e.value}% per {e.countLabel?.replace(/s$/, "")}{e.cap != null ? `, cap ${e.cap}%` : ""} — {e.countLabel}: <b>{n}</b></span>
                              <input type="range" min={0} max={maxN} value={n}
                                onChange={(ev) => setOwnCount({ ...ownCount, [e.key]: Number(ev.target.value) })} />
                            </label>
                          );
                        })()}
                      </td>
                      <td className="small">{e.cond}</td>
                      <td>{m === true ? "yes" : m === false ? "no" : "?"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ------------------------------------------------ buffers */}
      <section className="dps-section">
        <h3>Buffers</h3>
        <p className="muted small">
          Each buffer applies every buff of its chosen class tier and skill that can reach the selected unit. Rows
          sharing a stack key keep the highest; sortie/deployment buffs add up; other groups keep the highest.
        </p>
        <div className="cg-ctl-group">
          {CATS.map((c) => (
            <label key={c.k} className={`cg-pill${catOn[c.k] ? " on" : ""}`}>
              <input type="checkbox" checked={catOn[c.k]} onChange={(e) => setCatOn({ ...catOn, [c.k]: e.target.checked })} />
              {c.label}
            </label>
          ))}
        </div>
        <div className="cg-ctl-group">
          <UnitSearch placeholder="add buffer (unit name / id)…" onPick={addBuffer}
            exclude={new Set([...buffers.map((b) => b.id), ...(u ? [u.id] : [])])} />
          <label className={`cg-pill${selfBuff ? " on" : ""}`}>
            <input type="checkbox" checked={selfBuff} onChange={(e) => setSelfBuff(e.target.checked)} />
            Count this unit's own buffs on itself
          </label>
          <label className={`cg-pill${showAll ? " on" : ""}`}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show rows that cannot apply
          </label>
        </div>

        {selfBuff && u && cl && buffIndex && (
          <div className="dps-buffer">
            <div className="dps-buffer-head">
              <img src={unitImageUrl("icon", u.id)} alt="" />
              <strong>{u.name_en || u.name}</strong> <span className="muted small">(itself — follows the unit settings above)</span>
            </div>
            {renderEffects(allBuffers(!!stage)[0].b, u, true)}
          </div>
        )}

        {buffers.map((b) => {
          const bu = bufUnits[b.id];
          if (!bu) return <div key={b.id} className="loading">loading #{b.id}…</div>;
          const bcl = bu.classes[Math.min(b.tier, bu.classes.length - 1)];
          const sk = b.slot === "none" ? null : (bu.skills as Record<string, UnitSkill | null | undefined>)[b.slot];
          return (
            <div key={b.id} className="dps-buffer">
              <div className="dps-buffer-head">
                <img src={unitImageUrl("icon", bu.id)} alt="" />
                <strong>{bu.name_en || bu.name}</strong> <span className="muted">#{bu.id}</span>
                <label className="cg-ctl">Class
                  <select value={b.tier} onChange={(e) => patchBuffer(b.id, (x) => ({ ...x, tier: Number(e.target.value) }))}>
                    {bu.classes.map((c, i) => <option key={c.class_id} value={i}>{CC_LABEL[c.cc] ?? `cc${c.cc}`} — {c.name}</option>)}
                  </select>
                </label>
                <Sel label="Skill" value={b.slot} set={(v) => patchBuffer(b.id, (x) => ({ ...x, slot: v, stage: 0, skillOn: v !== "none" }))}
                  opts={skillOptions(bu)} />
                {(sk?.stages?.length ?? 0) > 1 && (
                  <label className="cg-ctl">Stage
                    <select value={b.stage} onChange={(e) => patchBuffer(b.id, (x) => ({ ...x, stage: Number(e.target.value) }))}>
                      {sk!.stages.map((s, i) => <option key={s.id} value={i}>{i + 1}: {s.name_en || s.name}</option>)}
                    </select>
                  </label>
                )}
                <label className={`cg-pill${b.deployed ? " on" : ""}`}>
                  <input type="checkbox" checked={b.deployed} onChange={(e) => patchBuffer(b.id, (x) => ({ ...x, deployed: e.target.checked }))} />
                  Deployed
                </label>
                {b.slot !== "none" && (
                  <label className={`cg-pill${b.skillOn ? " on" : ""}`}>
                    <input type="checkbox" checked={b.skillOn} onChange={(e) => patchBuffer(b.id, (x) => ({ ...x, skillOn: e.target.checked }))} />
                    Skill active
                  </label>
                )}
                <button className="dps-remove" title="remove buffer" onClick={() => setBuffers(buffers.filter((x) => x.id !== b.id))}>remove</button>
              </div>
              {bcl && renderEffects(b, bu, false)}
            </div>
          );
        })}
      </section>

      </div>
      <aside className="dps-side">
      {/* ------------------------------------------------ results */}
      {resNo && (
        <section className="dps-section dps-results">
          <h3>Result</h3>
          <div className="dps-tiles">
            {[["No skill", resNo] as const, ...(resSkill ? [[SLOT_LABEL[slot], resSkill] as const] : [])].map(([title, r]) => (
              <div key={title} className="dps-tile">
                <div className="dps-tile-title">{title}</div>
                <div className="dps-tile-value">{fmt(r.dps)}</div>
                <div className="dps-tile-sub">DPS / target{r.targets > 1 ? ` · ${fmt(r.dps * r.targets)} on ${r.targets}` : ""}</div>
                <div className="dps-tile-sub">{ttk(r) !== "-" ? `kills in ${ttk(r)}` : "set enemy HP for time to kill"}</div>
              </div>
            ))}
          </div>
          <table className="dps-result">
            <thead>
              <tr><th></th><th>ATK</th><th>per hit</th><th>interval</th><th>DPS</th></tr>
            </thead>
            <tbody>
              {[["No skill", resNo] as const, ...(resSkill ? [[SLOT_LABEL[slot], resSkill] as const] : [])].map(([title, r]) => (
                <tr key={title}>
                  <td>
                    {title}
                    {r.facts?.duration != null && <div className="muted small">{r.facts.duration}s · CD {r.facts.cooldown ?? "-"}s</div>}
                  </td>
                  <td>{r.atkFinal}</td><td>{fmt(r.perHit)}</td><td>{r.interval}f</td><td>{fmt(r.dps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="dps-steps">
            {[["No skill", resNo] as const, ...(resSkill ? [[SLOT_LABEL[slot], resSkill] as const] : [])].map(([title, r]) => (
              <div key={title}>
                <h4>{title} — breakdown</h4>
                <table className="dps-breakdown">
                  <tbody>
                    {r.steps.map((s, i) => (
                      <tr key={i} className={s.em ? "em" : ""}>
                        <td>{s.label}{s.note && <div className="dps-note">{s.note}</div>}</td><td>{s.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}
      </aside>
      </div>
    </div>
  );
}
