import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Breadcrumbs, FallbackImage, MetaChip, MetaChips, PageHeader, StoryLines, type StoryLineView } from "@altterisk/game-hub";
import { LIST_META, NOT_FOUND_META, plainText } from "../meta";
import { usePageMeta } from "../usePageMeta";
import { bannerUrl, storyCharaUrl, talkFaceUrl, useStoryGroup } from "../data";
import { ColorCodedText, routerLink } from "../components";
import { StoryViewer } from "../storyViewer";
import type { StoryGroup, StoryLine, StoryScene } from "../types";

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

function toView(l: StoryLine): StoryLineView {
  if (!l.n) return { kind: "narration", text: <ColorCodedText text={l.t} /> };
  const uid = l.w?.startsWith("u") ? Number(l.w.slice(1)) : null;
  return {
    kind: "say",
    name: l.n,
    nameHref: uid != null ? `/units/${uid}` : undefined,
    text: <ColorCodedText text={l.t} />,
    avatar: <Avatar w={l.w} name={l.n} />,
  };
}

function SceneRow({ scene, onPlay }: { scene: StoryScene; onPlay: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="story-scene">
      <div className="story-scene-head">
        <span className="story-scene-title">
          Scene <span className="muted small">· {scene.lines.length} lines</span>
          {scene.card != null && <> · <Link to={`/units/${scene.card}`}>unit page</Link></>}
        </span>
        <button type="button" className="story-btn primary" onClick={() => onPlay(scene.key)} disabled={!scene.pages.length}>
          ▶ Play
        </button>
        <button type="button" className="story-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Hide text" : "Read"}
        </button>
      </div>
      {open && <StoryLines className="story-read" lines={scene.lines.map(toView)} renderLink={routerLink} />}
    </div>
  );
}

function allScenes(g: StoryGroup): StoryScene[] {
  return [...g.intro, ...g.quests.flatMap((q) => q.scenes)];
}

export default function StoryDetail() {
  const { groupId } = useParams();
  const { loading, group } = useStoryGroup(groupId);
  const [params, setParams] = useSearchParams();
  const [bannerFailed, setBannerFailed] = useState(false);
  const playing = params.get("play");
  usePageMeta(loading ? LIST_META["/story"] : group ? {
    title: `${plainText(group.title)} story`,
    description: `Event story of ${plainText(group.title)} (Millennium War Aigis): ${group.scenes} out-of-battle scenes with a scene viewer, and links to its battle dialogue.`,
  } : NOT_FOUND_META);
  if (loading) return <p className="loading">Loading…</p>;
  if (!group) return <p>Story not found. <Link to="/story">Back</Link></p>;

  const play = (key: string | null) => {
    const next = new URLSearchParams(params);
    if (key) next.set("play", key); else next.delete("play");
    setParams(next, { replace: !key });
  };
  const scene = playing ? allScenes(group).find((s) => s.key === playing) : undefined;

  return (
    <div className="detail story-detail">
      <Breadcrumbs renderLink={routerLink} items={[
        { label: "Story", href: "/story" },
        { label: <ColorCodedText text={group.title} /> },
      ]} />
      <PageHeader
        className="stage-header"
        level={2}
        art={group.mission_id != null && !bannerFailed ? (
          <img className="stage-banner" src={bannerUrl(group.mission_id)} alt="" onError={() => setBannerFailed(true)} />
        ) : undefined}
        title={<ColorCodedText text={group.title} />}
        subtitle={<span className="event-line"><span className="cat-badge">{group.category}</span></span>}
        meta={(
          <MetaChips>
            <MetaChip label="Scenes" value={group.scenes} />
            <MetaChip label="Stages with battle dialogue" value={group.battle} />
            {group.mission_id != null && <MetaChip label="Mission" value={group.mission_id} />}
            {group.past && <MetaChip className="past-chip" value="past content" />}
          </MetaChips>
        )}
      />

      {group.story_talk_quest != null && (
        <p className="story-note">
          Part of this event&apos;s story is shown on the battle screen:{" "}
          <Link to={`/stages/${group.story_talk_quest}?tab=dialogue`}>read it on the stage&apos;s Dialogue tab</Link>.
        </p>
      )}

      {group.intro.length > 0 && (
        <section className="story-quest">
          <h3>{group.quests.length ? "Event scenes" : "Scenes"}</h3>
          {group.intro.map((s) => (
            <div key={s.key}>
              {s.title !== s.key && <div className="story-scene-name"><ColorCodedText text={s.title} /></div>}
              <SceneRow scene={s} onPlay={play} />
            </div>
          ))}
        </section>
      )}

      {group.quests.map((q) => (
        <section key={q.quest_id} className="story-quest">
          <h3>
            {q.stage ? <Link to={`/stages/${q.quest_id}`}><ColorCodedText text={q.name} /></Link> : <ColorCodedText text={q.name} />}
          </h3>
          {q.scenes.map((s) => <SceneRow key={s.key} scene={s} onPlay={play} />)}
          {q.battle > 0 && (
            <div className="story-battle">
              <span>Battle dialogue <span className="muted small">· {q.battle} scene{q.battle === 1 ? "" : "s"}</span></span>
              <Link className="story-btn" to={`/stages/${q.quest_id}?tab=dialogue`}>Open</Link>
            </div>
          )}
        </section>
      ))}

      {scene && <StoryViewer key={scene.key} scene={scene} onClose={() => play(null)} />}
    </div>
  );
}
