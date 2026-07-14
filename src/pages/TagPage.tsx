import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useUnits, useLocalisation, loadJSONFile } from "../data";
import { UnitImage } from "../components";
import type { TagMentions } from "../types";

// /tags/:tag -- one page per JP tag (faction / race / big-race / attribute /
// season): every unit carrying the tag, plus every skill/ability whose
// condition mentions it (tag_mentions.json, same data the unit list used).
export default function TagPage() {
  const { tag = "" } = useParams();
  const { loading, units } = useUnits();
  const loc = useLocalisation();
  const [mentions, setMentions] = useState<TagMentions | null>(null);

  useEffect(() => {
    loadJSONFile<TagMentions>("tag_mentions").then(setMentions).catch(() => setMentions({}));
  }, []);

  if (loading) return <p className="loading">Loading units…</p>;

  const tagEn = loc?.tags[tag] || loc?.races[tag] || tag;
  const carriers = (units || []).filter(
    (u) => (u.tags || []).includes(tag) && !(u.prince && u.id !== 1)
  );

  return (
    <div>
      <Link className="back" to="/units">← units</Link>
      <h2>
        {tagEn}
        {tagEn !== tag && <span className="muted" style={{ fontSize: 14 }}> {tag}</span>}
      </h2>

      {mentions && (["unit", "enemy"] as const).map((bucket) => {
        const list = mentions[tag]?.[bucket] || [];
        if (list.length === 0) return null;
        return (
          <details className="tag-mentions" key={bucket} open>
            <summary>
              {list.length} skills / abilities{" "}
              {bucket === "unit"
                ? `condition on ally/unit tag ${tagEn}`
                : `target ENEMIES tagged ${tagEn} (enemy race/element namespace)`}
            </summary>
            <ul className="admin-examples">
              {list.map((m, i) => (
                <li key={i}>
                  <Link to={`/units/${m.unit}`}>#{m.unit} {m.name}</Link>
                  <span className="muted"> — {m.slot} ({m.kind})</span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}

      <p className="muted small">{carriers.length.toLocaleString()} units with this tag</p>
      <div className="unit-grid">
        {carriers.map((u) => (
          <Link to={`/units/${u.id}`} className="enemy-tile unit-tile" key={u.id}>
            <UnitImage kind="icon" id={u.id} className="unit-icon-thumb" alt={String(u.id)} />
            <div className="enemy-tile-body unit-tile-body">
              <div className="unit-tile-name">
                {u.name_en || u.name || "(unnamed)"}
              </div>
              <div className="muted small unit-tile-sub">
                #{u.id}{u.name_en && u.name ? ` · ${u.name}` : ""}
              </div>
              <div className="enemy-tile-attr">
                {u.rarity} · {(u.class && loc?.classes[u.class]) || u.class || "?"} {u.ranged ? "(ranged)" : ""}
              </div>
              {u.tags && u.tags.length > 0 && (
                <div className="muted small unit-tile-tags">
                  {u.tags.map((t) => loc?.tags[t] || t).join(", ")}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
