import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Breadcrumbs, FallbackImage, MetaChip, MetaChips, PageHeader, StoryLines, type StoryLineView } from "@altterisk/game-hub";
import { LIST_META, NOT_FOUND_META, plainText } from "../meta";
import { usePageMeta } from "../usePageMeta";
import { bannerUrl, storyCharaUrl, talkFaceUrl, useDialogueTl, useEventInfo, useStoryGroup, type DialogueTl } from "../data";
import { ColorCodedText, MtlText, routerLink } from "../components";
import { StoryViewer } from "../storyViewer";
import type { StoryGroup, StoryLine, StoryScene } from "../types";
import { altName, gameName, useL, useLang } from "../i18n";

// The speaker's portrait: a unit's icon, or the top of an event character's art.
function Avatar({ w, name }: { w?: string; name: string }) {
  if (w?.startsWith("u")) {
    return <FallbackImage className="dlg-face" srcs={[talkFaceUrl(w)]} alt={name} missing={<div className="dlg-face dlg-face--none">{name.slice(0, 1) || "…"}</div>} />;
  }
  if (w?.startsWith("e")) {
    return <span className="dlg-face story-face-crop" style={{ backgroundImage: `url(${storyCharaUrl(w)})` }} role="img" aria-label={name} />;
  }
  return <div className="dlg-face dlg-face--none">{name.slice(0, 1) || "…"}</div>;
}

function toView(l: StoryLine, tl: DialogueTl, lang: "en" | "ja"): StoryLineView {
  const text = <MtlText jp={l.t} en={tl.text[l.t]} />;
  if (!l.n) return { kind: "narration", text };
  const uid = l.w?.startsWith("u") ? Number(l.w.slice(1)) : null;
  return {
    kind: "say",
    name: gameName(tl.speakers[l.n], l.n, lang),
    nameHref: uid != null ? `/units/${uid}` : undefined,
    text,
    avatar: <Avatar w={l.w} name={l.n} />,
  };
}

function SceneRow({ scene, onPlay, tl }: { scene: StoryScene; onPlay: (key: string) => void; tl: DialogueTl }) {
  const [open, setOpen] = useState(false);
  const L = useL();
  const lang = useLang();
  return (
    <div className="story-scene">
      <div className="story-scene-head">
        <span className="story-scene-title">
          {L("Scene", "シーン")} <span className="muted small">{L("· {n} lines", "· {n} 行", { n: scene.lines.length })}</span>
          {scene.card != null && <> · <Link to={`/units/${scene.card}`}>{L("unit page", "ユニットページ")}</Link></>}
        </span>
        <button type="button" className="story-btn primary" onClick={() => onPlay(scene.key)} disabled={!scene.pages.length}>
          ▶ {L("Play", "再生")}
        </button>
        <button type="button" className="story-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? L("Hide text", "テキストを隠す") : L("Read", "読む")}
        </button>
      </div>
      {open && <StoryLines className="story-read" lines={scene.lines.map((l) => toView(l, tl, lang))} renderLink={routerLink} />}
    </div>
  );
}

function allScenes(g: StoryGroup): StoryScene[] {
  return [...g.intro, ...g.quests.flatMap((q) => q.scenes)];
}

