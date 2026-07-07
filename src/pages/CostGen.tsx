// /costgen -- UP (cost) generation simulator. Compares selected Platinum/Black
// units' cumulative UP output over time, starting from their deploy-cost
// deficit. Data model: data/costgen.json (python/export_costgen.py).
//
// Simulation rules (user-confirmed):
//  * ability 170 ticks ONLY while the unit's own skill is active; ability 262
//    ticks at all times. When several gradual rows apply at once, the LOWEST
//    interval (fastest) wins.
//  * initial skill timer: Platinum = base CD / 2; Black = flat 1s on a normal
//    skill, 5s on the AW skill; heroes follow their color. External CDR never
//    shortens the initial timer.
//  * only affection bonuses modify the skill at base (type 8 = CD -%, which
//    DOES shrink the Platinum initial timer; type 7 = duration +%). Affection
//    is always assumed maxed.
//  * of all in-battle CDR sources (the page slider, the unit's own ability
//    45/118) only the HIGHEST single source applies, to cooldowns only.
//  * permanent skills (duration 9999) stay active forever once triggered;
//    their cooldown only matters for skill-cancel, which is out of scope.
//  * deploy cost = cost_min (max level); conditional reductions floor at 0.
import { useEffect, useMemo, useRef, useState } from "react";
import { loadJSONFile, unitImageUrl } from "../data";

// ---------------------------------------------------------------- data types

type Cond =
  | { kind: "skill_active"; neg: boolean; ids: number[] }
  | { kind: "skill_is"; neg: boolean; ids: number[] }
  | { kind: "tag_count"; card: number; tag: string; op: string; n: number; self: boolean }
  | { kind: "team_count"; var: string; op: string; n: number }
  | { kind: "deployed_count"; op: string; n: number }
  | { kind: "env"; text: string; human: string }
  | { kind: "self_tag"; tag: string; match: boolean; human: string }
  | { kind: "skill_evolved"; ids: number[] }
  | { kind: "raw"; human: string; raw: string };

interface GenRow {
  type: number; // 170 / 262 / 169
  value?: number;
  interval?: number;
  cond?: Cond;
}
interface CostRow {
  type: number;
  target?: string;
  flat?: number;
  pct?: number;
  cond?: Cond;
}
interface StageRec {
  id: number;
  name?: string;
  duration: number;
  cooldown: number;
  permanent?: boolean;
  flat?: number;
  tick?: { value: number; interval: number };
  consume?: number;
  swaps_to?: number;
}
interface SkillRec {
  id: number;
  name?: string;
  stages: StageRec[];
}
interface TierRec {
  cc: number;
  class_id: number;
  name: string;
  cost: number;
  gen: GenRow[];
  cost_mods: CostRow[];
  own_cdr: number;
  dur_pct?: number;
  starting_up?: number;
}
interface AbilityBlock {
  name?: string;
  gen: GenRow[];
  cost: CostRow[];
  init_pct: number | null;
  init_cond: Cond | null;
  own_cdr: number;
  dur_kills: { per: number; cap: number } | null;
}
interface CGUnit {
  id: number;
  name: string;
  name_jp: string;
  rarity: "platinum" | "black";
  hero: boolean;
  aff_cd?: number;
  aff_dur?: number;
  tiers: TierRec[];
  skills: Partial<Record<"base" | "class_evolved" | "awakened", SkillRec>>;
  abilities: Partial<Record<"default" | "awakened", AbilityBlock>>;
}

// ------------------------------------------------------------ selection state

type SlotKey = "base" | "class_evolved" | "awakened";
const SLOT_LABEL: Record<SlotKey, string> = {
  base: "Base",
  class_evolved: "CC",
  awakened: "AW",
};
const CC_LABEL: Record<number, string> = { 0: "Base", 1: "CC", 2: "AW", 3: "AW2A", 4: "AW2B" };

interface Sel {
  id: number;
  color: number; // palette slot, fixed while selected
  tier: number; // index into tiers
  slot: SlotKey;
  sliders: Record<string, number>;
  toggles: Record<string, boolean>;
  costOverride: string; // "" = computed
}

// dark-surface categorical palette (dataviz reference, validated vs #1e2128)
const PALETTE = ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767", "#d55181", "#d95926"];
const MAX_SEL = 8;

