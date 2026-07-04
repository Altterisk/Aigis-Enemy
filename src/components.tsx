import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { spriteUrl, unitImageUrl, DMG_COLORS, useInfluenceLabels } from "./data";
import type { Effect, DamageType, UnitImageKind, Missile, MissileOnHit } from "./types";

// Humanize a missile's on-hit status effect (decoded from the Property field).
// Shared by enemy (StageDetail) and unit skill (UnitDetail) missile displays.
export function missileOnHitText(h?: MissileOnHit | null): string {
  if (!h) return "";
  const KIND: Record<string, string> = {
    "DOT": "poison",
    "スタック式DOT": "stacking poison",
    "攻撃遅延": "attack-delay (slow)",
    "ステータス低下": "stat down",
  };
  const label = KIND[h.kind] || h.kind;
  // damage description with the per-second rate. The percent's BASE depends
  // on 攻撃力を使う (uses_atk): set -> % of the attacker's own ATK per tick
  // (the normal unit-skill poison, user-confirmed on Roselne #2621);
  // unset -> % of the target's max HP (the rarer enemy style, e.g. Acid
  // Slime missile 753).
  const parts: string[] = [];
  const iv = h.interval_f || 0;
  if (h.pct_hp) {
    const base = h.uses_atk ? "of ATK" : "of max HP";
    const perSec = iv ? ` (${Math.round((h.pct_hp * 60) / iv)}%/sec)` : "";
    parts.push(`${h.pct_hp}% ${base}/tick${perSec}`);
  }
  if (h.flat) {
    const perSec = iv ? ` (${Math.round((h.flat * 60) / iv)}/sec)` : "";
    parts.push(`${h.flat} dmg/tick${perSec}`);
  }
  if (h.attack_interval_f) {
    // 攻撃遅延's raw 攻撃間隔 frame count -- shown raw, semantics unverified.
    parts.push(`攻撃間隔 ${h.attack_interval_f}f (raw)`);
  }
  if (h.stat_down) {
    const sd = Object.entries(h.stat_down)
      .map(([k, v]) => `${k.toUpperCase()} 低下 ${v}`)
      .join(", ");
    parts.push(`${sd} (raw %, to/by unverified)`);
  }
  const dur = h.duration_f ? ` for ${(h.duration_f / 60).toFixed(1)}s` : "";
  const dmg = parts.length ? `: ${parts.join(", ")}` : "";
  const extra: string[] = [];
  if (h.relief) extra.push("症状緩和");
  if (h.expire_duration_only) extra.push("expires by duration only");
  if (h.other) extra.push(...Object.entries(h.other).map(([k, v]) => `${k}=${v}`));
  const tail = extra.length ? ` [${extra.join(", ")}]` : "";
  return `on hit: ${label}${dmg}${dur}${tail}`;
}

// All of a missile's noteworthy facts on one line (shared by unit skill rows
// and enemy displays).
export function missileText(m: Missile): string {
  const parts: string[] = [];
  if (m.splash) parts.push(`splash ${m.splash}`);
  if (m.penetrate) {
    // travelling projectile that hits every enemy it passes through; the AoE
    // is the projectile's own collision size in pixels (these missiles have
    // no DamageArea), user-confirmed.
    parts.push(`penetrates all in path${m.width ? ` (width ${m.width}px)` : ""}`);
  }
  if (m.slow) parts.push(`slow ${m.slow[0]}%/${m.slow[1]}f`);
  if (m.deflectable) parts.push("deflectable");
  if (m.heal) parts.push("heal");
  if (m.blast_residue) {
    // the blast area lingers as a DAMAGE FIELD re-hitting on an interval
    // (area = the splash radius above), user-confirmed on missile 1498.
    const [t, iv] = m.blast_residue;
    parts.push(`creates a damage field for ${(t / 60).toFixed(1)}s (ticks every ${iv}f)`);
  }
  if (m.on_hit) parts.push(missileOnHitText(m.on_hit));
  return parts.join(", ");
}

