// Hand-written account of the site's new features and new units (no fixes),
// newest first. `date` is a
// release's identity and the key the once-per-update popup remembers. A "unit"
// entry lists card ids; the page renders their names as links in the current
// language.
import { createSeenStore } from "@altterisk/game-hub/persist";

export type ChangeKind = "unit" | "feature";

export type Text = { en: string; ja: string };

export type ChangeEntry =
  | { kind: "unit"; units: number[] }
  | { kind: "feature"; text: Text };

export type Release = {
  date: string;
  title?: Text;
  entries: ChangeEntry[];
};

export const KIND_LABEL: Record<ChangeKind, Text> = {
  unit: { en: "New units", ja: "新ユニット" },
  feature: { en: "Feature", ja: "機能" },
};

export const RELEASES: Release[] = [
  {
    date: "2026-11-25",
    title: { en: "Event names and dates", ja: "イベント名と開催日" },
    entries: [
      { kind: "feature", text: {
        en: "Stages: each event lists its stages as cards with the map, stamina, EXP, gold, start cost, max deploy, enemy count, stage modifiers, drops (amount per drop and how many enemies carry it) and the complete bonus.",
        ja: "ステージ: 各イベントのステージをカードで表示。マップ・スタミナ・経験値・ゴールド・初期コスト・出撃上限・敵数・ステージ効果・ドロップ（1回の数とドロップする敵の数）・コンプリートボーナス。",
      } },
      { kind: "feature", text: {
        en: "Stages: every event shows its English name and the dates of its first run, and the search finds events by their English or Japanese name.",
        ja: "ステージ: 各イベントに英語名と初開催の日付を表示。イベント名は日本語・英語どちらでも検索可能。",
      } },
      { kind: "feature", text: {
        en: "Stages: the Great Imperial War lists all of its corps together, and all of them count as open while the war is on.",
        ja: "ステージ: 帝国大戦の全陣を一覧にまとめ、開催中は過去の陣もすべて開催中として表示。",
      } },
    ],
  },
  {
    date: "2026-11-24",
    title: { en: "Buff categories and unit traits", ja: "バフ分類とユニットの特徴" },
    entries: [
      { kind: "feature", text: {
        en: "Buffs: Auto Skill, Assassination, Placement Type and Token Movement tabs — units that make other units auto-use their skill, assassination chance and its modifiers, omni placement and placement outside the normal spots, and tokens that move their owner's range circle, position or target.",
        ja: "バフ: スキル自動発動・暗殺・配置タイプ・トークンによる移動タブを追加。他ユニットのスキルを自動発動させるユニット、暗殺率とその補正、近接・遠距離両用配置と通常の配置マス以外への配置、本体の射程円・位置・攻撃対象を動かすトークン。",
      } },
      { kind: "feature", text: {
        en: "Buffs: Cost & UP tab (cost reduction from the sortie lineup, while deployed and from skills; starting UP and UP generation), Can't Be Reflected, Revive & Redeploy, Drops & Gold, and Possession (1st barrack) stat buffs ranked by value. Stealth now also lists lower targeting priority; Weather lists units whose skill generates a weather.",
        ja: "バフ: コスト・UPタブ (出撃メンバー・出撃中・スキルによるコスト減少、初期UPとUP生成)、反射・反撃無効、復活・再出撃、ドロップ・ゴールド、所持効果 (第一兵舎) のステータスバフを数値順に追加。隠密に狙われにくい効果、天候に天候を発生させるスキルを追加。",
      } },
      { kind: "feature", text: {
        en: "Weather: each weather shows the game's own help text.",
        ja: "天候: 各天候にゲーム内ヘルプの説明を表示。",
      } },
      { kind: "feature", text: {
        en: "Unit list: Traits filter — Hero, Support, Crossover, no second awakening, no 150% affection bonus, third scene (bond quest), trading post (rainbow, demonic, time, dark, merit and tower crystals).",
        ja: "ユニット一覧: 特徴で絞り込み — 英傑、サポート、コラボ、第二覚醒なし、好感度150%ボーナスなし、第3シーン (交流クエスト)、交換所 (虹水晶・魔水晶・刻水晶・闇水晶・武勲結晶・塔の結晶)。",
      } },
      { kind: "feature", text: {
        en: "Buffs: Placement & Tokens tab — deployment-spot buffs (Sanara's Geo tokens, Enju, Maou's Throne), deployment-spot units (Ivril's ship), tokens usable without deploying, automatic token deployment, alternative units, and effects that heal or reset other units' tokens.",
        ja: "バフ: 配置・トークンタブを追加。配置マスへのバフ (サナラのジオトークン、エンジュ、魔王の玉座)、配置マスになるユニット (イヴリールの船)、出撃せずに使えるトークン、トークンの自動配置、代替ユニット、他ユニットのトークンを回復・リセットする効果。",
      } },
    ],
  },
  {
    date: "2026-11-20",
    title: { en: "Buff filters and enemy phases", ja: "バフの絞り込みと敵のフェーズ表示" },
    entries: [
      { kind: "feature", text: {
        en: "Buffs: filter by who receives a buff (all allies, conditional, in range, self, tokens only, enemies) and by the unit giving it.",
        ja: "バフ: 効果を受ける対象 (味方全体、条件付き、射程内、自身、トークンのみ、敵) と、効果を与えるユニットで絞り込み可能に。",
      } },
      { kind: "feature", text: {
        en: "Enemies whose later forms keep the same HP are shown as phases of one enemy.",
        ja: "HPが変わらない形態変化を、一体の敵のフェーズとして表示。",
      } },
      { kind: "feature", text: {
        en: "Upcoming summon rotations are listed.",
        ja: "今後の召喚ローテーションを掲載。",
      } },
    ],
  },
  {
    date: "2026-11-19",
    title: { en: "Game update", ja: "ゲーム更新" },
    entries: [
      { kind: "unit", units: [2939, 2940, 2941, 2713] },
      { kind: "feature", text: {
        en: "\"Anywhere (designated tile)\" placement type in the unit filter, the collection and the unit page.",
        ja: "ユニット絞り込み・所持一覧・ユニット詳細に配置タイプ「指定地点」を追加。",
      } },
    ],
  },
  {
    date: "2026-11-18",
    title: { en: "Japanese and team builder", ja: "日本語表示と編成" },
    entries: [
      { kind: "feature", text: {
        en: "EN / 日本語 language toggle.",
        ja: "EN / 日本語の表示切り替え。",
      } },
      { kind: "feature", text: {
        en: "Team builder: a 15-unit formation within the stage's deploy limit, with the buffs each unit adds.",
        ja: "編成: ステージの出撃数内で15ユニットの編成を組み、各ユニットが与えるバフを確認。",
      } },
    ],
  },
  {
    date: "2026-11-17",
    title: { en: "Story", ja: "ストーリー" },
    entries: [
      { kind: "feature", text: {
        en: "Story page and scene player for event and story scenes outside battle.",
        ja: "ストーリーページと、戦闘外のイベント・ストーリーシーンの再生機能。",
      } },
    ],
  },
  {
    date: "2026-11-16",
    title: { en: "Stage maps, Prince, possession buffs", ja: "ステージマップ、王子、所持効果" },
    entries: [
      { kind: "feature", text: {
        en: "Stage Map tab: map art, melee and ranged spots, map changes during the battle, PNG download and copy.",
        ja: "ステージのマップタブ: マップ画像、近接・遠距離の配置マス、戦闘中のマップ変化、PNG保存・コピー。",
      } },
      { kind: "feature", text: {
        en: "Stage mission portal with advent kinds and history year tabs.",
        ja: "ミッション一覧に降臨の種類と年別の復刻タブ。",
      } },
      { kind: "feature", text: {
        en: "Prince page with every Prince title.",
        ja: "王子ページ (全称号)。",
      } },
      { kind: "feature", text: {
        en: "Unit page Possession buffs and War God Blessing tabs.",
        ja: "ユニット詳細に所持効果タブと戦神の加護タブ。",
      } },
      { kind: "feature", text: {
        en: "Unit tags in English; the unit list is sorted newest first.",
        ja: "ユニットタグの英語表記。ユニット一覧を新しい順に表示。",
      } },
    ],
  },
  {
    date: "2026-11-15",
    title: { en: "Home page", ja: "ホーム" },
    entries: [
      { kind: "feature", text: {
        en: "Home page with current events, new units and the live summon banners with their rate-ups.",
        ja: "開催中のイベント、新ユニット、現在の召喚とピックアップを表示するホームページ。",
      } },
    ],
  },
  {
    date: "2026-11-12",
    title: { en: "Game update", ja: "ゲーム更新" },
    entries: [
      { kind: "unit", units: [2934, 2935, 2933] },
      { kind: "feature", text: {
        en: "Conditions are written out as readable text across the site.",
        ja: "発動条件をサイト全体で読みやすい文章で表示。",
      } },
    ],
  },
  {
    date: "2026-11-09",
    title: { en: "Readable view", ja: "読みやすい表示" },
    entries: [
      { kind: "feature", text: {
        en: "Unit page Readable view: skills and abilities as sentences.",
        ja: "ユニット詳細の文章表示: スキルとアビリティを文章で表示。",
      } },
    ],
  },
  {
    date: "2026-11-05",
    title: { en: "Game update", ja: "ゲーム更新" },
    entries: [
      { kind: "unit", units: [2932, 2931] },
    ],
  },
  {
    date: "2026-10-30",
    entries: [
      { kind: "feature", text: {
        en: "Clean page links (no #) and a sitemap for search engines.",
        ja: "ページURLから # を削除、検索エンジン用サイトマップを追加。",
      } },
    ],
  },
  {
    date: "2026-10-29",
    title: { en: "Game update", ja: "ゲーム更新" },
    entries: [
      { kind: "unit", units: [2925, 2926, 2927] },
      { kind: "feature", text: {
        en: "Enemy special effects are labelled from the game's own data; Empire story chapter banners.",
        ja: "敵の特殊効果をゲームデータに基づいて表示。帝国編のストーリーバナーを追加。",
      } },
    ],
  },
  {
    date: "2026-10-22",
    title: { en: "Game update: Shadow Empire", ja: "ゲーム更新: 影の帝国" },
    entries: [
      { kind: "unit", units: [2914, 2915, 2916, 2912, 2917, 2918, 2913] },
    ],
  },
  {
    date: "2026-10-15",
    title: { en: "Game update: Halloween", ja: "ゲーム更新: ハロウィン" },
    entries: [
      { kind: "unit", units: [2907, 2908, 2906, 2909] },
    ],
  },
];

// the top release's date plus its entry count: entries added to it later
// show the popup again
export const latestKey = () => `changelog:${RELEASES[0].date}#${RELEASES[0].entries.length}`;

const seen = createSeenStore("aigis.seen");
export const restoreSeen = seen.restore;
export const markSeen = seen.markSeen;

// other site data stored before this module loaded (language, UI state):
// read once at import, before the app writes anything of its own
const hadSiteData = (() => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("aigis") && k !== "aigis.seen") return true;
    }
  } catch { /* storage unavailable */ }
  return false;
})();
// a visitor with no seen record and no other site data has nothing to catch up on
export const isFreshVisitor = () => seen.isFresh() && !hadSiteData;
export const useShouldShow = seen.useShouldShow;
