// UI language (EN / 日本語). The game data is Japanese: in Japanese mode names
// show the game's own words (unit / skill / ability / class / race / tag names),
// in English the translations (name_en, localisation.json, tagLabels.ts). UI
// text is written in place as L("English", "日本語") pairs.
import { useCallback, useSyncExternalStore } from "react";
import { createPersisted } from "@altterisk/game-hub/persist";
import type {
  HubBarLabels, HubFooterLabels, ErrorBoundaryLabels, PagerLabels, LoadStateLabels, ListToolbarLabels, FilterPanelLabels,
} from "@altterisk/game-hub";

export type Lang = "en" | "ja";

export const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "ja", label: "日本語" },
];

const stored = createPersisted<Lang>({
  key: "aigis.lang", version: 1,
  // first visit: the browser's language
  empty: () => (typeof navigator !== "undefined" && /^ja\b/i.test(navigator.language || "") ? "ja" : "en"),
  sanitize: (raw) => (raw === "ja" ? "ja" : "en"),
});

let current: Lang = stored.load();
const listeners = new Set<() => void>();
if (typeof document !== "undefined") document.documentElement.lang = current;

export const getLang = (): Lang => current;

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  stored.save(lang);
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

/** The UI language; the calling component re-renders when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** `{name}` placeholders, so a translated sentence can reorder its parts. */
export function fill(text: string, vars?: Record<string, string | number>): string {
  return vars ? text.replace(/\{(\w+)\}/g, (whole, k: string) => (k in vars ? String(vars[k]) : whole)) : text;
}

export type Pick = (en: string, ja: string, vars?: Record<string, string | number>) => string;
/** L(en, ja, vars) in the current language; the component re-renders when it changes. */
export function useL(): Pick {
  const ja = useLang() === "ja";
  // stable per language, so it can sit in hook dependency lists
  return useCallback<Pick>((en, jaText, vars) => fill(ja ? jaText : en, vars), [ja]);
}

/** A game name: the Japanese original in Japanese mode, else the English (falling back to the Japanese). */
export function gameName(en: string | null | undefined, jp: string | null | undefined, lang: Lang = current): string {
  return (lang === "ja" ? jp || en : en || jp) || "";
}
/** The other-language name to show under a main name, or "" (Japanese mode shows no English line). */
export function altName(en: string | null | undefined, jp: string | null | undefined, lang: Lang = current): string {
  return lang === "en" && en && jp ? jp : "";
}

// English-valued unit tags in Japanese: rarity names from cfgRarity.atb (the
// only three it names), gender (and the support / genderless codes) as plain
// words; anything else stays as it is.
export const TAG_JA: Record<string, string> = {
  Gold: "金", Platinum: "白金", Black: "黒", Female: "女性", Male: "男性", "100": "サポート", "4": "性別なし",
};

/** A rarity name in the current language. */
export const rarityName = (r: string | null | undefined): string => (r ? (current === "ja" ? TAG_JA[r] ?? r : r) : "");

// labels for the shared game-hub parts
export function hubLabels(lang: Lang) {
  const ja = lang === "ja";
  const bar: Partial<HubBarLabels> | undefined = ja
    ? { switchGame: "ゲームを切り替え", allGames: "すべてのゲーム", here: "表示中", menu: "メニュー", closeMenu: "メニューを閉じる" } : undefined;
  const footer: Partial<HubFooterLabels> | undefined = ja ? {
    source: "ソース", portfolio: "ポートフォリオ", donate: "Ko-fi", allGames: "すべてのゲーム",
    rights: (owner, title) => `非公式のファンサイトです。${title}の画像・データ・その他のゲーム素材は${owner}に帰属します。`,
    unowned: "非公式のファンサイトです。ゲームの画像・音声・テキストは各権利者に帰属します。",
    license: "サイトのコード: AGPL-3.0",
  } : undefined;
  const error: Partial<ErrorBoundaryLabels> | undefined = ja
    ? { title: "このページで問題が発生しました。", hint: "もう一度試すか、ページを再読み込みしてください。", retry: "再試行" } : undefined;
  const pager: Partial<PagerLabels> | undefined = ja
    ? { first: "« 最初", prev: "‹ 前", next: "次 ›", last: "最後 »", page: (p, n) => `${p} / ${n} ページ`, jump: "ページへ移動" } : undefined;
  const load: Partial<LoadStateLabels> | undefined = ja ? { loading: "読み込み中…", error: "データを読み込めませんでした。", retry: "再試行" } : undefined;
  const toolbar: Partial<ListToolbarLabels> | undefined = ja ? { clearFilters: "絞り込みを解除" } : undefined;
  const filters: Partial<FilterPanelLabels> | undefined = ja ? { filters: "絞り込み", show: "絞り込みを表示", hide: "絞り込みを隠す" } : undefined;
  return { bar, footer, error, pager, load, toolbar, filters, skip: ja ? "本文へ移動" : undefined, clearSearch: ja ? "検索をクリア" : undefined };
}

export const useHubLabels = () => hubLabels(useLang());
