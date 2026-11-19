// Prince titles (data/prince_titles.json, PlayerTitle.atb): grouping into
// title families and English renderings of the game's fixed text templates.
// Text that matches no template is returned as null and shown in Japanese.
import type { PrinceData, PrinceTitle } from "./types";
import { gameName, getLang } from "./i18n";

export const PRINCE_ID = 1;

/** One title family: the rows sharing a GroupId, ordered by level. */
export interface PrinceFamily {
  group: number;
  rows: PrinceTitle[];
  first: PrinceTitle;
}

export function princeFamilies(data: PrinceData): { forms: PrinceFamily[]; stats: PrinceTitle[] } {
  const groups = new Map<number, PrinceTitle[]>();
  for (const t of data.titles) {
    if (t.card == null) continue;
    const rows = groups.get(t.group) || [];
    rows.push(t);
    groups.set(t.group, rows);
  }
  const forms = [...groups.entries()].map(([group, rows]) => {
    rows.sort((a, b) => a.level - b.level);
    return { group, rows, first: rows[0] };
  });
  return { forms, stats: data.titles.filter((t) => t.card == null) };
}

/** The family a card belongs to, if any. */
export function familyOfCard(families: PrinceFamily[], id: number): PrinceFamily | undefined {
  return families.find((f) => f.rows.some((r) => r.card === id));
}

/** The family's title without the trailing "LvN". */
export function familyTitle(f: PrinceFamily): string {
  return f.first.title.replace(/Lv\d+$/, "");
}

export function familyName(f: PrinceFamily): string {
  return gameName(f.first.card_name_en, f.first.card_name) || familyTitle(f);
}

const SKILL_UP: Record<string, string> = { 小: "small", 中: "medium", 大: "large", 特大: "extra large" };
const CARD_EXPLAN: Record<string, string> = {
  パラメータ強化: "Stats raised",
  スキルを強化: "Skill upgraded",
  アビリティを強化: "Ability upgraded",
};

/** The effect line in English, or null when it has no fixed template. */
export function explanEn(t: PrinceTitle): string | null {
  if (getLang() === "ja") return null;
  switch (t.effect) {
    case 1: return `HP +${t.power}%`;
    case 2: return `ATK +${t.power}%`;
    case 3: return `DEF +${t.power}%`;
    case 4: {
      const m = /^スキル効果(特大|小|中|大)アップ$/.exec(t.explan);
      return m ? `Skill effect up (${SKILL_UP[m[1]]})` : null;
    }
    default: return CARD_EXPLAN[t.explan] ?? null;
  }
}

/** The unlock condition in English, or null when it has no fixed template. */
export function conditionEn(text: string | undefined): string | null {
  if (!text || getLang() === "ja") return null;
  if (text === "最初から所持") return "Owned from the start";
  if (text === "期間限定") return "Limited-time";
  let m = /^プレイヤーランクが(\d+)になると解放$/.exec(text);
  if (m) return `Reach player rank ${m[1]}`;
  m = /^(『.+』)を交換所にて入手すると解放$/.exec(text);
  if (m) return `Get ${m[1]} at the exchange`;
  m = /^大総力戦ミッション(「.+」)をクリアで解放$/.exec(text);
  if (m) return `Clear ${m[1]}`;
  m = /^(.+)で(『.+』)をクリアで解放$/.exec(text);
  if (m) return `Clear ${m[2]} (${m[1]})`;
  return null;
}
