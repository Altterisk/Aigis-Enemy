// Sentence templates for the unit page's "Readable" view, one per influence id.
// A template is a predicate phrase; the composer in UnitDetail supplies the
// recipient and the value text already computed by the row renderers.
//
// Placeholders:
//   {subj} / {Subj}  recipient as a subject ("it", "allies in range", ...)
//   {obj}            recipient as an object ("itself", "allies in range", ...)
//   {its}            possessive ("its", "their")
//   {of:X}           "its X" for self, "the X of allies in range" otherwise
//   {s} {is} {has}   verb agreement with {subj}
//   {v}              the row's value text (same text as the Game details view)
//   {by}             mul3 as a bare multiplier ("1.4", "1.4 (1.7 at max skill level)")
//   {pct}            mul3 as a percent ("70%", "70% (90% at max skill level)")
//   {name}           the influence label name
//   {add} {mul} {mul2} {p1}..{p4}  raw row fields
//   {secs:F}         frame field F (add, mul, mul2, mul3, p1..p4) as seconds ("0.5s")
//   {x:F}            field F divided by 100 ("1.3")
//   {rarity:F}       field F as a rarity name ("Silver")
//   {ref}            a referenced skill, by name when known ("Triple Shot (#3818)")
// A template may also be a function returning the phrase, null to drop the row,
// or undefined to fall back to "name: value".

export interface ProseCtx {
  target?: string | number;
  v: string | null;
  name: string;
  // raw skill-row fields
  mul?: number; mul2?: number; mul3?: number; mul3_cap?: number; add?: number;
  // raw ability-row fields
  params?: number[];
  invoke?: string | number;
  // raw skill-row expression (only read by ids in EXPR_PROSE)
  expression?: string;
  expressionHuman?: string;
  extend?: Record<string, unknown>;
  commandHuman?: string;
  // skill id -> name for skills shown on this page
  skillName?: (id: number) => string | undefined;
  // name of the skill/config the row references, when the page knows it
  ref?: string;
  // card id -> name for tokens shown on this page
  unitName?: (id: number) => string | undefined;
}

export type ProseTpl = string | ((c: ProseCtx) => string | null | undefined);

interface Recipient { subj: string; obj: string; plural: boolean }

const SELF: Recipient = { subj: "it", obj: "itself", plural: false };

const SKILL_RECIPIENT: Record<string, Recipient> = {
  self: SELF,
  nearby: { subj: "allies in range", obj: "allies in range", plural: true },
  all: { subj: "all allies", obj: "all allies", plural: true },
  enemy_in_range: { subj: "enemies in range", obj: "enemies in range", plural: true },
  all_enemy: { subj: "all enemies", obj: "all enemies", plural: true },
};

const ABILITY_RECIPIENT: Record<string, Recipient> = {
  self: SELF,
  all: { subj: "all allies", obj: "all allies", plural: true },
  "in range": { subj: "allies in range", obj: "allies in range", plural: true },
  "enemy in range": { subj: "enemies in range", obj: "enemies in range", plural: true },
};

export function recipient(ns: "skill" | "ability", target?: string | number): Recipient {
  const t = String(target ?? "self");
  const known = (ns === "skill" ? SKILL_RECIPIENT : ABILITY_RECIPIENT)[t];
  return known ?? { subj: `units of target "${t}"`, obj: `units of target "${t}"`, plural: true };
}

const mult = (v: number) => String(Math.round(v) / 100);

// rarity_id -> name, as the unit export pairs them
const RARITY_NAME: Record<number, string> = {
  0: "Iron", 1: "Bronze", 2: "Silver", 3: "Gold", 4: "Platinum", 5: "Black",
  7: "Sapphire", 10: "Platinum Hero", 11: "Black Hero",
};

export const secs = (frames: number) => `${Math.round((frames / 60) * 100) / 100}s`;

function field(c: ProseCtx, k: string): number | undefined {
  const p = k.match(/^p([1-4])$/);
  if (p) return c.params?.[Number(p[1]) - 1] ?? 0;
  return (c as unknown as Record<string, number | undefined>)[k];
}

function byText(c: ProseCtx): string {
  if (c.mul3 == null) return "?";
  return c.mul3_cap != null && c.mul3_cap !== c.mul3
    ? `${mult(c.mul3)} (${mult(c.mul3_cap)} at max skill level)`
    : mult(c.mul3);
}

function pctText(c: ProseCtx): string {
  if (c.mul3 == null) return "?%";
  return c.mul3_cap != null && c.mul3_cap !== c.mul3
    ? `${c.mul3}% (${c.mul3_cap}% at max skill level)`
    : `${c.mul3}%`;
}

export function applyProse(tpl: string, r: Recipient, c: ProseCtx): string {
  return tpl
    .replace(/\{Subj\}/g, r.subj.charAt(0).toUpperCase() + r.subj.slice(1))
    .replace(/\{subj\}/g, r.subj)
    .replace(/\{obj\}/g, r.obj)
    .replace(/\{its\}/g, r.plural ? "their" : "its")
    .replace(/\{of:([^}]+)\}/g, (_m, x) => (r === SELF ? `its ${x}` : `the ${x} of ${r.obj}`))
    .replace(/\{s\}/g, r.plural ? "" : "s")
    .replace(/\{is\}/g, r.plural ? "are" : "is")
    .replace(/\{has\}/g, r.plural ? "have" : "has")
    .replace(/\{v\}/g, c.v ?? "")
    .replace(/\{by\}/g, () => byText(c))
    .replace(/\{pct\}/g, () => pctText(c))
    .replace(/\{ref\}/g, () => (c.ref ? `${c.ref} (#${c.add})` : `skill #${c.add}`))
    .replace(/\{name\}/g, c.name)
    .replace(/\{rarity:(\w+)\}/g, (_m, k) => { const f = field(c, k); return f == null ? "?" : RARITY_NAME[f] ?? `rarity ${f}`; })
    .replace(/\{x:(\w+)\}/g, (_m, k) => { const f = field(c, k); return f == null ? "?" : mult(f); })
    .replace(/\{secs:(\w+)\}/g, (_m, k) => { const f = field(c, k); return f == null ? "?" : secs(f); })
    .replace(/\{(add|mul|mul2|mul3)\}/g, (_m, k: "add" | "mul" | "mul2" | "mul3") => String(c[k] ?? "?"))
    .replace(/\{p([1-4])\}/g, (_m, n) => String(c.params?.[Number(n) - 1] ?? 0))
    .replace(/\s+/g, " ")
    .trim();
}

// Skill ids whose template states the decoded tick_scale itself.
export const TICK_PROSE = new Set([173, 176, 177]);

// Skill ids whose template reads the extend itself (its key=value list is not appended).
export const EXTEND_PROSE = new Set([262, 267, 276]);

// Skill ids whose expression is the effect itself, not a recipient condition.
export const EXPR_PROSE = new Set([151, 156, 178, 193]);

