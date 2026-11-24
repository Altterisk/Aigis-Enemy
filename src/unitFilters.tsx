// The unit list's checkbox filters (rarity, position, gender, affiliation, race, attribute,
// season, release year) as reusable pieces: option lists built from the data, and a hook
// that keeps a selection in URL params under a prefix and tests units against it.
import { useEffect, useMemo, useState } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import { CheckboxGroup, FilterPanel } from "@altterisk/game-hub";
import type { Localisation, UnitIndexEntry } from "./types";
import { loadJSONFile } from "./data";
import { rarityName, useHubLabels, useL, type Pick } from "./i18n";

// "Platinum Hero" / "Black Hero" are a card-art variant of Platinum/Black,
// not a distinct rarity tier. Strip the suffix so the checkbox list shows
// one entry per real tier and selecting it matches both.
export function baseRarity(r: string): string {
  return r.replace(/ Hero$/, "");
}

export const positionOpts = (L: Pick) => [
  { value: "melee", label: L("Melee", "近接") },
  { value: "ranged", label: L("Ranged", "遠距離") },
  { value: "omni", label: L("Omni (deployable either spot)", "両用 (どちらの配置場所にも出撃可)") },
  { value: "anywhere", label: L("Anywhere (designated tile)", "指定地点 (任意のマスに配置可)") },
];
export const genderOpts = (L: Pick) => [
  { value: "Female", label: L("Female", "女性") },
  { value: "Male", label: L("Male", "男性") },
];

// Unit traits (each checked trait is required): Hero rarity variant, Support
// (CardData Kind 100), crossover series, no second awakening, no 150%
// affection bonus (card slot 3), a third (bond-quest) scene, sold in the
// trading post (crystal shops or Dark / Merit Crystal exchange rows).
export function useBondQuestIds(needed: boolean): Set<number> | null {
  const [ids, setIds] = useState<Set<number> | null>(null);
  useEffect(() => {
    if (needed && !ids) {
      loadJSONFile<number[]>("bond_quest_ids").then((l) => setIds(new Set(l))).catch(() => setIds(new Set()));
    }
  }, [needed, ids]);
  return ids;
}
export const traitOpts = (L: Pick) => [
  { value: "hero", label: L("Hero", "英傑") },
  { value: "support", label: L("Support unit", "サポートユニット") },
  { value: "crossover", label: L("Crossover", "コラボ") },
  { value: "no_aw2", label: L("No second awakening", "第二覚醒なし") },
  { value: "no_aff150", label: L("No 150% affection bonus", "好感度150%ボーナスなし") },
  { value: "third_scene", label: L("Third scene (bond quest)", "第3シーン (交流クエスト)") },
  { value: "trading_post", label: L("Trading post (crystals)", "交換所 (水晶・結晶)") },
];
// trading-post stock: listings priced in rainbow / demonic / time / dark /
// merit crystal or a tower crystal. Medal rows (召喚メダル etc.) list gacha
// units only while they are on banner.
const TRADING_POST_ITEMS = new Set([
  "虹水晶", "魔水晶", "刻水晶", "闇水晶", "武勲結晶", "英傑結晶", "統帥結晶", "悪霊結晶",
]);
// bondQuest: card ids with a bond-quest scene (data/bond_quest_ids.json),
// loaded only while the third-scene trait is selected
export function hasTrait(u: UnitIndexEntry, t: string, bondQuest?: Set<number> | null): boolean {
  switch (t) {
    case "hero": return / Hero$/.test(u.rarity || "");
    case "support": return !!u.support;
    case "crossover": return !!u.crossover;
    case "no_aw2": return !u.aw2_branches;
    case "no_aff150": return !(u.affection_bonuses || []).some((b) => b.slot === 3);
    case "third_scene": return !!bondQuest?.has(u.id);
    case "trading_post": return (u.trade || []).some((e) => e.item != null && TRADING_POST_ITEMS.has(e.item));
    default: return true;
  }
}

// Distinct values in use for every checkbox category, translated where a
// localisation entry exists, in the game's own menu order (each value's
// smallest internal id across the units that carry it).
export function unitFilterOptions(units: UnitIndexEntry[] | null | undefined, loc: Localisation | null | undefined) {
  const ids = new Map<string, number>();
  const track = (v: string, id?: number | null) => {
    if (id == null) return;
    const cur = ids.get(v);
    if (cur == null || id < cur) ids.set(v, id);
  };
  const rarity = new Set<string>();
  const faction = new Set<string>();
  const race = new Set<string>();
  const attr = new Set<string>();
  const season = new Set<string>();
  const year = new Set<number>();
  (units || []).forEach((u) => {
    if (u.npc) return;
    if (u.rarity) { rarity.add(baseRarity(u.rarity)); track(baseRarity(u.rarity), u.rarity_id); }
    if (u.faction) { faction.add(u.faction); track(u.faction, u.faction_id); }
    if (u.race) { race.add(u.race); track(u.race, u.race_id); }
    (u.identity_tags || []).forEach((t, i) => { attr.add(t); track(t, u.identity_ids?.[i]); });
    if (u.genus) { season.add(u.genus); track(u.genus, u.genus_id); }
    if (u.release_year) year.add(u.release_year);
  });
  const byId = (a: string, b: string) => (ids.get(a) ?? 1e9) - (ids.get(b) ?? 1e9);
  const toOpts = (s: Set<string>, tr?: Record<string, string>) =>
    [...s].sort(byId).map((v) => ({ value: v, label: tr?.[v] || v }));
  return {
    rarityOpts: [...rarity].sort(byId).map((v) => ({ value: v, label: rarityName(v) })),
    factionOpts: toOpts(faction, loc?.races),
    raceOpts: toOpts(race, loc?.races),
    attrOpts: toOpts(attr, loc?.tags),
    seasonOpts: toOpts(season, loc?.tags),
    yearOpts: [...year].sort((a, b) => a - b).map((y) => ({ value: String(y), label: String(y) })),
  };
}

