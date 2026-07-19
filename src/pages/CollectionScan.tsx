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
const MAX_FILES = 10;

interface Candidate {
  unit: UnitIndexEntry;
  tier: number;
  dist: number;
  cropUrl: string;
  checked: boolean;
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

  const scanFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || scanning) return;
    const files = [...fileList].slice(0, MAX_FILES);
    setScanning(true);
    setNote("");
    try {
      if (!dbRef.current) {
        setProgress("Loading icon database…");
        dbRef.current = unpackIconHashes(await loadJSONFile("icon_hashes"));
      }
      const db = dbRef.current;
      // confident matches are applied directly; only uncertain ones are
      // queued for review. addedIds treats units applied earlier in this
      // batch as owned (the isOwned prop closes over pre-apply state).
      const autoAdd = new Map<number, UnitIndexEntry>();
      const review = new Map<number, Candidate>();
      const addedIds = new Set<number>();
      let alreadyOwned = 0;
      let unknown = 0;
      for (let fi = 0; fi < files.length; fi += 1) {
        const file = files[fi];
        const label = files.length > 1 ? `${file.name} (${fi + 1}/${files.length})` : file.name;
        const { matches, canvas } = await scanScreenshotFile(file, db, (fraction) => {
          setProgress(`Scanning ${label} — ${Math.round(fraction * 100)}%`);
        });
        matches.forEach((m) => {
          const unit = byId?.get(m.unitId);
          if (!unit) {
            unknown += 1;
            return;
          }
          if (unit.npc) return;
          if (isOwned(unit) || addedIds.has(unit.id)) {
            alreadyOwned += 1;
            return;
          }
          if (m.dist <= AUTO_ACCEPT_DIST) {
            autoAdd.set(unit.id, unit);
            addedIds.add(unit.id);
            review.delete(unit.id);
            return;
          }
          const existing = review.get(unit.id);
          if (existing && existing.dist <= m.dist) return;
          review.set(unit.id, {
            unit,
            tier: m.tier,
            dist: m.dist,
            cropUrl: cropDataUrl(canvas, m.rect),
            checked: false,
          });
        });
      }
      if (autoAdd.size) onApply([...autoAdd.values()]);
      setCandidates([...review.values()]);
      const parts = [
        autoAdd.size
          ? `Added ${autoAdd.size} unit${autoAdd.size === 1 ? "" : "s"} automatically.`
          : "No confident new matches.",
        review.size ? `${review.size} uncertain match${review.size === 1 ? "" : "es"} below — check the correct ones.` : "",
        alreadyOwned ? `${alreadyOwned} already owned.` : "",
        unknown ? `${unknown} matched images are not in this export.` : "",
        fileList.length > MAX_FILES ? `Only the first ${MAX_FILES} screenshots were scanned.` : "",
      ].filter(Boolean);
      setNote(autoAdd.size || review.size || alreadyOwned
        ? parts.join(" ")
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

  const selected = candidates.filter((c) => c.checked);

  const apply = () => {
    onApply(selected.map((c) => c.unit));
    setCandidates((current) => current.filter((c) => !c.checked));
  };

  return (
    <details className="collection-transfer collection-scan">
      <summary>Import from screenshots (image recognition)</summary>
      <p className="muted small">
        Upload up to {MAX_FILES} screenshots of the in-game unit list. Icons are recognized
        locally in your browser (nothing is uploaded); confident matches are added as owned
        right away, uncertain ones are listed for review. Awakened and AW2 icons are
        recognized too.
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
              dismiss
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
            return (
              <label
                key={c.unit.id}
                className={`collection-scan-tile${c.checked ? " on" : ""}`}
                title={`match ${confidence}% (${c.dist}/${HASH_BITS} bits differ)`}
              >
                <input type="checkbox" checked={c.checked} onChange={() => toggle(c.unit.id)} />
                <img className="collection-scan-crop" src={c.cropUrl} alt="" />
                <span aria-hidden="true">→</span>
                <UnitImage kind="icon" id={c.unit.id} tier={c.tier} className="collection-scan-icon" alt="" />
                <span className="collection-scan-name">
                  <Link to={`/units/${c.unit.id}`}>{unitName(c.unit)}</Link>
                  <span className="muted small">uncertain ({confidence}%)</span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </details>
  );
}
