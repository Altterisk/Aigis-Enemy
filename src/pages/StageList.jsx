import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStages } from "../data.js";

export default function StageList() {
  const { loading, stages } = useStages();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const categories = useMemo(() => {
    if (!stages) return [];
    return [...new Set(stages.map((s) => s.event_category).filter(Boolean))].sort();
  }, [stages]);

  // Group filtered stages by event.
  const groups = useMemo(() => {
    if (!stages) return [];
    const term = q.trim().toLowerCase();
    const filtered = stages.filter((s) => {
      if (cat !== "all" && s.event_category !== cat) return false;
      if (!term) return true;
      return (
        s.name.toLowerCase().includes(term) ||
        (s.event && s.event.toLowerCase().includes(term)) ||
        String(s.quest_id).includes(term)
      );
    });
    const byEvent = new Map();
    for (const s of filtered) {
      const key = s.event || "(ungrouped)";
      if (!byEvent.has(key))
        byEvent.set(key, { event: key, category: s.event_category, stages: [] });
      byEvent.get(key).stages.push(s);
    }
    return [...byEvent.values()];
  }, [stages, q, cat]);

  if (loading) return <p className="loading">Loading stages…</p>;

  const total = groups.reduce((n, g) => n + g.stages.length, 0);

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
        <span className="count">{total} stages · {groups.length} events</span>
      </div>

      {groups.slice(0, 120).map((g) => (
        <section key={g.event} className="event-group">
          <h3>
            {g.category && <span className="cat-badge">{g.category}</span>} {g.event}
            <span className="muted small"> · {g.stages.length}</span>
          </h3>
          <ul className="stage-row">
            {g.stages
              .sort((a, b) => a.level - b.level)
              .map((s) => (
                <li key={s.quest_id}>
                  <Link to={`/stages/${s.quest_id}`}>
                    {s.name}
                    <span className="muted small"> ×{s.multiplier}</span>
                    <span className="muted small"> · {s.enemies.length} enemies</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
      {groups.length > 120 && (
        <p className="muted">Showing first 120 events. Refine your search.</p>
      )}
    </div>
  );
}
