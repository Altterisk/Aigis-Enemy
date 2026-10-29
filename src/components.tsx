import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { RenderLink } from "@altterisk/game-hub";
import { spriteUrl, enemyAnimUrl, unitImageUrl, DMG_COLORS, useInfluenceLabels, useLocalisation } from "./data";
import type {
  Effect, DamageType, UnitImageKind, Missile, MissileOnHit,
  Localisation as LocalisationT,
} from "./types";

// Router-aware link for shared game-hub parts that take renderLink.
export const routerLink: RenderLink = ({ href, ...rest }) => <Link to={href} {...rest} />;

// engine frames (@60fps) -> "Nf (X.Xs)" -- always show both the raw frame
// count and its seconds conversion side by side, never seconds alone, since
// the raw frame count is the verifiable source value.
export function fmtFrames(f?: number | null): string {
  if (f == null) return "?";
  if (!f) return "0f";
  const s = f / 60;
  return `${f}f (${s.toFixed(s % 1 ? 1 : 0)}s)`;
}

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
  // damage description: raw amount/tick, the tick interval (frames+seconds),
  // and the computed per-second rate together (e.g. "45HP/30f (0.5s)
  // (90HP/s)"). The percent's BASE depends on 攻撃力を使う (uses_atk): set
  // means % of the attacker's own ATK per tick (the normal unit-skill
  // poison, e.g. Roselne #2621); unset means % of the target's max HP (the
  // rarer enemy style, e.g. Acid Slime missile 753).
  const parts: string[] = [];
  const iv = h.interval_f || 0;
  if (h.pct_hp) {
    const base = h.uses_atk ? "of ATK" : "of max HP";
    const perSec = iv ? ` (${Math.round((h.pct_hp * 60) / iv)}%/sec)` : "";
    parts.push(`${h.pct_hp}% ${base} / ${fmtFrames(iv)}${perSec}`);
  }
  if (h.flat) {
    const perSec = iv ? ` (${Math.round((h.flat * 60) / iv)}/sec)` : "";
    parts.push(`${h.flat} dmg / ${fmtFrames(iv)}${perSec}`);
  }
  if (h.attack_interval_f) {
    // 攻撃遅延's raw 攻撃間隔 frame count -- shown raw, semantics unverified.
    parts.push(`攻撃間隔 ${fmtFrames(h.attack_interval_f)} (raw)`);
  }
  if (h.stat_down) {
    const sd = Object.entries(h.stat_down)
      .map(([k, v]) => `${k.toUpperCase()} 低下 ${v}`)
      .join(", ");
    parts.push(`${sd} (raw %, to/by unverified)`);
  }
  const dur = h.duration_f ? ` for ${fmtFrames(h.duration_f)}` : "";
  const dmg = parts.length ? `: ${parts.join(", ")}` : "";
  const extra: string[] = [];
  if (h.relief) extra.push("症状緩和");
  if (h.expire_duration_only) extra.push("expires by duration only");
  if (h.other) extra.push(...Object.entries(h.other).map(([k, v]) => `${k}=${v}`));
  const tail = extra.length ? ` [${extra.join(", ")}]` : "";
  return `on hit: ${label}${dmg}${dur}${tail}`;
}

