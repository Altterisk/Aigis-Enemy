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
  non_omni_types?: number[]; // class types some real unit deploys melee-only or ranged-only
  npc_cards?: number[]; // NPC / placeholder card ids
  token_types?: number[]; // class types held only by summoned tokens
  weathers?: Record<string, string>; // weather id -> WeatherConfig name
}

interface Tables {
  className: Map<number, string>;
  classTypeNames: Map<number, string[]>;
  classRoot: Map<number, number>;
  skillName: Map<number, string>;
  nonOmniTypes: Set<number>;
  npcCards: Set<number>;
  tokenTypes: Set<number>;
  weatherName: Map<number, string>;
}

let tables: Tables = {
  className: new Map(), classTypeNames: new Map(), classRoot: new Map(), skillName: new Map(),
  nonOmniTypes: new Set(), npcCards: new Set(), tokenTypes: new Set(), weatherName: new Map(),
};
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
    nonOmniTypes: new Set(n.non_omni_types ?? []),
    npcCards: new Set(n.npc_cards ?? []),
    tokenTypes: new Set(n.token_types ?? []),
    weatherName: new Map(Object.entries(n.weathers ?? {}).map(([k, v]) => [Number(k), v])),
  };
  memo.clear();
}

// Is this class type held only by summoned tokens (never a real unit's class)?
export const isTokenClassType = (t: number): boolean => tables.tokenTypes.has(t);

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
  if (name === "IsWeatherID" && parts.every(isDigits)) {
    return parts.map((p) => tables.weatherName.get(Number(p)) ?? `#${p}`).join(" / ");
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
  s = unwrap(balanceParens(s));
  quoted.forEach((q, i) => { s = s.split(`\x00Q${i}\x00`).join(q); });
  stashed.forEach((q, i) => { s = s.split(`\x00S${i}\x00`).join(q); });
  return s || null;
}

// Drops parentheses with no partner -- a few game scripts carry a stray ")"
// (e.g. `IsIdentitiy("飛行"));`), which would otherwise show up in the text.
function balanceParens(s: string): string {
  const drop = new Set<number>();
  const open: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") open.push(i);
    else if (s[i] === ")") {
      if (open.length) open.pop();
      else drop.add(i);
    }
  }
  open.forEach((i) => drop.add(i));
  return drop.size ? [...s].filter((_, i) => !drop.has(i)).join("") : s;
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

// ---- recipient phrases ----------------------------------------------------
// A recipient filter (a group-target row's command / expression) rewritten as
// the recipients themselves: "raises the ATK of the Prince and Dragon allies"
// instead of "of all allies (only units where it is the Prince or ...)".
// The filter is parsed into a tree; unit traits become adjectives or nouns,
// negated ones exclusions. Anything that is not a plain unit trait (enemy-side
// checks, card-id ranges, counts, emblems, ...) returns null and the caller
// keeps the "(only units where ...)" wording.

type Node =
  | { t: "call"; name: string; args: string }
  | { t: "not"; x: Node }
  | { t: "and" | "or"; xs: Node[] }
  | { t: "num"; v: number }
  | { t: "cmp"; op: string; l: Node; r: Node };

function parseExpr(src: string): Node | null {
  const toks = src.match(/"[^"]*"|\d+|[A-Za-z_]\w*\s*\((?:"[^"]*"|[^()"])*\)|&&|\|\||==|!=|>=|<=|[()!<>]/g) || [];
  let i = 0;
  const fail = (): never => { throw new Error("parse"); };
  const primary = (): Node => {
    const t = toks[i++];
    if (t === undefined) return fail();
    if (t === "(") {
      const n = or();
      if (toks[i++] !== ")") fail();
      return n;
    }
    if (t === "!") return { t: "not", x: unary() };
    if (/^\d+$/.test(t)) return { t: "num", v: Number(t) };
    const m = t.match(/^([A-Za-z_]\w*)\s*\(((?:"[^"]*"|[^()"])*)\)$/);
    return m ? { t: "call", name: m[1], args: m[2] } : fail();
  };
  const unary = (): Node => {
    const l = primary();
    const op = toks[i];
    if (op && ["==", "!=", ">=", "<=", "<", ">"].includes(op)) {
      i++;
      return { t: "cmp", op, l, r: primary() };
    }
    return l;
  };
  const and = (): Node => {
    const xs = [unary()];
    while (toks[i] === "&&") { i++; xs.push(unary()); }
    return xs.length > 1 ? { t: "and", xs } : xs[0];
  };
  const or = (): Node => {
    const xs = [and()];
    while (toks[i] === "||") { i++; xs.push(and()); }
    return xs.length > 1 ? { t: "or", xs } : xs[0];
  };
  try {
    const n = or();
    return i === toks.length ? norm(n) : null;
  } catch {
    return null;
  }
}

