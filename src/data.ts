// Lightweight data layer: fetch the exported JSON once (shared loader), and index it.
import { useEffect, useState } from "react";
import type {
  DropItem,
  AffectionBonus,
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
  Texts,
  PrinceData,
  PossessionBuffs,
  WarGodBlessings,
  Missile,
  AbilityInfluence,
  StoryTalk,
  StoryIndex,
  StoryGroup,
  UnitSpeech,
  WeatherData,
} from "./types";
import { INFLUENCE_LABELS } from "./influenceLabels";
import { setExprNames, type ExprNames } from "./humanize";
import { RACE_LABELS, TAG_LABELS } from "./tagLabels";
import { bucketFor, createJsonLoader, parseBounds } from "@altterisk/game-hub/data";
import { TAG_JA, getLang, useLang } from "./i18n";

// retryOn keeps the old behaviour of retrying any non-OK response once
const loader = createJsonLoader({
  urls: (name) => [`${import.meta.env.BASE_URL}data/${name}.json`],
  retryOn: () => true,
});

export { loadJSON as loadJSONFile };

function loadJSON<T>(name: string): Promise<T> {
  return loader.load<T>(name);
}

// Stat value of one affection stat bonus (HP/ATK/DEF/Range/Speed) before the
// unit's own stat mod: slots 1/2 (100% affection) scale *1.2 at full bloom
// (max level > 50) and *0.5 at half bloom; slot 3 (150% affection) applies
// at its raw value.
export function affectionStat(b: AffectionBonus, fullBloom: boolean): number {
  if (b.slot === 3) return b.raw;
  return Math.floor(b.raw * (fullBloom ? 1.2 : 0.5) + 0.5);
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
// Availability is a compact mission-id list instead of a flag duplicated into
// every stage belonging to that mission.
export function useStoryTalk(missionId: number | null | undefined) {
  const [state, set] = useState<{
    available: boolean;
    talk: StoryTalk | null;
  }>({ available: false, talk: null });
  useEffect(() => {
    let alive = true;
    set({ available: false, talk: null });
    if (missionId == null) return;
    loadJSON<number[]>("story_talk_missions")
      .then((ids) => {
        if (!ids.includes(missionId)) return null;
        if (alive) set({ available: true, talk: null });
        return loadJSON<StoryTalk>(`talk/${missionId}`);
      })
      .then((talk) => {
        if (alive && talk) set({ available: true, talk });
      })
      .catch(() => {
        if (alive) set({ available: false, talk: null });
      });
    return () => { alive = false; };
  }, [missionId]);
  return state;
}

// Per-unit quotes + affection/trust scenes, loaded on demand. Units without
// speech data simply have no file -> null (section hidden).
export function useUnitSpeech(id: number) {
  const [speech, set] = useState<UnitSpeech | null>(null);
  useEffect(() => {
    let alive = true;
    set(null);
    loadJSON<UnitSpeech>(`speech/${id}`)
      .then((s) => { if (alive) set(s); })
      .catch(() => { if (alive) set(null); });
    return () => { alive = false; };
  }, [id]);
  return speech;
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

// PatternID -> lowest PatternID with a pixel-identical sprite (only aliased ids are listed).
export type SpriteAlias = Record<string, number>;

export function useSpriteAlias(): SpriteAlias | null {
  const [alias, set] = useState<SpriteAlias | null>(null);
  useEffect(() => {
    loadJSON<SpriteAlias>("sprite_alias").then(set).catch(() => set({}));
  }, []);
  return alias;
}

export function sameSprite(alias: SpriteAlias | null, a?: number | null, b?: number | null): boolean {
  if (a == null || b == null) return a === b;
  return (alias?.[String(a)] ?? a) === (alias?.[String(b)] ?? b);
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

// Loads data/expr_names.json (the id -> name tables of the condition
// humanizer) once. Pages that show condition text call it so they re-render
// when the names arrive.
let exprNamesLoaded = false;
export function useExprNames(): boolean {
  const [ready, set] = useState(exprNamesLoaded);
  useEffect(() => {
    if (exprNamesLoaded) return;
    loadJSON<ExprNames>("expr_names")
      .then((n) => {
        if (!exprNamesLoaded) setExprNames(n);
        exprNamesLoaded = true;
        set(true);
      })
      .catch(() => set(true));
  }, []);
  return ready;
}

// Unit id -> English (else JP) name, for [[unit:ID]] markers in conditions.
// Shares the cached unit index with useUnits.
// Built once and shared: HumanText renders hundreds of times per page.
// `needed` = false skips loading the unit index at all.
// In Japanese mode the Japanese name.
type NameMaps = { en: Map<number, string>; ja: Map<number, string> };
let unitNameMap: NameMaps | null = null;
let unitNameLoad: Promise<NameMaps> | null = null;
export function useUnitNameMap(needed = true): Map<number, string> | null {
  const lang = useLang();
  const [names, set] = useState<NameMaps | null>(unitNameMap);
  useEffect(() => {
    if (!needed || unitNameMap) return;
    unitNameLoad ??= loadJSON<UnitIndexEntry[]>("units")
      .then((units) => ({
        en: new Map(units.map((u) => [u.id, u.name_en || u.name || `#${u.id}`] as [number, string])),
        ja: new Map(units.map((u) => [u.id, u.name || u.name_en || `#${u.id}`] as [number, string])),
      }))
      .catch(() => ({ en: new Map<number, string>(), ja: new Map<number, string>() }));
    let alive = true;
    unitNameLoad.then((m) => {
      unitNameMap = m;
      if (alive) set(m);
    });
    return () => { alive = false; };
  }, [needed]);
  return names ? names[lang] : null;
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
// A unit tag in English: identity/season tags are in `tags`, factions and races in `races`.
export function tagName(loc: Localisation | null, tag: string): string {
  if (getLang() === "ja") return TAG_JA[tag] ?? tag;
  return loc?.tags[tag] || loc?.races[tag] || tag;
}

// In Japanese mode every map is empty, so callers fall back to the game's own name.
const NO_LOCALISATION: Localisation = { classes: {}, races: {}, tags: {}, skills: {}, abilities: {} };
export function useLocalisation(): Localisation | null {
  const lang = useLang();
  const [loc, set] = useState<Localisation | null>(null);
  useEffect(() => {
    // tagLabels.ts wins; the exported maps fill any tag it does not name yet
    loadJSON<Localisation>("localisation")
      .then((l) => set({ ...l, races: { ...l.races, ...RACE_LABELS }, tags: { ...l.tags, ...TAG_LABELS } }))
      .catch(() => set({ classes: {}, races: RACE_LABELS, tags: TAG_LABELS, skills: {}, abilities: {} }));
  }, []);
  return loc && lang === "ja" ? NO_LOCALISATION : loc;
}

// Machine-translated skill/ability/class descriptions (data/texts.json).
// Separate from useLocalisation: this file is ~1.6 MB, so only unit/tag detail
// pages that render descriptions pay for it. Missing file -> empty maps (JP shows).
const EMPTY_TEXTS: Texts = { skill_texts: {}, ability_texts: {}, class_texts: {} };

// Japanese mode: no translations, the original text shows.
export function useTexts(): Texts {
  const lang = useLang();
  const [texts, set] = useState<Texts>(EMPTY_TEXTS);
  useEffect(() => {
    loadJSON<Texts>("texts")
      .then((t) => set({ ...EMPTY_TEXTS, ...t }))
      .catch(() => set(EMPTY_TEXTS));
  }, []);
  return lang === "ja" ? EMPTY_TEXTS : texts;
}

// War God Blessing items and rows; empty until the export has produced it.
export function useWarGodBlessings(): WarGodBlessings | null {
  const [data, set] = useState<WarGodBlessings | null>(null);
  useEffect(() => {
    loadJSON<WarGodBlessings>("war_god_blessings")
      .then((d) => set(Array.isArray(d?.rows) ? d : { items: {}, rows: [] }))
      .catch(() => set({ items: {}, rows: [] }));
  }, []);
  return data;
}

// 【所持効果】 possession-effect rows of every real unit.
export function usePossessionBuffs(): PossessionBuffs | null {
  const [data, set] = useState<PossessionBuffs | null>(null);
  useEffect(() => {
    loadJSON<PossessionBuffs>("possession_buffs")
      .then((d) => set(Array.isArray(d?.rows) ? d : { rows: [] }))
      .catch(() => set({ rows: [] }));
  }, []);
  return data;
}

// Prince titles (PlayerTitle.atb); empty until the export has produced it.
const EMPTY_PRINCE: PrinceData = { base: { id: 1 }, titles: [] };
export function usePrinceTitles(): PrinceData | null {
  const [data, set] = useState<PrinceData | null>(null);
  useEffect(() => {
    loadJSON<PrinceData>("prince_titles")
      .then((d) => set(Array.isArray(d?.titles) ? d : EMPTY_PRINCE))
      .catch(() => set(EMPTY_PRINCE));
  }, []);
  return data;
}

// Site assets that are gitignored locally (enemy sprites, banners, enemy
// idle gifs) are served from a single jsDelivr assets repo in production.
const ASSETS_CDN: string =
  (import.meta.env.VITE_ASSETS_CDN as string | undefined)?.replace(/\/$/, "") || "";

function assetUrl(rel: string): string {
  if (ASSETS_CDN && !import.meta.env.DEV) return `${ASSETS_CDN}/${rel}`;
  return `${import.meta.env.BASE_URL}${rel}`;
}

// Story scene images: "u<cardId>" = the unit's art, "e<id>" = an event character.
export function storyCharaUrl(ref: string): string | null {
  const m = /^([ue])(\d+)$/.exec(ref);
  if (!m) return null;
  return m[1] === "u" ? unitImageUrl("art", Number(m[2])) : assetUrl(`story-chara/${m[2]}.webp`);
}

export function storyBgUrl(src: string): string {
  return assetUrl(`story-bg/${src}.webp`);
}

export function useStoryIndex(): StoryIndex | null {
  const [index, set] = useState<StoryIndex | null>(null);
  useEffect(() => {
    loadJSON<StoryIndex>("story/index").then(set).catch(() => set({ stage: [960, 640], groups: [] }));
  }, []);
  return index;
}

export function useStoryGroup(id: string | undefined) {
  const [state, set] = useState<{ loading: boolean; group: StoryGroup | null }>({ loading: true, group: null });
  useEffect(() => {
    let alive = true;
    set({ loading: true, group: null });
    if (!id || !/^[a-z0-9]+$/.test(id)) {
      set({ loading: false, group: null });
      return;
    }
    loadJSON<StoryIndex>("story/index")
      .then((index) => {
        const entry = index.groups.find((g) => g.id === id);
        if (!entry) return null;
        return loadJSON<Record<string, StoryGroup>>(`story/s${entry.shard}`).then((shard) => shard[id] ?? null);
      })
      .then((group) => { if (alive) set({ loading: false, group }); })
      .catch(() => { if (alive) set({ loading: false, group: null }); });
    return () => { alive = false; };
  }, [id]);
  return state;
}

export function spriteUrl(patternId: number): string {
  return assetUrl(`sprites/${patternId}.png`);
}

export interface CurrentMission {
  mission_id: number;
  name: string;
  category: string;
  // "running" = limited-time and open now, "permanent" = always available
  timing: "running" | "permanent";
  // a running mission's end: "2026/11/19 11:00:00" (home banner) or
  // "2026-11-19" (hand-kept entry, last day)
  until?: string;
}

// missions whose config row is currently OPEN (Enable day-bitmask set)
export function useCurrentMissions(): CurrentMission[] | null {
  const [cur, set] = useState<CurrentMission[] | null>(null);
  useEffect(() => {
    loadJSON<CurrentMission[]>("current_missions").then(set).catch(() => set([]));
  }, []);
  return cur;
}

// Summon lineups, live plus every one seen before; times are JST ("2026/11/19 11:30:00"), close "" = no end.
export interface CurrentSummon {
  key: string; // summon_id, or "a<series>-<open digits>" for a rotation known only from banner art
  summon_id: number | null;
  series: number; // title text id: rotations of one banner share it (0 = home-rotation only)
  title: string;
  open: string;
  close: string;
  units: number[]; // rate-up card ids
  currency: number;
  consume_item: string | null;
  banner_id: number;
  source: "server" | "art";
  ocr?: boolean; // art entry read by the export's banner OCR (absent = entered by hand)
  banner: boolean; // banners/summon_<key>.png exists
}

// The live summon worker (workers/aigis-summons); unset = the exported file only.
const SUMMONS_API: string =
  (import.meta.env.VITE_SUMMONS_API as string | undefined)?.replace(/\/$/, "") || "";

type LiveSummon = Omit<CurrentSummon, "key" | "title" | "banner">;

const sameRotation = (a: { series: number; units: number[] }, b: { series: number; units: number[] }) =>
  a.series === b.series && [...a.units].sort().join() === [...b.units].sort().join();

// Live lineups override the exported ones by id; an art-only rotation the server now lists is dropped.
export function mergeSummons(
  exported: CurrentSummon[], titles: Record<string, string>, live: LiveSummon[],
): CurrentSummon[] {
  const byKey = new Map(exported.map((s) => [s.key, { ...s, title: s.title || titles[s.series] || "" }]));
  for (const r of live) {
    const key = String(r.summon_id);
    const prev = byKey.get(key);
    byKey.set(key, { ...r, key, title: titles[r.series] || prev?.title || "", banner: prev?.banner ?? r.banner_id > 0 });
  }
  const all = [...byKey.values()];
  return all.filter((s) => s.source !== "art" || !all.some((o) => o.source === "server" && sameRotation(o, s)));
}

export function useCurrentSummons(): CurrentSummon[] | null {
  const [cur, set] = useState<CurrentSummon[] | null>(null);
  useEffect(() => {
    let alive = true;
    const live = SUMMONS_API
      ? fetch(`${SUMMONS_API}/summons`).then((r) => (r.ok ? r.json() : { lineups: [] }))
        .then((d: { lineups?: LiveSummon[] }) => d.lineups ?? []).catch(() => [] as LiveSummon[])
      : Promise.resolve([] as LiveSummon[]);
    Promise.all([
      loadJSON<CurrentSummon[]>("current_summons").catch(() => [] as CurrentSummon[]),
      loadJSON<Record<string, string>>("summon_titles").catch(() => ({} as Record<string, string>)),
      live,
    ]).then(([exported, titles, lineups]) => { if (alive) set(mergeSummons(exported, titles, lineups)); });
    return () => { alive = false; };
  }, []);
  return cur;
}

// Temple banners are exported by BannerID; a home-rotation-only summon by its key.
export function summonBannerUrl(s: { key: string; banner_id: number }): string {
  return assetUrl(`banners/summon_${s.banner_id ? `b${s.banner_id}` : s.key}.png`);
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

// Per mission id: the event's English name and its first run (JST dates,
// "2025-04-03"); no dates for permanent content.
export interface EventInfoEntry {
  en: string;
  start?: string;
  end?: string;
}

export function useEventInfo(): Record<string, EventInfoEntry> | null {
  const [info, set] = useState<Record<string, EventInfoEntry> | null>(null);
  useEffect(() => {
    loadJSON<Record<string, EventInfoEntry>>("event_info").then(set).catch(() => set({}));
  }, []);
  return info;
}

export function useDropItems(): Record<string, DropItem> | null {
  const [items, set] = useState<Record<string, DropItem> | null>(null);
  useEffect(() => {
    loadJSON<Record<string, DropItem>>("drop_items").then(set).catch(() => set({}));
  }, []);
  return items;
}

// Stage-list category tiles in the in-game mission portal's order; banner =
// banners/category_<key>.png exists (the game's general banner for the menu).
export interface StageCategoryTile {
  key: string;
  title: string;
  categories: string[];
  banner: boolean;
}

export interface StageCategories {
  tiles: StageCategoryTile[];
  // MissionConfig DisplayOrder by mission id: a category's in-game list order
  display_order: Record<string, number>;
}

export function useStageCategories(): StageCategories | null {
  const [cats, set] = useState<StageCategories | null>(null);
  useEffect(() => {
    loadJSON<StageCategories>("stage_categories").then(set)
      .catch(() => set({ tiles: [], display_order: {} }));
  }, []);
  return cats;
}

// Enemy idle animation; EnemyDot archives are shared per dot number.
export function enemyAnimUrl(patternId: number): string {
  const dot = Math.floor((patternId - 0x200000) / 16);
  return assetUrl(`sprite-anim/${dot}.gif`);
}

export function bannerUrl(missionId: number | string): string {
  return assetUrl(`banners/${missionId}.png`);
}

// Stage map art: its own jsDelivr repo (aigis-maps) in production, public/maps in dev.
const MAPS_CDN: string =
  (import.meta.env.VITE_MAPS_CDN as string | undefined)?.replace(/\/$/, "") || "";

export function mapImageUrl(image: string): string {
  if (MAPS_CDN && !import.meta.env.DEV) return `${MAPS_CDN}/${image}.webp`;
  return `${import.meta.env.BASE_URL}maps/${image}.webp`;
}

// Skill/ability influence names/templates are a static import from
// influenceLabels.ts, not a fetched JSON file, so editing wording doesn't
// require a Python re-export.
export function useUnitInfluenceLabels(): UnitInfluenceLabels | null {
  return INFLUENCE_LABELS;
}

// the decoded WeatherConfig table + the units whose skill generates a weather.
export function useWeather(): WeatherData | null {
  const [weather, set] = useState<WeatherData | null>(null);
  useEffect(() => {
    loadJSON<WeatherData>("weather")
      .then(set)
      .catch(() => set({ weathers: [], sources: [] }));
  }, []);
  return weather;
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
const IMG_BUCKET_BOUNDS = parseBounds(import.meta.env.VITE_IMG_BUCKET_BOUNDS as string | undefined);

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
    const base = IMG_CDN.replace("{b}", String(bucketFor(id, IMG_BUCKET_BOUNDS)));
    return `${base}/${kind}/${id}${suffix}.png`;
  }
  return `${import.meta.env.BASE_URL}unit-img/${kind}/${id}${suffix}.png`;
}

export const DMG_COLORS: Record<DamageType, string> = {
  physical: "#d98c5f",
  magical: "#6f8fd9",
  true: "#c45c8a",
};