// Skill influence id -> sentence template.
export const SKILL_PROSE: Record<number, ProseTpl> = {
  1: () => null,
  2: (c) => (c.target === "raise_morale" ? undefined : "multiplies {of:ATK} by {by}"),
  3: "multiplies {of:ATK} by {by}",
  4: (c) => (c.target === "raise_morale" ? undefined : "multiplies {of:DEF} by {by}"),
  5: "multiplies {of:DEF} by {by}",
  6: (c) => (c.mul3 != null ? "multiplies {of:range} by {by}" : c.mul === 0 && c.add ? "sets {of:range} to {add}" : undefined),
  7: "attacks {add} times in a row",
  8: "multiplies {of:attack's area of effect} by {by}",
  9: "{subj} dodge{s} attacks with a {pct} chance",
  10: "{subj} dodge{s} ranged attacks with a {pct} chance",
  11: "multiplies {of:max HP} by {by}",
  12: (c) => (!c.add ? "blocks no enemies" : c.add === 1 ? "blocks 1 enemy" : "blocks {add} enemies"),
  13: "hits up to {add} enemies at once in melee",
  14: "sets {of:PAD} {v}",
  19: (c) => {
    const mul = c.mul3 != null && (c.mul3 !== 100 || (c.mul3_cap ?? 100) !== 100);
    if (mul && c.add) return "multiplies {of:MR} by {by}, then adds {add}";
    if (mul) return "multiplies {of:MR} by {by}";
    return c.add ? "raises {of:MR} by {add}" : undefined;
  },
  21: "fires projectile #{add} as {its} attack",
  22: (c) => (c.mul === 0 ? "targets up to {add} units at once" : "targets {add} more units at once"),
  25: (c) => (c.add ? "extends the skill duration of {obj} by {add}s"
    : c.mul3 != null && c.mul3 !== 100 ? "sets the skill duration of {obj} to {pct} of normal" : undefined),
  30: "{its} attacks have a {add}% chance to kill instantly",
  31: "on activation, restores HP equal to {pct} of max HP to {obj}",
  32: (c) => (c.mul3 == null ? undefined : c.mul3_cap != null && c.mul3_cap !== c.mul3
    ? `generates {mul3} UP (${c.mul3_cap} at max skill level)` : "generates {mul3} UP"),
  33: "physical damage taken by {obj} is reduced by {pct}",
  34: "magic damage taken by {obj} is reduced by {pct}",
  35: "each attack restores {pct} of {its} max HP",
  36: "{of:HP} cannot drop to 0",
  37: "lowers {of:ATK} by {pct}",
  38: "{subj} deal{s} magic damage",
  39: "{subj} deal{s} true damage",
  40: (c) => (c.add != null ? "if {its} HP reaches 0, {subj} revive{s} once with {add}% HP"
    : c.mul3 != null ? "if {its} HP reaches 0, {subj} revive{s} once with {pct} HP" : undefined),
  41: "when the skill ends, {subj} {is} paralyzed",
  42: (c) => (c.mul3 == null ? undefined : "when the skill ends, {subj} lose{s} {pct} of {its} current HP"),
  44: "{subj} take{s} flight (collision switched)",
  45: (c) => (c.add ? "its attacks deal a fixed {add} damage" : "its attacks deal no damage"),
  46: "cures status ailments on {obj}",
  47: () => null,
  50: "activates automatically",
  91: "{subj} cannot be healed",
  93: "{subj} deal{s} physical damage",
  95: "its attacks deal damage equal to {add}% of the target's current HP",
  96: (c) => (!c.add ? undefined : c.add >= 99 ? "heals every ally in range at once" : "heals up to {add} allies at once"),
  98: (c) => (c.mul === 0 && c.add ? "{its} attacks have a {add}% chance to deal true damage" : undefined),
  100: "multiplies the HP {subj} recover{s} per attack by {by}",
  101: "when the skill ends, it reverts to the base skill",
  102: "defeating an enemy restores a token charge",
  103: "lowers {of:ATK} by {pct}",
  104: "lowers {of:DEF} by {pct}",
  105: "lowers {of:MR} by {pct}",
  106: "draws enemy ranged attacks to {obj}",
  107: "lasts for the rest of the battle",
  108: (c) => (c.mul3 == null ? undefined : "on activation, {subj} lose{s} {pct} of {its} current HP"),
  110: "its duration is not extended by skill-duration bonuses",
  115: "its attacks never finish off an enemy (they leave it at 1 HP)",
  116: (c) => (c.mul == null ? undefined : c.target === "self"
    ? "multiplies ally magic damage by {x:mul}" : "multiplies the magic damage of {obj} by {x:mul}"),
  118: (c) => (c.mul !== 0 ? undefined : `permanently sets {of:block count} to ${c.add ?? 0}`),
  120: (c) => (c.add === 1 ? "restores 1 token charge" : "restores {add} token charges"),
  122: () => null,
  124: "when the skill ends, restores HP equal to {pct} of max HP to {obj}",
  125: "when the skill ends, heals {obj}",
  133: "forces {obj} to retreat",
  134: "{subj} use{s} {its} skills automatically",
  137: "multiplies the enemy ATK reduction from its class trait or ability by {by}",
  138: "multiplies the enemy DEF reduction from its class trait or ability by {by}",
  139: "reduces the skill cooldown of {obj} by {add}%",
  140: (c) => (c.add == null ? undefined : c.add < 0
    ? `lowers the MR of all enemies by ${-c.add}` : "raises the MR of all enemies by {add}"),
  141: "permanently multiplies {of:ATK} by {by}",
  142: "permanently multiplies {of:DEF} by {by}",
  145: (c) => {
    const parts: string[] = [];
    if (c.mul3 != null && c.mul3 !== 100) parts.push("multiplies its ATK support to allies by {by}");
    if (c.add) parts.push("adds {add}% of its ATK to its ATK support to allies");
    return parts.length ? parts.join(" and ") : undefined;
  },
  146: (c) => {
    const parts: string[] = [];
    if (c.mul3 != null && c.mul3 !== 100) parts.push("multiplies its DEF support to allies by {by}");
    if (c.add) parts.push("adds {add}% of its DEF to its DEF support to allies");
    return parts.length ? parts.join(" and ") : undefined;
  },
  148: "resets the skill duration of {obj}",
  150: "{subj} can fly again",
  151: (c) => (c.expressionHuman ? `revives a dead or withdrawn ally (eligible: ${c.expressionHuman})` : "revives a dead or withdrawn ally"),
  153: (c) => (c.add == null ? undefined : "the revival takes {secs:add}"),
  155: "sets the share of damage its Lifelinker trait spreads to {add}%",
  156: (c) => (/PlayBgmBySkill\(/.test(c.expression ?? "") ? "plays its own battle music"
    : /CallEvent\(/.test(c.expression ?? "") ? "triggers stage event scripts" : undefined),
  159: "heals {obj} even if they normally cannot be healed",
  160: (c) => (c.target === "self" ? "if it falls, it counts as a retreat, not a death"
    : "{subj} that fall count as retreating, not dying"),
  161: (c) => (c.mul2 == null ? undefined : c.target === "self"
    ? "if it falls, it can be redeployed after {secs:mul2}" : "{subj} that fall can be redeployed after {secs:mul2}"),
  162: "the block counter triggers on every attack type, not just physical",
  163: "{subj} take{s} no damage",
  165: "fires projectile #{add} as {its} attack until the next skill use",
  166: (c) => (c.add ? "attacks {add} times in a row until the next skill use" : "resets its attack count until the next skill use"),
  167: (c) => (c.mul === 0 ? `permanently sets {of:target count} to ${c.add ?? 0}`
    : c.add ? "permanently raises {of:target count} by {add}" : undefined),
  169: "permanently sets the number of enemies it hits while blocking to {add}",
  170: (c) => (c.add == null ? undefined : "permanently sets {of:PAD} {v}"),
  171: "{subj} permanently deal{s} magic damage",
  173: (c) => {
    if (!c.add || !c.mul || c.mul2 == null) return undefined;
    const cap = c.mul3 != null ? " (cap {mul3})" : "";
    return c.add > 0 ? `{of:ATK} rises by {mul2} every {secs:mul}${cap}` : `{of:ATK} falls by {mul2} every {secs:mul}${cap}`;
  },
  176: (c) => {
    if (!c.add || !c.mul || c.mul2 == null) return undefined;
    const cap = c.mul3 != null ? " (cap {mul3})" : "";
    return c.add > 0 ? `{of:hit count} rises by {mul2} every {secs:mul}${cap}` : `{of:hit count} falls by {mul2} every {secs:mul}${cap}`;
  },
  177: (c) => {
    if (!c.add || !c.mul || c.mul2 == null) return undefined;
    const cap = c.mul3 != null ? " (cap {mul3})" : "";
    return c.add > 0 ? `{of:target count} rises by {mul2} every {secs:mul}${cap}` : `{of:target count} falls by {mul2} every {secs:mul}${cap}`;
  },
  178: (c) => (c.mul3 == null ? undefined : c.expressionHuman
    ? `transforms into a selected unit at {pct} of that unit's stats (eligible: ${c.expressionHuman})`
    : "transforms into a selected unit at {pct} of that unit's stats"),
  179: "the skill is excluded from automatic activation",
  183: "multiplies the max HP its cooking ability grants each second by {by}",
  184: "multiplies the ATK its cooking ability grants each second by {by}",
  185: "multiplies the DEF its cooking ability grants each second by {by}",
  187: "multiplies the instant-kill effect of its class trait or ability by {by}",
  193: "detonates its servant tokens, dealing magic damage and stopping nearby enemies",
  195: "attacks once, then stops attacking",
  204: "raises {of:ATK} by up to {pct}, scaling with the UP consumed",
  205: "raises {of:DEF} by up to {pct}, scaling with the UP consumed",
  206: "raises {of:MR} by up to {pct}, scaling with the UP consumed",
  214: "magic damage taken by {obj} is reduced by {pct}",
  215: "true damage taken by {obj} is reduced by {pct}",
  216: "physical damage taken by {obj} is reduced by {pct}",
  217: "lowers {of:ATK} by {pct}",
  226: "multiplies the effect of its Scholar debuff ability on {obj} by {by}",
  228: "multiplies {of:ATK} by {by}",
  229: "multiplies {of:DEF} by {by}",
  233: "multiplies the healing {subj} receive{s} by {by}",
  234: "further multiplies the healing {subj} receive{s} by {by}",
  235: "multiplies the damage {subj} take{s} by {by}",
  247: "the skill can be ended manually",
  196: "reduces the Deep Sea effect on {obj} by {add}%",
  200: "multiplies {of:range} by {by} (on top of other range buffs)",
  203: (c) => (c.name === "Max UP consumed for scaling buff"
    ? "consumes up to {add} UP when used; the buff scales with the UP spent"
    : "costs {add} UP to activate"),
  51: (c) => (c.add && c.mul ? `restores {add} HP to {obj} every {secs:mul} (${Math.round((c.add * 60) / c.mul)} HP/s)` : undefined),
  52: (c) => (c.mul == null ? undefined : "multiplies the UP it gains from defeating enemies by {x:mul}"),
  53: (c) => (c.add == null ? null : c.add >= 100
    ? "{subj} attack{s} every ground enemy around {obj}" : "{subj} {has} a {add}% chance to attack every ground enemy around {obj}"),
  54: "attacks against {obj} have a {add}% chance to be nullified",
  55: "the skill's changed mode persists after it ends, until the next skill use",
  56: (c) => (c.mul === 1000 ? "stops time for all enemies for {secs:mul2}"
    : c.mul === -1 ? "stops time for enemies within range for {secs:mul2}" : undefined),
  57: "when {subj} block{s} an enemy's attack, {subj} counter{s} with physical damage equal to {pct} of that enemy's ATK",
  58: "creates a damage field",
  59: (c) => (c.mul == null ? undefined : `lowers {of:MR} by ${100 - c.mul}%`),
  60: (c) => (c.mul == null ? undefined : `lowers {of:DEF} by ${100 - c.mul}%`),
  61: "{subj} cannot be targeted",
  64: "heals {obj} (amount based on its ATK)",
  65: "gradually generates UP (+{add} each tick)",
  71: (c) => (c.mul == null ? undefined : "its attacks heal allies in range for {mul}% of the damage dealt"),
  72: (c) => {
    if (c.mul === 0) return c.add ? "sets the activation chance of its multi-hit ability to {add}%" : undefined;
    const parts: string[] = [];
    if (c.mul3 != null && c.mul3 !== 100) parts.push("multiplies the activation chance of its multi-hit ability by {by}");
    if (c.add) parts.push(parts.length ? "adds {add} percentage points" : "raises the activation chance of its multi-hit ability by {add} percentage points");
    return parts.length ? parts.join(", then ") : undefined;
  },
  75: "enemies it defeats drop gold with a {add}% chance",
  76: "its class's forced action is removed",
  77: (c) => {
    const parts: string[] = [];
    if (c.mul3 != null && c.mul3 !== 100) parts.push("multiplies the activation chance of its critical-hit ability by {by}");
    if (c.add) parts.push(parts.length ? "adds {add} percentage points" : "raises the activation chance of its critical-hit ability by {add} percentage points");
    return parts.length ? parts.join(", then ") : undefined;
  },
  79: (c) => (c.mul === 0 ? (c.add ? "sets the activation chance of its ability's special effect to {add}%" : undefined)
    : c.mul3 != null && c.mul3 !== 100 ? "multiplies the activation chance of its ability's special effect by {by}" : undefined),
  81: (c) => (!c.add ? undefined : c.mul === 0
    ? "{its} attacks have a {add}% chance to deal true damage"
    : "raises {its} chance to deal true damage by {add}%"),
  83: "permanently multiplies {of:max HP} by {by}",
  84: (c) => (c.mul == null ? undefined : c.mul === 0 ? "sets the deployment cost of {obj} to 0" : "sets the deployment cost of {obj} to {mul}% of normal"),
  85: (c) => (c.add == null ? undefined : c.mul3 != null
    ? "multiplies the ATK of all {rarity:add} allies by {by}" : "buffs the ATK of all {rarity:add} allies"),
  86: (c) => (c.mul == null || c.add == null ? undefined : "when the skill ends, all {rarity:add} allies lose {mul}% of their HP"),
  87: (c) => (c.add == null ? undefined : c.mul3 != null
    ? "multiplies the DEF of all {rarity:add} allies by {by}" : "buffs the DEF of all {rarity:add} allies"),
  88: (c) => {
    if (!c.add) return undefined;
    const n = Math.ceil(6000 / c.add);
    return `{its} attacks build up paralysis ({add} per hit; paralyzes after ${n} hit${n === 1 ? "" : "s"}, before resistance)`;
  },
  89: "multiplies {of:ATK} by {by}",
  90: "multiplies {of:DEF} by {by}",
  49: (c) => (c.add ? "after use, the skill becomes {ref}" : "can be used only once; no skill remains after it ends"),
  248: "multiplies the cap of its song max-HP support by {by}",
  249: "multiplies the cap of its song ATK support by {by}",
  250: "multiplies the cap of its song DEF support by {by}",
  251: "multiplies the cap of its song MR support by {by}",
  252: (c) => (c.add == null ? undefined : c.add < 0
    ? `shortens the interval of its song max-HP support growth by ${secs(-c.add)}` : "lengthens the interval of its song max-HP support growth by {secs:add}"),
  253: (c) => (c.add == null ? undefined : c.add < 0
    ? `shortens the interval of its song ATK support growth by ${secs(-c.add)}` : "lengthens the interval of its song ATK support growth by {secs:add}"),
  254: (c) => (c.add == null ? undefined : c.add < 0
    ? `shortens the interval of its song DEF support growth by ${secs(-c.add)}` : "lengthens the interval of its song DEF support growth by {secs:add}"),
  255: (c) => (c.add == null ? undefined : c.add < 0
    ? `shortens the interval of its song MR support growth by ${secs(-c.add)}` : "lengthens the interval of its song MR support growth by {secs:add}"),
  257: "raises the share of its token's ATK added to its parent unit by {add} percentage points",
  258: "raises the share of its token's DEF added to its parent unit by {add} percentage points",
  262: (c) => (c.add == null ? undefined : c.extend?.["種別"] === "高効果優先"
    ? "gives {obj} a barrier that blocks up to {add} damage (the stronger barrier is kept)"
    : "gives {obj} a barrier that blocks up to {add} damage"),
  263: "consumes UP gradually while active ({add} each tick)",
  264: "multiplies {of:ATK} by {by} while UP is being consumed",
  267: (c) => {
    const next = Number(c.extend?.["切り替わりスキルリスト"]);
    const step = Number(c.extend?.["段階切り替わりフレーム"]);
    if (!next) return undefined;
    const name = c.skillName?.(next);
    const target = name ? `${name} (#${next})` : `skill #${next}`;
    return `holding the skill charges it into ${target}${step ? `; each charge step takes ${secs(step)}` : ""}`;
  },
  268: "{subj} stop{s} making normal attacks",
  276: (c) => (c.extend?.["天候"] ? `overwrites the current weather with ${String(c.extend["天候"])} while the skill lasts` : undefined),
};

// Ability ids whose template reads the command itself (it is not appended as a condition).
export const COMMAND_PROSE = new Set<number>([86, 87, 108, 109, 110, 111, 138, 174, 193, 263, 297, 302, 327]);

// Ability ids whose template reads the extend itself (its key=value list is not appended).
export const ABILITY_EXTEND_PROSE = new Set<number>([17, 148, 150, 151, 152, 180, 191, 201, 204, 205, 261, 275, 304, 305, 306, 307]);

// Ability influence id -> sentence template.
export const ABILITY_PROSE: Record<number, ProseTpl> = {
  1: (c) => (!c.params?.[0] ? undefined : (c.params[1] ?? 100) >= 100
    ? "attacks with {x:p1}x ATK" : "attacks with {x:p1}x ATK with a {p2}% chance"),
  8: (c) => (c.params?.[2] ? "has a {p1}% chance to deal {x:p2}x damage ({p3} percentage points more during its skill)" : "has a {p1}% chance to deal {x:p2}x damage"),
  9: (c) => (c.params?.[2] ? "has a {p1}% chance to heal {x:p2}x ({p3} percentage points more during its skill)" : "has a {p1}% chance to heal {x:p2}x"),
  10: (c) => {
    const v = c.params?.[0];
    return !v ? undefined : v > 0 ? "lowers its deployment cost by {p1}" : `raises its deployment cost by ${-v}`;
  },
  11: "multiplies the ATK and HP of enemies by {x:p1}",
  12: (c) => {
    if (c.invoke === "default") return undefined;
    if (c.invoke !== "inherent" || c.target !== "self") return c.params?.[0] ? "raises {of:max HP} by {p1}%" : undefined;
    return c.params?.[0] ? "multiplies {of:max HP} by {x:p1}" : "sets {of:max HP} to 0";
  },
  13: (c) => {
    if (c.invoke !== "inherent" || c.target !== "self") return c.params?.[0] ? "raises {of:ATK} by {p1}%" : undefined;
    return c.params?.[0] ? "multiplies {of:ATK} by {x:p1}" : "sets {of:ATK} to 0";
  },
  14: (c) => {
    if (c.invoke === "default") return undefined;
    if (c.invoke !== "inherent" || c.target !== "self") return c.params?.[0] ? "raises {of:DEF} by {p1}%" : undefined;
    return c.params?.[0] ? "multiplies {of:DEF} by {x:p1}" : "sets {of:DEF} to 0";
  },
  15: (c) => {
    const v = c.invoke === "while in the 1st barrack" ? c.params?.[1] : c.params?.[0];
    return v ? `raises {of:MR} by ${v}` : undefined;
  },
  16: "multiplies the skill duration of {obj} by {x:p1}",
  17: (c) => {
    const pct = c.params?.[0], flat = c.params?.[1];
    if (!pct && !flat) return "heals {obj} (amount based on its ATK)";
    return `heals {obj} for ${[pct ? "{p1}% of max HP" : "", flat ? "{p2} HP" : ""].filter(Boolean).join(" plus ")}`;
  },
  18: "after attacking, has a {p1}% chance to attack again with no PAD",
  19: "attacks against {obj} have a {p1}% chance to be nullified",
  20: "{subj} dodge{s} physical attacks with a {p1}% chance",
  21: (c) => {
    const v = c.params?.[0] || c.params?.[1];
    return !v ? undefined : v > 0 ? `raises {of:range} by ${v}` : `lowers {of:range} by ${-v}`;
  },
  22: (c) => (!c.params?.[0] ? "its attacks have a base 0% chance to deal true damage, raised by skills"
    : c.params[0] >= 100 ? "its attacks deal true damage" : "its attacks have a {p1}% chance to deal true damage"),
  23: "its attacks have a {p1}% chance to kill instantly",
  24: (c) => (c.params?.[0] ? "enemies it defeats drop gold with a {p1}% chance" : undefined),
  25: "prioritizes attacking an enemy",
  26: (c) => ((c.params?.[0] ?? 0) >= 100 ? "each attack hits {p2} times, {secs:p3} apart" : "has a {p1}% chance to hit {p2} times in one attack, {secs:p3} apart"),
  27: (c) => (c.params?.[1] ? "lowers its deployment cost by {p2} during bad weather" : null),
  28: (c) => {
    const p2 = c.params?.[1];
    if (p2 == null) return undefined;
    return p2 === 100 ? "{of:ATK} is not reduced by bad weather"
      : p2 > 100 ? `{of:ATK} rises by ${p2 - 100}% during bad weather` : `{of:ATK} falls by ${100 - p2}% during bad weather`;
  },
  29: (c) => {
    const p2 = c.params?.[1];
    if (p2 == null) return undefined;
    return p2 === 100 ? "{of:range} is not reduced by bad weather"
      : p2 > 100 ? `{of:range} rises by ${p2 - 100}% during bad weather` : `{of:range} falls by ${100 - p2}% during bad weather`;
  },
  30: "restores {p1} HP to {obj} every {secs:p2}",
  32: (c) => (c.params?.[0] === 2 && c.params[2] ? "while its skill is active, multiplies its regeneration by {x:p3}" : undefined),
  33: "the battle starts with {p1} extra UP",
  34: (c) => (c.params?.[0] == null ? undefined : c.params[0] === 100 ? "{subj} {is} immune to status ailments" : "status ailments on {obj} are reduced by {p1}%"),
  35: "multiplies its instant-kill chance by {x:p1}",
  36: "each attack restores {p1}% of its max HP",
  37: "heals all allies, itself included, for {p1}% of the damage it takes",
  38: "an enemy it leaves at {p1}% HP or less after an attack dies instantly",
  39: (c) => (c.params?.[0] === 3 ? "its attack-nullify effect works only while it is not using its skill" : undefined),
  40: "reduces terrain effects on {obj} by {p1}%",
  45: "reduces the skill cooldown of {obj} by {p1}%",
  47: "retreating refunds {p1}% of its deployment cost",
  48: "adds {p1} percentage points to its instant-kill chance",
  49: "below {p1}% HP, raises its DEF by up to {p2}% as HP falls",
  50: "nearby allies recover from status ailments {x:p1}x faster",
  51: "{subj} that fall count as retreating, not dying",
  55: "can hold {p1} more tokens",
  56: (c) => ((c.params?.[0] ?? 0) >= 100 ? "attacks every ground enemy around it (area {p3})" : "has a {p1}% chance to attack every ground enemy around it (area {p3})"),
  57: "raises the drop rate of affection gifts by {p1}%",
  58: "raises the drop rate of trust gifts by {p1}%",
  59: "raises the drop rate of demon crystals by {p1}%",
  60: "raises the drop rate of armor units by {p1}%",
  61: "raises the drop rate of spirits by {p1}%",
  62: (c) => (c.params?.[0] ? "sets the first-use skill timer of {obj} to {p1}% of normal" : "sets the first-use skill timer of {obj} to 0"),
  65: "{subj} cannot be healed",
  66: (c) => (c.params?.[0] === 100 && c.params[1] ? "it can be redeployed after {secs:p2}" : undefined),
  67: "when its HP reaches 0 it stays in place and revives, regenerating {p1} HP every {secs:p2}",
  69: "raises the deployment cost of {obj} by {p1}",
  70: "raises {of:ATK} by {p1}%",
  71: "raises {of:DEF} by {p1}%",
  72: (c) => (c.v ? "{v}" : undefined),
  73: "reduces the Makai effect on {obj} by {p1}%",
  74: "reduces the Makai effect on {obj} by {p1}%",
  75: "reduces the Makai effect on {obj} by {p1}%",
  76: (c) => {
    const v = c.invoke === "deployed" ? c.params?.[1] : c.invoke === "sortie" ? c.params?.[0] : undefined;
    return v ? `raises {of:MR} by ${v}` : undefined;
  },
  77: "restores {p1} HP to {obj} every {secs:p2}",
  78: "raises the gold reward for clearing the mission by {p1}%",
  79: (c) => (c.params?.[1] ? "raises the drop rate of {rarity:p2} units by {p1}%" : "raises the drop rate of units by {p1}%"),
  80: "raises the drop rate of non-unit items by {p1}%",
  81: "lowers the deployment cost of {obj} by {p1}",
  82: "raises {of:max HP} by {p1}%",
  83: "multiplies {of:ATK} by {x:p1} (not shown in the stat display)",
  84: "multiplies {of:DEF} by {x:p1} (not shown in the stat display)",
  85: (c) => (c.params?.[0] != null && (c.params[1] ?? 100) === 100 ? "{subj} take{s} {p1}% of normal damage" : undefined),
  86: (c) => `when an ally${c.commandHuman ? ` (where ${c.commandHuman})` : ""} would die, it retreats in that ally's place and the ally revives at full HP`,
  87: (c) => (!c.params?.[0] ? undefined : c.commandHuman
    ? `raises the max HP of allies by {p1}% (only units where ${c.commandHuman})` : "raises the max HP of allies by {p1}%"),
  88: "raises the gold that Gold GET! effects give by {p1}%",
  89: "its attacks lower the target's ATK by {p1}% for {secs:p2}",
  90: "its attacks lower the target's DEF by {p1}% for {secs:p2}",
  91: "lowers {of:PAD} by {p1}%",
  92: (c) => (!c.params?.[1] ? undefined : (c.params[0] ?? 0) >= 100 ? "attacks up to {p2} targets at once" : "has a {p1}% chance to attack up to {p2} targets at once"),
  97: "its first {p1} deployments do not count toward the deployment limit",
  98: (c) => {
    if (!c.params?.[1]) return undefined;
    return c.params[0] ? "{subj} lose{s} {p1} HP every {secs:p2}" : c.params[2] ? "{subj} lose{s} {p3}% HP every {secs:p2}" : undefined;
  },
  99: (c) => (c.params?.[0] ? "used as synthesis material, it gives {p1} skill EXP" : undefined),
  102: "it cannot be sold",
  104: "used as synthesis material, it gives {p1} cost-reduction EXP",
  105: "owning it raises synthesis EXP by {p1}%",
  106: (c) => {
    const parts: string[] = [];
    if (c.params?.[0] != null && c.params[0] !== 100) parts.push("sets its deployment cost to {p1}% of normal");
    if (c.params?.[1]) parts.push(parts.length ? "lowers it by {p2}" : "lowers its deployment cost by {p2}");
    return parts.length ? parts.join(" and ") : undefined;
  },
  107: (c) => (c.params?.[0] === 100 ? "{subj} {is} immune to bad-weather effects" : undefined),
  108: (c) => {
    if (!c.params?.[0]) return undefined;
    const area = c.target === "all" ? "all" : "in range";
    const extra = c.params[1] ? " and of allies by {p2}%" : "";
    return c.commandHuman === "it is an enemy unit"
      ? `lowers the ATK of enemies ${area} by {p1}%${extra}`
      : `lowers the ATK of units ${area} by {p1}%${extra}${c.commandHuman ? ` (only units where ${c.commandHuman})` : ""}`;
  },
  109: (c) => {
    if (!c.params?.[0]) return undefined;
    const area = c.target === "all" ? "all" : "in range";
    const extra = c.params[1] ? " and of allies by {p2}%" : "";
    return c.commandHuman === "it is an enemy unit"
      ? `lowers the DEF of enemies ${area} by {p1}%${extra}`
      : `lowers the DEF of units ${area} by {p1}%${extra}${c.commandHuman ? ` (only units where ${c.commandHuman})` : ""}`;
  },
  110: (c) => (c.commandHuman ? `gains {p1}% ATK for each deployed unit where ${c.commandHuman} (cap {p2}%)` : undefined),
  111: (c) => (c.commandHuman ? `gains {p1}% DEF for each deployed unit where ${c.commandHuman} (cap {p2}%)` : undefined),
  112: "{of:ATK} is not lowered in Makai",
  113: "{of:DEF} is not lowered in Makai",
  114: "{of:MR} is not lowered in Makai",
  115: (c) => (c.params?.[0] ? "adds {p1}% of its ATK to {obj}" : "adds 0% of its ATK to {obj}, raised by skills"),
  116: (c) => (c.params?.[0] ? "adds {p1}% of its DEF to {obj}" : "adds 0% of its DEF to {obj}, raised by skills"),
  117: "its attacks cannot be reflected or countered",
  118: "reduces its skill cooldown by {p1}%",
  119: "lowers the HP of enemies by {p1}%",
  120: "lowers the ATK of enemies by {p1}%",
  121: "lowers the DEF of enemies by {p1}%",
  122: (c) => {
    const pct = c.params?.[0], flat = c.params?.[1];
    if (pct && flat) return "lowers the MR of enemies by {p1}%, then by {p2}";
    return pct ? "lowers the MR of enemies by {p1}%" : flat ? "lowers the MR of enemies by {p2}" : undefined;
  },
  124: "allied ranged attacks prioritize the enemies it blocks",
  125: "enemy ranged attacks cannot target {obj}",
  127: "raises {of:block count} by {p1}",
  128: "{subj} deal{s} magic damage",
  129: "takes {p1}% of the damage dealt to allies in range onto itself",
  130: "spreads {p1}% of the damage taken by {obj} across all of them",
  132: "owning it raises the EXP reward for clearing missions by {p1}%",
  133: (c) => (c.params?.[0] ? "the deployment spot lasts {secs:p1}" : "acts as a deployment spot"),
  134: (c) => {
    const parts: string[] = [];
    if (c.params?.[0] && c.params[0] !== 100) parts.push("multiplies the max HP of the unit placed on it by {x:p1}");
    if (c.params?.[1]) parts.push(parts.length ? "adds {p2}" : "adds {p2} max HP to the unit placed on it");
    return parts.length ? parts.join(", then ") : undefined;
  },
  135: (c) => {
    const parts: string[] = [];
    if (c.params?.[0] && c.params[0] !== 100) parts.push("multiplies the ATK of the unit placed on it by {x:p1}");
    if (c.params?.[1]) parts.push(parts.length ? "adds {p2}" : "adds {p2} ATK to the unit placed on it");
    return parts.length ? parts.join(", then ") : undefined;
  },
  136: (c) => {
    const parts: string[] = [];
    if (c.params?.[0] && c.params[0] !== 100) parts.push("multiplies the DEF of the unit placed on it by {x:p1}");
    if (c.params?.[1]) parts.push(parts.length ? "adds {p2}" : "adds {p2} DEF to the unit placed on it");
    return parts.length ? parts.join(", then ") : undefined;
  },
  137: (c) => {
    const parts: string[] = [];
    if (c.params?.[0] && c.params[0] !== 100) parts.push("multiplies the MR of the unit placed on it by {x:p1}");
    if (c.params?.[1]) parts.push(parts.length ? "adds {p2}" : "adds {p2} MR to the unit placed on it");
    return parts.length ? parts.join(", then ") : undefined;
  },
  138: (c) => (c.commandHuman && c.commandHuman !== "1" ? `cannot be combined with units where ${c.commandHuman}` : "cannot be combined with other units"),
  145: "targets every enemy in its attack area",
  148: "only one unit of its class can be in the team",
  149: "moves its main unit to this token's position",
  150: (c) => {
    const every = Number(c.extend?.["Interval"]), add = Number(c.extend?.["Add"]), max = Number(c.extend?.["Max"]);
    return every && add ? `raises {of:max HP} by ${add} every ${secs(every)}${max ? ` (up to ${max})` : ""}` : undefined;
  },
  151: (c) => {
    const every = Number(c.extend?.["Interval"]), add = Number(c.extend?.["Add"]), max = Number(c.extend?.["Max"]);
    return every && add ? `raises {of:ATK} by ${add} every ${secs(every)}${max ? ` (up to ${max})` : ""}` : undefined;
  },
  152: (c) => {
    const every = Number(c.extend?.["Interval"]), add = Number(c.extend?.["Add"]), max = Number(c.extend?.["Max"]);
    return every && add ? `raises {of:DEF} by ${add} every ${secs(every)}${max ? ` (up to ${max})` : ""}` : undefined;
  },
  153: "enemies in range that fall below {p1}% HP are killed by the next hit from it or an ally",
  154: () => null,
  155: (c) => {
    const d = (c.params?.[0] ?? 100) - 100;
    return !d ? undefined : d > 0 ? `each time it dies, {of:max HP} rises by ${d}%` : `each time it dies, {of:max HP} falls by ${-d}%`;
  },
  156: (c) => {
    const d = (c.params?.[0] ?? 100) - 100;
    return !d ? undefined : d > 0 ? `each time it dies, {of:ATK} rises by ${d}%` : `each time it dies, {of:ATK} falls by ${-d}%`;
  },
  157: (c) => {
    const d = (c.params?.[0] ?? 100) - 100;
    return !d ? undefined : d > 0 ? `each time it dies, {of:DEF} rises by ${d}%` : `each time it dies, {of:DEF} falls by ${-d}%`;
  },
  158: (c) => {
    const d = (c.params?.[0] ?? 100) - 100;
    return !d ? undefined : d > 0 ? `each time it dies, {of:MR} rises by ${d}%` : `each time it dies, {of:MR} falls by ${-d}%`;
  },
  159: () => null,
  160: (c) => (c.params?.[0] ? "permanently gains {p1}% max HP per count" : c.params?.[1] ? "permanently gains {p2} max HP per count" : undefined),
  161: (c) => (c.params?.[0] ? "permanently gains {p1}% ATK per count" : c.params?.[1] ? "permanently gains {p2} ATK per count" : undefined),
  162: (c) => (c.params?.[0] ? "permanently gains {p1}% DEF per count" : c.params?.[1] ? "permanently gains {p2} DEF per count" : undefined),
  163: (c) => (c.params?.[0] ? "permanently gains {p1}% MR per count" : c.params?.[1] ? "permanently gains {p2} MR per count" : undefined),
  164: (c) => (c.params?.[0] ? "permanently gains {p1}% max HP per count" : c.params?.[1] ? "permanently gains {p2} max HP per count" : undefined),
  165: (c) => (c.params?.[0] ? "permanently gains {p1}% ATK per count" : c.params?.[1] ? "permanently gains {p2} ATK per count" : undefined),
  166: (c) => (c.params?.[0] ? "permanently gains {p1}% DEF per count" : c.params?.[1] ? "permanently gains {p2} DEF per count" : undefined),
  167: (c) => (c.params?.[0] ? "permanently gains {p1}% MR per count" : c.params?.[1] ? "permanently gains {p2} MR per count" : undefined),
  168: "when its skill ends, restores {p1}% of its HP",
  169: "generates {p1} UP when its skill activates",
  170: "while its skill is active, generates {p2} UP every {secs:p1}",
  171: "multiplies the healing it gives by {x:p1}",
  172: "when it uses its skill, heals its tokens for {p1}% of their HP",
  173: "{subj} deal{s} magic damage",
  174: (c) => (c.commandHuman ? `multiplies the healing it gives by {x:p1} (to allies where ${c.commandHuman})` : "multiplies the healing it gives by {x:p1}"),
  175: "marks enemies with its token so they become targets",
  176: "reduces the Deep Sea effect on {obj} by {p1}%",
  177: "multiplies {of:ATK} by {x:p1} in Deep Sea",
  178: "multiplies {of:DEF} by {x:p1} in Deep Sea",
  180: (c) => {
    const m = Number(c.extend?.["ダメージ倍率"]);
    return m ? `attacks as it moves, dealing ${m / 100}x ATK` : undefined;
  },
  181: "reduces the Tenkai effect on {obj} by {p1}%",
  182: "reduces the Tenkai effect on {obj} by {p1}%",
  183: "reduces the Tenkai effect on {obj} by {p1}%",
  184: "{subj} {is} immune to Tenkai effects",
  185: "{subj} {is} immune to Tenkai effects",
  186: "{subj} {is} immune to Tenkai effects",
  188: (c) => (c.params?.[0] ? "gains a ranged attack with range {p1} (projectile #{p2})" : undefined),
  189: "grants {obj} the effects of ability config #{p1}",
  190: (c) => (c.params?.[0] === 100 ? "each attack hits {p2} times, {secs:p3} apart" : undefined),
  191: (c) => {
    const every = Number(c.extend?.["間隔"]), gain = Number(c.extend?.["上昇"]);
    const cap = Number(c.extend?.["上限"]), decay = Number(c.extend?.["減衰"] ?? 0);
    if (!every || !gain) return undefined;
    const inverted = !!c.extend?.["増減反転"];
    const base = `${inverted ? "after each attack" : "while not attacking"}, {of:ATK} rises by ${gain / 100}% every ${secs(every)}${cap ? ` (cap ${cap / 100}%)` : ""}`;
    if (!decay) return base;
    return inverted ? `${base}, with a ${decay / 100}% decay` : `${base}, and attacking lowers it by ${decay / 100}%`;
  },
  192: "allied ranged attacks prioritize enemies in its range",
  193: (c) => {
    if (!c.params?.[0]) return undefined;
    const foes = c.target === "all" ? "all enemies" : "enemies in range";
    return c.params[1] ? `lowers the MR of ${foes} by {p1}% and of allies by {p2}%` : `lowers the MR of ${foes} by {p1}%`;
  },
  194: "raises {of:ATK} by {p1}",
  195: "raises {of:DEF} by {p1}",
  196: "raises {of:MR} by {p1}",
  197: "multiplies {of:ATK} by {x:p1}",
  198: "multiplies {of:DEF} by {x:p1}",
  199: "multiplies {of:MR} by {x:p1}",
  200: "on deployment, gains a barrier that blocks up to {p2} damage",
  201: (c) => {
    const d = Number(c.extend?.["ディレイ"]);
    return d ? `retreats automatically when its skill ends and can be redeployed after ${secs(d)}` : "retreats automatically when its skill ends";
  },
  203: "its skills have no initial wait and no cooldown between them",
  204: (c) => {
    const kind = String(c.extend?.["種別"] ?? "");
    const pct = Number(c.extend?.["効果割合"] ?? 0), flat = Number(c.extend?.["効果固定量"] ?? 0);
    const time = Number(c.extend?.["効果時間"] ?? 0), range = Number(c.extend?.["射程"] ?? 0);
    const tail = `${time ? ` for ${secs(time)}` : ""}${range ? ` (range ${range})` : ""}`;
    if (kind === "リジェネ") {
      const every = Number(c.extend?.["インターバル"] ?? 0);
      return flat && every ? `restores ${flat} HP every ${secs(every)}${tail}` : undefined;
    }
    const stat = ({ "攻撃力": "ATK", "防御力": "DEF", "魔法耐性": "MR", "移動速度": "movement speed" } as Record<string, string>)[kind.replace(/(上昇|低下)$/, "")];
    if (!stat || (!pct && !flat)) return undefined;
    const up = kind.endsWith("上昇");
    const owner = c.extend?.["自身含む"] ? "its " : "";
    const amount = [pct ? `${pct}%` : "", flat ? String(flat) : ""].filter(Boolean).join(" and ");
    return `${up ? "raises" : "lowers"} ${owner}${stat} by ${amount}${tail}`;
  },
  205: (c) => {
    const stat = ({ "攻撃力": "ATK", "防御力": "DEF", "魔法耐性": "MR" } as Record<string, string>)[String(c.extend?.["種別"])];
    return stat ? `lowers the ${stat} of enemies by {p1}%, rising by {p2} points every {secs:p3} up to {p4}%` : undefined;
  },
  206: (c) => (c.params?.length ? `can deploy alternative units (${c.params.filter(Boolean).map((p) => `#${p}`).join(", ")})` : undefined),
  207: "permanently multiplies {of:max HP} by {x:p1}",
  210: "its hits alternate damage type",
  211: "shortens its skill cooldown by {secs:p1} per count",
  212: "extends its skill duration by {secs:p1} per count",
  213: "enemy ranged attacks target it with lower priority",
  214: "used as synthesis material on a {rarity:p2} unit, it gives {x:p1}x EXP",
  215: "adds a team restriction (some classes cannot be in the same team)",
  216: "its tokens can be used without deploying it",
  217: "when its skill activates, gains a barrier that blocks up to {p1} damage",
  219: "other units can be placed on it",
  220: "multiplies the healing {subj} receive{s} by {x:p1}",
  221: (c) => {
    const foes = c.target === "all" ? "all enemies" : "enemies in range";
    return c.params?.[0] && c.params[0] !== 100 ? `multiplies the damage ${foes} take by {x:p1}` : `marks ${foes} to take more damage (raised by its skills)`;
  },
  222: (c) => (c.params?.[0] ? "separately from its own attacks, fires at {p2} targets every {secs:p1} for {p4}% of its ATK" : undefined),
  223: "raises {of:ATK} by {p1}%",
  224: "raises {of:DEF} by {p1}%",
  225: "raises {of:MR} by {p1}%",
  226: "{subj} attack{s} with {x:p1}x ATK",
  228: "{subj} dodge{s} physical attacks with a {p1}% chance",
  229: "{its} attacks have a {p1}% chance to deal true damage",
  230: "{its} attacks lower the target's ATK by {p1}% for {secs:p2}",
  231: "{its} attacks lower the target's DEF by {p1}% for {secs:p2}",
  232: "gives {obj} a barrier that blocks up to {p2} damage",
  233: "lowers the deployment cost of {obj} by {p1}",
  234: "raises {of:max HP} by {p1}%",
  236: "another unit can be deployed on it to pilot it, adding that unit's stats to its own",
  237: "multiplies {of:ATK} by {x:p1}",
  238: "multiplies {of:DEF} by {x:p1}",
  240: "sets {of:PAD} to {secs:p1}",
  241: "adds {p1}% of the pilot's max HP to its own",
  242: "adds {p1}% of the pilot's ATK to its own",
  243: "adds {p1}% of the pilot's DEF to its own",
  244: "adds {p1}% of the pilot's MR to its own",
  249: "sets the first-use skill timer of {obj} to {p1}% of normal",
  250: "defeating an enemy has a {p2}% chance to give {p1} UP",
  251: "{its} attacks have a {p2}% chance to restore {p1}% of max HP",
  258: "each attack hits {p1} times in one animation",
  260: "raises {of:range} by {p1}",
  261: (c) => {
    const school = ({ "物理": "physical", "魔法": "magic", "貫通": "true" } as Record<string, string>)[String(c.extend?.["反撃攻撃属性"])];
    // 最終ダメージ値を対象に: the counter is a share of the damage it actually took
    const base = Number(c.extend?.["最終ダメージ値を対象に"]) ? "of the damage it takes" : "of their ATK";
    // 射程範囲内のみ: ranged attackers are countered too, from any distance
    const ranged = Number(c.extend?.["射程範囲内のみ"]) ? " (ranged ones from any distance too)" : "";
    return `counters attackers${ranged} for {p1}% ${base} as ${school ?? "normal"} damage`;
  },
  262: "generates {p1} UP every {secs:p2}",
  263: (c) => (c.commandHuman ? `sets the deployment cost of units where ${c.commandHuman} to {p1}% of normal` : "sets the deployment cost of all units to {p1}% of normal"),
  264: (c) => (c.params?.[0] ? "takes no damage from hits of {p1} or less" : undefined),
  265: "gains {p1}% max HP for each enemy it blocks",
  266: "gains {p1}% ATK for each enemy it blocks",
  267: "gains {p1}% DEF for each enemy it blocks",
  268: "gains {p1}% MR for each enemy it blocks",
  271: "raises the damage of {its} on-death explosion by {p1}%",
  272: "restores {p1} HP to {obj} every {secs:p2}",
  273: "reduces the skill cooldown of {obj} by {p1}%",
  274: "draws enemy ranged attacks to itself",
  275: (c) => {
    const e = c.extend ?? {};
    const gains = ([["攻撃力加算値", "ATK"], ["防御力加算値", "DEF"], ["魔法耐性加算値", "MR"], ["射程加算値", "range"]] as const)
      .filter(([k]) => Number(e[k])).map(([k, n]) => `+${Number(e[k])} ${n}`);
    if (!gains.length) return undefined;
    const time = Number(e["持続時間"]);
    const pri = ({ "防御力": "DEF", "攻撃力": "ATK", "最大HP": "max HP" } as Record<string, string>)[String(e["優先対象"])];
    const order = e["優先方向"] === "降順" ? "highest" : "lowest";
    return `allies it supports gain ${gains.join(" and ")}${time ? ` for ${secs(time)}` : ""}${pri ? ` (it prioritizes the ${order} ${pri})` : ""}`;
  },
  276: (c) => (c.params?.[0] === 100 ? "{subj} {is} immune to status ailments" : "status ailments on {obj} are reduced by {p1}%"),
  277: "restores {p1} HP to allies in range every {secs:p3}",
  279: "gains {p1}% ATK for each ally in its range (cap {p2}%)",
  280: "gains {p1}% DEF for each ally in its range (cap {p2}%)",
  282: "its attacks lower the target's MR by {p1}% for {secs:p2}",
  283: "{subj} dodge{s} ranged attacks with a {p1}% chance",
  284: "each dodged attack raises its max HP by {p1}% (cap {p3}%)",
  285: "each dodged attack raises its ATK by {p1}% (cap {p3}%)",
  286: "each dodged attack raises its DEF by {p1}% (cap {p3}%)",
  287: "each dodged attack raises its MR by {p2} (cap {p4})",
  288: "{its} attacks lower the target's MR by {p1}% for {secs:p2}",
  289: "{its} attacks make the target take {x:p1}x damage for {secs:p2}",
  290: "heals its tokens for {p1}% of the damage it deals",
  291: "while their skill is active, lowers {of:PAD} by {p1}%",
  292: "when their skill ends, {subj} recover {p1}% of max HP",
  294: "raises {of:ATK} by {p1}% for every {p2} HP it loses (counting up to {p3} HP lost)",
  295: "raises {of:DEF} by {p1}% for every {p2} HP it loses (counting up to {p3} HP lost)",
  296: "raises {of:MR} by {p1} for every {p2} HP it loses (counting up to {p3} HP lost)",
  297: (c) => `on deployment, gives {p2} nearby allies${c.commandHuman ? ` (where ${c.commandHuman})` : ""} attacks that restore {p1}% of their max HP`,
  298: (c) => {
    const token = c.unitName?.(c.params?.[1] ?? 0);
    return token ? `automatically places a ${token} token every {secs:p1}` : "automatically places a token (unit #{p2}) every {secs:p1}";
  },
  301: "is placed on top of another unit and cannot stand on a tile alone",
  302: (c) => (c.commandHuman ? `lowers the PAD of allies in its song range by {p1}% (only units where ${c.commandHuman})` : "lowers the PAD of allies in its song range by {p1}%"),
  303: "raises the PAD of enemies in range by {p1}%",
  304: (c) => {
    const every = Number(c.extend?.["Interval"]), add = Number(c.extend?.["MulAdd"]);
    const cap = Number(c.extend?.["MulMaxBase"]), per = Number(c.extend?.["MulMaxAdd"]);
    if (!every || !add) return undefined;
    return `raises {of:max HP} by ${add}% every ${secs(every)} (up to ${cap}%${per ? `, +${per}% per target` : ""})`;
  },
  305: (c) => {
    const every = Number(c.extend?.["Interval"]), add = Number(c.extend?.["MulAdd"]);
    const cap = Number(c.extend?.["MulMaxBase"]), per = Number(c.extend?.["MulMaxAdd"]);
    if (!every || !add) return undefined;
    return `raises {of:ATK} by ${add}% every ${secs(every)} (up to ${cap}%${per ? `, +${per}% per target` : ""})`;
  },
  306: (c) => {
    const every = Number(c.extend?.["Interval"]), add = Number(c.extend?.["MulAdd"]);
    const cap = Number(c.extend?.["MulMaxBase"]), per = Number(c.extend?.["MulMaxAdd"]);
    if (!every || !add) return undefined;
    return `raises {of:DEF} by ${add}% every ${secs(every)} (up to ${cap}%${per ? `, +${per}% per target` : ""})`;
  },
  307: (c) => {
    const every = Number(c.extend?.["Interval"]), add = Number(c.extend?.["MulAdd"]);
    const cap = Number(c.extend?.["MulMaxBase"]), per = Number(c.extend?.["MulMaxAdd"]);
    if (!every || !add) return undefined;
    return `raises {of:MR} by ${add}% every ${secs(every)} (up to ${cap}%${per ? `, +${per}% per target` : ""})`;
  },
  308: "when they use their skill, {subj} recover {p1}% of max HP",
  309: "shortens bad weather by {p1}%",
  310: "lowers {of:PAD} by {p1}%",
  311: "speeds up natural UP recovery by {p1}%",
  312: "its skill costs {p1} catalyst to use (starts at {p3}, max {p2})",
  319: "its enemy ATK reduction grows by {p1} percentage points per count",
  321: "its enemy MR reduction grows by {p1} percentage points per count",
  322: "its on-hit ATK reduction grows by {p1} percentage points per count",
  325: "can use its skill immediately by spending UP",
  326: "spreads {p1}% of the damage it takes across {obj}",
  327: (c) => (c.commandHuman ? `natural UP recovery speeds up for each unit in the team where ${c.commandHuman} (up to {p2})` : "natural UP recovery speeds up for each matching unit in the team (up to {p2})"),
  328: "its hits have a {p1}% chance to transform the enemy for {secs:p2}, leaving it at {p3}% of its stats",
  335: "raises {of:ATK} by {p2}% plus {p1}% for each UP held above {p4}, up to {p3} UP",
  336: "raises {of:DEF} by {p2}% plus {p1}% for each UP held above {p4}, up to {p3} UP",
  339: "raises {of:range} by {p2} plus {p1} for each UP held above {p4}, up to {p3} UP",
  341: "{of:range} is not reduced by bad weather",
  342: "base life cannot decrease",
  343: "its skill is ready to use as soon as it is deployed",
  344: "its heals can raise {obj} up to {p1} HP over max HP",
  345: "raises the ATK of overhealed allies by {p1}%",
  346: "raises the DEF of overhealed allies by {p1}%",
  351: "each enemy defeated by it or an ally raises the damage it nullifies by {p1} (up to {p2})",
};

// Buff family shown as a tag next to a clause, read from the influence label name.
const CATEGORY_WORDS: [RegExp, string][] = [
  [/Type-A/, "Type-A"], [/Type-B/, "Type-B"], [/Type-C/, "Type-C"],
  [/War God Blessing/, "War God Blessing"], [/Deployment Spot/, "Deployment Spot"],
  [/Bard/, "Bard"], [/Conqueror/, "Conqueror"], [/Dancer/, "Dancer"], [/Chef/, "Chef"],
  [/Nekomata/, "Nekomata"], [/Lukifer/, "Lukifer"], [/Scholar/, "Scholar"], [/Medic/, "Medic"],
  [/Lifelinker/, "Lifelinker"], [/Zhenren/, "Zhenren"], [/Valkyrie/, "Valkyrie"],
  [/Possession/, "Possession"], [/Placement/, "Placement"],
];
const SELF_BUFF_SKILLS = new Set([2, 3, 4, 5, 89, 90]);

export function buffCategory(
  ns: "skill" | "ability", type: number | undefined, labelName: string | undefined,
  target?: string | number, invoke?: string | number,
): string | undefined {
  if (ns === "skill" && type != null && SELF_BUFF_SKILLS.has(type) && String(target) === "self") return "Self";
  if (labelName && /Sortie|Deployment/.test(labelName) && !/Deployment Spot/.test(labelName)) {
    if (invoke === "sortie") return "Sortie";
    if (invoke === "deployed") return "Deployment";
  }
  return CATEGORY_WORDS.find(([re]) => labelName && re.test(labelName))?.[1];
}

// Joins same-value clauses that differ only in the stat or damage type:
// "multiplies its ATK by 1.6" + "multiplies its DEF by 1.6" -> "multiplies its ATK and DEF by 1.6".
const MERGE_SHAPES: RegExp[] = [
  /^(permanently multiplies|multiplies|lowers|raises) (its|the) (.+?)( of .+?)? (by .+)$/,
  /^(physical|magic|true)( damage taken by .+ is reduced by .+)$/,
  /^(its|the) (.+?)( of .+?)? is (.+)$/,
  /^(permanently gains [\d.]+%?) (.+?)( per count.*)$/,
  /^(adds \S+ of (?:its|the pilot's)) (.+?)( to .+)$/,
  /^(gains \S+) (.+?)( for each .+)$/,
];

function joinList(xs: string[]): string {
  return xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

export function mergeClauses<T extends { text: string; verified: boolean; note?: string; tag?: string }>(clauses: T[]): T[] {
  const out: T[] = [];
  const keys: (string | null)[] = [];
  const parts: string[][] = [];
  for (const c of clauses) {
    if (out.some((o) => o.text === c.text)) continue;
    let key: string | null = null;
    let part = "";
    let build: ((ps: string[]) => string) | null = null;
    const a = c.text.match(MERGE_SHAPES[0]);
    const b = c.text.match(MERGE_SHAPES[1]);
    const d = !a && !b ? c.text.match(MERGE_SHAPES[2]) : null;
    const e = c.text.match(MERGE_SHAPES[3]) ?? c.text.match(MERGE_SHAPES[4]) ?? c.text.match(MERGE_SHAPES[5]);
    if (e) {
      key = `e|${e[1]}|${e[3]}|${c.verified}|${c.tag ?? ""}`;
      part = e[2];
      build = (ps) => `${e[1]} ${joinList(ps)}${e[3]}`;
    } else if (d) {
      key = `d|${d[1]}|${d[3] ?? ""}|${d[4]}|${c.verified}|${c.tag ?? ""}`;
      part = d[2];
      build = (ps) => `${d[1]} ${joinList(ps)}${d[3] ?? ""} ${ps.length > 1 ? "are" : "is"} ${d[4]}`;
    } else if (a) {
      key = `a|${a[1]}|${a[2]}|${a[4] ?? ""}|${a[5]}|${c.verified}|${c.tag ?? ""}`;
      part = a[3];
      build = (ps) => `${a[1]} ${a[2]} ${joinList(ps)}${a[4] ?? ""} ${a[5]}`;
    } else if (b) {
      key = `b|${b[2]}|${c.verified}|${c.tag ?? ""}`;
      part = b[1];
      build = (ps) => `${joinList(ps)}${b[2]}`;
    }
    const at = key ? keys.indexOf(key) : -1;
    if (at >= 0 && build) {
      parts[at].push(part);
      out[at] = { ...out[at], text: build(parts[at]) };
      continue;
    }
    out.push(c);
    keys.push(key);
    parts.push([part]);
  }
  return out;
}

export function proseClause(ns: "skill" | "ability", type: number | undefined, c: ProseCtx): string | null {
  const r = recipient(ns, c.target);
  const tpl = type != null ? (ns === "skill" ? SKILL_PROSE : ABILITY_PROSE)[type] : undefined;
  const phrase = tpl == null ? undefined : typeof tpl === "function" ? tpl(c) : tpl;
  if (phrase === null) return null;
  if (phrase !== undefined) return applyProse(phrase, r, c);
  const who = r === SELF ? "" : ` (${r.subj})`;
  return c.v ? `${c.name}${who}: ${c.v}` : `${c.name}${who}`;
}