// X()==1 / X()!=0 -> X(); X()==0 / X()!=1 -> !X(); nested and/or flattened
function norm(n: Node): Node {
  if (n.t === "cmp" && n.r.t === "num" && (n.r.v === 0 || n.r.v === 1) && (n.op === "==" || n.op === "!=")) {
    const truthy = (n.op === "==") === (n.r.v === 1);
    const l = norm(n.l);
    if (l.t === "call" && /^Get/.test(l.name)) return n;
    return truthy ? l : { t: "not", x: l };
  }
  if (n.t === "not") {
    const x = norm(n.x);
    return x.t === "not" ? x.x : { t: "not", x };
  }
  if (n.t === "and" || n.t === "or") {
    const kind = n.t;
    const xs = n.xs.map(norm).flatMap((x) => (x.t === kind ? (x as { xs: Node[] }).xs : [x]));
    return { t: kind, xs };
  }
  return n;
}

// gender first, then melee/ranged, then tags: "female melee Flying"
const adjRank = (w: string) => (w === "male" || w === "female" ? 0 : /^(melee|ranged)/.test(w) ? 1 : 2);
const sortAdj = (xs: string[]) => [...xs].sort((a, b) => adjRank(a) - adjRank(b));

// one member of a recipient set: an adjective ("Flying") or a noun ("the Prince")
interface Atom { adj?: string; noun?: string }
interface Desc {
  union: Atom[] | null; // alternatives; null = no list
  adj: string[];        // ANDed adjectives
  other: boolean;       // !IsOwnerUnit
  except: string[];
  flags: Set<string>;   // excluded kinds: tokens / guests / borrowed units
}
// card Rare id -> rarity name (as the unit list shows it)
const RARITY_NAME: Record<number, string> = {
  0: "Iron", 1: "Bronze", 2: "Silver", 3: "Gold", 4: "Platinum", 5: "Black", 7: "Sapphire",
  10: "Platinum Hero", 11: "Black Hero",
};
const RECIPIENT_TAG_PREDS = new Set(["IsIdentitiy", "IsIdentity", "IsRace", "IsGenus", "IsAssign"]);
const FLAG_PREDS: Record<string, string> = {
  IsToken: "tokens", IsGuestUnit: "guest units", IsPlayerSupportUnit: "borrowed support units",
};

const listAnd = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const listOr = (xs: string[]) => (xs.length < 3 ? xs.join(" or ") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);
const nums = (args: string) => args.split(",").map((p) => p.trim()).filter(isDigits).map(Number);

function classAtom(name: string, args: string): Atom {
  const ids = nums(args);
  if (name === "IsClassID") return { adj: classIdListText(ids.map(String)) };
  if (ids.length > 4) return { noun: `allies of ${ids.length} class types` };
  return { adj: ids.map((t) => classTypeText(String(t))).join(" / ") };
}

// a positive unit trait as recipient atoms, or null. `flags` collects the
// token / guest / borrowed exclusions found inside OR branches.
function atomsOf(n: Node, flags?: Set<string>): Atom[] | null {
  if (n.t === "and") {
    // one OR branch that is several traits at once: "melee and omni White Empire"
    const d = describe(n);
    if (!d || d.other || d.except.length) return null;
    // "the Prince and not a token": the noun alone
    if (d.union && d.union.length === 1 && d.union[0].noun && !d.adj.length) {
      d.flags.forEach((f) => flags?.add(f));
      return d.union;
    }
    if (d.union || !d.adj.length) return null;
    d.flags.forEach((f) => flags?.add(f));
    return [{ adj: sortAdj(d.adj).join(" ") }];
  }
  if (n.t === "or") {
    const calls = n.xs.filter((x): x is Extract<Node, { t: "call" }> => x.t === "call");
    // melee/ranged OR a list of omni class types: "melee and omni"
    const pos = calls.find((c) => c.name === "IsVanguard" || c.name === "IsRearguard");
    const cls = calls.find((c) => c.name === "IsClassType");
    if (n.xs.length === 2 && pos && cls && tables.nonOmniTypes.size
      && nums(cls.args).every((t) => !tables.nonOmniTypes.has(t))) {
      return [{ adj: `${pos.name === "IsVanguard" ? "melee" : "ranged"} and omni` }];
    }
    const out: Atom[] = [];
    for (const x of n.xs) {
      const a = atomsOf(x, flags);
      if (!a) return null;
      out.push(...a);
    }
    return out;
  }
  if (n.t !== "call") return null;
  const raw = n.args.trim();
  if (n.name === "IsOwnerUnit" && !raw) return [{ noun: "itself" }];
  if ((n.name === "IsRarity" || n.name === "IsRaryty") && nums(raw).length && nums(raw).every((r) => RARITY_NAME[r])) {
    return [{ adj: listOr(nums(raw).map((r) => RARITY_NAME[r])) }];
  }
  if (n.name === "IsPrince" && !raw) return [{ noun: "the Prince" }];
  if (n.name === "IsVanguard" && !raw) return [{ adj: "melee" }];
  if (n.name === "IsRearguard" && !raw) return [{ adj: "ranged" }];
  if (n.name === "IsGender" && GENDER[raw]) return [{ adj: GENDER[raw] }];
  if (n.name === "IsToken" && !raw) return [{ noun: "tokens" }];
  if (n.name === "IsServantToken" && !raw) return [{ noun: "servant tokens" }];
  if (RECIPIENT_TAG_PREDS.has(n.name) && raw) return fmtArgs(n.name, n.args).split(", ").map((a) => ({ adj: a }));
  if ((n.name === "IsClassType" || n.name === "IsClassID") && nums(raw).length) return [classAtom(n.name, raw)];
  if (n.name === "IsCardID" && nums(raw).length) {
    const ids = nums(raw);
    return ids.length > 6 ? [{ noun: `${ids.length} specific units` }] : ids.map((id) => ({ noun: `[[unit:${id}]]` }));
  }
  return null;
}

