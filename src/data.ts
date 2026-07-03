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
} from "./types";

const cache: Record<string, unknown> = {};

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

export function spriteUrl(patternId: number): string {
  return `${import.meta.env.BASE_URL}sprites/${patternId}.png`;
}

export function useUnitInfluenceLabels(): UnitInfluenceLabels | null {
  const [labels, set] = useState<UnitInfluenceLabels | null>(null);
  useEffect(() => {
    loadJSON<UnitInfluenceLabels>("unit_influence_labels")
      .then(set)
      .catch(() => set({ skill: {}, ability: {} }));
  }, []);
  return labels;
}

// Unit images. ICONS are published with the site (public/unit-icon, ~108 MB).
// ART and battle SPRITES are several GB and stay local-only: they live in
// ../unit_images (outside web/public) and are served ONLY by vite.config.js's
// dev middleware at /unit-img/* -- the published site has no art/sprites.
export function unitImageUrl(kind: UnitImageKind, id: number, tier = 0): string {
  const suffix = kind === "sprite" || tier === 0 ? "" : `_aw${tier}`;
  if (kind === "icon") {
    return `${import.meta.env.BASE_URL}unit-icon/${id}${suffix}.png`;
  }
  return `${import.meta.env.BASE_URL}unit-img/${kind}/${id}${suffix}.png`;
}

export const DMG_COLORS: Record<DamageType, string> = {
  physical: "#d98c5f",
  magical: "#6f8fd9",
  true: "#c45c8a",
};
