import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, FallbackImage, ListToolbar, SearchBox } from "@altterisk/game-hub";
import { listState, searchParamsAdapter } from "@altterisk/game-hub/filters";
import {
  useStages, useCurrentMissions, useHistoryYears, useStageCategories, useEventInfo, bannerUrl,
  type EventInfoEntry, type StageCategoryTile,
} from "../data";
import { ColorCodedText } from "../components";
import type { StageIndexEntry } from "../types";
import { altName, gameName, useHubLabels, useL, useLang } from "../i18n";

interface EventGroup {
  event: string;
  category?: string | null;
  missionId?: number | null;
  until?: string;
  // English name and first run (data/event_info.json)
  en?: string;
  start?: string;
  end?: string;
  stages: StageIndexEntry[];
}

// The Great Imperial War is one continuing event: while any of its corps is
// open, every earlier corps is open with it.
const IMPERIAL_WAR = "Empire";

// "2026/11/19 11:00:00" -> "11/19 11:00", "2026-11-19" -> "11/19"
function untilText(until: string): string {
  const m = until.match(/^\d{4}[/-](\d{2})[/-](\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!m) return until;
  return `${Number(m[1])}/${Number(m[2])}${m[3] ? ` ${m[3]}` : ""}`;
}

// "2025-04-03", "2025-04-10" -> "2025/4/3 – 4/10" (the end's year only when it differs)
function runText(start: string, end?: string): string {
  const p = (d: string) => d.split("-").map(Number);
  const [sy, sm, sd] = p(start);
  if (!end) return `${sy}/${sm}/${sd}`;
  const [ey, em, ed] = p(end);
  return `${sy}/${sm}/${sd} – ${ey !== sy ? `${ey}/` : ""}${em}/${ed}`;
}

function FirstRun({ start, end }: { start?: string; end?: string }) {
  const L = useL();
  if (!start) return null;
  return <span className="event-run">{L("first run {t}", "初開催 {t}", { t: runText(start, end) })}</span>;
}

// One event block: banner + title, then its stages.
function EventBlock({ event, category, missionId, until, en, start, end, stages }: EventGroup) {
  const L = useL();
  const lang = useLang();
  const alt = altName(en, event, lang);
  return (
    <section className="event-group">
      <div className="event-head">
        {missionId && <FallbackImage className="event-banner" srcs={[bannerUrl(missionId)]} missing={null} />}
        <div>
          <h3>
            {category && <span className="cat-badge">{category}</span>} <ColorCodedText text={gameName(en, event, lang)} />
          </h3>
          {alt && <div className="muted small event-alt"><ColorCodedText text={alt} /></div>}
          <div className="muted small">
            {L("{n} stage(s)", "{n} ステージ", { n: stages.length })}
            {until && <span className="event-until">{L(" · until {t}", " · {t}まで", { t: untilText(until) })}</span>}
            {start && <> · <FirstRun start={start} end={end} /></>}
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
                <span className="muted small">{L(" · {n} enemies", " · 敵 {n} 体", { n: s.enemy_count ?? 0 })}</span>
                {(s.marker_count ?? 0) > 0 && (
                  <span className="muted small" title={L("fixtures / clones the game does not count as enemies", "ゲームが敵として数えないオブジェクト・分身")}>
                    {L(" + {n} markers", " + オブジェクト {n}", { n: s.marker_count ?? 0 })}
                  </span>
                )}
                {s.active === false && <span className="past-tag">{L("past", "終了")}</span>}
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
  const L = useL();
  const lang = useLang();
  if (!ev.missionId) return null;
  const mid = ev.missionId;
  const name = gameName(ev.en, ev.event, lang);
  const alt = altName(ev.en, ev.event, lang);
  return (
    <button type="button" className="mission-card" onClick={() => onOpen(mid)}>
      <FallbackImage
        className="mission-card-banner"
        srcs={[bannerUrl(mid)]}
        alt={name}
        missing={<span className="mission-card-missing"><ColorCodedText text={name} /></span>}
      />
      <span className="mission-card-meta">
        <span className="mission-card-name"><ColorCodedText text={name} /></span>
        {alt && <span className="muted small mission-card-alt"><ColorCodedText text={alt} /></span>}
        <span className="muted small">
          {ev.stages.length} stage(s)
          {ev.until && <span className="event-until">{L(" · until {t}", " · {t}まで", { t: untilText(ev.until) })}</span>}
        </span>
        {ev.start && <span className="muted small"><FirstRun start={ev.start} end={ev.end} /></span>}
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
  const L = useL();
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
        <span className="muted small">{L("{n} events", "{n} イベント", { n: events })}</span>
      </span>
    </button>
  );
}

// Group stages into events (one per mission).
function groupEvents(
  stages: StageIndexEntry[], untilById: Map<number, string>, info: Record<string, EventInfoEntry>,
): EventGroup[] {
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
        ...(s.mission_id ? info[String(s.mission_id)] : undefined),
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
  const L = useL();
  const hub = useHubLabels();
  const { loading, stages } = useStages();
  const currentMissions = useCurrentMissions();
  const historyYears = useHistoryYears();
  const stageCats = useStageCategories();
  const eventInfo = useEventInfo();
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
    const running = ids("running");
    // an open Imperial War corps opens every corps
    const war = (stages || []).filter((s) => s.event_category === IMPERIAL_WAR && s.mission_id).map((s) => s.mission_id!);
    if (war.some((m) => running.has(m))) {
      const warUntil = war.map((m) => until.get(m)).find(Boolean);
      for (const m of war) {
        running.add(m);
        if (warUntil && !until.has(m)) until.set(m, warUntil);
      }
    }
    return [running, ids("permanent"), until];
  }, [currentMissions, stages]);
  const info = useMemo(() => eventInfo || {}, [eventInfo]);

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

  const allEvents = useMemo(() => groupEvents(stages || [], untilById, info), [stages, untilById, info]);

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
      const en = s.mission_id ? info[String(s.mission_id)]?.en : undefined;
      return (
        (s.name || "").toLowerCase().includes(term) ||
        (s.event ? s.event.toLowerCase().includes(term) : false) ||
        (en ? en.toLowerCase().includes(term) : false) ||
        String(s.quest_id).includes(term)
      );
    });
    const events = groupEvents(filtered, untilById, info);

    if (cat === "running") {
      // one section, emergency first, newest missions on top
      events.sort((a, b) => {
        const ae = a.category === "Emergency" ? 0 : 1;
        const be = b.category === "Emergency" ? 0 : 1;
        return ae - be || (b.missionId || 0) - (a.missionId || 0);
      });
      return events.length ? [[L("Now running", "開催中"), events]] : [];
    }

    const byCat = new Map<string, EventGroup[]>();
    for (const ev of events) {
      const c = ev.category || L("Other", "その他");
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c)!.push(ev);
    }
    for (const evs of byCat.values()) {
      evs.sort((a, b) => (a.missionId || 0) - (b.missionId || 0));
    }
    const order = tile ? tile.categories : [...byCat.keys()].sort();
    return order.filter((c) => byCat.has(c)).map((c) => [c, byCat.get(c)!] as [string, EventGroup[]]);
  }, [stages, listMode, cat, term, tile, currentSet, permanentSet, untilById, info, L]);

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

  if (loading) return <p className="loading">{L("Loading stages…", "ステージを読み込み中…")}</p>;

  const openEvent = openMid ? allEvents.find((ev) => ev.missionId === openMid) : undefined;

  const toolbar = (count: string) => (
    <ListToolbar
      search={(
        <>
          <SearchBox value={q} onChange={(v) => list.setText("q", v)} placeholder={L("Search stage / event name (EN or JP) / quest id", "ステージ・イベント名（日本語・英語）・クエストIDで検索")} clearLabel={hub.clearSearch} />
          <select className="hub-select" value={cat} onChange={(e) => go({ cat: e.target.value })}>
            <option value="">{L("mission portal", "ミッション一覧")}</option>
            <option value="running">{L("now running", "開催中")}</option>
            <option value="permanent">{L("permanent", "常設")}</option>
            <option value="all">{L("all categories", "すべてのカテゴリ")}</option>
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
    const back = tile ? tile.title : cat === "running" ? L("Now running", "開催中") : cat === "permanent" ? L("Permanent", "常設")
      : cat === "all" ? L("All categories", "すべてのカテゴリ") : L("Mission portal", "ミッション一覧");
    return (
      <div>
        {toolbar(L("{n} stages", "{n} ステージ", { n: openEvent.stages.length }))}
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
        {toolbar(L("{n} events", "{n} イベント", { n: totalEvents }))}
        {cat === "running" && !term && totalEvents === 0 && (
          <EmptyState title={L("No limited-time missions right now", "現在開催中の期間限定ミッションはありません")} hint={L("Pick a category above.", "上のカテゴリを選んでください。")} />
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
    const isImperialWar = tile.categories.length === 1 && tile.categories[0] === IMPERIAL_WAR;
    const open = events.filter(isOpen);
    const closed = events.filter((ev) => !isOpen(ev));
    return (
      <div>
        {toolbar(L("{n} events", "{n} イベント", { n: events.length }))}
        <div className="portal-head">
          <button type="button" className="portal-back" onClick={() => go({})}>{L("← Mission portal", "← ミッション一覧")}</button>
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
            ...(rest.length ? [{ key: "other", label: L("Other", "その他"), group: null }] : []),
          ];
          const current = pages.find((p) => p.key === yearParam) ?? pages[0];
          if (!current) return null;
          const shown = current.group === null ? rest : clusters.get(current.group)!;
          return (
            <>
              <div className="year-tabs" role="tablist" aria-label={L("Year", "年")}>
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
        })() : isImperialWar ? (
          // every corps in one list: the war opens and closes as a whole
          <div className="cat-section">
            <h2 className="cat-title">
              {L("Great Imperial War", "帝国大戦")}{" "}
              <span className="muted small">{open.length ? L("open now", "開催中") : L("not open now", "開催していません")}</span>
            </h2>
            <MissionGrid events={events} onOpen={openMission} />
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <div className="cat-section">
                <h2 className="cat-title">{L("Open now", "開催中")}</h2>
                <MissionGrid events={open} onOpen={openMission} />
              </div>
            )}
            {closed.length > 0 && (
              <div className="cat-section">
                <h2 className="cat-title">{open.length ? L("Not open now", "開催していないミッション") : L("Missions", "ミッション")}</h2>
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
      {toolbar(L("{n} categories", "{n} カテゴリ", { n: tiles.filter(hasEvents).length }))}
      <nav className="portal-grid" aria-label={L("Stage categories", "ステージのカテゴリ")}>
        {tiles.filter(hasEvents).map((t) => (
          <PortalTile key={t.key} tile={t} events={tileEvents.get(t.key) ?? 0} onPick={pickTile} />
        ))}
      </nav>

      <div className="cat-section">
        <h2 className="cat-title">{L("Now running", "開催中")}</h2>
        {running.length ? <MissionGrid events={running} onOpen={openMission} />
          : <EmptyState title={L("No limited-time missions right now", "現在開催中の期間限定ミッションはありません")} hint={L("Pick a category above.", "上のカテゴリを選んでください。")} />}
      </div>
    </div>
  );
}
