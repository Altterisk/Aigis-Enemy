import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, FallbackImage, ListToolbar, SearchBox } from "@altterisk/game-hub";
import { listState, searchParamsAdapter } from "@altterisk/game-hub/filters";
import {
  useStages, useCurrentMissions, useHistoryYears, useStageCategories, bannerUrl,
  type StageCategoryTile,
} from "../data";
import { ColorCodedText } from "../components";
import type { StageIndexEntry } from "../types";

interface EventGroup {
  event: string;
  category?: string | null;
  missionId?: number | null;
  until?: string;
  stages: StageIndexEntry[];
}

// "2026/11/19 11:00:00" -> "11/19 11:00", "2026-11-19" -> "11/19"
function untilText(until: string): string {
  const m = until.match(/^\d{4}[/-](\d{2})[/-](\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!m) return until;
  return `${Number(m[1])}/${Number(m[2])}${m[3] ? ` ${m[3]}` : ""}`;
}

// One event block: banner + title, then its stages.
function EventBlock({ event, category, missionId, until, stages }: EventGroup) {
  return (
    <section className="event-group">
      <div className="event-head">
        {missionId && <FallbackImage className="event-banner" srcs={[bannerUrl(missionId)]} missing={null} />}
        <div>
          <h3>
            {category && <span className="cat-badge">{category}</span>} {event}
          </h3>
          <div className="muted small">
            {stages.length} stage(s)
            {until && <span className="event-until"> · until {untilText(until)}</span>}
          </div>
        </div>
      </div>
      <ul className="stage-row">
        {stages
          .slice()
          .sort((a, b) => a.quest_id - b.quest_id)
          .map((s) => (
            <li key={s.quest_id} className={s.active === false ? "archived" : ""}>
              <Link to={`/stages/${s.quest_id}`}>
                <ColorCodedText text={s.name} />
                <span className="muted small"> ×{s.multiplier ?? 1}</span>
                <span className="muted small"> · {s.enemy_count ?? 0} enemies</span>
                {(s.marker_count ?? 0) > 0 && (
                  <span className="muted small" title="fixtures / clones the game does not count as enemies">
                    {" "}+ {s.marker_count} markers
                  </span>
                )}
                {s.active === false && <span className="past-tag">past</span>}
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}

// One mission in a category's banner list, as the game lists it: its banner,
// opening the mission's stage list.
function MissionCard({ ev, onOpen }: { ev: EventGroup; onOpen: (mid: number) => void }) {
  if (!ev.missionId) return null;
  const mid = ev.missionId;
  return (
    <button type="button" className="mission-card" onClick={() => onOpen(mid)}>
      <FallbackImage
        className="mission-card-banner"
        srcs={[bannerUrl(mid)]}
        alt={ev.event}
        missing={<span className="mission-card-missing"><ColorCodedText text={ev.event} /></span>}
      />
      <span className="mission-card-meta">
        <span className="mission-card-name"><ColorCodedText text={ev.event} /></span>
        <span className="muted small">
          {ev.stages.length} stage(s)
          {ev.until && <span className="event-until"> · until {untilText(ev.until)}</span>}
        </span>
      </span>
    </button>
  );
}

function MissionGrid({ events, onOpen }: { events: EventGroup[]; onOpen: (mid: number) => void }) {
  return (
    <div className="mission-grid">
      {events.map((ev) => <MissionCard key={ev.missionId || ev.event} ev={ev} onOpen={onOpen} />)}
    </div>
  );
}

// A category tile: the game's general banner for the menu, or a text tile
// when the game has none.
function PortalTile({ tile, events, onPick }: {
  tile: StageCategoryTile;
  events: number;
  onPick: (key: string) => void;
}) {
  const text = <span className="portal-name">{tile.title}</span>;
  return (
    <button
      type="button"
      className={`portal-tile${tile.banner ? "" : " text-only"}`}
      onClick={() => onPick(tile.key)}
      title={tile.categories.join(" / ")}
    >
      {tile.banner ? (
        <FallbackImage className="portal-banner" srcs={[bannerUrl(`category_${tile.key}`)]} alt={tile.title} missing={text} />
      ) : text}
      <span className="portal-meta">
        {tile.banner && <span className="portal-label">{tile.title}</span>}
        <span className="muted small">{events} events</span>
      </span>
    </button>
  );
}

// Group stages into events (one per mission).
function groupEvents(stages: StageIndexEntry[], untilById: Map<number, string>): EventGroup[] {
  const byEvent = new Map<string | number, EventGroup>();
  for (const s of stages) {
    const key = s.mission_id || s.event || "(ungrouped)";
    let g = byEvent.get(key);
    if (!g) {
      g = {
        event: s.event || "(ungrouped)",
        category: s.event_category,
        missionId: s.mission_id,
        until: s.mission_id ? untilById.get(s.mission_id) : undefined,
        stages: [],
      };
      byEvent.set(key, g);
    }
    g.stages.push(s);
  }
  return [...byEvent.values()];
}

const LIST_VIEWS = ["running", "permanent", "all"];

export default function StageList() {
  const { loading, stages } = useStages();
  const currentMissions = useCurrentMissions();
  const historyYears = useHistoryYears();
  const stageCats = useStageCategories();
  // search, view and open mission live in the URL; no ?cat= / ?m= = the portal
  const [params, setParams] = useSearchParams();
  const list = listState(searchParamsAdapter(params, setParams));
  const q = list.text("q");
  const rawCat = list.text("cat");
  const cat = rawCat === "current" ? "running" : rawCat;
  const openMid = Number(list.text("m")) || 0;
  const yearParam = list.text("year");
  const term = q.trim().toLowerCase();

  // mission ids by timing (data/current_missions.json): limited-time events
  // open now, and the always-available ones
  const [currentSet, permanentSet, untilById] = useMemo(() => {
    const ids = (t: string) => new Set((currentMissions || []).filter((m) => m.timing === t).map((m) => m.mission_id));
    const until = new Map((currentMissions || []).filter((m) => m.until).map((m) => [m.mission_id, m.until!]));
    return [ids("running"), ids("permanent"), until];
  }, [currentMissions]);

  // Exported tiles, plus a text tile for any category no tile covers.
  const tiles = useMemo<StageCategoryTile[]>(() => {
    const out = [...(stageCats?.tiles || [])];
    const covered = new Set(out.flatMap((t) => t.categories));
    const rest = [...new Set((stages || []).map((s) => s.event_category).filter(Boolean))]
      .filter((c) => !covered.has(c!)).sort() as string[];
    for (const c of rest) out.push({ key: c, title: c, categories: [c], banner: false });
    return out;
  }, [stageCats, stages]);

  const tile = tiles.find((t) => t.key === cat);
  const listMode = !!term || LIST_VIEWS.includes(cat) || (!!cat && !tile);

  const allEvents = useMemo(() => groupEvents(stages || [], untilById), [stages, untilById]);

  // the in-game list order: MissionConfig DisplayOrder, then mission id
  const byGameOrder = useMemo(() => {
    const order = stageCats?.display_order || {};
    const key = (ev: EventGroup) => order[String(ev.missionId)] ?? Number.MAX_SAFE_INTEGER;
    return (a: EventGroup, b: EventGroup) => key(a) - key(b) || (a.missionId || 0) - (b.missionId || 0);
  }, [stageCats]);

  const tileEvents = useMemo(() => {
    const n = new Map<string, number>();
    for (const ev of allEvents) n.set(ev.category || "", (n.get(ev.category || "") ?? 0) + 1);
    return new Map(tiles.map((t) => [t.key, t.categories.reduce((s, c) => s + (n.get(c) ?? 0), 0)]));
  }, [tiles, allEvents]);

  const isOpen = (ev: EventGroup) =>
    !!ev.missionId && (currentSet.has(ev.missionId) || permanentSet.has(ev.missionId));

  // Search and the running / permanent / all views: events with their stages,
  // in category sections.
  const sections = useMemo<[string, EventGroup[]][]>(() => {
    if (!stages || !listMode) return [];
    const inView = (s: StageIndexEntry) => {
      if (cat === "") return true;
      if (cat === "running") return !!s.mission_id && currentSet.has(s.mission_id);
      if (cat === "permanent") return !!s.mission_id && permanentSet.has(s.mission_id);
      if (cat === "all") return true;
      if (tile) return tile.categories.includes(s.event_category || "");
      return s.event_category === cat;
    };
    const filtered = stages.filter((s) => {
      if (!inView(s)) return false;
      if (!term) return true;
      return (
        (s.name || "").toLowerCase().includes(term) ||
        (s.event ? s.event.toLowerCase().includes(term) : false) ||
        String(s.quest_id).includes(term)
      );
    });
    const events = groupEvents(filtered, untilById);

    if (cat === "running") {
      // one section, emergency first, newest missions on top
      events.sort((a, b) => {
        const ae = a.category === "Emergency" ? 0 : 1;
        const be = b.category === "Emergency" ? 0 : 1;
        return ae - be || (b.missionId || 0) - (a.missionId || 0);
      });
      return events.length ? [["Now running", events]] : [];
    }

    const byCat = new Map<string, EventGroup[]>();
    for (const ev of events) {
      const c = ev.category || "Other";
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c)!.push(ev);
    }
    for (const evs of byCat.values()) {
      evs.sort((a, b) => (a.missionId || 0) - (b.missionId || 0));
    }
    const order = tile ? tile.categories : [...byCat.keys()].sort();
    return order.filter((c) => byCat.has(c)).map((c) => [c, byCat.get(c)!] as [string, EventGroup[]]);
  }, [stages, listMode, cat, term, tile, currentSet, permanentSet, untilById]);

  // History events clustered into year groups (falls back to a flat list
  // when the year data is missing).
  const historyClusters = (events: EventGroup[]) => {
    const yearOf = new Map<number, number>();
    for (const y of historyYears || []) {
      for (const m of y.missions) yearOf.set(m, y.group);
    }
    const clusters = new Map<number, EventGroup[]>();
    const rest: EventGroup[] = [];
    for (const ev of events) {
      const g = ev.missionId ? yearOf.get(ev.missionId) : undefined;
      if (g === undefined) {
        rest.push(ev);
        continue;
      }
      if (!clusters.has(g)) clusters.set(g, []);
      clusters.get(g)!.push(ev);
    }
    return { clusters, rest };
  };

  const yearHead = (group: number, title: string) => (
    <div className="year-head">
      <FallbackImage
        className="year-banner"
        srcs={[bannerUrl(`history_${group}`)]}
        missing={<h2 className="cat-title">{title}</h2>}
      />
    </div>
  );

  const renderHistoryList = (events: EventGroup[]) => {
    if (!historyYears?.length) return events.slice(0, 200).map((ev) => <EventBlock key={ev.missionId || ev.event} {...ev} />);
    const { clusters, rest } = historyClusters(events);
    return (
      <>
        {historyYears.map((y) => clusters.has(y.group) && (
          <div key={y.group} className="year-group">
            {yearHead(y.group, y.title)}
            {clusters.get(y.group)!.map((ev) => <EventBlock key={ev.missionId || ev.event} {...ev} />)}
          </div>
        ))}
        {rest.map((ev) => <EventBlock key={ev.missionId || ev.event} {...ev} />)}
      </>
    );
  };

  // URL moves: a category, a mission inside it, or back to the portal.
  const go = (next: { cat?: string; m?: number }) => {
    const p = new URLSearchParams(params);
    p.delete("page");
    if (next.cat) p.set("cat", next.cat); else p.delete("cat");
    if (next.cat !== cat) p.delete("year");
    if (next.m) p.set("m", String(next.m)); else p.delete("m");
    setParams(p);
  };
  const pickTile = (key: string) => go({ cat: key });
  const openMission = (mid: number) => go({ cat: tile?.key ?? (LIST_VIEWS.includes(cat) ? cat : ""), m: mid });

  if (loading) return <p className="loading">Loading stages…</p>;

  const openEvent = openMid ? allEvents.find((ev) => ev.missionId === openMid) : undefined;

  const toolbar = (count: string) => (
    <ListToolbar
      search={(
        <>
          <SearchBox value={q} onChange={(v) => list.setText("q", v)} placeholder="Search stage / event / quest id" />
          <select className="hub-select" value={cat} onChange={(e) => go({ cat: e.target.value })}>
            <option value="">mission portal</option>
            <option value="running">now running</option>
            <option value="permanent">permanent</option>
            <option value="all">all categories</option>
            {tiles.map((t) => (
              <option key={t.key} value={t.key}>{t.title}</option>
            ))}
            {cat && !tile && !LIST_VIEWS.includes(cat) && <option value={cat}>{cat}</option>}
          </select>
        </>
      )}
      count={count}
    />
  );

  // --- one mission: its stages ---
  if (openEvent && !term) {
    const back = tile ? tile.title : cat === "running" ? "Now running" : cat === "permanent" ? "Permanent"
      : cat === "all" ? "All categories" : "Mission portal";
    return (
      <div>
        {toolbar(`${openEvent.stages.length} stages`)}
        <button type="button" className="portal-back" onClick={() => go({ cat })}>← {back}</button>
        <EventBlock {...openEvent} />
      </div>
    );
  }

  // --- search / list views: events with their stages ---
  if (listMode) {
    const totalEvents = sections.reduce((n, [, evs]) => n + evs.length, 0);
    return (
      <div>
        {toolbar(`${totalEvents} events`)}
        {cat === "running" && !term && totalEvents === 0 && (
          <EmptyState title="No limited-time missions right now" hint="Pick a category above." />
        )}
        {sections.map(([category, events]) => (
          <div key={category} className="cat-section">
            <h2 className="cat-title">{category}</h2>
            {category === "History"
              ? renderHistoryList(events)
              : events.slice(0, 200).map((ev) => <EventBlock key={ev.missionId || ev.event} {...ev} />)}
          </div>
        ))}
      </div>
    );
  }

  // --- one category: its missions as banners, in the game's list order ---
  if (tile) {
    const events = allEvents.filter((ev) => tile.categories.includes(ev.category || "")).sort(byGameOrder);
    const isHistory = tile.categories.length === 1 && tile.categories[0] === "History";
    const open = events.filter(isOpen);
    const closed = events.filter((ev) => !isOpen(ev));
    return (
      <div>
        {toolbar(`${events.length} events`)}
        <div className="portal-head">
          <button type="button" className="portal-back" onClick={() => go({})}>← Mission portal</button>
          {tile.banner && (
            <FallbackImage className="portal-head-banner" srcs={[bannerUrl(`category_${tile.key}`)]} alt={tile.title} missing={null} />
          )}
          <h2 className="portal-head-title">{tile.title}</h2>
        </div>
        {isHistory && historyYears?.length ? (() => {
          // one page per year (CfgMissionHistoryTable GroupId); "other" =
          // history missions no year lists
          const { clusters, rest } = historyClusters(events);
          const years = historyYears.filter((y) => clusters.has(y.group));
          const pages = [
            ...years.map((y) => ({ key: String(y.group), label: y.title, group: y.group as number | null })),
            ...(rest.length ? [{ key: "other", label: "Other", group: null }] : []),
          ];
          const current = pages.find((p) => p.key === yearParam) ?? pages[0];
          if (!current) return null;
          const shown = current.group === null ? rest : clusters.get(current.group)!;
          return (
            <>
              <div className="year-tabs" role="tablist" aria-label="Year">
                {pages.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    role="tab"
                    aria-selected={p.key === current.key}
                    className={`year-tab${p.key === current.key ? " active" : ""}`}
                    onClick={() => list.setText("year", p.key === pages[0].key ? "" : p.key)}
                  >
                    {p.label}
                    <span className="muted small"> {p.group === null ? rest.length : clusters.get(p.group)!.length}</span>
                  </button>
                ))}
              </div>
              <div className="year-group">
                {current.group !== null && yearHead(current.group, current.label)}
                <MissionGrid events={shown} onOpen={openMission} />
              </div>
            </>
          );
        })() : (
          <>
            {open.length > 0 && (
              <div className="cat-section">
                <h2 className="cat-title">Open now</h2>
                <MissionGrid events={open} onOpen={openMission} />
              </div>
            )}
            {closed.length > 0 && (
              <div className="cat-section">
                <h2 className="cat-title">{open.length ? "Not open now" : "Missions"}</h2>
                <MissionGrid events={closed} onOpen={openMission} />
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // --- the mission portal ---
  const hasEvents = (t: StageCategoryTile) => (tileEvents.get(t.key) ?? 0) > 0;
  const running = allEvents.filter((ev) => ev.missionId && currentSet.has(ev.missionId)).sort((a, b) => {
    const ae = a.category === "Emergency" ? 0 : 1;
    const be = b.category === "Emergency" ? 0 : 1;
    return ae - be || byGameOrder(a, b);
  });
  return (
    <div>
      {toolbar(`${tiles.filter(hasEvents).length} categories`)}
      <nav className="portal-grid" aria-label="Stage categories">
        {tiles.filter(hasEvents).map((t) => (
          <PortalTile key={t.key} tile={t} events={tileEvents.get(t.key) ?? 0} onPick={pickTile} />
        ))}
      </nav>

      <div className="cat-section">
        <h2 className="cat-title">Now running</h2>
        {running.length ? <MissionGrid events={running} onOpen={openMission} />
          : <EmptyState title="No limited-time missions right now" hint="Pick a category above." />}
      </div>
    </div>
  );
}
