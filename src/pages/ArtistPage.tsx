import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useUnits, loadJSONFile } from "../data";
import { SearchBox } from "@altterisk/game-hub";
import { UnitImage } from "../components";
import type { ArtistLinks, UnitIndexEntry } from "../types";

const UNKNOWN = "Unknown";

// case-, width- and kana-insensitive form for search matching
const fold = (s: string) =>
  s.normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

// /artists -- every artist (card.Illust credit) with their profile links
// and the units they drew, most units first; units without a credit are
// grouped under "Unknown" at the end. ?artist=<name> scrolls to and
// highlights that artist's row; ?q= keeps the rows whose artist name or any
// unit name (JP / EN) contains the query.
export default function ArtistPage() {
  const { loading, units } = useUnits();
  const [params, setParams] = useSearchParams();
  const focus = params.get("artist");
  const q = params.get("q") || "";
  const setQ = (v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set("q", v); else next.delete("q");
    setParams(next, { replace: true });
  };
  const [links, setLinks] = useState<ArtistLinks | null>(null);

  useEffect(() => {
    loadJSONFile<ArtistLinks>("artist_links").then(setLinks).catch(() => setLinks({}));
  }, []);

  const groups = new Map<string, UnitIndexEntry[]>();
  for (const u of units || []) {
    if (u.prince && u.id !== 1) continue;
    const key = u.artist || UNKNOWN;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(u);
  }
  const artists = [...groups.entries()].sort(([a, ua], [b, ub]) =>
    Number(a === UNKNOWN) - Number(b === UNKNOWN) || ub.length - ua.length || a.localeCompare(b, "ja")
  );

  const needle = fold(q.trim());
  const shown = needle
    ? artists.filter(([name, list]) =>
        fold(name).includes(needle) ||
        list.some((u) => fold(u.name || "").includes(needle) || fold(u.name_en || "").includes(needle)))
    : artists;

  // after the links load too: they set the row heights above the target
  useEffect(() => {
    if (loading || !links || !focus) return;
    document.querySelector(`[data-artist="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: "start" });
  }, [loading, links, focus]);

  if (loading) return <p className="loading">Loading units…</p>;

  return (
    <div>
      <h2>Artists</h2>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search artist / unit name" />
        <span className="count">{shown.length.toLocaleString()} artists</span>
      </div>
      <table className="grid artist-table">
        <thead><tr><th>Artist</th><th>Links</th><th>Units</th></tr></thead>
        <tbody>
          {shown.map(([name, list]) => (
            <tr key={name} data-artist={name} className={name === focus ? "focused" : undefined}>
              <td className="artist-name">{name} <span className="muted small">({list.length})</span></td>
              <td className="artist-links">
                {(links?.[name] || []).map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
                ))}
              </td>
              <td>
                <div className="artist-units">
                  {list.sort((a, b) => a.id - b.id).map((u) => (
                    <Link key={u.id} to={`/units/${u.id}`} title={`#${u.id} ${u.name_en || u.name || ""}`}>
                      <UnitImage kind="icon" id={u.id} className="unit-icon-mini" alt={String(u.id)} />
                    </Link>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