// Parse an enemy specialty's _ExtParam ("key=value, key=value") into a map.
function parseExt(ext: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of ext.split(/[,\n]/)) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// Barrier (specialty 41) thresholds: one per melee/ranged x physical/magic/true.
// A hit at or below the threshold is negated; 0 = that type is not blocked;
// 1,000,000 and above blocks every hit.
function barrierText(kv: Record<string, string>): string | null {
  const TYPES: [string, string][] = [["物理", "physical"], ["魔法", "magic"], ["貫通", "true"]];
  const val = (k: string) => (kv[k] === undefined ? null : Number(kv[k]));
  const cells = TYPES.flatMap(([jp]) => [val(`近接${jp}`), val(`遠隔${jp}`)]);
  if (cells.every((v) => v === null)) return null;
  const amount = (v: number) => (v >= 1_000_000 ? "every hit" : `hits of ${v.toLocaleString()} damage or less`);
  const all = cells.every((v) => v === cells[0]);
  if (all) {
    const v = cells[0] ?? 0;
    if (!v) return "blocks nothing";
    return v >= 1_000_000 ? "blocks every hit" : `blocks every hit of ${v.toLocaleString()} damage or less`;
  }
  const parts: string[] = [];
  for (const [jp, en] of TYPES) {
    const m = val(`近接${jp}`) ?? 0;
    const r = val(`遠隔${jp}`) ?? 0;
    if (m === r) {
      if (m) parts.push(`${en}: ${amount(m)}`);
    } else {
      if (m) parts.push(`melee ${en}: ${amount(m)}`);
      if (r) parts.push(`ranged ${en}: ${amount(r)}`);
    }
  }
  return parts.length ? `blocks ${parts.join("; ")}` : "blocks nothing";
}

// Damage-type words used by several specialty ext fields.
const DMG_TYPE: Record<string, string> = { 物理: "physical", 魔法: "magic", 貫通: "true" };
function damageTypes(v: string): string {
  return v
    .split(/[,、]/)
    .map((t) => DMG_TYPE[t.trim()] || t.trim())
    .filter(Boolean)
    .join(" / ");
}

// Counter (specialty 23) ext keys, translated literally. 反応 lists the
// damage types that trigger it; it is the last key, so the values after it
// (e.g. "反応=魔法,貫通") arrive split across entries.
function counterText(ext: string): string | null {
  const m = ext.match(/反応=([^=]*)$/);
  const kv = parseExt(m ? ext.slice(0, m.index) : ext);
  const parts: string[] = [];
  if (kv["反射"] === "1") parts.push("reflect mode");
  if (kv["反射"] === "0") parts.push("reflect mode off");
  if (kv["相手攻撃利用"] === "1") parts.push("uses the attacker's attack");
  if (kv["反射分ダメージ減少"] === "1") parts.push("damage it takes is reduced by the reflected amount");
  if (m) parts.push(`reacts to ${damageTypes(m[1])} attacks`);
  return parts.length ? parts.join("; ") : null;
}

