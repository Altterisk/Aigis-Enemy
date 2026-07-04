// Shapes of the exported JSON. The export COMPACTS the data (drops null / false /
// empty / zero-ish fields), so almost everything is OPTIONAL -- a missing field
// means "the default" (0, false, [], "", null). Treat optional accordingly.

export type DamageType = "physical" | "magical" | "true";

// one resolved influence row of a SpEff / quest term.
export interface Effect {
  kind?: "specialty" | "term";
  influence: number;
  params?: number[];
  ext?: string;
  expression?: string;
  expression_human?: string;
}

// SpEff id (string) -> its influence rows.
export type SpecialtyConfig = Record<string, Effect[]>;

// decoded on-hit status from the missile Property field.
export interface MissileOnHit {
  kind: string;        // DOT / スタック式DOT / 攻撃遅延 / ステータス低下
  duration_f?: number;
  interval_f?: number;
  pct_hp?: number;     // percent of MAX HP per tick
  flat?: number;       // fixed damage per tick
  uses_atk?: boolean;
  attack_interval_f?: number;              // 攻撃遅延: raw frame count (unverified semantics)
  stat_down?: { atk?: number; def?: number; mr?: number }; // ステータス低下: raw % (TO vs BY unverified)
  priority?: number;                       // 上書き優先度
  expire_duration_only?: boolean;          // 効果時間のみで消滅
  relief?: boolean;                        // 症状緩和
  effect_name?: string;                    // 演出 (visual)
  other?: Record<string, string>;          // unrecognized Property keys, verbatim
}

// missile splash / slow / deflect / on-hit status (only present when noteworthy).
export interface Missile {
  speed?: number;
  splash?: number | null;
  slow?: [number, number] | null;
  deflectable?: boolean | null;
  // PenetrateType != 0: travelling projectile that hits every enemy it
  // passes through (user-confirmed); width = ColDiameter collision width.
  penetrate?: number | null;
  width?: number | null;
  heal?: boolean | null;
  blast_residue?: [number, number] | null; // lingering blast [time, interval] frames (raw)
  on_hit?: MissileOnHit | null;
}

// per-spawn EntryCommand scripts.
export interface Commands {
  raw?: string;
  sets_flags?: [number, number][];
  flag_checks?: string[];
  mode_changes?: number;
  force_dead?: boolean;
  on_destroy?: boolean;
  on_mode_changed?: boolean;
}

// structured route @OnEvent behaviour.
export interface RouteBehaviour {
  transforms?: { flag: number | null; val: number | null; to: number | null; wait?: number }[];
  sets_flags?: [number, number, number | null][];
  calls_event?: number[];
  reroutes?: string[];
  creates_obj?: number;
  creates_guest?: number;
  force_dead?: boolean;
  battle_styles?: string[];
}

// one form / variant of a stage enemy.
export interface StageEnemyForm {
  tags?: string[];
  fixture?: boolean;
  hp?: number;
  attack?: number;
  base_hp?: number;
  base_attack?: number;
  damage_type?: DamageType;
  armor_defense?: number;
  magic_defense?: number;
  attack_range?: number;
  attack_speed?: number;
  attack_wait?: number;
  attack_interval?: number | null;
  move_speed?: number;
  gain_cost?: number;
  dot_rate?: number;
  assassin_resist?: number;
  transform_resist?: number;
  pattern_id?: number;
  race_id?: number | null;
  special_effect_id?: number | null;
  missile?: Missile | null;
  missile_id?: number | null;
  master_id?: number | null;
  global_id?: number | null;
  ranged?: boolean;
  change_to?: number | null;
  change_condition?: number | null;
}

