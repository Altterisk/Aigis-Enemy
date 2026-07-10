// Lightweight data layer: fetch the exported JSON once, cache, and index it.
import { useEffect, useState } from "react";
import type {
  GlobalEnemy,
  Stage,
  StageIndexEntry,
  InfluenceLabels,
  RaceLabels,
  SpecialtyConfig,
  EnemyStages,
  DamageType,
  Unit,
  UnitIndexEntry,
  UnitImageKind,
  UnitInfluenceLabels,
  Localisation,
  PrinceTitle,
  Missile,
  AbilityInfluence,
  StoryTalk,
} from "./types";
import { INFLUENCE_LABELS } from "./influenceLabels";
import { RACE_LABELS, TAG_LABELS } from "./tagLabels";

const cache: Record<string, unknown> = {};

export { loadJSON as loadJSONFile };

async function loadJSON<T>(name: string): Promise<T> {
  if (cache[name]) return cache[name] as T;
  const url = `${import.meta.env.BASE_URL}data/${name}.json`;
  let res = await fetch(url);
  if (!res.ok) {
    // transient failures (dev-server restart, flaky network) get one retry
    res = await fetch(url);
  }
  if (!res.ok) throw new Error(`failed to load ${name}.json (${res.status})`);
  const data = (await res.json()) as T;
  cache[name] = data;
  return data;
}

export function useEnemies() {
  const [state, set] = useState<{
    loading: boolean;
    enemies: GlobalEnemy[] | null;
    byId: Map<number, GlobalEnemy> | null;
  }>({ loading: true, enemies: null, byId: null });
  useEffect(() => {
    loadJSON<GlobalEnemy[]>("enemies").then((enemies) => {
      const byId = new Map(enemies.map((e) => [e.id, e]));
      set({ loading: false, enemies, byId });
    });
  }, []);
  return state;
}

// The stage LIST: loads only the slim index (one small file).
export function useStages() {
  const [state, set] = useState<{
    loading: boolean;
    stages: StageIndexEntry[] | null;
    byQuest: Map<number, StageIndexEntry> | null;
  }>({ loading: true, stages: null, byQuest: null });
  useEffect(() => {
    loadJSON<StageIndexEntry[]>("stages_index").then((stages) => {
      const byQuest = new Map(stages.map((s) => [s.quest_id, s]));
      set({ loading: false, stages, byQuest });
    });
  }, []);
  return state;
}

// One stage's FULL data, loaded on demand (per-stage file).
export function useStageDetail(questId: number) {
  const [state, set] = useState<{ loading: boolean; stage: Stage | null }>({
    loading: true,
    stage: null,
  });
  useEffect(() => {
    let alive = true;
    set({ loading: true, stage: null });
    loadJSON<Stage>(`stage/${questId}`)
      .then((stage) => { if (alive) set({ loading: false, stage }); })
      .catch(() => { if (alive) set({ loading: false, stage: null }); });
    return () => { alive = false; };
  }, [questId]);
  return state;
}

// Per-mission out-of-battle story talk (enter/clear scenes), loaded on demand.
// Only fetched when the stage says it exists (story_talk flag).
export function useStoryTalk(missionId: number | null | undefined, enabled: boolean) {
  const [talk, set] = useState<StoryTalk | null>(null);
  useEffect(() => {
    let alive = true;
    set(null);
    if (!enabled || missionId == null) return;
    loadJSON<StoryTalk>(`talk/${missionId}`)
      .then((t) => { if (alive) set(t); })
      .catch(() => { if (alive) set(null); });
    return () => { alive = false; };
  }, [missionId, enabled]);
  return talk;
}

// Dialogue face ref -> image URL. "u<cardId>[a<tier>]" = unit icon;
// "l<hash>" = deduped NPC face (talk-face/<hash>.png, gitignored locally and
// served from the assets repo in production, like banners/sprites).
export function talkFaceUrl(face?: string | null): string | null {
  if (!face) return null;
  if (face.startsWith("l")) {
    return assetUrl(`talk-face/${face.slice(1)}.png`);
  }
  const m = /^u(\d+)(?:a(\d+))?$/.exec(face);
  if (!m) return null;
  return unitImageUrl("icon", Number(m[1]), m[2] ? Number(m[2]) : 0);
}

export function useInfluenceLabels(): InfluenceLabels | null {
  const [labels, set] = useState<InfluenceLabels | null>(null);
  useEffect(() => {
    loadJSON<InfluenceLabels>("influence_labels")
      .then(set)
      .catch(() => set({ specialty: {}, term: {} }));
  }, []);
  return labels;
}

