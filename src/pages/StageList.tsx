import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStages } from "../data";
import type { StageIndexEntry } from "../types";

function bannerUrl(missionId: number): string {
  return `${import.meta.env.BASE_URL}banners/${missionId}.png`;
}

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

export default function StageList() {
  const { loading, stages } = useStages();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

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
      if (cat !== "all" && s.event_category !== cat) return false;
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
  }, [stages, q, cat]);

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
          <option value="all">all categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="count">{totalEvents} events</span>
      </div>

      {sections.map(([category, events]) => (
        <div key={category} className="cat-section">
          <h2 className="cat-title">{category}</h2>
          {events.slice(0, 200).map((ev) => (
            <EventBlock key={ev.missionId || ev.event} {...ev} />
          ))}
        </div>
      ))}
    </div>
  );
}
