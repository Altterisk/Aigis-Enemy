// Lightweight data layer: fetch the exported JSON once, cache, and index it.
import { useEffect, useState } from "react";

const cache = {};

async function loadJSON(name) {
  if (cache[name]) return cache[name];
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
  if (!res.ok) throw new Error(`failed to load ${name}.json`);
  const data = await res.json();
  cache[name] = data;
  return data;
}

export function useEnemies() {
  const [state, set] = useState({ loading: true, enemies: null, byId: null });
  useEffect(() => {
    loadJSON("enemies").then((enemies) => {
      const byId = new Map(enemies.map((e) => [e.id, e]));
      set({ loading: false, enemies, byId });
    });
  }, []);
  return state;
}

export function useStages() {
  const [state, set] = useState({ loading: true, stages: null, byQuest: null });
  useEffect(() => {
    loadJSON("stages").then((stages) => {
      const byQuest = new Map(stages.map((s) => [s.quest_id, s]));
      set({ loading: false, stages, byQuest });
    });
  }, []);
  return state;
}

export function useInfluenceLabels() {
  const [labels, set] = useState(null);
  useEffect(() => {
    loadJSON("influence_labels")
      .then(set)
      .catch(() => set({ specialty: {}, term: {} }));
  }, []);
  return labels;
}

export function useRaceLabels() {
  const [labels, set] = useState(null);
  useEffect(() => {
    loadJSON("race_labels")
      .then(set)
      .catch(() => set({}));
  }, []);
  return labels;
}

export function spriteUrl(patternId) {
  return `${import.meta.env.BASE_URL}sprites/${patternId}.png`;
}

export const DMG_COLORS = {
  physical: "#d98c5f",
  magical: "#6f8fd9",
  true: "#c45c8a",
};