// ------------------------------------------------------------ condition eval

interface Ctx {
  activeStageId: number | null; // null unless the skill is currently active
  equippedId: number; // current skill id (stage about to be / being used)
  slotEvolved: boolean; // selected slot is the awakened (evolved) skill
  selfId: number;
  sliders: Record<string, number>;
  toggles: Record<string, boolean>;
}

function cmp(op: string, a: number, b: number): boolean {
  return op === "==" ? a === b : op === ">=" ? a >= b : op === "<=" ? a <= b : false;
}

function sliderKey(c: Cond): string | null {
  if (c.kind === "team_count") return `team:${c.var}`;
  if (c.kind === "tag_count") return `tag:${c.tag}`;
  return null;
}
function toggleKey(c: Cond): string | null {
  if (c.kind === "deployed_count") return `deployed:${c.op}${c.n}`;
  if (c.kind === "env") return `env:${c.text}`;
  if (c.kind === "raw") return `raw:${c.raw}`;
  return null;
}

function evalCond(c: Cond | undefined, ctx: Ctx): boolean {
  if (!c) return true;
  switch (c.kind) {
    case "skill_active": {
      const hit = ctx.activeStageId !== null && c.ids.includes(ctx.activeStageId);
      return c.neg ? !hit : hit;
    }
    case "skill_is": {
      const hit = c.ids.includes(ctx.equippedId);
      return c.neg ? !hit : hit;
    }
    case "tag_count":
      if (!c.self && c.card !== ctx.selfId) return false; // gated to another unit
      return cmp(c.op, ctx.sliders[`tag:${c.tag}`] ?? 1, c.n);
    case "team_count":
      return cmp(c.op, ctx.sliders[`team:${c.var}`] ?? 0, c.n);
    case "deployed_count":
      return !!ctx.toggles[`deployed:${c.op}${c.n}`];
    case "env":
      return !!ctx.toggles[`env:${c.text}`];
    case "self_tag":
      return c.match;
    case "skill_evolved":
      return ctx.slotEvolved && c.ids.includes(ctx.equippedId);
    case "raw":
      return !!ctx.toggles[`raw:${c.raw}`];
  }
}

// ------------------------------------------------------------- sim assembly

interface Prepared {
  unit: CGUnit;
  tier: TierRec;
  block: AbilityBlock | null;
  stages: StageRec[]; // selected slot's stages
  allStages: Map<number, StageRec>; // every stage of every slot, for swaps
  genRows: GenRow[]; // tier + ability-block gradual/flat rows
  cost: number;
  initialSec: number;
  cdrPct: number; // effective (highest single source)
  killsCap: number; // max kills slider value (0 = no slider)
  killsPer: number; // frames per kill
}

function prepare(u: CGUnit, sel: Sel, globalCdr: number, ignoreCosts: boolean, ignoreInitial: boolean): Prepared | null {
  const tier = u.tiers[sel.tier] ?? u.tiers[u.tiers.length - 1];
  const sk = u.skills[sel.slot] ?? u.skills.awakened ?? u.skills.class_evolved ?? u.skills.base;
  if (!tier || !sk || !sk.stages.length) return null;
  const block =
    (tier.cc >= 2 ? u.abilities.awakened : u.abilities.default) ??
    u.abilities.awakened ??
    u.abilities.default ??
    null;

  const allStages = new Map<number, StageRec>();
  for (const s of Object.values(u.skills)) {
    if (s) for (const st of s.stages) allStages.set(st.id, st);
  }

  const genRows = [...tier.gen, ...(block?.gen ?? [])];
  const affCd = 1 - (u.aff_cd ?? 0) / 100;

  const ctx0: Ctx = {
    activeStageId: null,
    equippedId: sk.stages[0].id,
    slotEvolved: sel.slot === "awakened",
    selfId: u.id,
    sliders: sel.sliders,
    toggles: sel.toggles,
  };

  // deploy cost: percent set first, then flats, floored at 0
  let cost = tier.cost;
  const costRows = [...tier.cost_mods, ...(block?.cost ?? [])].filter(
    (r) => !r.target || r.target === "self"
  );
  for (const r of costRows) {
    if (!evalCond(r.cond, ctx0)) continue;
    if (r.pct !== undefined && r.pct !== 100) cost = (cost * r.pct) / 100;
  }
  for (const r of costRows) {
    if (!evalCond(r.cond, ctx0)) continue;
    if (r.flat) cost -= r.flat;
  }
  cost = Math.max(0, cost);
  if (sel.costOverride.trim() !== "" && !isNaN(Number(sel.costOverride))) {
    cost = Math.max(0, Number(sel.costOverride));
  }
  if (ignoreCosts) cost = 0;
  // initial timer: plat = affection-reduced base CD / 2; black = flat 1s on
  // a normal skill, 5s on the AW skill; ability 62 multiplies it down to p1 %
  let initialSec = ignoreInitial
    ? 0
    : u.rarity === "black"
      ? sel.slot === "awakened" ? 5 : 1
      : (sk.stages[0].cooldown * affCd) / 2;
  if (block && block.init_pct !== null && evalCond(block.init_cond ?? undefined, ctx0)) {
    initialSec = (initialSec * block.init_pct) / 100;
  }

  const cdrPct = Math.max(globalCdr, tier.own_cdr, block?.own_cdr ?? 0);
  const dk = block?.dur_kills ?? null;
  return {
    unit: u,
    tier,
    block,
    stages: sk.stages,
    allStages,
    genRows,
    cost,
    initialSec,
    cdrPct,
    killsCap: dk && dk.per > 0 ? Math.floor(dk.cap / dk.per) : 0,
    killsPer: dk?.per ?? 0,
  };
}

