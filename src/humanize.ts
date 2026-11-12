// Readable English for the game's condition scripts (_Command / _Expression /
// _ActivateCommand / NoChangeCondition ...). The scripts are little boolean
// expressions of predicate calls, e.g.
//
//   IsStageFlag(1) && IsEnemyElementAny("アーマー")
//   GetRaryty() >= 4 && IsToken() == 0
//   (IsClassType(1,201)&&IsStageFlag(1)) || (IsClassType(3,203)&&IsStageFlag(2))
//
// humanize() is best-effort: known predicates are translated, the boolean glue
// (&& || ! parentheses, == 1 / == 0 / != 1 comparisons) is preserved, and
// anything unrecognized is left verbatim so nothing is silently dropped or
// invented. The output carries markers that HumanText renders:
// [[class:NAME]] / [[tag:NAME]] (unit-list filter links), [[unit:ID]],
// [[skill:NAME]] and [[etag:NAME]] (enemy race / element tag).

// Predicate name -> phrase; {a} = the formatted args. null = dropped (cosmetic).
const PRED: Record<string, string | null> = {
  IsEnemyElementAny: "the enemy is {a}",
  IsEnemyRace: "the enemy's race is {a}",
  IsEnemyFlight: "the enemy is flying",
  IsRace: "its race is {a}",
  IsIdentitiy: "it has the identity {a}", // game's spelling (typo)
  IsIdentity: "it has the identity {a}",
  IsGenus: "it is genus {a}",
  IsAssign: "it is assigned to {a}",
  IsClassType: "its class type is one of {a}",
  IsClassID: "its class id is one of {a}",
  IsCardID: "it is {a}",
  IsGender: "it is {a}", // 0/1 mapped below
  IsStageFlag: "stage flag {a} is set",
  IsToken: "it is a token",
  IsPrince: "it is the Prince",
  // shared by unit AND enemy contexts -- keep the wording side-neutral
  IsOwnerUnit: "it is the owner itself",
  IsOverlapMember: "it is a duplicate of another unit in your team",
  IsPlayerSupportUnit: "it is a borrowed support unit",
  IsVanguard: "it is a melee unit",
  IsRearguard: "it is a ranged unit",
  IsRaryty: "its rarity is {a}", // game's spelling (typo)
  GetRaryty: "rarity",
  GetNameCharCount: "name length",
  GetBlockCount: "block count",
  GetClassChange: "class-change stage",
  GetClassType: "class type",
  GetClassID: "class id",
  HasToken: "it has a token",
  HasHealToken: "it has a heal token",
  HasHealTask: "it has a heal task",
  HasAttackTask: "it has an attack task",
  HasDualTask: "it has a dual task",
  HasAssasin: "it has assassinate", // game's spelling
  HasCostGeneratorSkill: "it has a cost-generation skill",
  IsSkillEvolved: "its skill is evolved",
  IsContainsChar: "its name contains {a}",
  Play_BurstEffect: null,
  // literal readings of the function names, same policy as the rest
  IsInvokedSkill: "its skill is active",
  IsSkillID: "its skill is {a}",
  IsGuestUnit: "it is a guest unit",
  IsEnabledPossession: "possession {a} is enabled",
  GetHPRatio: "HP ratio",
  GetHP: "HP",
  GetGender: "gender",
  GetCardID: "card id",
  IsEnemyUnit: "it is an enemy unit",
  IsEnemyWarpStandby: "the enemy is warp-standby",
  IsServantToken: "it is a servant token",
  IsServantClassType: "its servant class type is {a}",
  IsEnemyBlock: "it is blocking an enemy",
  GetEntryUnitCount: "deployed unit count",
  GetEntryAssignCount: "team count assigned to {a}",
  GetEntryGenusCount: "team count of genus {a}",
  GetEntryGenderCount: "team count of gender {a}",
  GetEntryIdentityCount: "team count with identity {a}",
  GetEntryRaceCount: "team count of race {a}",
  IsInRangeParty: "an ally is within range",
  IsWeatherID: "the weather is {a}",
  GetWeatherID: "weather id",
  IsEvacuation: "it is withdrawing",
  IsMoreLoyalty: "affection >= {a}",
  CheckUnitInBattleSomeMatch: "some deployed unit matches {a}",
  IsMatchPlaceType: "it matches the placement type",
  HasTransformState: "it is transformed",
  IsContainesParty: "the team contains {a}",
  CallEvent: "it triggers events {a}",
  PlaySe: null,
  CheckInBattleClassID: "a deployed unit's class id is {a}",
  GetSallyCount: "sortie count",
  GetEnemyHPRatio: "the enemy's HP ratio",
  IsEmblem: "it has the emblem {a}",
  IsUnitRidingInRobot: "a unit is riding this mech",
  IsLeavingType: "its leaving type is {a}",
  IsRarity: "its rarity is {a}",
  IsEnemyMagicType: "the enemy attacks with magic",
  IsEnemyRemoteType: "the enemy is ranged",
  HasEnvInf: "the map has the {a} effect",
  DoUnitAction_CreateField: "creates a field ({a})",
  DoUnitAction_Revenge: "performs a revenge action ({a})",
  DoUnit_RegistCommand: "registers command {a}",
  PlayBgmBySkill: null,
  GetEntryRarityCount: "team count of rarity {a}",
  GetClassTypeSallyCount: "sortie count of class type {a}",
  GetCardInitialCost: "starting cost",
  IsBlood: "its blood is {a}",
  MatchRarityGroup: "its rarity group is {a}",
  SetStageFlag: "sets stage flag {a}",
  HasSklInf: "it has a skill matching {a}",
  HasAbiInf: "it has an ability matching {a}",
  IsOwnerOfToken: "it owns a token",
  HasGoldGet: "it has a gold-gain effect",
  IsInvokedSuspend: "its suspend is active",
  IsBlockedEnemy: "it has blocked an enemy",
  IsServantTokenCostSkill: "it has a servant-token cost skill",
  IsEnvHell: "the map is in Hell",
  GetUsedSkillCount: "times its skill has been used",
  GetSysVer: "system version",
  GetDefeatsCountOfEnemy: "enemies defeated",
  GetBattle_KillRatio: "kill ratio",
  IsClassType_EBT: "its class type is one of {a}",
  IsCardID_EBT: "it is {a}",
  IsRarity_EBT: "its rarity is {a}",
  GetRarity: "rarity",
  IsTeamUnit: "it is in the team",
  HasHealTarget: "it has a heal target",
  IsPlayer: "it is a player unit",
};

