import { useState } from "react";
import { spriteUrl, DMG_COLORS, useInfluenceLabels } from "./data.js";

export function Sprite({ patternId, size = 56, alt = "" }) {
  const [failed, setFailed] = useState(false);
  if (failed || patternId == null) {
    return <div className="sprite sprite--missing" style={{ width: size, height: size }} />;
  }
  return (
    <img
      className="sprite"
      src={spriteUrl(patternId)}
      width={size}
      height={size}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function DamageBadge({ type }) {
  return (
    <span className="badge" style={{ background: DMG_COLORS[type] || "#777" }}>
      {type}
    </span>
  );
}

// DoT influences: 16 = self-DoT, 19 = aura DoT. Both encode damage in Param_2
// and an interval in Param_3 (engine frames at 60fps; display is 30fps).
// dmg/sec = dmg * 60 / interval. We surface per-frame and per-second so the
// real numbers are clear. id 19's interval defaults to 10 engine frames when
// absent (matches the reference 200/5 display-frames = 1200/sec).
const DOT_IDS = new Set([16, 19]);

function dotBreakdown(e) {
  if (e.kind !== "specialty" || !DOT_IDS.has(e.influence)) return null;
  const dmg = e.params?.[1] || 0;
  if (!dmg) return null;
  const interval = e.params?.[2] || 10; // engine frames @60fps
  const displayFrames = interval / 2; // game runs at 30fps
  const perSec = Math.round((dmg * 60) / interval);
  return `${dmg} dmg / ${displayFrames}f (${perSec}/sec)`;
}

// Render influences. Verified meanings are resolved HERE from a static label
// table (influence_labels.json) keyed by kind+id, so adding/fixing a label
// needs no data re-extract. Unknown ids show raw. The `kind` (term vs
// specialty) matters: those are SEPARATE id namespaces.
export function Effects({ effects }) {
  const labels = useInfluenceLabels();
  if (!effects || effects.length === 0) return <span className="muted">none</span>;
  return (
    <ul className="effects">
      {effects.map((e, i) => {
        let meaning =
          labels && e.kind && labels[e.kind]
            ? labels[e.kind][String(e.influence)]
            : null;
        // substitute {p1}..{p4} with the actual param values
        if (meaning) {
          meaning = meaning.replace(/\{p([1-4])\}/g, (_, n) =>
            String(e.params?.[Number(n) - 1] ?? 0)
          );
        }
        const dot = dotBreakdown(e);
        return (
          <li key={i}>
            {e.kind && <span className="kind">{e.kind}</span>}
            <code>influence {e.influence}</code>
            {e.params && e.params.length > 0 && (
              <span className="params"> [{e.params.join(", ")}]</span>
            )}
            {meaning && <span className="meaning"> {meaning}</span>}
            {dot && <span className="dot-calc"> {dot}</span>}
            {e.expression && <span className="expr"> {e.expression}</span>}
            {e.ext && <span className="expr"> {e.ext}</span>}
          </li>
        );
      })}
    </ul>
  );
}

// _Attribute element/property tags (Undead, Armor, Stealth, unblockable, ...).
// These are NOT names — just the game's category tags.
export function Tags({ tags }) {
  if (!tags || tags.length === 0) return null;
  return (
    <span className="tags">
      {tags.map((t, i) => (
        <span className="tag" key={i}>{t}</span>
      ))}
    </span>
  );
}

export function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
