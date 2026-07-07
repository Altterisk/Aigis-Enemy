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

export function spriteUrl(patternId: number): string {
  return `${import.meta.env.BASE_URL}sprites/${patternId}.png`;
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
// hosting the same art/<id>.png + sprite/<id>.png layout — e.g. a dedicated
// image repo via jsDelivr: https://cdn.jsdelivr.net/gh/<user>/<repo>@<tag>
// (jsDelivr serves files up to 20 MB from public GitHub repos; keep each
// image repo under ~1 GB, split if needed). Without it, production falls
// back to icons (UnitImage fallbackKind).
const IMG_CDN: string =
  (import.meta.env.VITE_IMG_CDN as string | undefined)?.replace(/\/$/, "") || "";

export function unitImageUrl(kind: UnitImageKind, id: number, tier = 0): string {
  const suffix = kind === "sprite" || tier === 0 ? "" : `_aw${tier}`;
  if (kind === "icon") {
    return `${import.meta.env.BASE_URL}unit-icon/${id}${suffix}.png`;
  }
  if (IMG_CDN && !import.meta.env.DEV) {
    return `${IMG_CDN}/${kind}/${id}${suffix}.png`;
  }
  return `${import.meta.env.BASE_URL}unit-img/${kind}/${id}${suffix}.png`;
}

export const DMG_COLORS: Record<DamageType, string> = {
  physical: "#d98c5f",
  magical: "#6f8fd9",
  true: "#c45c8a",
};