// MatchRarityGroup() args are rarity kanji
const RARITY_GROUP: Record<string, string> = {
  鉄: "Iron", 銅: "Bronze", 銀: "Silver", 金: "Gold", 白: "Platinum", 黒: "Black", 青: "Sapphire",
};

// HasEnvInf("効果=X") map-effect names
const ENV_EFFECT: Record<string, string> = {
  水圧: "water pressure", 天界: "Heaven", "攻撃変動[味方][魔界]": "ally attack change [Hell]",
};

const GENDER: Record<string, string> = { 0: "male", 1: "female" };

// predicates whose string arg is a unit tag / race / genus / faction
const TAG_ARG_PREDS = new Set(["IsAssign", "IsRace", "IsIdentitiy", "IsIdentity", "IsGenus",
  "GetEntryIdentityCount", "GetEntryGenusCount", "GetEntryRaceCount"]);

// enemy-side predicates whose string arg is an enemy race / element tag
const ENEMY_TAG_PREDS = new Set(["IsEnemyRace", "IsEnemyElementAny", "IsEnemyElement"]);

// IsAssign()/GetEntryAssignCount() args are SHORT faction names that do not
// always match the unit tag (card.Assign -> PlayerAssignType name).
const ASSIGN_TO_TAG: Record<string, string> = { 帝国: "白の帝国", 砂漠: "砂漠の国", パルス: "パルス王国" };

