// Page titles, descriptions and canonical URLs. Plain functions over the
// exported JSON (no React, no fetch, no import.meta.env): the pages set them at
// runtime through usePageMeta, and the build (prerender.js) writes the same
// text into each page's static HTML, so the two never disagree.
import { clip as hubClip, createSiteMeta, plainText as hubPlainText, sentence, type PageMeta } from "@altterisk/game-hub/meta";

export type { PageMeta };

export const DEFAULT_META: PageMeta = {
  title: "",
  description:
    "Fan-made Millennium War Aigis (千年戦争アイギス) database: unit stats, skills and abilities, enemy stats, stage maps and waves, buff index, collection checker, cost generation and DPS calculators.",
};

export const site = createSiteMeta({
  game: "aigis",
  format: (title, s) => `${title} · ${s.name}`,
  defaultDescription: DEFAULT_META.description,
  defaultImage: "/favicon.png",
});

/** Where the site is served; canonical URLs, the sitemap and og:url use it. */
export const SITE_URL = site.url;
export const SITE_NAME = site.name;

export const NOT_FOUND_META: PageMeta = { title: "Page not found", description: DEFAULT_META.description, noindex: true };

/** Index pages, keyed by path. */
export const LIST_META: Record<string, PageMeta> = {
  "/units": {
    title: "Units",
    description: "Every Millennium War Aigis unit: rarity, class, stats, skills, abilities, awakening, quotes and art. Filter by rarity, class, race, faction and tag.",
  },
  "/collection": {
    title: "Collection",
    description: "Track which Millennium War Aigis units you own, import them from screenshots and back the list up as a code or file.",
  },
  "/enemies": {
    title: "Enemies",
    description: "Every Millennium War Aigis enemy: HP, attack, defense, magic resistance, damage type, range, speed, specialties and the stages it appears in.",
  },
  "/stages": {
    title: "Stages",
    description: "Millennium War Aigis stages by story chapter and event: enemy waves, stats, map terms, weather and dialogue.",
  },
  "/buffs": {
    title: "Buffs",
    description: "Millennium War Aigis units grouped by the buffs and debuffs their skills and abilities give: ATK, DEF, MR, range, cost, healing and more.",
  },
  "/costgen": {
    title: "Cost Gen",
    description: "Simulate Millennium War Aigis cost (UP) generation over time for a team of units, with skill timing, cooldown reduction and affection.",
  },
  "/dps": {
    title: "DPS Calculator",
    description: "Millennium War Aigis damage calculator: a unit's DPS against an enemy's HP, defense and magic resistance, with buffs and skills.",
  },
  "/weather": {
    title: "Weather",
    description: "Millennium War Aigis weather effects on allies and enemies, and the skills that create each weather.",
  },
  "/artists": {
    title: "Artists",
    description: "Every illustrator credited on a Millennium War Aigis unit, with the units they drew.",
  },
};

export const fullTitle = site.fullTitle;
/** Each path segment encoded once (tag pages carry Japanese names). */
export const sitePath = site.sitePath;
export const canonicalUrl = (path: string) => site.canonicalUrl(path);

const clip = (s: string) => hubClip(s, 200);
/** Drops the game's %c[rrggbb] colour codes. */
export const plainText = (s: string | null | undefined) => hubPlainText(s, /%c\[[0-9a-fA-F]{6}\]/g);

export interface UnitMetaSource {
  id: number;
  name?: string | null;
  name_en?: string | null;
  name_full_en?: string | null;
  rarity: string;
  artist?: string | null;
  release_year?: number | null;
}

/** className: the unit's base class, in English where translated. */
export function unitMeta(u: UnitMetaSource, className?: string | null): PageMeta {
  const short = u.name_en || u.name || `Unit #${u.id}`;
  const full = u.name_full_en || short;
  const kind = [u.rarity, className].filter(Boolean).join(" ");
  return {
    title: kind ? `${short} – ${kind}` : short,
    description: clip(sentence(
      `${full}${u.name && u.name !== full ? ` (${u.name})` : ""}, ${kind || "a"} unit in Millennium War Aigis:`,
      "stats, class chain, skills, abilities, quotes and art.",
      u.artist && `Art: ${u.artist}.`,
      u.release_year ? `Released ${u.release_year}.` : null,
    )),
    image: `/unit-icon/${u.id}.png`,
  };
}

export interface StageMetaSource {
  quest_id: number;
  name?: string | null;
  event?: string | null;
}

export function stageMeta(s: StageMetaSource): PageMeta {
  const name = plainText(s.name) || `Stage #${s.quest_id}`;
  const event = plainText(s.event);
  return {
    title: event && event !== name ? `${name} – ${event}` : name,
    description: clip(sentence(
      `Millennium War Aigis stage ${name}${event && event !== name ? ` (${event})` : ""}:`,
      "enemy waves with HP, attack, defense and resistances, map terms, weather and dialogue.",
    )),
  };
}

export function enemyMeta(e: { id: number }): PageMeta {
  return {
    title: `Enemy #${e.id}`,
    description: `Millennium War Aigis enemy #${e.id}: HP, attack, defense, magic resistance, damage type, range, speed, specialties and the stages it appears in.`,
  };
}

/** tagEn: the tag's English name, or the tag itself when untranslated. */
export function tagMeta(tag: string, tagEn: string): PageMeta {
  const label = tagEn !== tag ? `${tagEn} (${tag})` : tag;
  return {
    title: tagEn !== tag ? `${tagEn} ${tag}` : tag,
    description: `Millennium War Aigis units with the ${label} tag, and the skills and abilities that buff or target it.`,
  };
}
