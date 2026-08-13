import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useUnits, useLocalisation, useTexts, loadJSONFile } from "../data";
import { ColorCodedText, UnitIconLink, UnitImage } from "../components";
import type { Localisation, TagMention, TagMentions, Texts } from "../types";

const SOURCE_TYPES = [
  { kind: "skill", label: "Skills" },
  { kind: "ability", label: "Abilities" },
  { kind: "class", label: "Classes" },
] as const;

function MentionTable({ rows, kind, loc, texts }: {
  rows: TagMention[];
  kind: TagMention["kind"];
  loc: Localisation | null;
  texts: Texts;
}) {
  const translatedName = (row: TagMention) => {
    if (row.source_name_en) return row.source_name_en;
    if (!row.source_name) return row.slot;
    if (kind === "skill") return loc?.skills[row.source_name] || row.source_name;
    if (kind === "ability") return loc?.abilities[row.source_name] || row.source_name;
    return loc?.classes[row.source_name] || row.source_name;
  };
  const translatedEffect = (row: TagMention) => {
    if (!row.effect) return undefined;
    if (kind === "skill") return texts.skill_texts[row.effect];
    if (kind === "ability") return texts.ability_texts[row.effect];
    return texts.class_texts[row.effect];
  };
  return (
    <table className="grid tag-effect-table">
      <thead><tr><th>Name</th><th>Effect</th><th>Owner unit</th></tr></thead>
      <tbody>
        {rows.map((row, index) => {
          const sourceName = translatedName(row);
          const effectEn = translatedEffect(row);
          return (
            <tr key={`${row.unit}-${row.slot}-${index}`}>
              <td>
                {sourceName}
                {row.source_name && sourceName !== row.source_name && (
                  <div className="muted small">{row.source_name}</div>
                )}
                {row.source_id && <span className="muted small"> #{row.source_id}</span>}
                <div className="muted small">{row.slot}</div>
              </td>
              <td className="tag-effect-text">
                {row.effect ? (
                  <>
                    {effectEn && <div title="machine translated">{effectEn}</div>}
                    <div className={effectEn ? "muted small" : undefined}>
                      <ColorCodedText text={row.effect} />
                    </div>
                  </>
                ) : <span className="muted">-</span>}
              </td>
              <td><UnitIconLink id={row.unit} name={row.name} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// /tags/:tag -- one page per JP tag (faction / race / big-race / attribute /
// season): every unit carrying the tag, plus detailed tables for every
// skill, ability, and class whose condition mentions it.
export default function TagPage() {
  const { tag = "" } = useParams();
  const { loading, units } = useUnits();
  const loc = useLocalisation();
  const texts = useTexts();
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
              {list.length} effects{" "}
              {bucket === "unit"
                ? `condition on ally/unit tag ${tagEn}`
                : `target ENEMIES tagged ${tagEn} (enemy race/element namespace)`}
            </summary>
            {SOURCE_TYPES.map(({ kind, label }) => {
              const rows = list.filter((mention) => mention.kind === kind);
              if (!rows.length) return null;
              return (
                <details className="tag-effect-section" key={kind}>
                  <summary>{label} <span className="muted small">({rows.length})</span></summary>
                  <MentionTable rows={rows} kind={kind} loc={loc} texts={texts} />
                </details>
              );
            })}
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
