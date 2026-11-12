import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, FallbackImage, ListToolbar, SearchBox } from "@altterisk/game-hub";
import { listState, searchParamsAdapter } from "@altterisk/game-hub/filters";
import { useStages, useCurrentMissions, useHistoryYears, bannerUrl } from "../data";
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

// Year heading + its events, for the History category.
function YearBlock({ group, title, events }: {
  group: number;
  title: string;
  events: EventGroup[];
}) {
  return (
    <div className="year-group">
      <div className="year-head">
        <FallbackImage
          className="year-banner"
          srcs={[bannerUrl(`history_${group}`)]}
          missing={<h2 className="cat-title">{title}</h2>}
        />
      </div>
      {events.map((ev) => (
        <EventBlock key={ev.missionId || ev.event} {...ev} />
      ))}
    </div>
  );
}


export default function StageList() {
  const { loading, stages } = useStages();
  const currentMissions = useCurrentMissions();
  const historyYears = useHistoryYears();
  // search + category live in the URL; an absent ?cat= is "current"
  const [params, setParams] = useSearchParams();
  const list = listState(searchParamsAdapter(params, setParams));
  const q = list.text("q");
  const cat = list.text("cat", "current");

  // mission ids by timing (data/current_missions.json): limited-time events
  // open now, and the always-available ones
  const [currentSet, permanentSet, untilById] = useMemo(() => {
    const ids = (t: string) => new Set((currentMissions || []).filter((m) => m.timing === t).map((m) => m.mission_id));
    const until = new Map((currentMissions || []).filter((m) => m.until).map((m) => [m.mission_id, m.until!]));
    return [ids("running"), ids("permanent"), until];
  }, [currentMissions]);

  const categories = useMemo(() => {
    if (!stages) return [] as string[];
    return [...new Set(stages.map((s) => s.event_category).filter(Boolean))]
      .sort() as string[];
  }, [stages]);

  // Group filtered stages into events, then events into category sections.
  const sections = useMemo<[string, EventGroup[]][]>(() => {
    if (!stages) return [];
    const term = q.trim().toLowerCase();
    const filtered = stages.filter((s) => {
      if (cat === "current") {
        if (!s.mission_id || !currentSet.has(s.mission_id)) return false;
      } else if (cat === "permanent") {
        if (!s.mission_id || !permanentSet.has(s.mission_id)) return false;
      } else if (cat !== "all" && s.event_category !== cat) {
        return false;
      }
      if (!term) return true;
      return (
        (s.name || "").toLowerCase().includes(term) ||
        (s.event ? s.event.toLowerCase().includes(term) : false) ||
        String(s.quest_id).includes(term)
      );
    });

    const byEvent = new Map<string | number, EventGroup>();
    for (const s of filtered) {
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
    const events = [...byEvent.values()];

    if (cat === "current") {
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
    for (const list of byCat.values()) {
      list.sort((a, b) => (a.missionId || 0) - (b.missionId || 0));
    }
    return [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [stages, q, cat, currentSet, permanentSet, untilById]);

  // History events clustered into year groups (falls back to a flat list
  // when the year data is missing).
  const renderHistory = (events: EventGroup[]) => {
    if (!historyYears?.length) {
      return events.slice(0, 200).map((ev) => (
        <EventBlock key={ev.missionId || ev.event} {...ev} />
      ));
    }
    const yearOf = new Map<number, number>();
    for (const y of historyYears) {
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
    return (
      <>
        {historyYears.map((y) =>
          clusters.has(y.group) ? (
            <YearBlock key={y.group} group={y.group} title={y.title} events={clusters.get(y.group)!} />
          ) : null,
        )}
        {rest.map((ev) => (
          <EventBlock key={ev.missionId || ev.event} {...ev} />
        ))}
      </>
    );
  };

  if (loading) return <p className="loading">Loading stages…</p>;

  const totalEvents = sections.reduce((n, [, evs]) => n + evs.length, 0);

  return (
    <div>
      <ListToolbar
        search={(
          <>
            <SearchBox value={q} onChange={(v) => list.setText("q", v)} placeholder="Search stage / event / quest id" />
            <select className="hub-select" value={cat} onChange={(e) => list.setText("cat", e.target.value === "current" ? "" : e.target.value)}>
              <option value="current">now running</option>
              <option value="permanent">permanent</option>
              <option value="all">all categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </>
        )}
        count={`${totalEvents} events`}
      />

      {cat === "current" && totalEvents === 0 && (
        <EmptyState title="No limited-time missions right now" hint="Pick a category above." />
      )}

      {sections.map(([category, events]) => (
        <div key={category} className="cat-section">
          <h2 className="cat-title">{category}</h2>
          {category === "History"
            ? renderHistory(events)
            : events.slice(0, 200).map((ev) => (
                <EventBlock key={ev.missionId || ev.event} {...ev} />
              ))}
        </div>
      ))}
    </div>
  );
}