// a stage enemy entry (a base form, with variants + spawn/transform metadata).
export interface StageEnemy extends StageEnemyForm {
  enemy_id: number;
  source?: string;
  count?: number;
  level?: number;
  form_index?: number;
  form_count?: number;
  variants?: StageEnemyForm[];
  from_condition?: number | "sp_change" | null;
  to_condition?: number | null;
  from_flag?: [number, number] | null;
  to_flag?: [number, number] | null;
  trigger_ticks?: number | null;
  to_ticks?: number | null;
  to_global_id?: number | null;
  timed_wait?: number | null;
  sp_change_to?: number[];
  spawned_on_death_by?: number[];
  spawn_sec?: number;
  commands?: Commands | null;
  route_behaviour?: RouteBehaviour | null;
}

// full stage (per-stage file).
export interface Stage {
  quest_id: number;
  name?: string;
  description?: string;
  modifier_notes?: string[];
  event?: string | null;
  event_category?: string | null;
  mission_id?: number | null;
  map_no?: number;
  entry_no?: number;
  level?: number;
  multiplier?: number;
  charisma?: number;
  capacity?: number;
  active?: boolean;
  modifiers?: Effect[];
  popups?: string[];
  enemies?: StageEnemy[];
  hard?: {
    multiplier?: number;
    modifiers?: Effect[];
  } | null;
}

// slim stage-list index entry.
export interface StageIndexEntry {
  quest_id: number;
  name?: string;
  event?: string | null;
  event_category?: string | null;
  mission_id?: number | null;
  multiplier?: number;
  map_no?: number;
  active?: boolean;
  enemy_count?: number;
}

// a global enemy (Enemy.atb row) in enemies.json.
export interface GlobalEnemy {
  id: number;
  type: string;
  weather?: string;
  hp: number;
  attack: number;
  damage_type: DamageType;
  armor_defense?: number;
  magic_defense?: number;
  attack_range?: number;
  attack_speed?: number;
  move_speed?: number;
  boss?: boolean;
  sky?: boolean;
  tags?: string[];
  influences?: number[];
  change_to?: number | null;
  change_condition?: number | null;
  pattern_id: number;
  special_effect_id?: number | null;
  raw?: { MagicAttack?: number; TypeAttack?: number; ATTACK_TYPE?: number };
}

// influence label tables (templated strings keyed by kind+id).
export interface InfluenceLabels {
  specialty: Record<string, string>;
  term: Record<string, string>;
}

// race id -> { name (JP), en (clean English) }.
export type RaceLabels = Record<string, { name?: string; en?: string }>;

// JP -> EN maps (data/localisation.json, from the txt lists + the
// fandom-wiki crawl; regenerated reuse lists live in
// Data/localisation/generated/).
export interface Localisation {
  classes: Record<string, string>;
  races: Record<string, string>;
  tags: Record<string, string>;      // identity + genus
  skills: Record<string, string>;
  abilities: Record<string, string>;
}

// one Prince title card (data/prince_titles.json).
export interface PrinceTitle {
  id: number;
  name: string;
  name_en?: string | null;
  level?: number; // repeated identical titles = successive upgrade levels
}

// global enemy id -> quest ids it appears in.
export type EnemyStages = Record<string, number[]>;

// ---- units (playable cards) ----------------------------------------------
export type UnitImageKind = "art" | "icon" | "sprite";
// Raw influence row (SkillInfluenceConfig / AbilityConfig). Meanings are NOT
// yet resolved (no label table ported for these ids) -- ids/params shown raw.
// Extra key=value data from the row's ExtendProperty column (e.g. a buff's
// duration/percent/stack-cap that doesn't fit the fixed Param1-4 slots).
export type InfluenceExtend = Record<string, string | number>;