export default function StoryDetail() {
  const { groupId } = useParams();
  const { loading, group } = useStoryGroup(groupId);
  const tl = useDialogueTl(groupId);
  const [params, setParams] = useSearchParams();
  const [bannerFailed, setBannerFailed] = useState(false);
  const playing = params.get("play");
  const L = useL();
  const lang = useLang();
  const eventInfo = useEventInfo();
  const eventEn = group?.mission_id != null ? eventInfo?.[String(group.mission_id)]?.en : undefined;
  const title = group ? gameName(eventEn, group.title, lang) : "";
  const titleAlt = group ? altName(eventEn, group.title, lang) : "";
  usePageMeta(loading ? LIST_META["/story"] : group ? {
    title: `${plainText(eventEn || group.title)} story`,
    description: `Event story of ${plainText(eventEn || group.title)} (Millennium War Aigis): ${group.scenes} out-of-battle scenes with a scene viewer, and links to its battle dialogue.`,
  } : NOT_FOUND_META);
  if (loading) return <p className="loading">{L("Loading…", "読み込み中…")}</p>;
  if (!group) return <p>{L("Story not found.", "ストーリーが見つかりません。")} <Link to="/story">{L("Back", "戻る")}</Link></p>;

  const play = (key: string | null) => {
    const next = new URLSearchParams(params);
    if (key) next.set("play", key); else next.delete("play");
    setParams(next, { replace: !key });
  };
  const scene = playing ? allScenes(group).find((s) => s.key === playing) : undefined;

  return (
    <div className="detail story-detail">
      <Breadcrumbs renderLink={routerLink} items={[
        { label: L("Story", "ストーリー"), href: "/story" },
        { label: <ColorCodedText text={title} /> },
      ]} />
      <PageHeader
        className="stage-header"
        level={2}
        art={group.mission_id != null && !bannerFailed ? (
          <img className="stage-banner" src={bannerUrl(group.mission_id)} alt="" onError={() => setBannerFailed(true)} />
        ) : undefined}
        title={<ColorCodedText text={title} />}
        subtitle={(
          <span className="event-line">
            <span className="cat-badge">{group.category}</span>
            {titleAlt && <span className="muted small"> <ColorCodedText text={titleAlt} /></span>}
          </span>
        )}
        meta={(
          <MetaChips>
            <MetaChip label={L("Scenes", "シーン")} value={group.scenes} />
            <MetaChip label={L("Stages with battle dialogue", "戦闘会話のあるステージ")} value={group.battle} />
            {group.mission_id != null && <MetaChip label={L("Mission", "ミッション")} value={group.mission_id} />}
            {group.past && <MetaChip className="past-chip" value={L("past content", "終了したコンテンツ")} />}
          </MetaChips>
        )}
      />

      {group.story_talk_quest != null && (
        <p className="story-note">
          {L("Part of this event's story is shown on the battle screen:", "このイベントのストーリーの一部は戦闘画面で表示されます:")}{" "}
          <Link to={`/stages/${group.story_talk_quest}?tab=dialogue`}>{L("read it on the stage's Dialogue tab", "ステージの会話タブで読む")}</Link>.
        </p>
      )}

      {group.intro.length > 0 && (
        <section className="story-quest">
          <h3>{group.quests.length ? L("Event scenes", "イベントのシーン") : L("Scenes", "シーン")}</h3>
          {group.intro.map((s) => (
            <div key={s.key}>
              {s.title !== s.key && <div className="story-scene-name"><ColorCodedText text={s.title} /></div>}
              <SceneRow scene={s} onPlay={play} tl={tl} />
            </div>
          ))}
        </section>
      )}

      {group.quests.map((q) => (
        <section key={q.quest_id} className="story-quest">
          <h3>
            {q.stage ? <Link to={`/stages/${q.quest_id}`}><ColorCodedText text={q.name} /></Link> : <ColorCodedText text={q.name} />}
          </h3>
          {q.scenes.map((s) => <SceneRow key={s.key} scene={s} onPlay={play} tl={tl} />)}
          {q.battle > 0 && (
            <div className="story-battle">
              <span>{L("Battle dialogue", "戦闘会話")} <span className="muted small">{L("· {n} scene(s)", "· {n} シーン", { n: q.battle })}</span></span>
              <Link className="story-btn" to={`/stages/${q.quest_id}?tab=dialogue`}>{L("Open", "開く")}</Link>
            </div>
          )}
        </section>
      ))}

      {scene && <StoryViewer key={scene.key} scene={scene} tl={tl} onClose={() => play(null)} />}
    </div>
  );
}
