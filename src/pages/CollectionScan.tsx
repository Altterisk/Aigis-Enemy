import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UnitImage } from "../components";
import { loadJSONFile } from "../data";
import {
  AUTO_ACCEPT_DIST,
  cropDataUrl,
  scanScreenshotFile,
  unpackIconHashes,
  type IconHashDb,
} from "../iconMatch";
import type { UnitIndexEntry } from "../types";

const HASH_BITS = 264;

interface Candidate {
  unit: UnitIndexEntry;
  tier: number;
  dist: number;
  cropUrl: string;
  checked: boolean;
  alreadyOwned: boolean;
}

export default function ScreenshotImport({ byId, unitName, isOwned, onApply }: {
  byId: Map<number, UnitIndexEntry> | null;
  unitName: (unit: UnitIndexEntry) => string;
  isOwned: (unit: UnitIndexEntry) => boolean;
  onApply: (units: UnitIndexEntry[]) => void;
}) {
  const dbRef = useRef<IconHashDb | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [note, setNote] = useState("");

  const scanFiles = async (files: FileList | null) => {
    if (!files?.length || scanning) return;
    setScanning(true);
    setNote("");
    try {
      if (!dbRef.current) {
        setProgress("Loading icon database…");
        dbRef.current = unpackIconHashes(await loadJSONFile("icon_hashes"));
      }
      const db = dbRef.current;
      let found = 0;
      let unknown = 0;
      for (let fi = 0; fi < files.length; fi += 1) {
        const file = files[fi];
        const label = files.length > 1 ? `${file.name} (${fi + 1}/${files.length})` : file.name;
        const { matches, canvas } = await scanScreenshotFile(file, db, (fraction) => {
          setProgress(`Scanning ${label} — ${Math.round(fraction * 100)}%`);
        });
        found += matches.length;
        setCandidates((current) => {
          const next = [...current];
          matches.forEach((m) => {
            const unit = byId?.get(m.unitId);
            if (!unit || unit.npc) {
              unknown += Number(!unit);
              return;
            }
            const existing = next.findIndex((c) => c.unit.id === unit.id);
            if (existing >= 0 && next[existing].dist <= m.dist) return;
            const candidate: Candidate = {
              unit,
              tier: m.tier,
              dist: m.dist,
              cropUrl: cropDataUrl(canvas, m.rect),
              alreadyOwned: isOwned(unit),
              checked: m.dist <= AUTO_ACCEPT_DIST && !isOwned(unit),
            };
            if (existing >= 0) next[existing] = candidate;
            else next.push(candidate);
          });
          return next;
        });
      }
      setNote(found
        ? `Detected ${found} icon${found === 1 ? "" : "s"}.`
          + (unknown ? ` ${unknown} matched images are not in this export.` : "")
          + " Review below, then apply."
        : "No unit icons were recognized. Use a screenshot of the in-game unit list or base-unit selection.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "could not scan the screenshot");
    } finally {
      setScanning(false);
      setProgress("");
    }
  };

  const toggle = (id: number) => setCandidates((current) =>
    current.map((c) => (c.unit.id === id ? { ...c, checked: !c.checked } : c)));

  const selectable = candidates.filter((c) => !c.alreadyOwned);
  const selected = selectable.filter((c) => c.checked);

  const apply = () => {
    onApply(selected.map((c) => c.unit));
    setCandidates((current) => current.map((c) =>
      c.checked ? { ...c, checked: false, alreadyOwned: true } : c));
  };

  return (
    <details className="collection-transfer collection-scan">
      <summary>Import from screenshots (image recognition)</summary>
      <p className="muted small">
        Upload screenshots of the in-game unit list. Icons are recognized locally in your
        browser (nothing is uploaded) and matched units can be added as owned. Awakened
        and AW2 icons are recognized too.
      </p>
      <div className="collection-scan-controls">
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={scanning}
          onChange={(e) => {
            void scanFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {candidates.length > 0 && (
          <>
            <button type="button" disabled={scanning || !selected.length} onClick={apply}>
              add {selected.length} selected as owned
            </button>
            <button type="button" disabled={scanning} onClick={() => { setCandidates([]); setNote(""); }}>
              clear results
            </button>
          </>
        )}
      </div>
      {scanning && <p className="collection-message">{progress}</p>}
      {note && !scanning && <p className="collection-message">{note}</p>}
      {candidates.length > 0 && (
        <div className="collection-scan-grid">
          {candidates.map((c) => {
            const confidence = Math.round(100 * (1 - c.dist / HASH_BITS));
            const uncertain = c.dist > AUTO_ACCEPT_DIST;
            return (
              <label
                key={c.unit.id}
                className={`collection-scan-tile${c.alreadyOwned ? " owned" : c.checked ? " on" : ""}`}
                title={`match ${confidence}% (${c.dist}/${HASH_BITS} bits differ)`}
              >
                <input
                  type="checkbox"
                  checked={c.checked}
                  disabled={c.alreadyOwned}
                  onChange={() => toggle(c.unit.id)}
                />
                <img className="collection-scan-crop" src={c.cropUrl} alt="" />
                <span aria-hidden="true">→</span>
                <UnitImage kind="icon" id={c.unit.id} tier={c.tier} className="collection-scan-icon" alt="" />
                <span className="collection-scan-name">
                  <Link to={`/units/${c.unit.id}`}>{unitName(c.unit)}</Link>
                  <span className="muted small">
                    {c.alreadyOwned ? "already owned" : uncertain ? `uncertain match (${confidence}%)` : `${confidence}%`}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </details>
  );
}