export interface SkillInfluence {
  influence_type?: number;
  target?: string | number;
  mul?: number;
  mul2?: number;
  mul3?: number;
  // this row's cap at max skill level, from _HoldRatioUpperLimit
  // (e.g. mul3=450 base, cap=500 -> "5x at max level", user-confirmed).
  mul3_cap?: number;
  // mul3/mul3_cap were filled from the skill's Power/PowerMax (the row's own
  // mul3 was unset -- Power integrated at export, see aigis.unit).
  power_filled?: boolean;
  // the exact skill-text placeholder token this row fills, from the row's
  // Tag0/TagDiff ExtendProperty (e.g. "[ATK]" or "<DEF>").
  tag?: string;
  // influence types 173/177 ("Scaling Attack"/"Scaling no. Targets",
  // user-confirmed formula) decoded: per_tick amount every interval_frames
  // (@60fps), capped at `cap`, direction +1 increasing / -1 decreasing.
  tick_scale?: {
    per_tick?: number; interval_frames?: number; per_sec?: number;
    cap?: number; direction?: number;
  };
  // influence type 21 "Missile": `add` is a Missile.atb id, resolved into
  // its splash/slow/deflect/on-hit facts the same way enemy missiles are.
  missile?: Missile;
  add?: number;
  collision?: number;
  collision_state?: number;
  change_function?: number;
  expression?: string;
  expression_human?: string;
  // this row's own gating condition (many SkillTypes are shared templates,
  // e.g. by a card's own AW2A/AW2B paths -- NOT filtered/evaluated, every
  // row is kept and shown with its raw condition so nothing is hidden).
  activate_if?: string;
  activate_if_human?: string;
  extend?: InfluenceExtend;
}

export interface AbilityInfluence {
  influence_type?: number;
  invoke?: string | number;
  target?: string | number;
  params?: number[];
  // Missile.atb ids referenced by extend keys (ミサイルID / ミサイルID1/2 /
  // counter missile), resolved like skill influence 21: id -> facts.
  missiles?: Record<string, Missile>;
  command?: string;
  command_human?: string;
  activate_command?: string;
  activate_command_human?: string;
  extend?: InfluenceExtend;
}

export interface SkillStage {
  id: number;
  name?: string;
  name_en?: string;
  // target skill ids of this stage's own swap/charge row -- recorded even
  // when the target is NOT inlined (e.g. an AW skill swapping back to the
  // base skill, or the cycle at the end of a charge chain).
  swaps_to?: number[];
  type?: number;
  text?: string;
  power?: number;
  power_max?: number;
  duration?: number;
  duration_max?: number;
  cooldown?: number;
  level_max?: number;
  influences?: SkillInfluence[];
  // from influence type 122 "Add ability config" rows -- the skill also
  // grants these (different id space, kept separate from `influences`).
  linked_ability_influences?: AbilityInfluence[];
  // set on every stage AFTER the first: how this stage was reached --
  // "swap" (influence type 49, permanent replacement after use) or
  // "charge" (influence type 267, charges into a stronger tier, which
  // typically swaps back via its own type-49 row).
  via?: "swap" | "charge";
}

// stages[0] is the skill itself; further stages are what it SWAPS TO after
// use (influence type 49 "Skill swap" chain), e.g. Double Shot -> Triple Shot.
export interface UnitSkill {
  id: number;
  name?: string;
  name_en?: string;
  stages: SkillStage[];
}

export interface UnitSkills {
  base?: UnitSkill | null;
  class_evolved?: UnitSkill | null;
  awakened?: UnitSkill | null;
}

export interface UnitAbility {
  id: number;
  name?: string;
  name_en?: string;
  type?: number;
  text?: string;
  power?: number;
  config_id?: number | null;
  influences?: AbilityInfluence[];
}

export interface UnitToken {
  unit: number;
  unit_name?: string | null;
  cost?: number;
  count?: number;
  deploy_max?: number;
  recast?: number;
  stats?: UnitClassStat[];
  // combat tokens can have their own skill + abilities (mini unit record)
  skills?: UnitSkills;
  abilities?: { default?: UnitAbility | null; awakened?: UnitAbility | null };
}

export interface UnitClassStat {
  level: number;
  hp: number;
  atk: number;
  def: number;
}

