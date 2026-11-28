// Evaluates the game's condition expressions (_Command / _ActivateCommand /
// NoChangeCondition) against one unit. Facts about the unit are answered from
// its data; everything else is a "control" (a page-set value) or, with no
// values given, null -- "cannot tell", which propagates through !, && and ||.
import type { Unit, UnitClass } from "./types";

export type Tri = boolean | null;

// facts about the calculated unit that conditions read
export interface TargetFacts {
  unitId: number;
  classId: number;
  gender: number | null; // GetGender(): 1 = female, 0 = male
  rarityId: number;
  race: string | null;
  genus: string | null;
  faction: string | null;
  identities: string[];
  prince: boolean;
  battleStyle: number | null; // ClassData.BattleStyle: bit 1 = IsVanguard, bit 2 = IsRearguard
  initialCost: number | null; // the class tier's starting deploy cost
}

export function targetFacts(u: Unit, cl: UnitClass): TargetFacts {
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
    battleStyle: cl.battle_style ?? null,
    initialCost: cl.cost_max ?? null,
  };
}

// functions answered from the unit's data / the page's skill and class choice
export const FACT_FNS = new Set([
  "IsOwnerUnit", "IsClassType", "IsCardID", "GetCardID", "GetGender", "IsGender", "IsRarity", "IsRaryty",
  "IsRace", "IsGenus", "IsAssign", "IsIdentitiy", "IsIdentity", "IsPrince", "IsVanguard", "IsRearguard",
  "IsToken", "IsServantToken", "IsEnemyUnit", "IsGuestUnit", "IsPlayerSupportUnit", "IsTeamUnit",
]);
export const STATE_FNS = new Set(["IsInvokedSkill", "IsSkillID", "GetClassChange"]);
// one control per listed name (race / tag), the call is true if any is on
export const MULTI_FNS: Record<string, string> = { IsEnemyRace: "race", IsEnemyElementAny: "tag" };

export interface Control {
  key: string;
  kind: "toggle" | "slider";
  label: string;
  min?: number;
  max?: number;
  def: number | boolean;
}

export function controlFor(name: string, args: string[]): Control[] {
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

export const CALL_RE = /([A-Za-z_]\w*)\s*\(\s*((?:"[^"]*"|[^()"])*)\)/g;
export function splitArgs(raw: string): string[] {
  return raw.split(",").map((p) => p.trim().replace(/^"|"$/g, "")).filter(Boolean);
}

// the controls an expression needs (fact / state functions excluded)
export function controlsOf(expr: string | null | undefined): Control[] {
  const out: Control[] = [];
  for (const m of (expr || "").matchAll(CALL_RE)) {
    const name = m[1];
    if (FACT_FNS.has(name) || STATE_FNS.has(name)) continue;
    out.push(...controlFor(name, splitArgs(m[2])));
  }
  return out;
}

export interface EvalCtx {
  skillActive: boolean;
  skillId: number | null;
  skillUnknown?: boolean; // skill state not known -> IsInvokedSkill/IsSkillID can't tell
  classChange: number;
  target?: TargetFacts; // the unit a row is evaluated against
  ownerId?: number; // the row's owner unit id (IsOwnerUnit)
  targetIsEnemy?: boolean; // debuff / damage-taken rows target the enemy
  values?: Record<string, number | boolean>; // control values; absent = can't tell
  // also answer CheckInBattleClassID / IsClassID / GetRarity /
  // GetCardInitialCost from the target, and treat IsEnabledPossession as owned
  possession?: boolean;
  // functions pinned to a value (null = can't tell), checked before anything else
  fixed?: Record<string, Val>;
  // functions answered from their arguments, checked after `fixed`
  fns?: Record<string, (args: (number | string)[]) => Val>;
}

export type Val = number | string | boolean | null;

// Evaluates the game's condition expressions. Anything not answerable yields
// null ("cannot tell"), which propagates through !, &&, || and comparisons.
export function evaluate(src: string, ctx: EvalCtx): Tri {
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
    if (ctx.fixed && name in ctx.fixed) return ctx.fixed[name];
    if (ctx.fns && name in ctx.fns) return ctx.fns[name](rawArgs);
    switch (name) {
      case "IsInvokedSkill": return ctx.skillUnknown ? null : ctx.skillActive;
      case "IsSkillID": return ctx.skillUnknown ? null : ctx.skillId != null && nums.includes(ctx.skillId);
      case "GetClassChange": return ctx.classChange;
      case "IsEnemyUnit": if (ctx.targetIsEnemy) return true; break;
    }
    const t = ctx.target;
    if (ctx.possession && t) {
      switch (name) {
        case "CheckInBattleClassID":
        case "IsClassID": return nums.includes(t.classId);
        case "GetRarity": return t.rarityId;
        case "GetCardInitialCost": return t.initialCost;
        case "IsEnabledPossession": return true;
      }
    }
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
        // the game reads ClassData.BattleStyle bits here, not PlaceAttribute (deploy_slot)
        case "IsVanguard": return t.battleStyle == null ? null : (t.battleStyle & 1) !== 0;
        case "IsRearguard": return t.battleStyle == null ? null : (t.battleStyle & 2) !== 0;
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
  // left to right like C: `a <= 3 == 1` is `(a <= 3) == 1`
  const cmp = (): Val => {
    let l = primary();
    for (let op = peek(); op && ["<=", ">=", "==", "!=", "<", ">"].includes(op); op = peek()) {
      next();
      const r = primary();
      if (l === null || r === null) { l = null; continue; }
      const a = Number(l);
      const b = Number(r);
      switch (op) {
        case "<=": l = a <= b; break; case ">=": l = a >= b; break; case "==": l = a === b; break;
        case "!=": l = a !== b; break; case "<": l = a < b; break; default: l = a > b;
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

export const both = (a: Tri, b: Tri): Tri => (a === false || b === false ? false : a === null || b === null ? null : true);
export const isAlways = (x?: string | null) => !x || !x.trim() || /^1;?$/.test(x.trim());
