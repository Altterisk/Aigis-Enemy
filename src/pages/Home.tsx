import { useMemo } from "react";
import { Link } from "react-router-dom";
import { FallbackImage } from "@altterisk/game-hub";
import {
  bannerUrl, summonBannerUrl, useCurrentMissions, useCurrentSummons, useLocalisation, useUnits,
} from "../data";
import { UnitImage } from "../components";
import type { UnitIndexEntry } from "../types";
import type { CurrentSummon } from "../data";

const SECTIONS = [
  { to: "/units", label: "Units", desc: "Stats, skills, abilities, quotes and art for every unit" },
  { to: "/collection", label: "Collection", desc: "Track owned units, import from screenshots" },
  { to: "/enemies", label: "Enemies", desc: "Enemy stats, specialties and where they appear" },
  { to: "/stages", label: "Stages", desc: "Waves, map terms, weather and dialogue" },
  { to: "/buffs", label: "Buffs", desc: "Units ranked by the buffs and debuffs they give" },
  { to: "/costgen", label: "Cost Gen", desc: "Simulate cost generation for a team" },
  { to: "/dps", label: "DPS", desc: "Damage against an enemy's defense and MR" },
  { to: "/weather", label: "Weather", desc: "Weather effects and the skills that create them" },
];

const ACQUISITION: { key: UnitIndexEntry["acquisition"] | null; label: string }[] = [
  { key: "gacha_paid", label: "Summon" },
  { key: "event", label: "Event" },
  { key: null, label: "Other" },
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

function timeLeft(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

function UnitTile({ u, loc }: { u: UnitIndexEntry; loc: ReturnType<typeof useLocalisation> }) {
  return (
    <Link to={`/units/${u.id}`} className="home-unit-tile">
      <UnitImage kind="icon" id={u.id} className="home-unit-icon" alt="" />
      <div className="home-unit-body">
        <div className="unit-tile-name">{u.name_en || u.name || `#${u.id}`}</div>
        {u.name_en && u.name && <div className="muted small">{u.name}</div>}
        <div className="small">
          {u.rarity} · {(u.class && loc?.classes[u.class]) || u.class || "?"}
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const missions = useCurrentMissions();
  const summons = useCurrentSummons();
  const { units, byId } = useUnits();
  const loc = useLocalisation();

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
        <p className="muted">Fan-made Millennium War Aigis database: units, enemies, stages and calculators.</p>
      </div>

      <section className="home-section">
        <div className="home-section-head">
          <h2>Current events</h2>
          <Link to="/stages" className="small">all running ›</Link>
        </div>
        {missions === null ? (
          <p className="loading">Loading events…</p>
        ) : running.length === 0 ? (
          <p className="muted">No limited-time missions right now.</p>
        ) : (
          <div className="home-events">
            {running.map((m) => (
              <Link key={m.mission_id} to="/stages" className="home-event-card">
                <FallbackImage className="home-event-banner" srcs={[bannerUrl(m.mission_id)]} missing={null} />
                <div className="home-event-body">
                  <div><span className="cat-badge">{m.category}</span></div>
                  <div className="home-event-name">{m.name}</div>
                  {m.until && <div className="muted small">until {untilText(m.until)}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {rateUps.length > 0 && (
        <section className="home-section">
          <div className="home-section-head">
            <h2>Current rate-up</h2>
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
                      <span className="home-summon-left">ends in {timeLeft(jst(current.close) - now)}</span>
                    )}
                  </div>
                  <ol className="home-rotations">
                    {rotations.map((s) => {
                      const state = isOpen(s) ? "now" : jst(s.open) > now ? "upcoming" : "ended";
                      return (
                        <li key={s.key} className={`home-rotation home-rotation--${state}`}>
                          <div className="home-rotation-time">
                            <span className={`home-rotation-badge home-rotation-badge--${state}`}>{state}</span>
                            {shortTime(s.open)} – {s.close ? `${shortTime(s.close)} JST` : "no end"}
                          </div>
                          <div className="home-rotation-units">
                            {s.units.map((id) => {
                              const u = byId?.get(id);
                              return (
                                <Link key={id} to={`/units/${id}`} className="home-unit-chip">
                                  <UnitImage kind="icon" id={id} className="home-unit-chip-icon" alt="" />
                                  <span className="home-unit-chip-text">
                                    <span className="home-unit-chip-name">{u ? u.name_en || u.name : `#${id}`}</span>
                                    {u && <span className="muted small">{u.rarity}</span>}
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
          <h2>New units</h2>
          {newest.date && <span className="muted small">added {newest.date}</span>}
          <Link to="/units" className="small">all units ›</Link>
        </div>
        {!units ? (
          <p className="loading">Loading units…</p>
        ) : (
          ACQUISITION.map(({ key, label }) => {
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
          {SECTIONS.map((s) => (
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