export interface UnitClass {
  class_id: number;
  cc: number; // 0 base, 1 CC, 2 AW, 3/4 2nd-AW A/B
  name?: string;
  description?: string;
  ranged: boolean;
  range?: number | null;
  block?: number | null;
  max_target?: number;
  attack_attribute?: string | number;
  cost_max?: number;
  cost_min?: number;
  max_level?: number;
  missile_id?: number | null;
  class_ability_id?: number | null;
  class_ability_influences?: AbilityInfluence[];
  // base card MR + this tier's own "MR mod" class-ability bonus (NOT constant
  // across tiers -- see aigis.unit._mr_bonus).
  magic_resistance?: number;
  attack_wait?: number | null;
  // engine frames @60fps (Attack.aod length + attack_wait + 2); null if the
  // PlayerDot archive/animation couldn't be resolved.
  attack_interval?: number | null;
  stats: UnitClassStat[];
  tokens: UnitToken[];
  materials: string[];
}

export interface UnitSpecial {
  type?: number;
  value?: number;
  params?: number[];
  command?: string | null;
}

// full unit (per-unit file).
export interface Unit {
  id: number;
  name?: string | null;
  name_en?: string | null;      // wiki short name (page title)
  name_full_en?: string | null; // full in-game title, EN
  npc?: boolean;        // NPC / test / fodder card (not a real playable unit)
  prince?: boolean;     // member of the Prince title group
  art_tiers?: number[]; // which awakening art tiers have a local art file
  rarity: string;
  rarity_id: number;
  gender?: string | number;
  magic_resistance?: number;
  sell_price?: number;
  trade_point?: number;
  build_exp?: number;
  race?: string | null;
  race_id?: number | null;
  big_race?: string | null;
  big_race_id?: number | null;
  identity_tags?: string[];
  faction?: string | null;
  genus?: string | null;
  affection_bonuses?: string[];
  classes: UnitClass[];
  skills: {
    base?: UnitSkill | null;
    class_evolved?: UnitSkill | null;
    awakened?: UnitSkill | null;
  };
  abilities: {
    default?: UnitAbility | null;
    awakened?: UnitAbility | null;
    awaken_ability_level?: number | null;
  };
  specials?: UnitSpecial[];
  dot_id: number;
}

// influence_type id -> label (skill/ability namespaces are separate).
export interface UnitInfluenceLabel {
  name?: string | null;
  verified?: boolean;
  // user-marked (test unit / synthesis fodder / NPC-only / token-only /
  // no data): deliberately not labeled, note carries the user's mark text.
  marker?: boolean;
  // value template derived from the user's notes ({pN} = ParamN, filled by
  // fillLabel): "+{p1}%" = increase by, "→ {p1}%" = set/raise/reduce TO.
  tpl?: string;
  note?: string;
  // user-confirmed: no known player-facing effect (internal mechanism, or
  // no observed effect) -- hide the row from the UI by default.
  hidden?: boolean;
}
export interface UnitInfluenceLabels {
  skill: Record<string, UnitInfluenceLabel>;
  ability: Record<string, UnitInfluenceLabel>;
}

// slim units-list index entry.
export interface UnitIndexEntry {
  id: number;
  name?: string | null;
  name_en?: string | null;
  classes?: string[];   // every class-tier JP name (for class filtering)
  tags?: string[];      // identity + genus + faction (for tag filtering)
  npc?: boolean;
  prince?: boolean;
  art_tiers?: number[];
  rarity: string;
  rarity_id: number;
  gender?: string | number;
  race?: string | null;
  class?: string | null;
  ranged?: boolean | null;
  cost_min?: number | null;
  hp?: number | null;
  atk?: number | null;
  def?: number | null;
  dot_id: number;
  // distinct skill / ability influence-type ids the unit carries anywhere
  // (skill stages, linked/default/awakened abilities, class attributes).
  s_inf?: number[];
  a_inf?: number[];
}