// Unit image (art/icon/sprite; icons are published, art/sprite dev-only).
// Not every unit has AW2A/AW2B (or even AW) art -- on load failure, step DOWN
// through lower tiers (AW2B -> AW2A -> AW -> base). When every tier of the
// requested kind fails (e.g. art on the published site, which has no art at
// all), optionally fall back to another kind (fallbackKind, retried from the
// originally requested tier) before giving up and showing a blank box.
export function UnitImage({
  kind,
  id,
  tier = 0,
  fallbackKind,
  className,
  alt = "",
}: {
  kind: UnitImageKind;
  id: number;
  tier?: number;
  fallbackKind?: UnitImageKind;
  className?: string;
  alt?: string;
}) {
  const [tried, setTried] = useState({ kind, tier });
  useEffect(() => setTried({ kind, tier }), [tier, id, kind]);

  if (tried.tier < 0) {
    return <div className={`unit-img unit-img--missing ${className || ""}`} />;
  }
  const onError = () => {
    setTried((t) => {
      if (t.tier > 0) return { ...t, tier: t.tier - 1 };
      if (fallbackKind && t.kind !== fallbackKind) return { kind: fallbackKind, tier };
      return { ...t, tier: -1 };
    });
  };
  return (
    <img
      className={`unit-img ${className || ""}${tried.kind !== kind ? " unit-img--fallback" : ""}`}
      src={unitImageUrl(tried.kind, id, tried.tier)}
      alt={alt}
      loading="lazy"
      onError={onError}
    />
  );
}

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
// Periodic HP effects -> per-second number. Param_2 = amount/tick, Param_3 =
// interval (engine frames @60fps). per-sec = amount * 60 / interval. The label
// stays descriptive; this adds the concrete rate. DoTs vs heals labelled.
//   16 = self-DoT, 19 = aura DoT (interval on the paired id 18 Param_3),
//   17 = self-heal, 32 = heals all enemies.
const DOT_IDS = new Set([16, 19]);
const HEAL_IDS = new Set([17, 32]);

export function periodicRate(e: Effect, all: Effect[]): string | null {
  if (e.kind !== "specialty") return null;
  const isDot = DOT_IDS.has(e.influence);
  const isHeal = HEAL_IDS.has(e.influence);
  if (!isDot && !isHeal) return null;
  const amount = e.params?.[1] || 0;
  if (!amount) return null;
  let interval = e.params?.[2] || 0;
  if (e.influence === 19) {
    // aura DoT: interval lives on the paired influence 18 (Param_3). Verified:
    // Wererat 18[1,70,6]+19[0,45] -> 45*60/6 = 450/sec.
    const aura = all.find((x) => x.influence === 18);
    interval = aura?.params?.[2] || interval;
  }
  if (!interval) interval = 10;
  const perSec = Math.round((amount * 60) / interval);
  const word = isHeal ? "heal" : "dmg";
  return `${amount} ${word} every ${(interval / 60).toFixed(2)}s (${perSec}/sec)`;
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
// Long lists fold behind a toggle (raw rows are reference material).
export function Effects({ effects, foldAt = 5 }: { effects?: Effect[]; foldAt?: number }) {
  const labels = useInfluenceLabels();
  if (!effects || effects.length === 0) return <span className="muted">none</span>;
  const list = (
    <ul className="effects">
      {effects.map((e, i) => {
        let meaning =
          labels && e.kind && labels[e.kind]
            ? labels[e.kind][String(e.influence)]
            : null;
        if (meaning) meaning = fillLabel(meaning, e.params);
        const dot = periodicRate(e, effects);
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
  if (effects.length > foldAt) {
    return (
      <details className="inf-toggle">
        <summary>{effects.length} effects</summary>
        {list}
      </details>
    );
  }
  return list;
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
