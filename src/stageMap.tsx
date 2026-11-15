import { useEffect, useRef, useState } from "react";
import { copyText } from "@altterisk/game-hub";
import { saveBlob } from "@altterisk/game-hub/persist";
import { mapImageUrl } from "./data";
import type { MapSpot, StageMapInfo } from "./types";

const COLORS: Record<MapSpot["k"], { fill: string; text: string }> = {
  m: { fill: "#ffd84a", text: "#1b1b1b" },
  r: { fill: "#ff9a3c", text: "#1b1b1b" },
  b: { fill: "#e5484d", text: "#ffffff" },
};
const FOOTER = 30;

// M1.. / R1.. in ObjectID order; bases are B, or B1.. when there are several.
export function spotLabels(spots: MapSpot[]): string[] {
  const seen = { m: 0, r: 0, b: 0 };
  const bases = spots.filter((s) => s.k === "b").length;
  return spots.map((s) => {
    seen[s.k] += 1;
    if (s.k === "b") return bases > 1 ? `B${seen.b}` : "B";
    return `${s.k.toUpperCase()}${seen[s.k]}`;
  });
}

function draw(canvas: HTMLCanvasElement, img: HTMLImageElement, map: StageMapInfo, show: Set<MapSpot["k"]>, footer: string) {
  canvas.width = map.w;
  canvas.height = map.h + FOOTER;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, map.w, map.h);
  const labels = spotLabels(map.spots);
  ctx.font = "bold 15px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  map.spots.forEach((s, i) => {
    if (!show.has(s.k)) return;
    const label = labels[i];
    const w = Math.max(30, ctx.measureText(label).width + 12);
    const h = 22;
    ctx.beginPath();
    ctx.roundRect(s.x - w / 2, s.y - h / 2, w, h, 6);
    ctx.fillStyle = COLORS[s.k].fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.stroke();
    ctx.fillStyle = COLORS[s.k].text;
    ctx.fillText(label, s.x, s.y + 1);
  });
  ctx.fillStyle = "#11141b";
  ctx.fillRect(0, map.h, map.w, FOOTER);
  ctx.fillStyle = "#e6e8ee";
  ctx.font = "13px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(footer, 10, map.h + FOOTER / 2);
}

export function StageMap({ map, questId, name }: { map: StageMapInfo; questId: number; name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [show, setShow] = useState<Set<MapSpot["k"]>>(new Set(["m", "r", "b"]));
  const [note, setNote] = useState("");
  const link = `${location.origin}/stages/${questId}?tab=map`;
  const footer = `${name} · ${link.replace(/^https?:\/\//, "")}`;
  const canCopyImage = typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

  useEffect(() => {
    const el = new Image();
    // jsDelivr sends CORS headers; without this the canvas could not be exported
    el.crossOrigin = "anonymous";
    el.onload = () => setImg(el);
    el.onerror = () => setFailed(true);
    el.src = mapImageUrl(map.image);
  }, [map.image]);

  useEffect(() => {
    if (img && canvasRef.current) draw(canvasRef.current, img, map, show, footer);
  }, [img, map, show, footer]);

  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(""), 2000);
  };
  const png = () => new Promise<Blob>((resolve, reject) =>
    canvasRef.current!.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));

  const counts = { m: 0, r: 0, b: 0 };
  for (const s of map.spots) counts[s.k] += 1;
  const toggle = (k: MapSpot["k"]) => setShow((cur) => {
    const next = new Set(cur);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  return (
    <div className="stage-map">
      <div className="stage-map-toolbar">
        {(["m", "r", "b"] as const).filter((k) => counts[k] > 0).map((k) => (
          <label key={k} className="stage-map-toggle">
            <input type="checkbox" checked={show.has(k)} onChange={() => toggle(k)} />
            <span className={`stage-map-key stage-map-key--${k}`}>{k === "b" ? "B" : k.toUpperCase()}</span>
            {k === "m" ? "Melee" : k === "r" ? "Ranged" : "Base"} ({counts[k]})
          </label>
        ))}
        <span className="stage-map-actions">
          <button type="button" className="hub-btn hub-btn--sm" disabled={!img}
            onClick={async () => saveBlob(await png(), `aigis-stage-${questId}-map.png`)}>
            Download PNG
          </button>
          {canCopyImage && (
            <button type="button" className="hub-btn hub-btn--sm" disabled={!img}
              onClick={() => navigator.clipboard.write([new ClipboardItem({ "image/png": png() })])
                .then(() => flash("Image copied"), () => flash("Copy failed"))}>
              Copy image
            </button>
          )}
          <button type="button" className="hub-btn hub-btn--sm"
            onClick={() => copyText(link).then((ok) => flash(ok ? "Link copied" : "Copy failed"))}>
            Copy link
          </button>
          {note && <span className="muted small" role="status">{note}</span>}
        </span>
      </div>
      {failed ? <p className="muted">Map image unavailable.</p> : !img && <p className="loading">Loading map…</p>}
      <canvas ref={canvasRef} className="stage-map-canvas" hidden={!img}
        aria-label={`Map of ${name}: ${counts.m} melee and ${counts.r} ranged deployment spots`} />
    </div>
  );
}
