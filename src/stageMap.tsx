import { useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "@altterisk/game-hub";
import { saveBlob } from "@altterisk/game-hub/persist";
import { mapImageUrl } from "./data";
import type { MapEvent, MapSpot, StageMapInfo } from "./types";
import { useL } from "./i18n";

const COLORS: Record<MapSpot["k"], { fill: string; text: string }> = {
  m: { fill: "#e5484d", text: "#ffffff" },
  r: { fill: "#3b82f6", text: "#ffffff" },
  b: { fill: "#ffffff", text: "#1b1b1b" },
};
const FOOTER = 30;
const ASSET_BASE = import.meta.env.BASE_URL;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
}

// The game's own spot markers (Battle.atx MeleePlace / MissilePlace / Goal), exported by the pipeline.
type Markers = { img: Record<MapSpot["k"], HTMLImageElement>; origin: Record<MapSpot["k"], [number, number]> };
let markersPromise: Promise<Markers | null> | null = null;

function loadMarkers(): Promise<Markers | null> {
  const base = `${ASSET_BASE}map-icons/`;
  markersPromise ??= Promise.all([
    fetch(`${base}origins.json`).then((r) => r.json()),
    loadImage(`${base}m.png`), loadImage(`${base}r.png`), loadImage(`${base}b.png`),
  ]).then(([origin, m, r, b]) => ({ img: { m, r, b }, origin })).catch(() => null);
  return markersPromise;
}

// Effect objects (clouds, map pieces): [origin_x, origin_y, scale_x, scale_y, alpha], image map-fx/<effect>.png.
type Effect = { img: HTMLImageElement; ox: number; oy: number; sx: number; sy: number; alpha: number };
let fxManifest: Promise<Record<string, number[]>> | null = null;
const fxImages = new Map<string, Promise<Effect | null>>();

function loadEffect(name: string): Promise<Effect | null> {
  fxManifest ??= fetch(`${ASSET_BASE}map-fx/fx.json`).then((r) => r.json()).catch(() => ({}));
  if (!fxImages.has(name)) {
    fxImages.set(name, fxManifest.then(async (m) => {
      const meta = m[name];
      if (!meta) return null;
      const img = await loadImage(`${ASSET_BASE}map-fx/${name}.png`);
      return { img, ox: meta[0], oy: meta[1], sx: meta[2] || 1, sy: meta[3] || 1, alpha: meta[4] ?? 1 };
    }).catch(() => null));
  }
  return fxImages.get(name)!;
}

type PlacedSpot = MapSpot & { name: string };
type PlacedFx = { name: string; fx: string; x: number; y: number };
type Phase = { label: string; events: MapEvent[] };

