import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useEnemies, useSpecialtyConfig, useInfluenceLabels } from "../data";
import { Sprite, DamageBadge, fillLabel } from "../components";
import type { GlobalEnemy, SpecialtyConfig } from "../types";

const PAGE = 60;

// resolve an enemy's influence ids from its SpEff, skipping cosmetic visuals.
const COSMETIC = new Set([1, 31, 49, 50]);
function enemyInfluences(e: GlobalEnemy, spcfg: SpecialtyConfig | null): number[] {
  const rows = (e.special_effect_id && spcfg?.[String(e.special_effect_id)]) || [];
  return rows.map((r) => r.influence).filter((i) => !COSMETIC.has(i));
}

export default function EnemyList() {
  const { loading, enemies } = useEnemies();
  const spcfg = useSpecialtyConfig();
  const labels = useInfluenceLabels();

  const [q, setQ] = useState("");
  const [dmg, setDmg] = useState("all");
  const [tag, setTag] = useState("all");
  const [infl, setInfl] = useState("all");
  const [page, setPage] = useState(0);

  const { tagOpts, inflOpts } = useMemo(() => {
    const tags = new Set<string>();
    const infls = new Set<number>();
    if (enemies && spcfg) {
      for (const e of enemies) {
        (e.tags || []).forEach((t) => tags.add(t));
        enemyInfluences(e, spcfg).forEach((i) => infls.add(i));
      }
    }
    return {
      tagOpts: [...tags].sort(),
      inflOpts: [...infls].sort((a, b) => a - b),
    };
  }, [enemies, spcfg]);

  const filtered = useMemo(() => {
    if (!enemies) return [] as GlobalEnemy[];
    const term = q.trim().toLowerCase();
    const inflN = infl === "all" ? null : Number(infl);
    return enemies.filter((e) => {
      if (dmg !== "all" && e.damage_type !== dmg) return false;
      if (tag !== "all" && !(e.tags || []).includes(tag)) return false;
      if (inflN != null && !enemyInfluences(e, spcfg).includes(inflN)) return false;
      if (term) {
        const hay = [String(e.id), e.type, (e.tags || []).join(",")]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [enemies, spcfg, q, dmg, tag, infl]);

  const resetPage =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(0);
    };

  if (loading) return <p className="loading">Loading enemies…</p>;

  const pages = Math.ceil(filtered.length / PAGE);
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const inflLabel = (i: number) => {
    const tpl = labels?.specialty?.[String(i)];
    return tpl ? `${i} — ${fillLabel(tpl, []).slice(0, 40)}` : `influence ${i}`;
  };

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder="Search id / type / tag"
          value={q}
          onChange={(e) => resetPage(setQ)(e.target.value)}
        />
        <select value={dmg} onChange={(e) => resetPage(setDmg)(e.target.value)}>
          <option value="all">all damage</option>
          <option value="physical">physical</option>
          <option value="magical">magical</option>
          <option value="true">true</option>
        </select>
        <select value={tag} onChange={(e) => resetPage(setTag)(e.target.value)}>
          <option value="all">all tags</option>
          {tagOpts.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={infl} onChange={(e) => resetPage(setInfl)(e.target.value)}>
          <option value="all">all abilities</option>
          {inflOpts.map((i) => (
            <option key={i} value={String(i)}>{inflLabel(i)}</option>
          ))}
        </select>
        <span className="count">{filtered.length.toLocaleString()} enemies</span>
      </div>

      <div className="enemy-grid">
        {shown.map((e) => (
          <Link to={`/enemies/${e.id}`} className="enemy-tile" key={e.id}>
            <Sprite patternId={e.pattern_id} size={56} alt={String(e.id)} />
            <div className="enemy-tile-body">
              <div className="enemy-tile-id">
                #{e.id} {e.boss && <span className="badge boss">BOSS</span>}
              </div>
              <div className="enemy-tile-attr">
                {e.tags && e.tags.length ? e.tags.join(" · ") : e.type}
              </div>
              <div><DamageBadge type={e.damage_type} /></div>
              <div className="muted small">
                HP {(e.hp ?? 0).toLocaleString()} · ATK {(e.attack ?? 0).toLocaleString()}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {pages > 1 && (
        <div className="pager">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ‹ prev
          </button>
          <span className="muted small">page {page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            next ›
          </button>
        </div>
      )}
    </div>
  );
}