// frame-accurate sim; returns cumulative UP sampled every half second
function simulate(p: Prepared, sel: Sel, seconds: number): number[] {
  const affCd = 1 - (p.unit.aff_cd ?? 0) / 100;
  const affDur = 1 + (p.unit.aff_dur ?? 0) / 100;
  const durPct = (p.tier.dur_pct ?? 100) / 100;
  const kills = sel.sliders["kills"] ?? 0;
  const killFrames = p.killsPer > 0 ? Math.min(kills * p.killsPer, (p.block?.dur_kills?.cap ?? 0)) : 0;

  const cdFrames = (st: StageRec) =>
    Math.max(1, Math.round(st.cooldown * affCd * (1 - p.cdrPct / 100) * 60));
  // zero-official-duration skills still occupy ~2s of skill animation
  const durFrames = (st: StageRec) =>
    st.permanent
      ? Infinity
      : st.duration === 0
        ? 120
        : Math.max(1, Math.round(st.duration * affDur * durPct * 60) + killFrames);

  const nextStage = (st: StageRec): StageRec =>
    (st.swaps_to !== undefined ? p.allStages.get(st.swaps_to) : undefined) ?? st;

  const totalFrames = seconds * 60;
  const samples: number[] = [];
  let up = -p.cost;
  let stage = p.stages[0];
  let phase: "wait" | "active" = "wait";
  let timer = Math.max(0, Math.round(p.initialSec * 60));
  let tickCounter = 0; // S65 tick within the active stage
  let gradKey = "";
  let gradCounter = 0;

  const ctx: Ctx = {
    activeStageId: null,
    equippedId: stage.id,
    slotEvolved: sel.slot === "awakened",
    selfId: p.unit.id,
    sliders: sel.sliders,
    toggles: sel.toggles,
  };

  const activate = () => {
    up += stage.flat ?? 0;
    up -= stage.consume ?? 0;
    for (const g of p.genRows) {
      if (g.type === 169 && evalCond(g.cond, ctx)) up += g.value ?? 0;
    }
    timer = durFrames(stage);
    tickCounter = 0;
    ctx.activeStageId = stage.id;
  };

  for (let f = 0; f <= totalFrames; f++) {
    if (f % 30 === 0) samples.push(up);
    // phase transitions first, so gen sees the post-transition state
    if (phase === "wait") {
      if (timer <= 0) {
        activate();
        phase = "active";
      } else {
        timer--;
      }
    }
    if (phase === "active" && timer !== Infinity) {
      if (timer <= 0) {
        const nx = nextStage(stage);
        stage = nx;
        ctx.equippedId = nx.id;
        ctx.activeStageId = null;
        phase = "wait";
        timer = cdFrames(nx);
      } else {
        timer--;
      }
    }
    // per-stage UP-over-time (skill influence 65), while active
    if (phase === "active" && stage.tick) {
      tickCounter++;
      if (tickCounter >= stage.tick.interval) {
        up += stage.tick.value;
        tickCounter = 0;
      }
    }
    // gradual ability rows: lowest interval among currently-true rows wins;
    // 170 additionally requires the skill to be active
    let best: GenRow | null = null;
    for (const g of p.genRows) {
      if (g.type === 169 || !g.interval) continue;
      if (g.type === 170 && phase !== "active") continue;
      if (!evalCond(g.cond, ctx)) continue;
      if (!best || g.interval < (best.interval ?? Infinity)) best = g;
    }
    if (best) {
      const key = `${best.type}:${best.interval}:${best.value}`;
      if (key !== gradKey) {
        gradKey = key;
        gradCounter = 0;
      }
      gradCounter++;
      if (gradCounter >= (best.interval ?? Infinity)) {
        up += best.value ?? 0;
        gradCounter = 0;
      }
    } else {
      gradKey = "";
      gradCounter = 0;
    }
  }
  return samples;
}