function clock(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// the stage export drops zero values: a timed event without t starts at 0:00, a missing x/y is 0
function normalise(e: MapEvent): MapEvent {
  return {
    ...e,
    t: e.when === "time" ? e.t ?? 0 : null,
    ops: e.ops.map((o) => (o.op === "+s" || o.op === "+fx" ? { ...o, x: o.x ?? 0, y: o.y ?? 0 } : o)),
  };
}

// Unconditional timed changes are phases; everything else (enemy / spot triggers, stage
// conditions) is a numbered trigger drawn on top of the selected phase.
const isPhaseEvent = (e: MapEvent) => e.when === "time" && !e.cond;

// Events at the same displayed second form one phase; Start is the map before any of them.
export function mapPhases(raw: MapEvent[]): Phase[] {
  const phases: Phase[] = [{ label: "Start", events: [] }];
  let key = -1;
  for (const e of raw.filter(isPhaseEvent).map(normalise)) {
    // the battle's opening layout belongs to Start
    const sec = Math.round(e.t ?? 0);
    if (sec === 0) {
      phases[0].events.push(e);
      continue;
    }
    if (sec !== key) {
      phases.push({ label: clock(e.t ?? 0), events: [] });
      key = sec;
    }
    phases[phases.length - 1].events.push(e);
  }
  // An effect that only plays in shortly before its spots (a cloud forming) reads as one step with them.
  const merged: Phase[] = [phases[0]];
  for (let i = 1; i < phases.length; i++) {
    const p = phases[i], next = phases[i + 1];
    const fxOnly = p.events.every((e) => e.ops.every((o) => o.op === "+fx" || o.op === "-fx"));
    const t = p.events[0].t, tn = next?.events[0].t;
    if (fxOnly && next && t != null && tn != null && tn - t <= 5) {
      next.events.unshift(...p.events);
      continue;
    }
    merged.push(p);
  }
  return merged;
}

// The spots and effect objects on the map after the first `upTo` phases have applied.
export function mapState(map: StageMapInfo, phases: Phase[], upTo: number) {
  const spots = new Map<string, PlacedSpot>(map.spots.map((s) => [`locPlc_${s.id}`,
    { ...s, x: s.x ?? 0, y: s.y ?? 0, name: `locPlc_${s.id}` }]));
  const fx = new Map<string, PlacedFx>();
  for (const p of phases.slice(0, upTo + 1)) {
    for (const e of p.events) {
      for (const op of e.ops) {
        if (op.op === "+s") spots.set(op.name, { k: op.k, x: op.x, y: op.y, id: op.id, name: op.name });
        else if (op.op === "-s") spots.delete(op.name);
        else if (op.op === "+fx") fx.set(op.name, { name: op.name, fx: op.fx, x: op.x, y: op.y });
        else fx.delete(op.name);
      }
    }
  }
  return { spots: [...spots.values()], fx: [...fx.values()] };
}

// M1.. / R1.. by ObjectID over every spot the map ever has, so a spot keeps its label in every phase.
export function spotLabels(map: StageMapInfo): Map<number, string> {
  const all = new Map<number, MapSpot["k"]>(map.spots.map((s) => [s.id, s.k]));
  for (const e of map.events ?? []) for (const op of e.ops) if (op.op === "+s") all.set(op.id, op.k);
  const ids = [...all.keys()].sort((a, b) => a - b);
  const bases = ids.filter((id) => all.get(id) === "b").length;
  const seen = { m: 0, r: 0, b: 0 };
  const out = new Map<number, string>();
  for (const id of ids) {
    const k = all.get(id)!;
    seen[k] += 1;
    out.set(id, k === "b" ? (bases > 1 ? `B${seen.b}` : "B") : `${k.toUpperCase()}${seen[k]}`);
  }
  return out;
}

// A spot change with a trigger that has no fixed time: numbered on the map, explained in the legend.
export type Trigger = { n: number; when: string; text: string; remove: string[]; add: PlacedSpot[] };

function triggerWhen(e: MapEvent, labels: Map<number, string>): string {
  const who = e.by?.length ? `enemy ${e.by.map((i) => `#${i}`).join(", ")}` : "an enemy";
  const when = {
    time: `at ${clock(e.t ?? 0)}`,
    event: `on ${who}'s scripted event`,
    defeat: `when ${who} is defeated`,
    attack: `when ${who} is about to attack`,
    route: `when ${who} reaches a waypoint`,
    hook: e.hook === "OnModeChanged" ? `when ${who} changes mode`
      : e.hook === "OnDestroy" ? `when ${who} is removed` : `on ${who}'s ${e.hook}`,
    spot: `on spot ${labels.get(e.spot ?? -1) ?? e.spot}'s ${e.hook}`,
  }[e.when];
  return e.cond ? `${when} (if ${e.cond})` : when;
}

function spotList(names: string[], ids: Map<string, number>, kinds: Map<number, MapSpot["k"]>,
  labels: Map<number, string>, sign: string): string {
  const known = names.map((n) => ids.get(n)).filter((id): id is number => id != null).sort((a, b) => a - b);
  if (known.length > 6) {
    return (["m", "r"] as const).map((k) => known.filter((id) => kinds.get(id) === k).length)
      .map((n, j) => (n ? `${sign}${n} ${j ? "ranged" : "melee"}` : "")).filter(Boolean).join(", ");
  }
  return known.map((id) => `${sign}${labels.get(id) ?? id}`).join(" ");
}

// Triggered spot changes, one entry per distinct trigger, numbered in script order.
export function mapTriggers(map: StageMapInfo, labels: Map<number, string>): Trigger[] {
  const ids = new Map<string, number>(map.spots.map((s) => [`locPlc_${s.id}`, s.id]));
  const kinds = new Map<number, MapSpot["k"]>(map.spots.map((s) => [s.id, s.k]));
  for (const e of map.events ?? []) {
    for (const op of e.ops) if (op.op === "+s") { ids.set(op.name, op.id); kinds.set(op.id, op.k); }
  }
  const byWhen = new Map<string, { remove: string[]; add: PlacedSpot[] }>();
  for (const e of (map.events ?? []).filter((x) => !isPhaseEvent(x)).map(normalise)) {
    const remove = e.ops.flatMap((o) => (o.op === "-s" && ids.has(o.name) ? [o.name] : []));
    const add = e.ops.flatMap((o) => (o.op === "+s" ? [{ k: o.k, x: o.x, y: o.y, id: o.id, name: o.name }] : []));
    if (!remove.length && !add.length) continue;
    const when = triggerWhen(e, labels);
    const cur = byWhen.get(when) ?? { remove: [], add: [] };
    cur.remove.push(...remove.filter((n) => !cur.remove.includes(n)));
    cur.add.push(...add.filter((s) => !cur.add.some((a) => a.name === s.name)));
    byWhen.set(when, cur);
  }
  return [...byWhen.entries()].map(([when, { remove, add }], i) => {
    const parts = [spotList(add.map((s) => s.name), ids, kinds, labels, "+"),
      spotList(remove, ids, kinds, labels, "−")].filter(Boolean);
    return { n: i + 1, when, text: `${parts.join(", ")} ${when}`, remove, add };
  });
}

const TRIGGER_COLOR = "#8b5cf6";
const LEGEND_LINE = 20;
const LEGEND_MAX = 14;

function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, n: number) {
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fillStyle = TRIGGER_COLOR;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), x, y + 0.5);
}