// GetClassChange() is the tier the unit is deployed at (0 base, 1 class
// change, 2 awakened, 3/4 second awakening A/B).
const CLASS_CHANGE_TIER: Record<number, string> = {
  0: "base", 1: "class-changed", 2: "awakened", 3: "second-awakening A", 4: "second-awakening B",
};
// GetClassChange() < N, the negation of the >= phrases below
const CLASS_CHANGE_BELOW: Record<number, string> = {
  1: "it has not class-changed", 2: "it has not awakened",
  3: "it has not reached its second awakening", 4: "it is not in its second-awakening B class",
};
// GetClassChange() >= N; tiers 3 and 4 are the two second-awakening paths, so
// ">= 3" covers both.
const CLASS_CHANGE_AT_LEAST: Record<number, string> = {
  1: "it has class-changed", 2: "it has awakened",
  3: "it has reached its second awakening", 4: "it is in its second-awakening B class",
};

// The id -> name tables from data/expr_names.json.
export interface ExprNames {
  classes: [number, string][]; // class id -> chain base name, in table order
  class_root: Record<string, number>; // class id -> chain root id (only when different)
  skills: Record<string, string>; // skill id -> JP name
}

interface Tables {
  className: Map<number, string>;
  classTypeNames: Map<number, string[]>;
  classRoot: Map<number, number>;
  skillName: Map<number, string>;
}

let tables: Tables = { className: new Map(), classTypeNames: new Map(), classRoot: new Map(), skillName: new Map() };
const memo = new Map<string, string | null>();

export function setExprNames(n: ExprNames): void {
  const className = new Map(n.classes.map(([id, name]) => [Number(id), name]));
  const classTypeNames = new Map<number, string[]>();
  for (const [id, name] of n.classes) {
    const list = classTypeNames.get(Math.floor(Number(id) / 100)) ?? [];
    if (!list.includes(name)) list.push(name);
    classTypeNames.set(Math.floor(Number(id) / 100), list);
  }
  tables = {
    className,
    classTypeNames,
    classRoot: new Map(Object.entries(n.class_root).map(([k, v]) => [Number(k), v])),
    skillName: new Map(Object.entries(n.skills).map(([k, v]) => [Number(k), v])),
  };
  memo.clear();
}

const isDigits = (p: string) => /^\d+$/.test(p);

function classLink(cid: string): string {
  const name = isDigits(cid) ? tables.className.get(Number(cid)) : undefined;
  return name ? `[[class:${name}]]` : cid;
}

// A raw ClassID list commonly names EVERY tier of one class; collapse a
// chain's tiers to ONE mention, but only when the chain's own root id is
// among the listed ids (a list naming only an AW/AW2 tier stays as is).
function classIdListText(parts: string[]): string {
  const ids = parts.filter(isDigits).map(Number);
  if (ids.length !== parts.length) return parts.map(classLink).join(", ");
  const idSet = new Set(ids);
  const shown: string[] = [];
  const seenRoots = new Set<number>();
  for (const cid of ids) {
    const root = tables.classRoot.get(cid) ?? cid;
    if (idSet.has(root)) {
      if (seenRoots.has(root)) continue;
      seenRoots.add(root);
      shown.push(classLink(String(root)));
    } else {
      shown.push(classLink(String(cid)));
    }
  }
  return shown.join(", ");
}

function classTypeText(tid: string): string {
  const names = isDigits(tid) ? tables.classTypeNames.get(Number(tid)) ?? [] : [];
  if (!names.length) return tid;
  const shown = names.slice(0, 2).map((n) => `[[class:${n}]]`).join(", ");
  return `${shown}${names.length > 2 ? "…" : ""}`;
}

