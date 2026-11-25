import { useMemo } from "react";
import { Link } from "react-router-dom";
import { FallbackImage } from "@altterisk/game-hub";
import {
  bannerUrl, summonBannerUrl, useCurrentMissions, useCurrentSummons, useEventInfo, useLocalisation, useUnits,
} from "../data";
import { UnitImage } from "../components";
import type { UnitIndexEntry } from "../types";
import { altName, gameName, rarityName, useL, type Pick } from "../i18n";
import type { CurrentSummon } from "../data";

const sections = (L: Pick) => [
  { to: "/units", label: L("Units", "ユニット"), desc: L("Stats, skills, abilities, quotes and art for every unit", "全ユニットのステータス・スキル・アビリティ・台詞・イラスト") },
  { to: "/collection", label: L("Collection", "所持"), desc: L("Track owned units, import from screenshots", "所持ユニットの管理、スクリーンショットから取り込み") },
  { to: "/enemies", label: L("Enemies", "敵"), desc: L("Enemy stats, specialties and where they appear", "敵のステータス・特性・出現ステージ") },
  { to: "/stages", label: L("Stages", "ステージ"), desc: L("Waves, map terms, weather and dialogue", "出撃の敵・マップ効果・天候・会話") },
  { to: "/buffs", label: L("Buffs", "バフ"), desc: L("Units ranked by the buffs and debuffs they give", "バフ・デバフ別のユニットランキング") },
  { to: "/costgen", label: L("Cost Gen", "コスト回復"), desc: L("Simulate cost generation for a team", "編成のコスト回復をシミュレート") },
  { to: "/dps", label: "DPS", desc: L("Damage against an enemy's defense and MR", "敵の防御力・魔法耐性に対するダメージ") },
  { to: "/team", label: L("Team", "編成"), desc: L("Build a formation around a unit and see who buffs her most", "ユニットを中心に編成し、バフを多く与えるユニットを提案") },
  { to: "/weather", label: L("Weather", "天候"), desc: L("Weather effects and the skills that create them", "天候の効果と天候を起こすスキル") },
];

const acquisition = (L: Pick): { key: UnitIndexEntry["acquisition"] | null; label: string }[] => [
  { key: "gacha_paid", label: L("Summon", "召喚") },
  { key: "event", label: L("Event", "イベント") },
  { key: null, label: L("Other", "その他") },
];