// ------------------------------------------------------------------ controls

interface ControlSpec {
  sliders: { key: string; label: string; min: number; max: number }[];
  toggles: { key: string; label: string }[];
}

function controlsFor(u: CGUnit, sel: Sel): ControlSpec {
  const tier = u.tiers[sel.tier] ?? u.tiers[u.tiers.length - 1];
  const block =
    (tier && tier.cc >= 2 ? u.abilities.awakened : u.abilities.default) ??
    u.abilities.awakened ??
    u.abilities.default ??
    null;
  const sliders = new Map<string, { key: string; label: string; min: number; max: number }>();
  const toggles = new Map<string, { key: string; label: string }>();

  const scan = (c?: Cond) => {
    if (!c) return;
    const sk = sliderKey(c);
    if (sk && (c.kind === "team_count" || (c.kind === "tag_count" && c.self))) {
      const prev = sliders.get(sk);
      const hi = Math.max(prev?.max ?? 0, (c as { n: number }).n);
      const isSelfTag = c.kind === "tag_count";
      sliders.set(sk, {
        key: sk,
        label:
          c.kind === "team_count"
            ? c.var === "female"
              ? "Female units in squad"
              : c.var === "male"
                ? "Male units in squad"
                : `${c.var} units in squad`
            : `${c.tag} units deployed (incl. self)`,
        min: isSelfTag ? 1 : 0,
        max: Math.max(hi, isSelfTag ? 1 : 0),
      });
    }
    const tk = toggleKey(c);
    if (tk) {
      const label =
        c.kind === "deployed_count"
          ? `Deployed unit count ${c.op} ${c.n}`
          : c.kind === "env"
            ? `Map effect: ${c.text}`
            : c.kind === "raw"
              ? c.human
              : tk;
      toggles.set(tk, { key: tk, label });
    }
  };

  for (const g of [...(tier?.gen ?? []), ...(block?.gen ?? [])]) scan(g.cond);
  for (const r of [...(tier?.cost_mods ?? []), ...(block?.cost ?? [])]) {
    if (!r.target || r.target === "self") scan(r.cond);
  }
  if (block?.init_cond) scan(block.init_cond);

  const out: ControlSpec = { sliders: [...sliders.values()], toggles: [...toggles.values()] };
  if (block?.dur_kills && block.dur_kills.per > 0) {
    out.sliders.push({
      key: "kills",
      label: `Kills during skill (+${block.dur_kills.per / 60}s each, max +${block.dur_kills.cap / 60}s)`,
      min: 0,
      max: Math.floor(block.dur_kills.cap / block.dur_kills.per),
    });
  }
  return out;
}

// --------------------------------------------------------------------- chart

interface Series {
  id: number;
  name: string;
  color: string;
  samples: number[]; // every 0.5s
}

