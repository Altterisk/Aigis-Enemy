import { useEffect, useMemo, useRef, useState } from "react";
import { SceneControls, SceneFrame, SceneTextBox, sceneTextSetting, useSceneStepper, type SceneLine } from "@altterisk/game-hub";
import { storyBgUrl, storyCharaUrl, type DialogueTl } from "./data";
import { ColorCodedText, MtlText } from "./components";
import type { StoryChara, StoryPage, StoryScene } from "./types";
import { gameName, useL, useLang } from "./i18n";

const STAGE_W = 960;
const STAGE_H = 640;
const AUTO_MS = 2400;
const autoDelay = () => AUTO_MS;

// all lines up front (page translators) or the current line only
const textMode = sceneTextSetting("aigis.story.preload");

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

export function StoryViewer({ scene, tl, onClose }: { scene: StoryScene; tl: DialogueTl; onClose: () => void }) {
  const pages = scene.pages;
  const [allLines, setAllLines] = textMode.use();
  const [log, setLog] = useState(false);
  const [done, setDone] = useState(false);
  const [dip, setDip] = useState(0);
  const base = useSceneStepper({
    count: pages.length,
    onEnd: () => setDone(true),
    onClose: log ? () => setLog(false) : onClose,
    autoDelay,
    ready: !done,
    keys: true,
  });
  // past the last page the end screen shows; Back returns to the last page
  const stepper = done ? { ...base, next: () => {}, back: () => setDone(false) } : base;
  const at = base.at;
  const page = pages[at];
  const line = page ? scene.lines[page.l] : undefined;
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (done) return;
    if (page?.f) setDip((d) => d + 1);
    preloadImages(pages[at + 1]);
  }, [at, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const lang = useLang();
  // the text box holds one language: English when the line is translated
  const textLines = useMemo<SceneLine[]>(() => pages.map((p) => {
    const l = scene.lines[p.l];
    const en = lang === "en" ? tl.text[l.t] : undefined;
    return { name: l.n ? gameName(tl.speakers[l.n], l.n, lang) : undefined, text: <ColorCodedText text={en || l.t} /> };
  }), [pages, scene.lines, tl, lang]);

  useEffect(() => {
    frameRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, []);

  const speaking = useMemo(() => new Set(line?.w ? [line.w] : []), [line]);
  const L = useL();
  const history = useMemo(
    () => pages.slice(0, Math.min(at + 1, pages.length)).map((p) => scene.lines[p.l]),
    [pages, at, scene.lines],
  );

  return (
    <div className="sv-theater" role="dialog" aria-modal="true" aria-label={scene.title} ref={frameRef} tabIndex={-1}>
      <SceneFrame aspect="3 / 2" className="sv-stage" onAdvance={log ? undefined : stepper.next}>
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
        <SceneTextBox className="sv-box" lines={textLines} at={at} allLines={allLines} hidden={done} />
        {!done && <span className="sv-more" aria-hidden="true" translate="no">▼</span>}
        {done && (
          <div className="sv-end" onClick={(e) => e.stopPropagation()} translate="no">
            <div className="sv-end-title">{scene.title}</div>
            <div className="sv-end-actions">
              <button type="button" onClick={() => { setDone(false); base.go(0); }}>{L("Replay", "もう一度")}</button>
              <button type="button" onClick={onClose}>{L("Close", "閉じる")}</button>
            </div>
          </div>
        )}
        {log && (
          <div className="sv-log" onClick={(e) => e.stopPropagation()}>
            {history.map((l, i) => (
              <div className="sv-log-line" key={i}>
                {l.n && <div className="sv-log-name">{gameName(tl.speakers[l.n], l.n, lang)}</div>}
                <div className="sv-log-text"><MtlText jp={l.t} en={tl.text[l.t]} /></div>
              </div>
            ))}
          </div>
        )}
      </SceneFrame>
      <SceneControls className="sv-controls" stepper={stepper} count={pages.length} nextDisabled={done}
        allLines={allLines} onAllLines={setAllLines} onClose={onClose}
        labels={lang === "ja" ? {
          back: "戻る", next: "次へ", auto: "オート", textAll: "全文", textOne: "1行ずつ", textTitle: "テキストの表示",
          theater: "シアター", exitTheater: "シアターを終了", close: "閉じる", position: "位置",
        } : undefined}>
        <button type="button" className="hub-btn" aria-pressed={log} onClick={() => setLog((v) => !v)}>{L("Log", "ログ")}</button>
      </SceneControls>
    </div>
  );
}
