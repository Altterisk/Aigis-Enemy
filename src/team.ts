// Team builder maths (pages/Team.tsx): which buff_index rows reach a chosen
// unit from a formation, how they add up per buff group, and how much each
// candidate would add.
//
//  * A row needs its giver deployed unless its slot is a sortie one
//    ("... (sortie)"), which works from the formation.
//  * Every unit is taken at its top form: the awakened ability when it has one
//    (else the default ability), the last class (or either 2nd-awakening
//    branch), and at most one skill (or one skill stage) at a time. Rows a
//    skill boosts ("... + awakened skill stage 3") belong to that skill.
//  * Reach: enemy-facing rows (debuffs, damage taken) help whoever is
//    attacking; ally rows reach the target when their target is not "self"
//    (or the giver is the target) and their `x` filter holds for her; `ax`
//    gates the giver. A condition that can't be decided from unit data
//    (enemy kind, HP %, class-change state...) makes the row conditional.
//  * Stacking follows /dps: one group per buff_index group (`grp`, else
//    stat + influence id; skill 235 is a new instance per giver, skill 236 and
//    ability 221 share one), rows sharing an ability _Param4 stack key keep
//    the highest, then the group's selection rule ("additive" sums, the rest
//    keep the highest). Separate groups are listed side by side, never
//    combined.
import { evaluate, both, isAlways, type EvalCtx, type TargetFacts, type Tri } from "./condEval";
import { influenceSelectionRule } from "./influenceLabels";
import type { BuffRow, UnitIndexEntry } from "./types";
import { getLang } from "./i18n";

export type Mode = "off" | "def" | "util";

export const MODE_STATS: Record<Mode, string[]> = {
  off: ["ATK", "RNG", "PAD_REDUCTION", "DEF_DEBUFF", "MR_DEBUFF", "DMG_AMP"],
  def: ["HP", "DEF", "MR", "ATK_DEBUFF", "PAD_DEBUFF"],
  util: ["CDR"],
};
export const STAT_LABEL: Record<string, string> = {
  ATK: "ATK", DEF: "DEF", HP: "HP", MR: "MR", RNG: "Range", PAD_REDUCTION: "PAD Reduction",
  CDR: "Skill CD Reduction", ATK_DEBUFF: "Enemy ATK debuff", DEF_DEBUFF: "Enemy DEF debuff",
  MR_DEBUFF: "Enemy MR debuff", PAD_DEBUFF: "Enemy PAD increase", DMG_AMP: "Enemy damage taken",
};
const ENEMY_SIDE = new Set(["ATK_DEBUFF", "DEF_DEBUFF", "MR_DEBUFF", "PAD_DEBUFF", "DMG_AMP"]);

export const MAX_TEAM = 15;

// value shapes, as on /buffs: skill percents are total multipliers except
// 204/205; ability percents add except the "→ X%" ids
const SKILL_ADDITIVE_PCT = new Set([204, 205]);
const ABILITY_MULTIPLIER_PCT = new Set([134, 135, 136, 155, 156, 157, 158, 197, 198, 199, 207, 221]);
const isReduction = (r: BuffRow) =>
  r.stat !== "PAD_DEBUFF" && (r.stat.endsWith("_DEBUFF") || r.stat === "PAD_REDUCTION" || r.stat === "CDR");
const asMultiplier = (r: BuffRow) =>
  !isReduction(r) && !r.fl && r.vk !== "share" &&
  ((r.ns === "skill" && !SKILL_ADDITIVE_PCT.has(r.t)) || (r.ns === "ability" && ABILITY_MULTIPLIER_PCT.has(r.t)));
// skill 14 sets PAD to a frame count: not a size that adds up with the rest
const isSetPad = (r: BuffRow) => r.ns === "skill" && r.t === 14;

/** How big a row is: percent points (x1.3 -> 30), or the flat amount. */
export function magnitude(r: BuffRow): number {
  return asMultiplier(r) ? r.v - 100 : r.v;
}

/** The group a row stacks in; flat and "% of own stat" rows are kept apart. */
export function groupKeyOf(r: BuffRow, giver: number): string {
  const g = r.ns === "skill" && r.t === 235 ? `new_instance:${giver}`
    : r.stat === "DMG_AMP" && (r.t === 236 || r.t === 221) ? "dmg_amp"
      : r.grp ?? `${r.ns}:${r.t}`;
  return `${r.stat}|${g}${r.fl ? "|flat" : r.vk === "share" ? "|share" : ""}`;
}
const stackKey = (r: BuffRow) => (r.ns === "ability" && r.p && r.p[3] ? `k${r.p[3]}` : null);