function fmtArgs(name: string, raw: string): string {
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean).map((p) => p.replace(/^"+|"+$/g, ""));
  if (ENEMY_TAG_PREDS.has(name)) return parts.map((p) => `[[etag:${p}]]`).join(", ");
  if ((name === "IsCardID" || name === "IsCardID_EBT") && parts.every(isDigits)) {
    if (parts.length > 6) return `one of ${parts.length} units`;
    return parts.map((p) => `[[unit:${p}]]`).join(", ");
  }
  if (name === "IsSkillID" && parts.every(isDigits)) {
    return parts.map((p) => {
      const n = tables.skillName.get(Number(p));
      return n ? `[[skill:${n}]]` : `#${p}`;
    }).join(" / ");
  }
  if (name === "IsContainesParty" && parts.length && parts[0] === "ClassID") {
    return "a unit of class " + classIdListText(parts.slice(1));
  }
  if (name === "CallEvent") return parts.map((p) => `#${p}`).join(", ");
  if (name === "IsBlood") return parts.map((p) => `[[tag:${p}]]`).join(", ");
  if (name === "MatchRarityGroup") return parts.map((p) => RARITY_GROUP[p] ?? p).join(", ");
  if (name === "HasEnvInf") {
    return parts.map((p) => ENV_EFFECT[p.includes("=") ? p.slice(p.indexOf("=") + 1) : p] ?? p).join(", ");
  }
  if (name === "IsClassType_EBT") return parts.map(classTypeText).join(" / ");
  if (name === "IsGender" && parts.length === 1) return GENDER[parts[0]] ?? parts[0];
  if (name === "IsEnabledPossession") {
    // arg is "ItemId=battle_god_bless_001009": show the bare item id
    return parts.map((p) => (p.includes("=") ? p.slice(p.indexOf("=") + 1) : p)).join(", ");
  }
  if (name === "IsAssign" || name === "GetEntryAssignCount") {
    return parts.map((p) => `[[tag:${ASSIGN_TO_TAG[p] ?? p}]]`).join(", ");
  }
  if (TAG_ARG_PREDS.has(name)) return parts.map((p) => `[[tag:${p}]]`).join(", ");
  if (name === "IsClassID" || name === "GetClassID" || name === "CheckInBattleClassID") return classIdListText(parts);
  if (name === "IsClassType" || name === "GetClassTypeSallyCount") {
    const resolved = parts.map(classTypeText);
    if (resolved.length > 4) return `${parts.length} class types`;
    // NOT "; " -- the cleanup pass later replaces every ";" with a space
    return resolved.join(" / ");
  }
  // collapse long id lists so the text stays readable
  if (parts.length > 6 && parts.every((p) => /^-?\d+$/.test(p))) return `${parts.length} class/id values`;
  return parts.join(", ");
}

function pred(name: string, raw: string): string {
  const known = Object.prototype.hasOwnProperty.call(PRED, name);
  if (known && PRED[name] === null) return "";
  if (name === "IsExistAssignClassTypeOverHpPer") {
    // a quoted, comma-JOINED class-type list followed by a bare HP percent
    const m = raw.match(/^\s*"([^"]*)"\s*,\s*(\d+)/);
    if (m) return `an ally of class type ${fmtArgs("IsClassType", m[1])} has HP% >= ${m[2]}`;
    return `${name}(${raw})`;
  }
  const tmpl = known ? PRED[name] : undefined;
  if (tmpl == null) return `${name}(${raw})`;
  return tmpl.includes("{a}") ? tmpl.replace("{a}", () => fmtArgs(name, raw)) : tmpl;
}

type Repl = (m: string, ...groups: string[]) => string;

// Apply a regex substitution only OUTSIDE double-quoted spans: several args
// are themselves strings holding a nested mini-expression.
function quoteSafeSub(pattern: RegExp, repl: string | Repl, s: string): string {
  const parts = s.split(/("[^"]*")/);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = typeof repl === "string" ? parts[i].replace(pattern, repl) : parts[i].replace(pattern, repl as never);
  }
  return parts.join("");
}

function negate(phraseIn: string): string {
  const phrase = phraseIn.trim();
  const swap = (head: string, to: string) => to + phrase.slice(head.length);
  if (phrase.startsWith("(")) return `not ${phrase}`;
  if (phrase.startsWith("it has ")) return swap("it has ", "it does not have ");
  if (phrase.startsWith("it is ")) return swap("it is ", "it is not ");
  if (phrase.startsWith("the enemy is ")) return swap("the enemy is ", "the enemy is not ");
  if (phrase.startsWith("the enemy's race is ")) return swap("the enemy's race is ", "the enemy's race is not ");
  if (phrase.startsWith("its name contains ")) return swap("its name contains ", "its name does not contain ");
  if (phrase.startsWith("its ") && phrase.includes(" is one of ")) return phrase.replace(" is one of ", " is not one of ");
  if (phrase.startsWith("its ") && phrase.includes(" is ")) return phrase.replace(" is ", " is not ");
  if (phrase.startsWith("the map has ")) return swap("the map has ", "the map does not have ");
  if (phrase.startsWith("stage flag ")) return phrase.replace(" is set", " is not set");
  if (phrase.startsWith("it ")) return swap("it ", "it does not ");
  return `not ${phrase}`;
}

