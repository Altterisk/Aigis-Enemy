import { useState } from "react";
import type { ReactNode } from "react";
import { spriteUrl, DMG_COLORS, useInfluenceLabels } from "./data";
import type { Effect, DamageType } from "./types";

export function Sprite({
  patternId,
  size = 56,
  alt = "",
  fit = false,
}: {
  patternId?: number | null;
  size?: number;
  alt?: string;
  fit?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed || patternId == null) {
    return <div className="sprite sprite--missing" style={{ width: size, height: size }} />;
  }
  // fit: respect the sprite's real proportions, bounded by `size`.
  const style = fit
    ? { maxWidth: size, maxHeight: size, width: "auto", height: "auto" }
    : { width: size, height: size };
  return (
    <img
      className="sprite"
      src={spriteUrl(patternId)}
      style={style}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function DamageBadge({ type }: { type?: DamageType }) {
  return (
    <span
      className="badge"
      style={{ background: (type && DMG_COLORS[type]) || "#777" }}
    >
      {type}
    </span>
  );
}

// Fill a label template with param values.
//  {pN}            -> the Nth param value (1-based).
//  [[?pN: text]]   -> include "text" only when param N is set (nonzero).
//  [[?pN|A|B]]     -> A if param N set, else B.
export function fillLabel(tpl: string, params?: number[]): string {
  const val = (n: string | number) => params?.[Number(n) - 1] ?? 0;
  let out = tpl;
  out = out.replace(
    /\[\[\?p([1-4])\|([\s\S]*?)\|([\s\S]*?)\]\]/g,
    (_m, n, ifSet, ifNot) => (val(n) ? ifSet : ifNot)
  );
  out = out.replace(/\[\[\?p([1-4]):([\s\S]*?)\]\]/g, (_m, n, text) =>
    val(n) ? text : ""
  );
  out = out.replace(/\{p([1-4])\}/g, (_m, n) => String(val(n)));
  return out.trim();
}

// DoT influences: 16 = self-DoT, 19 = aura DoT. dmg in Param_2, interval in
// Param_3 (60fps engine frames; display 30fps). dmg/sec = dmg*60/interval.
const DOT_IDS = new Set([16, 19]);

// DoT damage/sec. id 16 (self-DoT) carries dmg AND interval in its own params.
// id 19 (aura DoT) carries the dmg in Param_2 but the INTERVAL lives on the
// paired influence 18 (Param_3) -- verified: Wererat 18[1,70,6]+19[0,45] ->
// 45*60/6 = 450/sec; Beelzebub 18[..,10]+19[0,10] -> 60/sec. Engine 60fps,
// display 30fps so display frames = interval/2.
function dotBreakdown(e: Effect, all: Effect[]): string | null {
  if (e.kind !== "specialty" || !DOT_IDS.has(e.influence)) return null;
  const dmg = e.params?.[1] || 0;
  if (!dmg) return null;
  let interval = e.params?.[2] || 0;
  if (e.influence === 19) {
    // pull the interval from the paired aura (influence 18, Param_3).
    const aura = all.find((x) => x.influence === 18);
    interval = aura?.params?.[2] || interval;
  }
  if (!interval) interval = 10;
  const displayFrames = interval / 2;
  const perSec = Math.round((dmg * 60) / interval);
  return `${dmg} dmg / ${displayFrames}f (${perSec}/sec)`;
}

// Aura range (influence 18): in-game radius = raw Param_2 * 2. Verified by
// Beelzebub's Servant (魔神討滅戦): raw 70 -> in-game 140. (Not *4/3 like splash,
// nor *DotRate/1.5 like attack range.) Huge values = global.
export function auraRadius(e: Effect): string | null {
  if (e.kind !== "specialty" || e.influence !== 18) return null;
  const raw = e.params?.[1] || 0;
  if (!raw) return null;
  if (raw >= 1000) return "global range";
  return `range ${raw * 2}`;
}

// Render influences. Meanings resolved from the label table keyed by kind+id.
export function Effects({ effects }: { effects?: Effect[] }) {
  const labels = useInfluenceLabels();
  if (!effects || effects.length === 0) return <span className="muted">none</span>;
  return (
    <ul className="effects">
      {effects.map((e, i) => {
        let meaning =
          labels && e.kind && labels[e.kind]
            ? labels[e.kind][String(e.influence)]
            : null;
        if (meaning) meaning = fillLabel(meaning, e.params);
        const dot = dotBreakdown(e, effects);
        const aura = auraRadius(e);
        return (
          <li key={i}>
            {e.kind && <span className="kind">{e.kind}</span>}
            <code>influence {e.influence}</code>
            {e.params && e.params.length > 0 && (
              <span className="params"> [{e.params.join(", ")}]</span>
            )}
            {meaning && <span className="meaning"> {meaning}</span>}
            {dot && <span className="dot-calc"> {dot}</span>}
            {aura && <span className="dot-calc"> {aura}</span>}
            {(e.expression_human || e.expression) && (
              <span className="expr" title={e.expression}>
                {" "}if {e.expression_human || e.expression}
              </span>
            )}
            {e.ext && <span className="expr"> {e.ext}</span>}
          </li>
        );
      })}
    </ul>
  );
}

// _Attribute element/property tags (Undead, Armor, Stealth, ...).
export function Tags({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <span className="tags">
      {tags.map((t, i) => (
        <span className="tag" key={i}>{t}</span>
      ))}
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