// global enemy id -> the quest_ids it appears in.
export function useEnemyStages(): EnemyStages | null {
  const [map, set] = useState<EnemyStages | null>(null);
  useEffect(() => {
    loadJSON<EnemyStages>("enemy_stages").then(set).catch(() => set({}));
  }, []);
  return map;
}

// SpEff id -> its influence rows (shared map; enemies carry only the id).
export function useSpecialtyConfig(): SpecialtyConfig | null {
  const [cfg, set] = useState<SpecialtyConfig | null>(null);
  useEffect(() => {
    loadJSON<SpecialtyConfig>("specialty_config").then(set).catch(() => set({}));
  }, []);
  return cfg;
}

export function useRaceLabels(): RaceLabels | null {
  const [labels, set] = useState<RaceLabels | null>(null);
  useEffect(() => {
    loadJSON<RaceLabels>("race_labels").then(set).catch(() => set({}));
  }, []);
  return labels;
}

// The unit LIST: loads only the slim index (one file, ~2800 entries).
export function useUnits() {
  const [state, set] = useState<{
    loading: boolean;
    units: UnitIndexEntry[] | null;
    byId: Map<number, UnitIndexEntry> | null;
  }>({ loading: true, units: null, byId: null });
  useEffect(() => {
    loadJSON<UnitIndexEntry[]>("units").then((units) => {
      const byId = new Map(units.map((u) => [u.id, u]));
      set({ loading: false, units, byId });
    });
  }, []);
  return state;
}

// One unit's FULL data, loaded on demand (per-unit file).
export function useUnitDetail(id: number) {
  const [state, set] = useState<{ loading: boolean; unit: Unit | null }>({
    loading: true,
    unit: null,
  });
  useEffect(() => {
    let alive = true;
    set({ loading: true, unit: null });
    loadJSON<Unit>(`unit/${id}`)
      .then((unit) => { if (alive) set({ loading: false, unit }); })
      .catch(() => { if (alive) set({ loading: false, unit: null }); });
    return () => { alive = false; };
  }, [id]);
  return state;
}

// JP -> EN class/race maps. races/tags are always the static, hot-reloadable
// RACE_LABELS/TAG_LABELS (see tagLabels.ts) -- editing a translation there
// takes effect immediately, no Python re-export needed. classes/skills/
// abilities still come from the published export (they need the wiki-crawl
// voting pipeline, which can't move client-side the same way).
export function useLocalisation(): Localisation | null {
  const [loc, set] = useState<Localisation | null>(null);
  useEffect(() => {
    loadJSON<Localisation>("localisation")
      .then((l) => set({ ...l, races: RACE_LABELS, tags: TAG_LABELS }))
      .catch(() => set({ classes: {}, races: RACE_LABELS, tags: TAG_LABELS, skills: {}, abilities: {} }));
  }, []);
  return loc;
}

// the Prince title group (empty until the export has produced it).
export function usePrinceTitles(): PrinceTitle[] | null {
  const [titles, set] = useState<PrinceTitle[] | null>(null);
  useEffect(() => {
    loadJSON<PrinceTitle[]>("prince_titles").then(set).catch(() => set([]));
  }, []);
  return titles;
}

// Site assets that are gitignored locally (enemy sprites, banners, enemy
// idle gifs) are served from a single jsDelivr assets repo in production.
const ASSETS_CDN: string =
  (import.meta.env.VITE_ASSETS_CDN as string | undefined)?.replace(/\/$/, "") || "";

function assetUrl(rel: string): string {
  if (ASSETS_CDN && !import.meta.env.DEV) return `${ASSETS_CDN}/${rel}`;
  return `${import.meta.env.BASE_URL}${rel}`;
}

export function spriteUrl(patternId: number): string {
  return assetUrl(`sprites/${patternId}.png`);
}

export interface CurrentMission {
  mission_id: number;
  name: string;
  category: string;
}

// missions whose config row is currently OPEN (Enable day-bitmask set)
export function useCurrentMissions(): CurrentMission[] | null {
  const [cur, set] = useState<CurrentMission[] | null>(null);
  useEffect(() => {
    loadJSON<CurrentMission[]>("current_missions").then(set).catch(() => set([]));
  }, []);
  return cur;
}

export interface HistoryYear {
  group: number;
  title: string;
  banner_texture: number;
  missions: number[];
}

export function useHistoryYears(): HistoryYear[] | null {
  const [years, set] = useState<HistoryYear[] | null>(null);
  useEffect(() => {
    loadJSON<HistoryYear[]>("history_years").then(set).catch(() => set([]));
  }, []);
  return years;
}