const KEYS = ["rarity", "position", "gender", "faction", "race", "attr", "season", "year", "trait"] as const;
type Key = (typeof KEYS)[number];

// The unit list's filters applied to some other page's units, stored in the URL as
// <prefix><key> (e.g. ?grarity=Black). `matches` tests one unit; `panel` is the
// collapsible checkbox panel.
export function useUnitFilters(
  units: UnitIndexEntry[] | null | undefined,
  loc: Localisation | null | undefined,
  params: URLSearchParams,
  setParams: SetURLSearchParams,
  prefix: string,
  title?: string,
) {
  const L = useL();
  const hub = useHubLabels();
  const [open, setOpen] = useState(false);
  const csv = (k: Key) => (params.get(prefix + k) || "").split(",").filter(Boolean);
  const sel = Object.fromEntries(KEYS.map((k) => [k, csv(k)])) as Record<Key, string[]>;
  const toggle = (k: Key, v: string) => {
    const list = sel[k];
    const next = new URLSearchParams(params);
    const val = (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]).join(",");
    if (val) next.set(prefix + k, val); else next.delete(prefix + k);
    setParams(next, { replace: true });
  };
  const clear = () => {
    const next = new URLSearchParams(params);
    for (const k of KEYS) next.delete(prefix + k);
    setParams(next, { replace: true });
  };
  const opts = useMemo(() => unitFilterOptions(units, loc), [units, loc]);
  const bondQuest = useBondQuestIds(sel.trait.includes("third_scene"));
  const key = KEYS.map((k) => sel[k].join(",")).join("|") + (bondQuest ? "|bq" : "");
  const activeCount = KEYS.reduce((n, k) => n + sel[k].length, 0);

  const matches = useMemo(() => (u: UnitIndexEntry | undefined): boolean => {
    if (!activeCount) return true;
    if (!u) return false;
    if (sel.rarity.length && !sel.rarity.includes(baseRarity(u.rarity))) return false;
    if (sel.position.length && !sel.position.includes(u.position || "")) return false;
    if (sel.gender.length && !sel.gender.includes(String(u.gender))) return false;
    if (sel.faction.length && !(u.faction && sel.faction.includes(u.faction))) return false;
    if (sel.race.length && !(u.race && sel.race.includes(u.race))) return false;
    if (sel.attr.length && !(u.identity_tags || []).some((t) => sel.attr.includes(t))) return false;
    if (sel.season.length && !(u.genus && sel.season.includes(u.genus))) return false;
    if (sel.year.length && !(u.release_year && sel.year.includes(String(u.release_year)))) return false;
    if (sel.trait.length && !sel.trait.every((t) => hasTrait(u, t, bondQuest))) return false;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const panel = (
    <FilterPanel
      open={open || activeCount > 0}
      onToggle={() => setOpen(!open)}
      activeCount={activeCount}
      phoneOnly={false}
      labels={{ ...hub.filters, ...(title ? { filters: title } : {}) }}
    >
      <CheckboxGroup title={L("Rarity", "レア度")} options={opts.rarityOpts} selected={sel.rarity} onToggle={(v) => toggle("rarity", v)} />
      <CheckboxGroup title={L("Position", "配置")} options={positionOpts(L)} selected={sel.position} onToggle={(v) => toggle("position", v)} />
      <CheckboxGroup title={L("Gender", "性別")} options={genderOpts(L)} selected={sel.gender} onToggle={(v) => toggle("gender", v)} />
      <CheckboxGroup title={L("Affiliation", "所属")} options={opts.factionOpts} selected={sel.faction} onToggle={(v) => toggle("faction", v)} />
      <CheckboxGroup title={L("Race", "種族")} options={opts.raceOpts} selected={sel.race} onToggle={(v) => toggle("race", v)} />
      <CheckboxGroup title={L("Attribute", "属性")} options={opts.attrOpts} selected={sel.attr} onToggle={(v) => toggle("attr", v)} />
      <CheckboxGroup title={L("Season", "季節")} options={opts.seasonOpts} selected={sel.season} onToggle={(v) => toggle("season", v)} />
      <CheckboxGroup title={L("Release Year", "実装年")} options={opts.yearOpts} selected={sel.year} onToggle={(v) => toggle("year", v)} />
      <CheckboxGroup title={L("Traits", "特徴")} options={traitOpts(L)} selected={sel.trait} onToggle={(v) => toggle("trait", v)} />
      {activeCount > 0 && (
        <button className="hub-btn hub-btn--sm hub-btn--ghost" onClick={clear}>{L("clear", "解除")}</button>
      )}
    </FilterPanel>
  );
  return { matches, panel, activeCount };
}
