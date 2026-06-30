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

// missile splash / slow / deflect (only present when noteworthy).
export interface Missile {
  speed?: number;
  splash?: number | null;
  slow?: [number, number] | null;
  deflectable?: boolean | null;
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

// global enemy id -> quest ids it appears in.
export type EnemyStages = Record<string, number[]>;