function niceStep(range: number): number {
  const raw = range / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  for (const m of [1, 2, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}

function Chart({ series, seconds }: { series: Series[]; seconds: number }) {
  const [hover, setHover] = useState<number | null>(null); // sample index
  const svgRef = useRef<SVGSVGElement | null>(null);
  const W = 920;
  const H = 430;
  const M = { l: 52, r: 130, t: 14, b: 30 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;

  let lo = 0;
  let hi = 10;
  for (const s of series)
    for (const v of s.samples) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  const pad = (hi - lo) * 0.05;
  hi += pad;
  lo -= pad;
  const x = (i: number, n: number) => M.l + (i / Math.max(1, n - 1)) * iw;
  const y = (v: number) => M.t + ih - ((v - lo) / (hi - lo)) * ih;

  const yStep = niceStep(hi - lo);
  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep) yTicks.push(v);
  const xEvery = seconds <= 120 ? 15 : seconds <= 300 ? 30 : 60; // seconds
  const xTicks: number[] = [];
  for (let t = 0; t <= seconds; t += xEvery) xTicks.push(t);

  const n = series[0]?.samples.length ?? 0;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !n) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - M.l) / iw) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  // right-edge direct labels, nudged apart
  const labels = series
    .map((s) => ({ s, ly: y(s.samples[s.samples.length - 1] ?? 0) }))
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].ly - labels[i - 1].ly < 13) labels[i].ly = labels[i - 1].ly + 13;
  }

  return (
    <div className="cg-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Cumulative UP generated over time"
      >
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} className={v === 0 ? "cg-zero" : "cg-grid"} />
            <text x={M.l - 8} y={y(v) + 4} className="cg-tick" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={x((t * 2), n)} x2={x(t * 2, n)} y1={M.t + ih} y2={M.t + ih + 4} className="cg-axis" />
            <text x={x(t * 2, n)} y={M.t + ih + 18} className="cg-tick" textAnchor="middle">
              {t}s
            </text>
          </g>
        ))}
        {series.map((s) => (
          <path
            key={s.id}
            className="cg-line"
            stroke={s.color}
            d={s.samples
              .map((v, i) => `${i === 0 ? "M" : "L"}${x(i, n).toFixed(1)},${y(v).toFixed(1)}`)
              .join("")}
          />
        ))}
        {labels.map(({ s, ly }) => (
          <text key={`l${s.id}`} x={W - M.r + 8} y={ly + 4} className="cg-label" fill={s.color}>
            {s.name}
          </text>
        ))}
        {hover !== null && n > 0 && (
          <g>
            <line x1={x(hover, n)} x2={x(hover, n)} y1={M.t} y2={M.t + ih} className="cg-cross" />
            {series.map((s) => (
              <circle key={`h${s.id}`} cx={x(hover, n)} cy={y(s.samples[hover] ?? 0)} r={4} fill={s.color} className="cg-dot" />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && n > 0 && (
        <div className="cg-tooltip">
          <div className="cg-tt-time">t = {(hover / 2).toFixed(1)}s</div>
          {[...series]
            .sort((a, b) => (b.samples[hover] ?? 0) - (a.samples[hover] ?? 0))
            .map((s) => (
              <div key={s.id} className="cg-tt-row">
                <span className="cg-swatch" style={{ background: s.color }} />
                {s.name}: <b>{(s.samples[hover] ?? 0).toFixed(1)}</b>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------- page

export default function CostGen() {
  const [data, setData] = useState<{ units: CGUnit[] } | null>(null);
  const [sels, setSels] = useState<Sel[]>([]);
  const [cdr, setCdr] = useState(0);
  const [ignoreCosts, setIgnoreCosts] = useState(false);
  const [ignoreInitial, setIgnoreInitial] = useState(false);
  const [seconds, setSeconds] = useState(180);
  const [query, setQuery] = useState("");
  const [dropOpen, setDropOpen] = useState(false);

  useEffect(() => {
    loadJSONFile<{ units: CGUnit[] }>("costgen").then(setData).catch(() => setData({ units: [] }));
  }, []);

  const byId = useMemo(() => new Map((data?.units ?? []).map((u) => [u.id, u])), [data]);

  const addUnit = (u: CGUnit) => {
    if (sels.length >= MAX_SEL || sels.some((s) => s.id === u.id)) return;
    const used = new Set(sels.map((s) => s.color));
    let color = 0;
    while (used.has(color)) color++;
    const tierIdx = u.tiers.length - 1;
    const slot: SlotKey = u.skills.awakened ? "awakened" : u.skills.class_evolved ? "class_evolved" : "base";
    setSels([...sels, { id: u.id, color, tier: tierIdx, slot, sliders: {}, toggles: {}, costOverride: "" }]);
    setQuery("");
  };

  const patch = (id: number, fn: (s: Sel) => Sel) =>
    setSels((cur) => cur.map((s) => (s.id === id ? fn(s) : s)));

  // empty query lists every unit, so the dropdown is browsable on click
  const matches = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.units
      .filter(
        (u) =>
          !sels.some((s) => s.id === u.id) &&
          (!q || u.name.toLowerCase().includes(q) || u.name_jp.includes(query.trim()) || String(u.id) === q)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, query, sels]);

  const series: Series[] = useMemo(() => {
    const out: Series[] = [];
    for (const sel of sels) {
      const u = byId.get(sel.id);
      if (!u) continue;
      const p = prepare(u, sel, cdr, ignoreCosts, ignoreInitial);
      if (!p) continue;
      out.push({ id: u.id, name: u.name, color: PALETTE[sel.color % PALETTE.length], samples: simulate(p, sel, seconds) });
    }
    return out;
  }, [sels, byId, cdr, seconds, ignoreCosts, ignoreInitial]);

  if (!data) return <div className="loading">loading…</div>;

  return (
    <div>
      <div className="toolbar">
        <div className="cg-search">
          <input
            placeholder="add unit (name / id)…"
            value={query}
            onFocus={() => setDropOpen(true)}
            onBlur={() => setTimeout(() => setDropOpen(false), 150)}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropOpen(true);
            }}
          />
          {dropOpen && matches.length > 0 && (
            <div className="cg-search-drop">
              {matches.map((u) => (
                <button key={u.id} onMouseDown={(e) => e.preventDefault()} onClick={() => addUnit(u)}>
                  <img src={unitImageUrl("icon", u.id)} alt="" loading="lazy" />
                  <span>
                    {u.name} <span className="muted">#{u.id}</span>
                  </span>
                  <span className={`cg-rar cg-rar-${u.rarity}`}>{u.rarity === "black" ? "Black" : "Plat"}{u.hero ? " Hero" : ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="cg-ctl-group">
          <label className="cg-ctl">
            CDR
            <select value={cdr} onChange={(e) => setCdr(Number(e.target.value))}>
              {Array.from({ length: 15 }, (_, i) => i * 5).map((v) => (
                <option key={v} value={v}>
                  {v}%
                </option>
              ))}
            </select>
          </label>
          <label className="cg-ctl">
            Window
            <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
              {[30, 60, 90, 120, 180, 300, 600].map((v) => (
                <option key={v} value={v}>
                  {v}s
                </option>
              ))}
            </select>
          </label>
          <label className={`cg-pill${ignoreCosts ? " on" : ""}`}>
            <input type="checkbox" checked={ignoreCosts} onChange={(e) => setIgnoreCosts(e.target.checked)} />
            Ignore Costs
          </label>
          <label className={`cg-pill${ignoreInitial ? " on" : ""}`}>
            <input type="checkbox" checked={ignoreInitial} onChange={(e) => setIgnoreInitial(e.target.checked)} />
            Ignore Initial
          </label>
        </div>
        <span className="count">
          {sels.length}/{MAX_SEL} selected · {data.units.length} UP-gen units above Gold
        </span>
      </div>

      <details className="cg-notes">
        <summary>Model assumptions</summary>
        <ul>
          <li>Skills at max level (duration_max), units at max level (cost_min), affection maxed.</li>
          <li>Initial skill timer: Platinum = base CD ÷ 2; Black = 1s on a normal skill, 5s on the AW skill (heroes follow their color). Only the affection CD bonus shrinks it; the CDR selector affects cooldowns only.</li>
          <li>Of all in-battle CDR sources (selector, own ability) only the highest single one applies.</li>
          <li>Skills re-activate the instant they are ready; swap chains follow their in-game order; permanent skills (∞ duration) stay on. Skills with no official duration still occupy 2s of skill animation.</li>
          <li>Deploy cost is subtracted at t=0 (floored at 0); percent cost mods apply before flat ones. Use the override field if the rounding disagrees with in-game.</li>
          <li>Team-wide starting UP (merchant +2) is shown as a badge but not added to the curve.</li>
        </ul>
      </details>

      {sels.length === 0 && (
        <p className="muted">
          Search above to add units — every Platinum/Black unit with a UP/cost-generation
          skill or ability is available. Lines start at −deploy cost.
        </p>
      )}

      <div className="cg-units">
        {sels.map((sel) => {
          const u = byId.get(sel.id);
          if (!u) return null;
          const p = prepare(u, sel, cdr, ignoreCosts, ignoreInitial);
          const ctl = controlsFor(u, sel);
          const tier = u.tiers[sel.tier] ?? u.tiers[u.tiers.length - 1];
          return (
            <div key={sel.id} className="cg-card" style={{ borderTopColor: PALETTE[sel.color % PALETTE.length] }}>
              <div className="cg-card-head">
                <img src={unitImageUrl("icon", u.id)} alt="" />
                <div>
                  <a href={`#/units/${u.id}`}>{u.name}</a>
                  <div className="muted small">
                    #{u.id} · {u.rarity === "black" ? "Black" : "Platinum"}
                    {u.hero ? " Hero" : ""}
                    {u.aff_cd ? ` · aff CD −${u.aff_cd}%` : ""}
                    {u.aff_dur ? ` · aff duration +${u.aff_dur}%` : ""}
                  </div>
                </div>
                <button className="cg-x" onClick={() => setSels(sels.filter((s) => s.id !== sel.id))}>
                  ×
                </button>
              </div>
              <div className="cg-row">
                <label>
                  Class
                  <select
                    value={sel.tier}
                    onChange={(e) => patch(sel.id, (s) => ({ ...s, tier: Number(e.target.value) }))}
                  >
                    {u.tiers.map((t, i) => (
                      <option key={i} value={i}>
                        {CC_LABEL[t.cc] ?? `cc${t.cc}`} · {t.name} (cost {t.cost})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Skill
                  <select
                    value={sel.slot}
                    onChange={(e) => patch(sel.id, (s) => ({ ...s, slot: e.target.value as SlotKey }))}
                  >
                    {(Object.keys(u.skills) as SlotKey[]).map((k) => (
                      <option key={k} value={k}>
                        {SLOT_LABEL[k]} · {u.skills[k]?.name ?? u.skills[k]?.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {ctl.sliders.map((sl) => (
                <label key={sl.key} className="cg-slider">
                  <span>
                    {sl.label}: <b>{sel.sliders[sl.key] ?? sl.min}</b>
                  </span>
                  <input
                    type="range"
                    min={sl.min}
                    max={sl.max}
                    value={sel.sliders[sl.key] ?? sl.min}
                    onChange={(e) =>
                      patch(sel.id, (s) => ({ ...s, sliders: { ...s.sliders, [sl.key]: Number(e.target.value) } }))
                    }
                  />
                </label>
              ))}
              {ctl.toggles.map((tg) => (
                <label key={tg.key} className="cg-toggle">
                  <input
                    type="checkbox"
                    checked={!!sel.toggles[tg.key]}
                    onChange={(e) =>
                      patch(sel.id, (s) => ({ ...s, toggles: { ...s.toggles, [tg.key]: e.target.checked } }))
                    }
                  />
                  {tg.label}
                </label>
              ))}
              {p && (
                <div className="cg-facts small">
                  <span>cost <b>{p.cost.toFixed(p.cost % 1 ? 1 : 0)}</b></span>
                  <span>initial <b>{p.initialSec.toFixed(1)}s</b></span>
                  {p.stages.map((st) => (
                    <span key={st.id}>
                      {st.name ?? st.id}:{" "}
                      {st.permanent
                        ? "∞"
                        : st.duration === 0
                          ? "2s (anim)"
                          : `${(st.duration * (1 + (u.aff_dur ?? 0) / 100) * ((tier.dur_pct ?? 100) / 100)).toFixed(0)}s`}
                      {" / "}
                      {(st.cooldown * (1 - (u.aff_cd ?? 0) / 100) * (1 - p.cdrPct / 100)).toFixed(0)}s cd
                      {st.flat ? ` · +${st.flat} UP` : ""}
                      {st.tick ? ` · ${st.tick.value}/${st.tick.interval}f` : ""}
                      {st.consume ? ` · −${st.consume} UP` : ""}
                    </span>
                  ))}
                  {p.cdrPct > cdr && <span>own CDR {p.cdrPct}% (highest source)</span>}
                  {tier.starting_up ? <span>+{tier.starting_up} team starting UP (not charted)</span> : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {series.length > 0 && <Chart series={series} seconds={seconds} />}
    </div>
  );
}
