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
} from "./types";

const cache: Record<string, unknown> = {};

async function loadJSON<T>(name: string): Promise<T> {
  if (cache[name]) return cache[name] as T;
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
  if (!res.ok) throw new Error(`failed to load ${name}.json`);
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

export function spriteUrl(patternId: number): string {
  return `${import.meta.env.BASE_URL}sprites/${patternId}.png`;
}

export const DMG_COLORS: Record<DamageType, string> = {
  physical: "#d98c5f",
  magical: "#6f8fd9",
  true: "#c45c8a",
};
