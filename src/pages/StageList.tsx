import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStages, useCurrentMissions, useHistoryYears, bannerUrl } from "../data";
import type { StageIndexEntry } from "../types";

interface EventGroup {
  event: string;
  category?: string | null;
  missionId?: number | null;
  stages: StageIndexEntry[];
}

// One event block: banner + title, then its stages.
function EventBlock({ event, category, missionId, stages }: EventGroup) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <section className="event-group">
      <div className="event-head">
        {missionId && imgOk && (
          <img
            className="event-banner"
            src={bannerUrl(missionId)}
            alt=""
            loading="lazy"
            onError={() => setImgOk(false)}
          />
        )}
        <div>
          <h3>
            {category && <span className="cat-badge">{category}</span>} {event}
          </h3>
          <div className="muted small">{stages.length} stage(s)</div>
        </div>
      </div>
      <ul className="stage-row">
        {stages
          .slice()
          .sort((a, b) => a.quest_id - b.quest_id)
          .map((s) => (
            <li key={s.quest_id} className={s.active === false ? "archived" : ""}>
              <Link to={`/stages/${s.quest_id}`}>
                {s.name}
                <span className="muted small"> ×{s.multiplier ?? 1}</span>
                <span className="muted small"> · {s.enemy_count ?? 0} enemies</span>
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
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className="year-group">
      <div className="year-head">
        {imgOk && (
          <img
            className="year-banner"
            src={bannerUrl(`history_${group}`)}
            alt=""
            loading="lazy"
            onError={() => setImgOk(false)}
          />
        )}
        {!imgOk && <h2 className="cat-title">{title}</h2>}
      </div>
      {events.map((ev) => (
        <EventBlock key={ev.missionId || ev.event} {...ev} />
      ))}
    </div>
  );
}

// Categories whose open (Enable-flagged) missions are limited-time content
// that belongs in the default "current" view. Rotating always-open tables
// (Devil Advent / Raid / Tower / Reproduce) are excluded — every one of
// their missions is flagged open all the time.
const CURRENT_CATS = new Set(["Emergency", "Subjugation"]);

export default function StageList() {
  const { loading, stages } = useStages();
  const currentMissions = useCurrentMissions();
  const historyYears = useHistoryYears();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("current");

  const currentSet = useMemo(() => {
    return new Set(
      (currentMissions || [])
        .filter((m) => CURRENT_CATS.has(m.category))
        .map((m) => m.mission_id),
    );
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
  }, [stages, q, cat, currentSet]);

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
      <div className="toolbar">
        <input
          placeholder="Search stage / event / quest id"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="current">now running</option>
          <option value="all">all categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="count">{totalEvents} events</span>
      </div>

      {cat === "current" && totalEvents === 0 && (
        <p className="muted">No limited-time missions matched — switch to a category above.</p>
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