function badge(ctx: CanvasRenderingContext2D, s: MapSpot, label: string, cy: number, ghost: boolean) {
  ctx.font = "bold 15px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = Math.max(30, ctx.measureText(label).width + 12);
  const h = 22;
  ctx.globalAlpha = ghost ? 0.75 : 1;
  ctx.beginPath();
  ctx.roundRect(s.x - w / 2, cy - h / 2, w, h, 6);
  ctx.fillStyle = COLORS[s.k].fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.setLineDash(ghost ? [4, 3] : []);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLORS[s.k].text;
  ctx.fillText(label, s.x, cy + 1);
  ctx.globalAlpha = 1;
}

function legendHeight(triggers: Trigger[]): number {
  return triggers.length ? Math.min(triggers.length, LEGEND_MAX + 1) * LEGEND_LINE + 10 : 0;
}

function draw(
  canvas: HTMLCanvasElement, img: HTMLImageElement, markers: Markers | null, effects: Map<string, Effect | null>,
  map: StageMapInfo, state: { spots: PlacedSpot[]; fx: PlacedFx[] }, labels: Map<number, string>,
  show: Set<MapSpot["k"]>, footer: string, triggers: Trigger[],
) {
  const legendH = legendHeight(triggers);
  canvas.width = map.w;
  canvas.height = map.h + legendH + FOOTER;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, map.w, map.h);
  for (const f of state.fx) {
    const e = effects.get(f.fx);
    if (!e) continue;
    // a few-pixel sprite stretched over the whole map is a screen fade (BlackOut / WhiteOut), not map art
    const w = e.img.width * e.sx, h = e.img.height * e.sy;
    if (e.img.width <= 16 && e.img.height <= 16 && w >= map.w && h >= map.h) continue;
    ctx.globalAlpha = e.alpha;
    ctx.drawImage(e.img, f.x - e.ox * e.sx, f.y - e.oy * e.sy, e.img.width * e.sx, e.img.height * e.sy);
    ctx.globalAlpha = 1;
  }
  const spots = state.spots.filter((s) => show.has(s.k)).sort((a, b) => a.y - b.y);
  if (markers) {
    for (const s of spots) {
      const [ox, oy] = markers.origin[s.k];
      ctx.drawImage(markers.img[s.k], s.x - ox, s.y - oy);
    }
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // damage tiles: an amber tag under the marker with the damage per interval
  ctx.font = "bold 12px Inter, system-ui, sans-serif";
  for (const s of spots) {
    if (!s.dmg) continue;
    const text = damageText(s.dmg);
    const w = ctx.measureText(text).width + 10;
    const h = 17;
    const cy = markers ? s.y - markers.origin[s.k][1] + markers.img[s.k].height + h / 2 : s.y + 20;
    ctx.beginPath();
    ctx.roundRect(s.x - w / 2, cy - h / 2, w, h, 5);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.stroke();
    ctx.fillStyle = "#1b1b1b";
    ctx.fillText(text, s.x, cy + 1);
  }
  // above the marker ring, so its sword / staff stays visible; kept inside the map at the top edge
  const badgeY = (s: MapSpot) => Math.max(12, markers ? s.y - markers.origin[s.k][1] - 2 : s.y);
  // centre and radius of the marker ring
  const ring = (s: MapSpot): [number, number, number] => (markers
    ? [s.y - markers.origin[s.k][1] + markers.img[s.k].height / 2, markers.img[s.k].width * 0.4, 0]
    : [s.y, 20, 0]);
  const present = new Set(state.spots.map((s) => s.name));
  // spots a trigger adds later: a dashed ring where they will appear
  const ghosts = triggers.flatMap((t) => t.add.filter((s) => !present.has(s.name) && show.has(s.k)).map((s) => ({ s, n: t.n })));
  for (const { s } of ghosts) {
    const [cy, r] = ring(s);
    ctx.beginPath();
    ctx.ellipse(s.x, cy, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COLORS[s.k].fill;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const s of spots) badge(ctx, s, labels.get(s.id) ?? "?", badgeY(s), false);
  for (const { s } of ghosts) badge(ctx, s, labels.get(s.id) ?? "?", badgeY(s), true);
  // spots a trigger removes: a cross over the ring
  const byName = new Map(spots.map((s) => [s.name, s]));
  const crossed = triggers.flatMap((t) => t.remove.flatMap((n) => (byName.has(n) ? [{ s: byName.get(n)!, n: t.n }] : [])));
  for (const { s } of crossed) {
    const [cy] = ring(s);
    const d = 11;
    for (const [w, c] of [[7, "rgba(0,0,0,0.9)"], [3.5, "#ffffff"]] as const) {
      ctx.beginPath();
      ctx.moveTo(s.x - d, cy - d); ctx.lineTo(s.x + d, cy + d);
      ctx.moveTo(s.x + d, cy - d); ctx.lineTo(s.x - d, cy + d);
      ctx.lineWidth = w;
      ctx.lineCap = "round";
      ctx.strokeStyle = c;
      ctx.stroke();
    }
  }
  // trigger numbers beside the ring; a spot with several triggers stacks them to the right
  const stack = new Map<string, number>();
  for (const { s, n } of [...ghosts, ...crossed]) {
    const [cy, r] = ring(s);
    const i = stack.get(s.name) ?? 0;
    stack.set(s.name, i + 1);
    bubble(ctx, s.x + r + 4 + i * 19, cy + 6, n);
  }
  ctx.fillStyle = "#11141b";
  ctx.fillRect(0, map.h, map.w, legendH + FOOTER);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const shown = triggers.length > LEGEND_MAX + 1 ? triggers.slice(0, LEGEND_MAX) : triggers;
  shown.forEach((t, i) => {
    const y = map.h + 8 + i * LEGEND_LINE + LEGEND_LINE / 2;
    bubble(ctx, 20, y, t.n);
    ctx.fillStyle = "#e6e8ee";
    ctx.font = "13px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    let text = t.text;
    while (text.length > 4 && ctx.measureText(text).width > map.w - 44) text = `${text.slice(0, -2)}…`;
    ctx.fillText(text, 36, y);
  });
  if (shown.length < triggers.length) {
    ctx.fillStyle = "#9aa1ad";
    ctx.fillText(`… ${triggers.length - shown.length} more on the stage page`, 36,
      map.h + 8 + shown.length * LEGEND_LINE + LEGEND_LINE / 2);
  }
  ctx.fillStyle = "#e6e8ee";
  ctx.font = "13px Inter, system-ui, sans-serif";
  ctx.fillText(footer, 10, map.h + legendH + FOOTER / 2);
  if (legendH) {
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(10, map.h + legendH, map.w - 20, 1);
  }
}

function damageText([dmg, ticks]: [number, number]): string {
  const sec = ticks / 60;
  return `${dmg}/${sec === 1 ? "" : sec}s`;
}

function phaseSummary(map: StageMapInfo, phases: Phase[], i: number): string {
  if (i === 0) return "";
  const before = mapState(map, phases, i - 1).spots;
  const after = mapState(map, phases, i).spots;
  const ids = (xs: PlacedSpot[]) => new Set(xs.map((s) => s.name));
  const added = after.filter((s) => !ids(before).has(s.name));
  const removed = before.filter((s) => !ids(after).has(s.name));
  const part = (xs: PlacedSpot[], sign: string) => (["m", "r"] as const)
    .map((k) => xs.filter((s) => s.k === k).length)
    .map((n, j) => (n ? `${sign}${n} ${j ? "ranged" : "melee"}` : ""))
    .filter(Boolean);
  const parts = [...part(added, "+"), ...part(removed, "−")];
  return parts.length ? parts.join(", ") : "map change";
}

export function StageMap({ map, questId, name }: { map: StageMapInfo; questId: number; name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [markers, setMarkers] = useState<Markers | null | undefined>(undefined);
  const [effects, setEffects] = useState<Map<string, Effect | null> | null>(null);
  const [failed, setFailed] = useState(false);
  const [show, setShow] = useState<Set<MapSpot["k"]>>(new Set(["m", "r", "b"]));
  const [phase, setPhase] = useState(0);
  const [note, setNote] = useState("");
  const [showTriggers, setShowTriggers] = useState(true);
  const phases = useMemo(() => mapPhases(map.events ?? []), [map.events]);
  const labels = useMemo(() => spotLabels(map), [map]);
  const state = useMemo(() => mapState(map, phases, phase), [map, phases, phase]);
  const triggers = useMemo(() => mapTriggers(map, labels), [map, labels]);
  const drawnTriggers = showTriggers ? triggers : [];
  const link = `${location.origin}/stages/${questId}?tab=map`;
  const phaseText = phases.length > 1 ? ` · ${phases[phase].label}` : "";
  const footer = `${name}${phaseText} · ${link.replace(/^https?:\/\//, "")}`;
  const canCopyImage = typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

  useEffect(() => {
    const el = new Image();
    // jsDelivr sends CORS headers; without this the canvas could not be exported
    el.crossOrigin = "anonymous";
    el.onload = () => setImg(el);
    el.onerror = () => setFailed(true);
    el.src = mapImageUrl(map.image);
  }, [map.image]);

  useEffect(() => { loadMarkers().then(setMarkers); }, []);

  useEffect(() => {
    const names = [...new Set((map.events ?? []).flatMap((e) => e.ops.flatMap((o) => (o.op === "+fx" ? [o.fx] : []))))];
    Promise.all(names.map((n) => loadEffect(n).then((e) => [n, e] as const)))
      .then((pairs) => setEffects(new Map(pairs)));
  }, [map.events]);

  useEffect(() => {
    if (img && markers !== undefined && effects && canvasRef.current) {
      draw(canvasRef.current, img, markers, effects, map, state, labels, show, footer, drawnTriggers);
    }
  }, [img, markers, effects, map, state, labels, show, footer, drawnTriggers]);

  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(""), 2000);
  };
  const png = () => new Promise<Blob>((resolve, reject) =>
    canvasRef.current!.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));

  const counts = { m: 0, r: 0, b: 0 };
  for (const s of state.spots) counts[s.k] += 1;
  const damageSpots = state.spots.filter((s) => s.dmg && show.has(s.k));
  const toggle = (k: MapSpot["k"]) => setShow((cur) => {
    const next = new Set(cur);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const missingFx = effects ? [...effects.entries()].filter(([, e]) => !e).map(([n]) => n) : [];
  const L = useL();
  const ready = !!img && !!effects;

  return (
    <div className="stage-map">
      {phases.length > 1 && (
        <div className="stage-map-phases" role="group" aria-label={L("Map phase", "マップの段階")}>
          <span className="muted small">{L("The map changes during this battle:", "この戦闘中にマップが変化します:")}</span>
          {phases.map((p, i) => (
            <button key={i} type="button" aria-pressed={phase === i}
              className={`hub-btn hub-btn--sm${phase === i ? " stage-map-phase--active" : ""}`}
              onClick={() => setPhase(i)} title={phaseSummary(map, phases, i)}>
              {p.label}
              {i > 0 && <span className="stage-map-phase-note">{phaseSummary(map, phases, i)}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="stage-map-toolbar">
        {(["m", "r", "b"] as const).filter((k) => counts[k] > 0).map((k) => (
          <label key={k} className="stage-map-toggle">
            <input type="checkbox" checked={show.has(k)} onChange={() => toggle(k)} />
            <span className={`stage-map-key stage-map-key--${k}`}>{k === "b" ? "B" : k.toUpperCase()}</span>
            {k === "m" ? L("Melee", "近接") : k === "r" ? L("Ranged", "遠距離") : L("Base", "拠点")} ({counts[k]})
          </label>
        ))}
        {damageSpots.length > 0 && (
          <span className="stage-map-toggle" title={L("Fixed damage to the unit placed on the spot", "配置したユニットへの固定ダメージ")}>
            <span className="stage-map-key stage-map-key--dmg">{damageText(damageSpots[0].dmg!)}</span>
            {L("Damage tile", "ダメージ床")} ({damageSpots.length})
          </span>
        )}
        {triggers.length > 0 && (
          <label className="stage-map-toggle" title={L("Spot changes caused by enemies or stage conditions", "敵やステージの条件による配置場所の変化")}>
            <input type="checkbox" checked={showTriggers} onChange={() => setShowTriggers((v) => !v)} />
            <span className="stage-map-key stage-map-key--trigger">1</span>
            {L("Triggered changes", "条件による変化")} ({triggers.length})
          </label>
        )}
        <span className="stage-map-actions">
          <button type="button" className="hub-btn hub-btn--sm" disabled={!ready}
            onClick={async () => saveBlob(await png(), `aigis-stage-${questId}-map${phase ? `-phase${phase}` : ""}.png`)}>
            {L("Download PNG", "PNGで保存")}
          </button>
          {canCopyImage && (
            <button type="button" className="hub-btn hub-btn--sm" disabled={!ready}
              onClick={() => navigator.clipboard.write([new ClipboardItem({ "image/png": png() })])
                .then(() => flash(L("Image copied", "画像をコピーしました")), () => flash(L("Copy failed", "コピーできませんでした")))}>
              {L("Copy image", "画像をコピー")}
            </button>
          )}
          <button type="button" className="hub-btn hub-btn--sm"
            onClick={() => copyText(link).then((ok) => flash(ok ? L("Link copied", "リンクをコピーしました") : L("Copy failed", "コピーできませんでした")))}>
            {L("Copy link", "リンクをコピー")}
          </button>
          {note && <span className="muted small" role="status">{note}</span>}
        </span>
      </div>
      {failed ? <p className="muted">{L("Map image unavailable.", "マップ画像がありません。")}</p> : !ready && <p className="loading">{L("Loading map…", "マップを読み込み中…")}</p>}
      <canvas ref={canvasRef} className="stage-map-canvas" hidden={!ready}
        aria-label={L("Map of {name}: {m} melee and {r} ranged deployment spots", "{name}のマップ: 近接 {m}・遠距離 {r} の配置場所", { name: `${name}${phaseText}`, m: counts.m, r: counts.r })} />
      {showTriggers && triggers.length > 0 && (
        <ol className="stage-map-triggers" aria-label={L("Triggered spot changes", "条件による配置場所の変化")}>
          {triggers.map((t) => (
            <li key={t.n}><span className="stage-map-key stage-map-key--trigger">{t.n}</span> {t.text}</li>
          ))}
        </ol>
      )}
      {missingFx.length > 0 && (
        <p className="muted small">{L("Some map changes have no extracted artwork ({fx}); their spots are still shown.", "一部のマップ変化は画像がありません ({fx})。配置場所は表示しています。", { fx: missingFx.join(", ") })}</p>
      )}
    </div>
  );
}
