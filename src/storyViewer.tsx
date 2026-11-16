import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSetting } from "@altterisk/game-hub/persist";
import { storyBgUrl, storyCharaUrl } from "./data";
import { ColorCodedText } from "./components";
import type { StoryChara, StoryPage, StoryScene } from "./types";

const STAGE_W = 960;
const STAGE_H = 640;
const AUTO_MS = 2400;

// Text mode: every line of the scene in the box up front (page translators reach
// them all), or only the current line (translators that handle new text themselves).
const preloadSetting = createSetting<boolean>({
  key: "aigis.story.preload",
  initial: true,
  sanitize: (raw) => (raw === false ? false : true),
});

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

function Background({ page }: { page: StoryPage }) {
  const [width, setWidth] = useState<Record<string, number>>({});
  const bg = page.bg;
  if (!bg?.src) return null;
  const natural = width[bg.src];
  return (
    <img
      key={bg.src}
      className="sv-bg"
      src={storyBgUrl(bg.src)}
      alt=""
      draggable={false}
      onLoad={(e) => {
        const w = e.currentTarget.naturalWidth;
        setWidth((m) => (m[bg.src!] === w ? m : { ...m, [bg.src!]: w }));
      }}
      style={{
        left: pct(bg.x, STAGE_W),
        top: pct(bg.y, STAGE_H),
        width: natural ? pct((natural * bg.s) / 100, STAGE_W) : "100%",
      }}
    />
  );
}

// A character is h x scale stage px tall, centred (or bottom-centred) on its position.
function Chara({ c, speaking }: { c: StoryChara; speaking: boolean }) {
  const url = storyCharaUrl(c.r);
  if (!url) return null;
  const { x, y } = c;
  return (
    <img
      className={`sv-chara${speaking ? "" : " sv-chara--idle"}`}
      src={url}
      alt=""
      draggable={false}
      style={{
        left: pct(x, STAGE_W),
        top: pct(y, STAGE_H),
        height: pct((c.h * c.s) / 100, STAGE_H),
        transform: c.a === "b" ? "translate(-50%, -100%)" : "translate(-50%, -50%)",
      }}
    />
  );
}

function preloadImages(page: StoryPage | undefined) {
  if (!page) return;
  const urls = [page.bg?.src ? storyBgUrl(page.bg.src) : null, ...page.c.map((c) => storyCharaUrl(c.r))];
  for (const u of urls) if (u) new Image().src = u;
}

export function StoryViewer({ scene, onClose }: { scene: StoryScene; onClose: () => void }) {
  const pages = scene.pages;
  const [at, setAt] = useState(0);
  const [auto, setAuto] = useState(false);
  const [preload, setPreload] = preloadSetting.use();
  const [log, setLog] = useState(false);
  const [dip, setDip] = useState(0);
  const done = at >= pages.length;
  const page = pages[Math.min(at, pages.length - 1)];
  const line = page ? scene.lines[page.l] : undefined;
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setAt(0); }, [scene.key]);

  useEffect(() => {
    if (done) return;
    if (page?.f) setDip((d) => d + 1);
    preloadImages(pages[at + 1]);
  }, [at, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = useCallback(() => setAt((i) => Math.min(i + 1, pages.length)), [pages.length]);
  const prev = useCallback(() => setAt((i) => Math.max(0, Math.min(i, pages.length) - 1)), [pages.length]);

  useEffect(() => {
    if (!auto || done) return undefined;
    const id = window.setTimeout(next, AUTO_MS);
    return () => window.clearTimeout(id);
  }, [auto, done, at, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (log) setLog(false); else onClose(); }
      else if (log) return;
      else if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose, log]);

  useEffect(() => {
    frameRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, []);

  const speaking = useMemo(() => new Set(line?.w ? [line.w] : []), [line]);
  const history = useMemo(
    () => pages.slice(0, Math.min(at + 1, pages.length)).map((p) => scene.lines[p.l]),
    [pages, at, scene.lines],
  );

  return (
    <div className="sv-theater" role="dialog" aria-modal="true" aria-label={scene.title} ref={frameRef} tabIndex={-1}>
      <div className="sv-stage" onClick={log ? undefined : next} data-testid="story-stage">
        {page && !done && (
          <>
            <Background page={page} />
            {page.c.map((c) => (
              <Chara key={`${c.o}:${c.r}`} c={c} speaking={speaking.size === 0 || speaking.has(c.r)} />
            ))}
            <div className={`sv-black${page.k ? " on" : ""}`} />
            {dip > 0 && <div key={dip} className="sv-dip" />}
          </>
        )}
        {/* Preloaded: every page's line sits in the box from the start, stacked
            and transparent but for the current one, and is never re-rendered, so
            page translators (Chrome, Edge) translate them all up front and
            stepping only changes which one shows. Per line: only the current
            line, keyed so each is a fresh element (a translator-replaced node
            updated in place would not show the new text). */}
        <div key={preload ? "all" : "one"} className={`sv-box${done || !line ? " off" : ""}`} lang="ja">
          {preload ? pages.map((p, k) => {
            const l = scene.lines[p.l];
            return (
              <div key={k} className={`sv-say${k === at ? " on" : ""}`} aria-hidden={k !== at}>
                {l.n && <div className="sv-name">{l.n}</div>}
                <div className="sv-text"><ColorCodedText text={l.t} /></div>
              </div>
            );
          }) : line && !done && (
            <div key={at} className="sv-say on">
              {line.n && <div className="sv-name">{line.n}</div>}
              <div className="sv-text"><ColorCodedText text={line.t} /></div>
            </div>
          )}
          <span className="sv-more" aria-hidden="true" translate="no">▼</span>
        </div>
        {done && (
          <div className="sv-end" onClick={(e) => e.stopPropagation()} translate="no">
            <div className="sv-end-title">{scene.title}</div>
            <div className="sv-end-actions">
              <button type="button" onClick={() => setAt(0)}>Replay</button>
              <button type="button" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
        {log && (
          <div className="sv-log" onClick={(e) => e.stopPropagation()} lang="ja">
            {history.map((l, i) => (
              <div className="sv-log-line" key={i}>
                {l.n && <div className="sv-log-name">{l.n}</div>}
                <div className="sv-log-text"><ColorCodedText text={l.t} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="sv-controls" translate="no">
        <span className="sv-progress">{Math.min(at + 1, pages.length)} / {pages.length}</span>
        <button type="button" onClick={prev} disabled={at === 0}>Back</button>
        <button type="button" onClick={next} disabled={done}>Next</button>
        <button type="button" className={auto ? "on" : ""} aria-pressed={auto} onClick={() => setAuto((a) => !a)}>Auto</button>
        <button type="button" className={log ? "on" : ""} aria-pressed={log} onClick={() => setLog((v) => !v)}>Log</button>
        <button type="button" aria-pressed={preload} onClick={() => setPreload(!preload)}
          title="Which works best depends on the translator. All lines: the whole scene's text is in the page up front (Chrome's built-in translation). Per line: only the current line (some translator extensions).">
          {preload ? "Text: all lines" : "Text: per line"}
        </button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