// records what a negated trait removes; false when it cannot be said
function exclusionOf(x: Node, d: Desc): boolean {
  if (x.t === "call" && x.name === "IsOwnerUnit" && !x.args.trim()) { d.other = true; return true; }
  if (x.t === "call" && FLAG_PREDS[x.name] && !x.args.trim()) { d.flags.add(FLAG_PREDS[x.name]); return true; }
  if (x.t === "call" && (x.name === "IsCardID" || x.name === "IsCardID_EBT")) {
    const ids = nums(x.args);
    // only placeholders (barricades, decorations, dummies): no real unit is left out
    if (ids.length && ids.every((id) => tables.npcCards.has(id))) return true;
    d.except.push(ids.length > 6 ? `${ids.length} specific units` : listAnd(ids.map((id) => `[[unit:${id}]]`)));
    return true;
  }
  const atoms = atomsOf(x);
  if (!atoms) return false;
  const adjs = atoms.filter((a) => a.adj).map((a) => a.adj!);
  const nouns = atoms.filter((a) => a.noun).map((a) => a.noun!);
  if (adjs.length) d.except.push(`${listAnd(adjs)} units`);
  d.except.push(...nouns.map((x) => x.replace(/^allies of (\d+ class types)$/, "$1")));
  return true;
}

function describe(n: Node): Desc | null {
  const d: Desc = { union: null, adj: [], other: false, except: [], flags: new Set() };
  for (const x of n.t === "and" ? n.xs : [n]) {
    if (x.t === "not") {
      if (!exclusionOf(x.x, d)) return null;
      continue;
    }
    const atoms = atomsOf(x, d.flags);
    if (!atoms) return null;
    if (atoms.length === 1 && atoms[0].adj) { d.adj.push(atoms[0].adj); continue; }
    if (d.union) return null; // two alternative lists cannot be said as one
    d.union = atoms;
  }
  return d;
}

/** The recipients a group-target filter selects, phrased in place of `obj`
 * ("all allies" / "allies in range"), or null when the filter is not a plain
 * unit-trait filter. */
export function recipientPhrase(expr: string | null | undefined, obj: string): string | null {
  if (!expr || (obj !== "all allies" && obj !== "allies in range")) return null;
  let s = expr.trim().replace(/;+\s*$/, "").trim();
  s = balanceParens(s.replace(/;\s*(?=\)|&&|\|\|)/g, ""));
  s = s.replace(/GetGender\(\)\s*==\s*([01])/g, "IsGender($1)");
  const tree = parseExpr(s);
  const d = tree && describe(tree);
  if (!d) return null;
  const inRange = obj === "allies in range" ? " in range" : "";
  const adjs = sortAdj(d.adj);
  const lead = d.other ? "other " : "";
  let phrase: string;
  if (!d.union) {
    // fully understood but nothing left to say (only placeholders excluded)
    if (!adjs.length && !d.other && !d.except.length && !d.flags.size) return obj;
    phrase = adjs.length || d.other
      ? `${lead}${adjs.join(" ")}${adjs.length ? " " : ""}allies${inRange}`
      : `${inRange ? "" : "all "}allies${inRange}`;
  } else {
    const nouns = d.union.filter((a) => a.noun).map((a) => a.noun!);
    const alt = d.union.filter((a) => a.adj).map((a) => a.adj!);
    if (nouns.length && adjs.length) return null;
    const allies = alt.length ? `${lead}${[...adjs, listOr(alt)].join(" ")} allies${inRange}` : null;
    if (nouns.length && inRange && allies) return null;
    // "the Prince" and "itself" first, then the allies part, then other nouns
    const head = nouns.filter((x) => x === "the Prince" || x === "itself");
    const rest = nouns.filter((x) => x !== "the Prince" && x !== "itself");
    phrase = listAnd([...head, ...(allies ? [allies] : []), ...rest]);
    if (!allies && inRange) phrase = `${phrase} in range`;
    if (d.other && !allies) phrase = `${phrase} (other than itself)`;
  }
  const notes: string[] = [];
  if (d.except.length) notes.push(`except ${listAnd(d.except)}`);
  if (d.flags.size) notes.push(`not ${listOr([...d.flags])}`);
  return notes.length ? `${phrase} (${notes.join("; ")})` : phrase;
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