// Enemy idle animation; EnemyDot archives are shared per dot number.
export function enemyAnimUrl(patternId: number): string {
  const dot = Math.floor((patternId - 0x200000) / 16);
  return assetUrl(`sprite-anim/${dot}.gif`);
}

export function bannerUrl(missionId: number | string): string {
  return assetUrl(`banners/${missionId}.png`);
}

// Skill/ability influence names/templates are a static import from
// influenceLabels.ts, not a fetched JSON file, so editing wording doesn't
// require a Python re-export.
export function useUnitInfluenceLabels(): UnitInfluenceLabels | null {
  return INFLUENCE_LABELS;
}

// every Missile.atb id with non-trivial facts (splash/slow/on-hit/penetrate/
// ...), keyed by id -- lets any raw missile id (e.g. one found inside a
// decoded "Command" script) be resolved without a per-row backend lookup.
export function useMissiles(): Record<string, Missile> | null {
  const [missiles, set] = useState<Record<string, Missile> | null>(null);
  useEffect(() => {
    loadJSON<Record<string, Missile>>("missiles").then(set).catch(() => set({}));
  }, []);
  return missiles;
}

// every AbilityConfig._ConfigID's resolved influence rows, keyed by id --
// lets ability influence type 189 ("Grant ability") resolve its raw
// AbilityConfig._ConfigID param client-side.
export function useAbilityConfigs(): Record<string, AbilityInfluence[]> | null {
  const [configs, set] = useState<Record<string, AbilityInfluence[]> | null>(null);
  useEffect(() => {
    loadJSON<Record<string, AbilityInfluence[]>>("ability_configs").then(set).catch(() => set({}));
  }, []);
  return configs;
}

// Unit images. ICONS are published with the site (public/unit-icon, ~108 MB).
// ART and battle SPRITES are several GB and stay out of this repo: in dev
// they live in ../unit_images served by vite.config.js's middleware at
// /unit-img/*. For the published site, set VITE_IMG_CDN to a static base
// hosting the same art/<id>.png + sprite/<id>.png layout. The art is split
// across several bucket repos (python/make_image_buckets.py) served via
// jsDelivr; a "{b}" placeholder in VITE_IMG_CDN is replaced with the bucket
// number for the unit id, routed by VITE_IMG_BUCKET_BOUNDS — a
// comma-separated list of each bucket's highest unit id (ascending); ids
// past the last boundary go to the last+1 (open-ended, newest) bucket.
// e.g. VITE_IMG_CDN=https://cdn.jsdelivr.net/gh/Altterisk/aigis-img-{b}@main
//      VITE_IMG_BUCKET_BOUNDS=615,1225,1885,2580
// Without VITE_IMG_CDN, production falls back to icons (UnitImage
// fallbackKind).
const IMG_CDN: string =
  (import.meta.env.VITE_IMG_CDN as string | undefined)?.replace(/\/$/, "") || "";
const IMG_BUCKET_BOUNDS: number[] =
  ((import.meta.env.VITE_IMG_BUCKET_BOUNDS as string | undefined) || "")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n));

function imgBucket(id: number): number {
  let b = 0;
  while (b < IMG_BUCKET_BOUNDS.length && id > IMG_BUCKET_BOUNDS[b]) b++;
  return b;
}

// Unit battle-sprite animation (all poses exported by export_anim.py);
// lives in the aigis-assets repo — the id-routed art buckets sit near the
// 1 GB limit.
export function unitAnimUrl(dotId: number, pose: string): string {
  if (ASSETS_CDN && !import.meta.env.DEV) {
    return `${ASSETS_CDN}/anim/${dotId}_${pose}.gif`;
  }
  return `${import.meta.env.BASE_URL}unit-img/anim/${dotId}_${pose}.gif`;
}

export function unitImageUrl(kind: UnitImageKind, id: number, tier = 0): string {
  const suffix = kind === "sprite" || tier === 0 ? "" : `_aw${tier}`;
  if (kind === "icon") {
    return `${import.meta.env.BASE_URL}unit-icon/${id}${suffix}.png`;
  }
  if (IMG_CDN && !import.meta.env.DEV) {
    const base = IMG_CDN.replace("{b}", String(imgBucket(id)));
    return `${base}/${kind}/${id}${suffix}.png`;
  }
  return `${import.meta.env.BASE_URL}unit-img/${kind}/${id}${suffix}.png`;
}

export const DMG_COLORS: Record<DamageType, string> = {
  physical: "#d98c5f",
  magical: "#6f8fd9",
  true: "#c45c8a",
};