// On-hit DoT ext (specialties 46 / 58) in the shape the missile on-hit
// formatter reads, so both display the same way.
function dotText(kv: Record<string, string>): string {
  const n = (k: string) => (kv[k] === undefined ? undefined : Number(kv[k]));
  const known = new Set(["種別", "効果時間", "インターバル", "割合ダメージ", "固定ダメージ",
    "攻撃力を使う", "攻撃間隔", "症状緩和", "効果時間のみで消滅", "演出", "演出ループ"]);
  const other: Record<string, string> = {};
  for (const [k, v] of Object.entries(kv)) if (!known.has(k)) other[k] = v;
  // An hour or more of battle time is effectively the whole battle.
  const dur = n("効果時間");
  const long = dur !== undefined && dur >= 216000;
  const text = missileOnHitText({
    kind: kv["種別"] || "DOT",
    duration_f: long ? undefined : dur,
    interval_f: n("インターバル"),
    pct_hp: n("割合ダメージ") || undefined,
    flat: n("固定ダメージ") || undefined,
    uses_atk: kv["攻撃力を使う"] === "1",
    attack_interval_f: n("攻撃間隔"),
    relief: kv["症状緩和"] === "1",
    expire_duration_only: kv["効果時間のみで消滅"] === "1",
    other: Object.keys(other).length ? other : undefined,
  }).replace(/^on hit: poison/, "on hit: damage over time");
  return long ? text.replace(/(?=( \[|$))/, " for the whole battle") : text;
}

// Human text for an enemy specialty's _ExtParam; null keeps the raw text.
export function extText(influence: number | undefined, ext?: string): string | null {
  if (!ext) return null;
  const kv = parseExt(ext);
  switch (influence) {
    case 41:
      return barrierText(kv);
    case 23:
      return counterText(ext);
    case 9:
    case 13:
    case 15:
      // The game sets this effect's state bit to Flag (default on).
      if (kv["Flag"] === "0") return "switched off here (Flag=0)";
      if (kv["Flag"] === "1") return "";
      return null;
    case 14:
      return kv["Style"] ? `style: ${kv["Style"].replace("自爆(爆心地)", "self-destruct (centred on itself)")}` : null;
    case 31:
    case 62:
      // Effect=<visual name>: cosmetic only.
      return "";
    case 42: {
      const name = kv["名前"];
      const code = kv["天候"];
      if (!name && !code) return null;
      return `weather: ${[code, name && `(${name})`].filter(Boolean).join(" ")}`;
    }
    case 46:
    case 58:
      return dotText(kv);
    case 52:
      if (kv["計算種別"] === "1") return "amount is a percent";
      if (kv["計算種別"] === "0") return "amount is a flat value";
      return null;
    case 55:
    case 56:
      if (kv["種別"] !== "スキル妨害") return null;
      return `skill seal${kv["効果時間"] ? ` for ${fmtFrames(Number(kv["効果時間"]))}` : ""}`;
    case 57: {
      // 属性 / ミサイルID / エフェクト lists run on past their own key.
      const m = ext.match(/属性=([^=]*?)(?:,\s*(?:ミサイルID|エフェクト)=|$)/);
      return m ? `hit types in order: ${damageTypes(m[1])}` : null;
    }
    case 59: {
      const STATS: [string, string][] = [["攻撃力低下", "ATK"], ["防御力低下", "DEF"], ["魔法耐性低下", "MR"]];
      const parts = STATS.filter(([k]) => kv[k] !== undefined && Number(kv[k]) !== 100)
        .map(([k, en]) => `${en} to ${kv[k]}%`);
      if (!parts.length) return null;
      const dur = kv["効果時間"] ? ` for ${fmtFrames(Number(kv["効果時間"]))}` : "";
      return `${parts.join(", ")}${dur}`;
    }
    case 64: {
      const on = Object.entries(DMG_TYPE).filter(([jp]) => kv[jp] === "1").map(([, en]) => en);
      return on.length ? `applies to ${on.join(" / ")} damage only` : null;
    }
    default:
      return null;
  }
}

// What to show for an effect's _ExtParam: the humanized text for enemy
// specialties ("" = nothing worth showing), otherwise the raw text.
export function extDisplay(e: { kind?: string; influence?: number; ext?: string }): string {
  if (!e.ext) return "";
  const h = e.kind === "specialty" ? extText(e.influence, e.ext) : null;
  return h === null ? e.ext : h;
}

// Ability text's own in-game color markup: "%c[RRGGBB]...%c[RRGGBB]" (the
// second code, usually ffffff, resets to default). Used on ~100 abilities
// to flag a "【所持効果】" (possession-effect / 1st-barrack) buff clause in
// red, matching the color-coded highlight already applied elsewhere to
// invoke="while in the 1st barrack" influence rows.
export function ColorCodedText({ text }: { text: string }) {
  const parts = text.split(/(%c\[[0-9a-fA-F]{6}\])/g);
  let color: string | null = null;
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^%c\[([0-9a-fA-F]{6})\]$/);
        if (m) {
          color = m[1].toLowerCase() === "ffffff" ? null : `#${m[1]}`;
          return null;
        }
        return color ? <span key={i} style={{ color }}>{part}</span> : part;
      })}
    </>
  );
}

// Humanized condition text with [[class:NAME]] / [[tag:NAME]] filter-link
// markers (emitted by aigis/expr.py) rendered as clickable unit-list filters,
// displayed with their EN translation where one exists.
export function HumanText({ text }: { text: string }) {
  const loc: LocalisationT | null = useLocalisation();
  const parts = text.split(/(\[\[(?:class|tag):[^\]]+\]\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[\[(class|tag):([^\]]+)\]\]$/);
        if (!m) return part;
        const [, kind, name] = m;
        const en = kind === "class"
          ? loc?.classes[name]
          : loc?.tags[name] || loc?.races[name];
        return (
          <Link key={i} to={`/units?${kind}=${encodeURIComponent(name)}`} title={name}>
            {en || name}
          </Link>
        );
      })}
    </>
  );
}

