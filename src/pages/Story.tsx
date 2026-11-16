import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, FallbackImage, ListToolbar, SearchBox } from "@altterisk/game-hub";
import { listState, searchParamsAdapter } from "@altterisk/game-hub/filters";
import { bannerUrl, useCurrentMissions, useHistoryYears, useStageCategories, useStoryIndex, type StageCategoryTile } from "../data";
import { ColorCodedText } from "../components";
import type { StoryGroupEntry } from "../types";

function counts(g: StoryGroupEntry): string {
  const parts = [];
  if (g.scenes) parts.push(`${g.scenes} scene${g.scenes === 1 ? "" : "s"}`);
  if (g.battle) parts.push(`${g.battle} stage${g.battle === 1 ? "" : "s"} with battle dialogue`);
  return parts.join(" · ") || "battle-screen story";
}

// "2026/11/19 11:00:00" -> "11/19 11:00", "2026-11-19" -> "11/19"
function untilText(until: string): string {
  const m = until.match(/^\d{4}[/-](\d{2})[/-](\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!m) return until;
  return `${Number(m[1])}/${Number(m[2])}${m[3] ? ` ${m[3]}` : ""}`;
}

function GroupCard({ g, until }: { g: StoryGroupEntry; until?: string }) {
  const name = <span className="mission-card-missing"><ColorCodedText text={g.title} /></span>;
  return (
    <Link className="mission-card story-card" to={`/story/${g.id}`}>
      {g.mission_id ? (
        <FallbackImage className="mission-card-banner" srcs={[bannerUrl(g.mission_id)]} alt={g.title} missing={name} />
      ) : name}
      <span className="mission-card-meta">
        <span className="mission-card-name"><ColorCodedText text={g.title} /></span>
        <span className="muted small">
          {counts(g)}
          {until && <span className="event-until"> · until {untilText(until)}</span>}
          {g.past && <span className="past-tag">past</span>}
        </span>
      </span>
    </Link>
  );
}

function Grid({ groups, until }: { groups: StoryGroupEntry[]; until?: Map<number, string> }) {
  return (
    <div className="mission-grid">
      {groups.map((g) => <GroupCard key={g.id} g={g} until={g.mission_id != null ? until?.get(g.mission_id) : undefined} />)}
    </div>
  );
}

// A category tile, as on the Stages portal: the game's banner, or a text tile.
function PortalTile({ tile, count, onPick }: { tile: StageCategoryTile; count: number; onPick: (key: string) => void }) {
  const text = <span className="portal-name">{tile.title}</span>;
  return (
    <button type="button" className={`portal-tile${tile.banner ? "" : " text-only"}`} onClick={() => onPick(tile.key)}
      title={tile.categories.join(" / ")}>
      {tile.banner ? (
        <FallbackImage className="portal-banner" srcs={[bannerUrl(`category_${tile.key}`)]} alt={tile.title} missing={text} />
      ) : text}
      <span className="portal-meta">
        {tile.banner && <span className="portal-label">{tile.title}</span>}
        <span className="muted small">{count} events</span>
      </span>
    </button>
  );
}

const EPISODE_TILE: StageCategoryTile = { key: "episode", title: "Episodes", categories: ["Episode"], banner: false };
const OTHER_TILE: StageCategoryTile = { key: "other", title: "Other scenes", categories: ["Other"], banner: false };

export default function Story() {
  const index = useStoryIndex();
  const stageCats = useStageCategories();
  const historyYears = useHistoryYears();
  const currentMissions = useCurrentMissions();
  const [params, setParams] = useSearchParams();
  const list = listState(searchParamsAdapter(params, setParams));
  const q = list.text("q");
  const cat = list.text("cat");
  const yearParam = list.text("year");
  const term = q.trim().toLowerCase();
  const groups = useMemo(() => index?.groups ?? [], [index]);

  // the Stages portal's tiles, then a text tile for every category none covers
  const tiles = useMemo<StageCategoryTile[]>(() => {
    const out = [...(stageCats?.tiles || [])];
    const covered = new Set(out.flatMap((t) => t.categories));
    const rest = [...new Set(groups.map((g) => g.category))]
      .filter((c) => !covered.has(c) && c !== "Episode" && c !== "Other").sort();
    for (const c of rest) out.push({ key: c, title: c, categories: [c], banner: false });
    out.splice(Math.min(1, out.length), 0, EPISODE_TILE);
    out.push(OTHER_TILE);
    return out.filter((t) => groups.some((g) => t.categories.includes(g.category)));
  }, [stageCats, groups]);

  const byGameOrder = useMemo(() => {
    const order = stageCats?.display_order || {};
    const key = (g: StoryGroupEntry) => (g.mission_id ? order[String(g.mission_id)] ?? Number.MAX_SAFE_INTEGER : 0);
    return (a: StoryGroupEntry, b: StoryGroupEntry) => key(a) - key(b) || (a.mission_id ?? 0) - (b.mission_id ?? 0);
  }, [stageCats]);

  // limited-time missions open now (current_missions.json), as on the Stages portal
  const [runningIds, untilById] = useMemo(() => {
    const running = (currentMissions || []).filter((m) => m.timing === "running");
    return [new Set(running.map((m) => m.mission_id)),
      new Map(running.filter((m) => m.until).map((m) => [m.mission_id, m.until!]))];
  }, [currentMissions]);

  const go = (key: string) => {
    const p = new URLSearchParams(params);
    if (key) p.set("cat", key); else p.delete("cat");
    p.delete("year");
    setParams(p);
  };

  if (!index) return <p className="loading">Loading…</p>;

  const tile = tiles.find((t) => t.key === cat);
  const inTile = (t: StageCategoryTile) => groups.filter((g) => t.categories.includes(g.category));

  const toolbar = (count: string) => (
    <ListToolbar
      search={(
        <>
          <SearchBox value={q} onChange={(v) => list.setText("q", v)} placeholder="Search events…" label="Search events" />
          <select className="hub-select" value={tile ? cat : ""} onChange={(e) => go(e.target.value)} aria-label="Category">
            <option value="">story portal</option>
            {tiles.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
          </select>
        </>
      )}
      count={count}
    />
  );
  const intro = (
    <p className="muted small">
      <b>Scenes</b> are the conversations shown outside battle and open in the scene viewer;
      {" "}<b>battle dialogue</b> links to the stage&apos;s Dialogue tab.
    </p>
  );

  // --- search: matching events, by category ---
  if (term) {
    const hits = groups.filter((g) => g.title.toLowerCase().includes(term) && (!tile || tile.categories.includes(g.category)));
    const sections = tiles.map((t) => [t, hits.filter((g) => t.categories.includes(g.category)).sort(byGameOrder)] as const)
      .filter(([, gs]) => gs.length);
    return (
      <div className="story-page">
        {toolbar(`${hits.length} events`)}
        {!hits.length && <EmptyState title="No events match." />}
        {sections.map(([t, gs]) => (
          <div key={t.key} className="cat-section">
            <h2 className="cat-title">{t.title}</h2>
            <Grid groups={gs} />
          </div>
        ))}
      </div>
    );
  }

  // --- one category ---
  if (tile) {
    const events = inTile(tile).sort(byGameOrder);
    const isHistory = tile.categories.length === 1 && tile.categories[0] === "History";
    let body = <Grid groups={events} />;
    if (isHistory && historyYears?.length) {
      const yearOf = new Map<number, number>();
      for (const y of historyYears) for (const m of y.missions) yearOf.set(m, y.group);
      const pages = [
        ...historyYears.map((y) => ({ key: String(y.group), label: y.title, list: events.filter((g) => g.mission_id != null && yearOf.get(g.mission_id) === y.group) })),
        { key: "other", label: "Other", list: events.filter((g) => g.mission_id == null || !yearOf.has(g.mission_id)) },
      ].filter((p) => p.list.length);
      const current = pages.find((p) => p.key === yearParam) ?? pages[0];
      if (current) {
        body = (
          <>
            <div className="year-tabs" role="tablist" aria-label="Year">
              {pages.map((p) => (
                <button key={p.key} type="button" role="tab" aria-selected={p.key === current.key}
                  className={`year-tab${p.key === current.key ? " active" : ""}`}
                  onClick={() => list.setText("year", p.key === pages[0].key ? "" : p.key)}>
                  {p.label}<span className="muted small"> {p.list.length}</span>
                </button>
              ))}
            </div>
            <div className="year-group">
              {current.key !== "other" && (
                <div className="year-head">
                  <FallbackImage className="year-banner" srcs={[bannerUrl(`history_${current.key}`)]}
                    missing={<h2 className="cat-title">{current.label}</h2>} />
                </div>
              )}
              <Grid groups={current.list} />
            </div>
          </>
        );
      }
    }
    return (
      <div className="story-page">
        {toolbar(`${events.length} events`)}
        <div className="portal-head">
          <button type="button" className="portal-back" onClick={() => go("")}>← Story portal</button>
          {tile.banner && (
            <FallbackImage className="portal-head-banner" srcs={[bannerUrl(`category_${tile.key}`)]} alt={tile.title} missing={null} />
          )}
          <h2 className="portal-head-title">{tile.title}</h2>
        </div>
        {intro}
        {body}
      </div>
    );
  }

  // --- the portal ---
  const running = groups.filter((g) => g.mission_id != null && runningIds.has(g.mission_id)).sort((a, b) => {
    const ae = a.category === "Emergency" ? 0 : 1;
    const be = b.category === "Emergency" ? 0 : 1;
    return ae - be || byGameOrder(a, b);
  });
  return (
    <div className="story-page">
      {toolbar(`${tiles.length} categories`)}
      {intro}
      <nav className="portal-grid" aria-label="Story categories">
        {tiles.map((t) => <PortalTile key={t.key} tile={t} count={inTile(t).length} onPick={go} />)}
      </nav>
      <div className="cat-section">
        <h2 className="cat-title">Now running</h2>
        {running.length ? <Grid groups={running} until={untilById} />
          : <EmptyState title="No running event has story right now" hint="Pick a category above." />}
      </div>
    </div>
  );
}
