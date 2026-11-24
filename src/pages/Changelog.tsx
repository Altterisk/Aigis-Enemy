import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChangelogDialog as HubChangelogDialog, ReleaseList, type Release as HubRelease } from "@altterisk/game-hub";
import { KIND_LABEL, RELEASES, isFreshVisitor, latestKey, markSeen, restoreSeen, useShouldShow, type ChangeKind } from "../changelog";
import { useUnits } from "../data";
import { gameName, useL, useLang, type Lang } from "../i18n";
import type { UnitIndexEntry } from "../types";

function unitLinks(ids: number[], byId: Map<number, UnitIndexEntry> | null, lang: Lang): ReactNode {
  return ids.map((id, i) => {
    const u = byId?.get(id);
    return (
      <span key={id}>
        {i > 0 && (lang === "ja" ? "、" : ", ")}
        <Link to={`/units/${id}`}>{u ? gameName(u.name_en, u.name, lang) : `#${id}`}</Link>
      </span>
    );
  });
}

function useReleases(): HubRelease[] {
  const lang = useLang();
  const { byId } = useUnits();
  return RELEASES.map((r) => ({
    date: r.date,
    title: r.title?.[lang],
    entries: r.entries.map((e) => ({
      kind: e.kind,
      text: e.kind === "unit" ? unitLinks(e.units, byId, lang) : e.text[lang],
    })),
  }));
}

export function ChangelogDialog() {
  const L = useL();
  const lang = useLang();
  const key = latestKey();
  useEffect(() => { restoreSeen(); }, []);
  const unseen = useShouldShow(key);
  const fresh = isFreshVisitor();

  // a first-ever visitor has nothing to catch up on: record the release silently
  useEffect(() => {
    if (fresh && unseen) markSeen(key);
  }, [fresh, unseen, key]);

  // mounted only when open, so closed pages never load the unit list
  return unseen && !fresh ? <OpenDialog L={L} lang={lang} seenKey={key} /> : null;
}

function OpenDialog({ L, lang, seenKey: key }: { L: ReturnType<typeof useL>; lang: Lang; seenKey: string }) {
  const releases = useReleases();
  return (
    <HubChangelogDialog
      open
      onClose={() => markSeen(key)}
      releases={releases}
      kindLabel={(k) => KIND_LABEL[k as ChangeKind][lang]}
      title={L("What's new", "更新情報")}
      closeLabel={L("Close", "閉じる")}
      footer={<Link to="/changelog" onClick={() => markSeen(key)}>{L("All changes", "すべての更新")}</Link>}
    />
  );
}

export default function Changelog() {
  const L = useL();
  const lang = useLang();
  const releases = useReleases();
  return (
    <div className="changelog-page">
      <h2>{L("What's new", "更新情報")}</h2>
      <ReleaseList releases={releases} kindLabel={(k) => KIND_LABEL[k as ChangeKind][lang]} />
    </div>
  );
}