// All of a missile's noteworthy facts on one line (shared by unit skill rows
// and enemy displays).
export function missileText(m: Missile): string {
  if (m.empty) return "empty slot: fires nothing";
  const parts: string[] = [];
  if (m.splash) parts.push(`splash ${m.splash}`);
  if (m.penetrate) {
    // travelling projectile that hits every enemy it passes through; the AoE
    // is the projectile's own collision size in pixels (these missiles have
    // no DamageArea).
    parts.push(`penetrates all in path${m.width ? ` (width ${m.width}px)` : ""}`);
  }
  if (m.slow) parts.push(`slow ${m.slow[0]}% / ${fmtFrames(m.slow[1])}`);
  if (m.deflectable) parts.push("deflectable");
  if (m.heal) parts.push("heal");
  if (m.blast_residue) {
    // the blast area lingers as a DAMAGE FIELD re-hitting on an interval
    // (area = the splash radius above; e.g. missile 1498).
    const [t, iv] = m.blast_residue;
    parts.push(`creates a damage field for ${fmtFrames(t)} (ticks every ${fmtFrames(iv)})`);
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

// Unit icon + link, used wherever a table row names the unit an effect
// belongs to (buff ranking rows, tag-page skill/ability/class mentions).
export function UnitIconLink({ id, name }: { id: number; name?: string | null }) {
  return (
    <Link className="unit-icon-link" to={`/units/${id}`}>
      <UnitImage kind="icon" id={id} className="unit-icon-mini" alt="" />
      <span>#{id} {name}</span>
    </Link>
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
  // try the idle animation first, then the static png, then a placeholder
  const [state, setState] = useState<"anim" | "png" | "missing">("anim");
  useEffect(() => setState("anim"), [patternId]);
  if (state === "missing" || patternId == null) {
    return <div className="sprite sprite--missing" style={{ width: size, height: size }} />;
  }
  // fit: respect the sprite's real proportions, bounded by `size`.
  const style = fit
    ? { maxWidth: size, maxHeight: size, width: "auto", height: "auto" }
    : { width: size, height: size };
  return (
    <img
      className="sprite"
      src={state === "anim" ? enemyAnimUrl(patternId) : spriteUrl(patternId)}
      style={style}
      alt={alt}
      loading="lazy"
      onError={() => setState(state === "anim" ? "png" : "missing")}
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
//  {pNf}           -> the Nth param as engine frames -> "Nf (X.Xs)" (always
//                     shows both the raw frame count and its seconds
//                     conversion, never seconds alone).
//  {pNx}           -> the Nth param as a multiplier (value/100 -> "x1.90").
//  [[?pN: text]]   -> include "text" only when param N is set (nonzero).
//  [[?pN|A|B]]     -> A if param N set, else B.
const fmtPX = (v: number) => `x${(v / 100).toFixed(2).replace(/\.?0+$/, "")}`;
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
  out = out.replace(/\{p([1-4])f\}/g, (_m, n) => fmtFrames(val(n)));
  out = out.replace(/\{p([1-4])x\}/g, (_m, n) => fmtPX(val(n)));
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
    // aura DoT: interval lives on the paired influence 18 (Param_3).
    const aura = all.find((x) => x.influence === 18);
    interval = aura?.params?.[2] || interval;
  }
  if (!interval) interval = 10;
  const perSec = Math.round((amount * 60) / interval);
  const word = isHeal ? "heal" : "dmg";
  return `${amount} ${word} / ${fmtFrames(interval)} (${perSec}/sec)`;
}

// Aura range (influence 18): in-game radius = raw Param_2 * 2. Huge values
// mean global range.
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
                {" "}if <HumanText text={e.expression_human || e.expression || ""} />
              </span>
            )}
            {e.ext && extDisplay(e) && (
              <span className="expr" title={e.ext}>
                {" "}{extDisplay(e)}
              </span>
            )}
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