// "2026/11/19 11:00:00" -> "11/19 11:00", "2026-11-19" -> "11/19"
function untilText(until: string): string {
  const m = until.match(/^\d{4}[/-](\d{2})[/-](\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!m) return until;
  return `${Number(m[1])}/${Number(m[2])}${m[3] ? ` ${m[3]}` : ""}`;
}

// "2026/11/19 11:30:00" in JST
function jst(time: string): number {
  return Date.parse(`${time.replace(/\//g, "-").replace(" ", "T")}+09:00`);
}

// "2026/11/19 11:30:00" -> "11/19 11:30"
function shortTime(time: string): string {
  const m = time.match(/^\d{4}\/(\d{2})\/(\d{2}) (\d{2}:\d{2})/);
  return m ? `${Number(m[1])}/${Number(m[2])} ${m[3]}` : time;
}

function timeLeft(ms: number, L: Pick): string {
  const h = Math.floor(ms / 3_600_000);
  return h >= 24 ? L("{d}d {h}h", "{d}日{h}時間", { d: Math.floor(h / 24), h: h % 24 })
    : L("{h}h {m}m", "{h}時間{m}分", { h, m: Math.floor((ms % 3_600_000) / 60_000) });
}

function UnitTile({ u, loc }: { u: UnitIndexEntry; loc: ReturnType<typeof useLocalisation> }) {
  return (
    <Link to={`/units/${u.id}`} className="home-unit-tile">
      <UnitImage kind="icon" id={u.id} className="home-unit-icon" alt="" />
      <div className="home-unit-body">
        <div className="unit-tile-name">{gameName(u.name_en, u.name) || `#${u.id}`}</div>
        {altName(u.name_en, u.name) && <div className="muted small">{u.name}</div>}
        <div className="small">
          {rarityName(u.rarity)} · {(u.class && loc?.classes[u.class]) || u.class || "?"}
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const missions = useCurrentMissions();
  const eventInfo = useEventInfo();
  const summons = useCurrentSummons();
  const { units, byId } = useUnits();
  const loc = useLocalisation();
  const L = useL();

  const now = Date.now();
  const isOpen = (s: CurrentSummon) => jst(s.open) <= now && (!s.close || now <= jst(s.close));
  const end = (s: CurrentSummon) => (s.close ? jst(s.close) : Infinity);
  // One card per banner: every rotation sharing the open rotation's series, in start order.
  const rateUps = (summons ?? [])
    .filter((s) => s.units.length > 0 && isOpen(s))
    .sort((a, b) => end(a) - end(b))
    .map((current) => ({
      current,
      rotations: current.series
        ? (summons ?? []).filter((s) => s.series === current.series && s.units.length > 0)
          .sort((a, b) => jst(a.open) - jst(b.open))
        : [current],
    }));

  const running = useMemo(() => (missions ?? [])
    .filter((m) => m.timing === "running")
    .sort((a, b) => {
      const ae = a.category === "Emergency" ? 0 : 1;
      const be = b.category === "Emergency" ? 0 : 1;
      return ae - be || b.mission_id - a.mission_id;
    }), [missions]);

  const newest = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const dated = (units ?? []).filter((u) => !u.npc && u.implementation_date && u.implementation_date <= today);
    const date = dated.reduce<string | null>((d, u) => (!d || u.implementation_date! > d ? u.implementation_date! : d), null);
    return { date, units: dated.filter((u) => u.implementation_date === date).sort((a, b) => b.id - a.id) };
  }, [units]);

  return (
    <div className="home-page">
      <div className="home-hero">
        <h1>Aigis Database</h1>
        <p className="muted">{L("Fan-made Millennium War Aigis database: units, enemies, stages and calculators.", "千年戦争アイギスの非公式データベース: ユニット・敵・ステージ・各種計算機")}</p>
      </div>

      <section className="home-section">
        <div className="home-section-head">
          <h2>{L("Current events", "開催中のイベント")}</h2>
          <Link to="/stages" className="small">{L("all running ›", "開催中をすべて見る ›")}</Link>
        </div>
        {missions === null ? (
          <p className="loading">{L("Loading events…", "イベントを読み込み中…")}</p>
        ) : running.length === 0 ? (
          <p className="muted">{L("No limited-time missions right now.", "現在開催中の期間限定ミッションはありません。")}</p>
        ) : (
          <div className="home-events">
            {running.map((m) => (
              <Link key={m.mission_id} to="/stages" className="home-event-card">
                <FallbackImage className="home-event-banner" srcs={[bannerUrl(m.mission_id)]} missing={null} />
                <div className="home-event-body">
                  <div><span className="cat-badge">{m.category}</span></div>
                  <div className="home-event-name">{gameName(eventInfo?.[String(m.mission_id)]?.en, m.name)}</div>
                  {m.until && <div className="muted small">{L("until {t}", "{t}まで", { t: untilText(m.until) })}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {rateUps.length > 0 && (
        <section className="home-section">
          <div className="home-section-head">
            <h2>{L("Current rate-up", "開催中のピックアップ")}</h2>
          </div>
          <div className="home-summons">
            {rateUps.map(({ current, rotations }) => (
              <article key={current.key} className="home-summon">
                <div className="home-summon-art">
                  {current.banner && (
                    <FallbackImage className="home-summon-banner" srcs={[summonBannerUrl(current)]} missing={null} />
                  )}
                </div>
                <div className="home-summon-body">
                  <div className="home-summon-head">
                    {current.title && <h3 className="home-summon-title">{current.title}</h3>}
                    {current.close && (
                      <span className="home-summon-left">{L("ends in {t}", "残り{t}", { t: timeLeft(jst(current.close) - now, L) })}</span>
                    )}
                  </div>
                  <ol className="home-rotations">
                    {rotations.map((s) => {
                      const state = isOpen(s) ? "now" : jst(s.open) > now ? "upcoming" : "ended";
                      return (
                        <li key={s.key} className={`home-rotation home-rotation--${state}`}>
                          <div className="home-rotation-time">
                            <span className={`home-rotation-badge home-rotation-badge--${state}`}>{state === "now" ? L("now", "開催中") : state === "upcoming" ? L("upcoming", "予定") : L("ended", "終了")}</span>
                            {shortTime(s.open)} – {s.close ? `${shortTime(s.close)} JST` : L("no end", "終了未定")}
                          </div>
                          <div className="home-rotation-units">
                            {s.units.map((id) => {
                              const u = byId?.get(id);
                              return (
                                <Link key={id} to={`/units/${id}`} className="home-unit-chip">
                                  <UnitImage kind="icon" id={id} className="home-unit-chip-icon" alt="" />
                                  <span className="home-unit-chip-text">
                                    <span className="home-unit-chip-name">{u ? gameName(u.name_en, u.name) : `#${id}`}</span>
                                    {u && <span className="muted small">{rarityName(u.rarity)}</span>}
                                  </span>
                                </Link>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="home-section">
        <div className="home-section-head">
          <h2>{L("New units", "新ユニット")}</h2>
          {newest.date && <span className="muted small">{L("added {d}", "{d} 追加", { d: newest.date })}</span>}
          <Link to="/units" className="small">{L("all units ›", "全ユニット ›")}</Link>
        </div>
        {!units ? (
          <p className="loading">{L("Loading units…", "ユニットを読み込み中…")}</p>
        ) : (
          acquisition(L).map(({ key, label }) => {
            const group = newest.units.filter((u) => (u.acquisition ?? null) === key);
            if (!group.length) return null;
            return (
              <div key={label} className="home-unit-group">
                <h3>{label}</h3>
                <div className="home-units">
                  {group.map((u) => <UnitTile key={u.id} u={u} loc={loc} />)}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="home-section">
        <div className="home-links">
          {sections(L).map((s) => (
            <Link key={s.to} to={s.to} className="home-link">
              <strong>{s.label}</strong>
              <span className="muted small">{s.desc}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