const MATCH_COUNT_DESC: Record<string, string> = {
  GetUnitInBattleMatchCount: "count of deployed units matching",
  GetUnitInTeamMatchCount: "count of team members matching",
  GetUnitInOneTeamMatchCount: "count of team members matching",
};

function classChangePhrase(opIn: string, nIn: number): string | undefined {
  let op = opIn;
  let n = nIn;
  if (op === ">") { op = ">="; n += 1; } else if (op === "<=") { op = "<"; n += 1; }
  if (op === "==") return CLASS_CHANGE_TIER[n] ? `it is in its ${CLASS_CHANGE_TIER[n]} class` : undefined;
  if (op === "!=") return CLASS_CHANGE_TIER[n] ? `it is not in its ${CLASS_CHANGE_TIER[n]} class` : undefined;
  if (op === ">=") return CLASS_CHANGE_AT_LEAST[n];
  if (op === "<") return CLASS_CHANGE_AT_LEAST[n] ? CLASS_CHANGE_BELOW[n] : undefined;
  return undefined;
}

function humanizeRaw(expr: string): string | null {
  if (!expr || !expr.trim()) return null;
  let s = expr.trim().replace(/;+$/, "").trim().replace(/＝/g, "=");
  // a ';' between two predicates acts as an implicit AND
  s = quoteSafeSub(/;\s*(?=\S)/g, " && ", s);
  s = quoteSafeSub(/&&\s*&&/g, "&&", s);
  // already-finished phrases are stashed as opaque placeholders, immune to
  // every later pass, and restored verbatim at the very end
  const stashed: string[] = [];
  const stash = (phrase: string) => { stashed.push(phrase); return `\x00S${stashed.length - 1}\x00`; };
  // "its skill is X and its skill is active" in either order -> "X is active"
  s = quoteSafeSub(
    /IsSkillID\(([\d,\s]+)\)\s*&&\s*IsInvokedSkill\(\)|IsInvokedSkill\(\)\s*&&\s*IsSkillID\(([\d,\s]+)\)/g,
    (_m, a, b) => stash(`${fmtArgs("IsSkillID", a ?? b)} is active`), s);
  // comparison forms rewritten to their predicate equivalents BEFORE the
  // generic ==0 negation pass eats them
  s = quoteSafeSub(/GetGender\(\)\s*==\s*([01])/g, "IsGender($1)", s);
  s = quoteSafeSub(/GetGender\(\)\s*!=\s*([01])/g, "!IsGender($1)", s);
  s = quoteSafeSub(/GetClassID\(\)\s*==\s*(\d+)/g, "IsClassID($1)", s);
  s = quoteSafeSub(/GetClassID\(\)\s*!=\s*(\d+)/g, "!IsClassID($1)", s);
  s = quoteSafeSub(/GetClassChange\(\)\s*(==|!=|>=|<=|>|<)\s*(\d+)/g, (m, op, n) => {
    const phrase = classChangePhrase(op, Number(n));
    return phrase === undefined ? m : stash(phrase);
  }, s);
  // IsMoreClassChange(N) reads like the other IsMore* predicates: ">= N"
  s = quoteSafeSub(/IsMoreClassChange\(\s*(\d+)\s*\)/g, (m, n) => {
    const phrase = classChangePhrase(">=", Number(n));
    return phrase === undefined ? m : stash(phrase);
  }, s);
  // GetUnitIn*MatchCount("Expression=<inner>;") counts units satisfying
  // <inner>; CheckUnitIn*SomeMatch is true when any one unit does
  s = s.replace(/(GetUnitInBattleMatchCount|GetUnitInTeamMatchCount|GetUnitInOneTeamMatchCount)\(\s*"Expression=(.*?);"\s*\)/g,
    (_m, fn, inner) => stash(`[${MATCH_COUNT_DESC[fn]}: ${humanizeRaw(inner) || inner}]`));
  s = s.replace(/(CheckUnitInTeamSomeMatch|CheckUnitInBattleSomeMatch)\(\s*"Expression=(.*?);"\s*\)/g,
    (_m, fn, inner) => stash(`[${fn === "CheckUnitInTeamSomeMatch" ? "a team member" : "a deployed unit"} exists where ${humanizeRaw(inner) || inner}]`));
  // Is*/Has*/Check* return 0/1, so "X()==1"/"X()!=0" is truthiness and
  // "X()==0"/"X()!=1" negation; Get* return a real number and keep the
  // comparison
  s = quoteSafeSub(/\b([A-Za-z_]\w*)\(((?:"[^"]*"|[^()"])*)\)\s*(==\s*1|!=\s*0|==\s*0|!=\s*1)\b/g, (m, name, args, op) => {
    if (name.startsWith("Get")) return m;
    const callText = `${name}(${args})`;
    return /^(==\s*1|!=\s*0)/.test(op) ? callText : `!${callText}`;
  }, s);
  // replace each predicate call with its phrase, repeatedly in case earlier
  // substitutions reveal new matches
  const call = /([A-Za-z_]\w*)\s*\(\s*((?:"[^"]*"|[^()"])*)\)/g;
  let prev: string | null = null;
  while (prev !== s) {
    prev = s;
    s = s.replace(call, (_m, name, args) => pred(name, args));
  }
  // quoted text left now belongs to an unknown predicate's fallback; shield it
  const quoted: string[] = [];
  s = s.replace(/"[^"]*"/g, (m) => { quoted.push(m); return `\x00Q${quoted.length - 1}\x00`; });
  // group comparisons: "(...)==1"/"(...)!=0" -> "(...)"; "(...)==0"/"(...)!=1"
  // -> negation sentinel
  s = s.replace(/(\))\s*==\s*1\b/g, "$1");
  s = s.replace(/(\))\s*!=\s*0\b/g, "$1");
  s = s.replace(/(\([^()]*\))\s*(?:==\s*0|!=\s*1)\b/g, "¬NEG¬$1");
  // leading ! is also a negation
  s = s.replace(/!\s*(?=\w|\()/g, "¬NEG¬");
  s = s.split("&&").join(" and ").split("||").join(" or ");
  // fold negation sentinels into natural phrasing, innermost first
  for (let i = 0; i < 4 && s.includes("¬NEG¬"); i++) {
    s = s.replace(/¬NEG¬\s*(?!\(|¬NEG¬)(.+?)(?=(?:\s+(?:and|or)\s)|\)|$)/g, (_m, p) => negate(p));
    s = s.replace(/¬NEG¬\s*(\((?:[^()¬]|\([^()¬]*\))*\))/g, (_m, p) => negate(p));
  }
  // tidy whitespace / stray semicolons / empty parens left by dropped preds
  s = s.split(";").join(" ");
  s = s.replace(/\(\s*\)/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s+(and|or)\s*\)/g, ")");
  s = s.replace(/\(\s*(and|or)\s+/g, "(");
  s = s.replace(/^(and|or)\s+|\s+(and|or)$/g, "").trim();
  s = s.replace(/\(\s*([^()]*?)\s*\)/g, "($1)");
  s = unwrap(s);
  quoted.forEach((q, i) => { s = s.split(`\x00Q${i}\x00`).join(q); });
  stashed.forEach((q, i) => { s = s.split(`\x00S${i}\x00`).join(q); });
  return s || null;
}

// "(A and B)" -> "A and B" when one pair of parentheses wraps the whole text
function unwrap(s: string): string {
  let out = s;
  while (out.startsWith("(") && out.endsWith(")")) {
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < out.length - 1; i++) {
      if (out[i] === "(") depth++;
      else if (out[i] === ")") depth--;
      if (depth === 0) { wraps = false; break; }
    }
    if (!wraps) break;
    out = out.slice(1, -1).trim();
  }
  return out;
}

// Readable English for one condition script, or null when it is empty.
export function humanize(expr: string | null | undefined): string | null {
  if (!expr) return null;
  const hit = memo.get(expr);
  if (hit !== undefined) return hit;
  const out = humanizeRaw(expr);
  memo.set(expr, out);
  return out;
}
