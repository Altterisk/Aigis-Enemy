import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useEnemies } from "../data.js";
import { Sprite, DamageBadge } from "../components.jsx";

export default function EnemyList() {
  const { loading, enemies } = useEnemies();
  const [q, setQ] = useState("");
  const [dmg, setDmg] = useState("all");

  const filtered = useMemo(() => {
    if (!enemies) return [];
    const term = q.trim().toLowerCase();
    return enemies.filter((e) => {
      if (dmg !== "all" && e.damage_type !== dmg) return false;
      if (!term) return true;
      return (
        (e.tags && e.tags.join(",").toLowerCase().includes(term)) ||
        e.type.toLowerCase().includes(term) ||
        String(e.id).includes(term)
      );
    });
  }, [enemies, q, dmg]);

  if (loading) return <p className="loading">Loading enemies…</p>;

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder="Search id / type / attribute"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={dmg} onChange={(e) => setDmg(e.target.value)}>
          <option value="all">all damage</option>
          <option value="physical">physical</option>
          <option value="magical">magical</option>
          <option value="true">true</option>
        </select>
        <span className="count">{filtered.length} enemies</span>
      </div>
      <div className="enemy-grid">
        {filtered.slice(0, 400).map((e) => (
          <Link to={`/enemies/${e.id}`} className="enemy-tile" key={e.id}>
            <Sprite patternId={e.pattern_id} size={56} alt={String(e.id)} />
            <div className="enemy-tile-body">
              <div className="enemy-tile-id">#{e.id}</div>
              <div className="enemy-tile-attr">
                {e.tags && e.tags.length ? e.tags.join(" · ") : e.type}
              </div>
              <div>
                <DamageBadge type={e.damage_type} />
              </div>
              <div className="muted small">
                HP {e.hp.toLocaleString()} · ATK {e.attack.toLocaleString()}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {filtered.length > 400 && (
        <p className="muted">Showing first 400. Refine your search.</p>
      )}
    </div>
  );
}