export function fmtAmount(r: BuffRow, m: number): string {
  const n = Math.round(m * 100) / 100;
  if (r.fl) return `${isReduction(r) ? "-" : "+"}${n.toLocaleString()} flat`;
  if (r.vk === "share") return `${n}% of giver's ${r.stat}`;
  if (asMultiplier(r)) return `x${Math.round((1 + m / 100) * 1000) / 1000}`;
  return `${isReduction(r) ? "-" : "+"}${n}%`;
}

// ------------------------------------------------------------------ units

/** Facts condEval reads about a unit, from the units.json entry. */
export function indexFacts(u: UnitIndexEntry): TargetFacts {
  const g = String(u.gender ?? "");
  return {
    unitId: u.id,
    classId: u.base_class_id ?? 0,
    gender: g === "Female" ? 1 : g === "Male" ? 0 : null,
    rarityId: u.rarity_id,
    race: u.race ?? null,
    genus: u.genus ?? null,
    faction: u.faction ?? null,
    identities: u.identity_tags ?? [],
    prince: !!u.prince,
    slot: u.position === "melee" ? "melee" : u.position === "ranged" ? "ranged" : null,
    initialCost: null,
  };
}

/** One way to field a unit: which 2nd-awakening class, which skill (stage). */
export interface Variant {
  cls: string | null;
  skill: string | null;
}

const SKILL_RE = /^(base|class_evolved|awakened) skill(?: stage (\d+))?/;
const BOOST_RE = / \+ (base|class_evolved|awakened) skill(?: stage (\d+))?/;
const CLASS_RE = /^class attribute \(([^)]+)\)/;
const skillOf = (s: string): string | null => {
  const m = SKILL_RE.exec(s) ?? BOOST_RE.exec(s);
  return m ? `${m[1]} skill${m[2] ? ` stage ${m[2]}` : ""}` : null;
};

/** The unit's rows at its top form, each tagged with the class / skill it needs. */
export interface UnitRows {
  rows: { r: BuffRow; cls: string | null; skill: string | null; deploy: boolean }[];
  classes: string[];
  skills: string[];
}
export function unitRows(u: UnitIndexEntry, all: BuffRow[]): UnitRows {
  const names = u.class_names ?? [];
  const top = u.aw2_branches === 2 ? names.slice(-2) : names.slice(-1);
  const rows: UnitRows["rows"] = [];
  const skills = new Set<string>();
  for (const r of all) {
    if (!MODE_STATS.off.includes(r.stat) && !MODE_STATS.def.includes(r.stat) && !MODE_STATS.util.includes(r.stat)) continue;
    if (isSetPad(r)) continue;
    const s = r.s;
    if (s.startsWith("default ability") && u.aw_ab) continue;
    if (s.startsWith("awakened ability") && !u.aw_ab) continue;
    const c = CLASS_RE.exec(s);
    if (c && !top.includes(c[1])) continue;
    // a token's rows, its own skill included, only need the token out
    const skill = s.startsWith("token ") ? null : skillOf(s);
    if (skill) skills.add(skill);
    rows.push({ r, cls: c && top.length > 1 ? c[1] : null, skill, deploy: !/\(sortie\)( \+ |$)/.test(s) });
  }
  return { rows, classes: top.length > 1 ? top : [], skills: [...skills] };
}

/** Every class x skill combination worth trying (no skill included). */
export function variantsOf(ur: UnitRows, skillsOn: boolean): Variant[] {
  const classes: (string | null)[] = ur.classes.length ? ur.classes : [null];
  const skills: (string | null)[] = [null, ...(skillsOn ? ur.skills : [])];
  return classes.flatMap((cls) => skills.map((skill) => ({ cls, skill })));
}

const SKILL_JA: Record<string, string> = { base: "スキル", class_evolved: "クラスチェンジ後スキル", awakened: "スキル覚醒" };
/** "awakened skill stage 2" in the current language. */
const skillText = (s: string) => {
  if (getLang() !== "ja") return s;
  const m = /^(base|class_evolved|awakened) skill(?: stage (\d+))?$/.exec(s);
  return m ? `${SKILL_JA[m[1]]}${m[2] ? ` 段階${m[2]}` : ""}` : s;
};
export const variantLabel = (v: Variant, loc?: Record<string, string>) =>
  [v.cls ? loc?.[v.cls] || v.cls : null, v.skill ? skillText(v.skill) : null].filter(Boolean).join(" · ");

// ------------------------------------------------------------------ reach

export interface Contribution {
  r: BuffRow;
  giver: number;
  key: string;
  m: number;
  /** true = always, null = depends on something unit data can't tell */
  state: Tri;
  /** placement-dependent (in range / nearby / on hit) */
  near: boolean;
}

/** Which of a giver's rows reach the target with this variant. */
export function reaching(
  ur: UnitRows, giver: UnitIndexEntry, v: Variant, deployed: boolean, target: UnitIndexEntry, mode: Mode,
): Contribution[] {
  const out: Contribution[] = [];
  const stats = MODE_STATS[mode];
  const ownerFacts = indexFacts(giver);
  const targetFacts = indexFacts(target);
  for (const { r, cls, skill, deploy } of ur.rows) {
    if (!stats.includes(r.stat)) continue;
    if (deploy && !deployed) continue;
    if (cls && cls !== v.cls) continue;
    if (skill && skill !== v.skill) continue;
    const enemy = ENEMY_SIDE.has(r.stat);
    const tgt = String(r.tgt ?? "");
    if (!enemy && tgt === "self" && giver.id !== target.id) continue;
    const ctx = (expr: string, t?: TargetFacts): EvalCtx => ({
      skillActive: !!v.skill, skillId: null, skillUnknown: !!v.skill && /IsSkillID/.test(expr),
      classChange: 0, target: t, ownerId: giver.id, targetIsEnemy: enemy && !t,
    });
    // GetClassChange() can't be told from the index: the gate is conditional
    const cc = (x: string): Tri => (/GetClassChange/.test(x) ? null : true);
    const gate: Tri = r.ax && !isAlways(r.ax) ? both(evaluate(r.ax, ctx(r.ax, ownerFacts)), cc(r.ax)) : true;
    const filter: Tri = r.x && !isAlways(r.x) ? both(evaluate(r.x, ctx(r.x, enemy ? undefined : targetFacts)), cc(r.x)) : true;
    // the buff needs the target overhealed
    const extra: Tri = tgt === "overhealed allies" ? null : true;
    const state = both(both(gate, filter), extra);
    if (state === false) continue;
    out.push({
      r, giver: giver.id, key: groupKeyOf(r, giver.id), m: magnitude(r), state,
      near: /in range|nearby|on hit/.test(tgt),
    });
  }
  return out;
}

/** One group's total: per giver its best row, stack keys keep the highest, then the rule. */
export function total(list: Contribution[]): number {
  if (!list.length) return 0;
  const byStack = new Map<string, number>();
  for (const c of list) {
    const k = stackKey(c.r) ?? `g${c.giver}`;
    byStack.set(k, Math.max(byStack.get(k) ?? -Infinity, c.m));
  }
  const vals = [...byStack.values()];
  const r = list[0].r;
  const rule = r.ns === "special" || r.ns === "class" ? undefined : influenceSelectionRule(r.ns, r.t);
  return rule === "additive" ? vals.reduce((a, b) => a + b, 0) : Math.max(...vals);
}

export function byKey(list: Contribution[]): Map<string, Contribution[]> {
  const m = new Map<string, Contribution[]>();
  for (const c of list) m.set(c.key, [...(m.get(c.key) || []), c]);
  return m;
}

export interface Gain {
  key: string;
  before: number;
  after: number;
  best: Contribution;
  isNew: boolean;
}

/** What a giver adds over the current formation, per group, and a score to rank by. */
export function gains(current: Map<string, Contribution[]>, mine: Contribution[]): { score: number; list: Gain[]; fresh: number } {
  const list: Gain[] = [];
  let score = 0;
  let fresh = 0;
  for (const [key, cs] of byKey(mine)) {
    const cur = current.get(key) || [];
    const before = total(cur);
    const after = total([...cur, ...cs]);
    const best = cs.reduce((a, b) => (b.m > a.m ? b : a));
    const isNew = before <= 0 && after > 0;
    list.push({ key, before, after, best, isNew });
    if (after > before) {
      // the share of the new total she brings, new groups counting extra;
      // placement-bound ones a bit less, conditional ones half
      const rel = (after - before) / after;
      const near = cs.every((c) => c.near) ? 0.85 : 1;
      const sure = cs.some((c) => c.state === true) ? 1 : 0.5;
      score += near * sure * (rel + (isNew ? 0.5 : 0));
      if (isNew) fresh++;
    }
  }
  list.sort((a, b) => Number(b.after > b.before) - Number(a.after > a.before)
    || Number(b.isNew) - Number(a.isNew)
    || (b.after - b.before) / (b.after || 1) - (a.after - a.before) / (a.after || 1));
  return { score, list, fresh };
}

/** The variant that adds the most for the target. */
export function bestVariant(
  ur: UnitRows, giver: UnitIndexEntry, deployed: boolean, target: UnitIndexEntry, mode: Mode,
  current: Map<string, Contribution[]>, skillsOn: boolean,
): { v: Variant; contrib: Contribution[]; score: number; list: Gain[]; fresh: number } {
  let best: ReturnType<typeof bestVariant> | null = null;
  for (const v of variantsOf(ur, skillsOn)) {
    const contrib = reaching(ur, giver, v, deployed, target, mode);
    const g = gains(current, contrib);
    if (!best || g.score > best.score) best = { v, contrib, ...g };
  }
  return best!;
}
