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
import { useL } from "../i18n";

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
  const L = useL();

  const scanFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || scanning) return;
    const files = [...fileList].slice(0, MAX_FILES);
    setScanning(true);
    setNote("");
    try {
      if (!dbRef.current) {
        setProgress(L("Loading icon database…", "アイコンのデータベースを読み込み中…"));
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
          setProgress(L("Scanning {f} — {p}%", "{f} を解析中 — {p}%", { f: label, p: Math.round(fraction * 100) }));
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
          ? L("Added {n} unit(s) automatically.", "{n} ユニットを自動で追加しました。", { n: autoAdd.size })
          : L("No confident new matches.", "確実な新規一致はありません。"),
        review.size ? L("{n} uncertain match(es) below — check the correct ones.", "下に不確かな一致が {n} 件あります — 正しいものにチェックしてください。", { n: review.size }) : "",
        alreadyOwned ? L("{n} already owned.", "{n} 件は所持済みです。", { n: alreadyOwned }) : "",
        unknown ? L("{n} matched images are not in this export.", "{n} 件の画像はこのデータにありません。", { n: unknown }) : "",
        fileList.length > MAX_FILES ? L("Only the first {n} screenshots were scanned.", "最初の {n} 枚だけを解析しました。", { n: MAX_FILES }) : "",
      ].filter(Boolean);
      setNote(autoAdd.size || review.size || alreadyOwned
        ? parts.join(" ")
        : L("No unit icons were recognized. Use a screenshot of the in-game unit list or base-unit selection.", "ユニットのアイコンを認識できませんでした。ゲーム内のユニット一覧のスクリーンショットを使ってください。"));
    } catch (error) {
      setNote(error instanceof Error ? error.message : L("could not scan the screenshot", "スクリーンショットを解析できませんでした"));
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
      <summary>{L("Import from screenshots (image recognition)", "スクリーンショットから取り込み (画像認識)")}</summary>
      <p className="muted small">
        {L("Upload up to {n} screenshots of the in-game unit list. Icons are recognized locally in your browser (nothing is uploaded); confident matches are added as owned right away, uncertain ones are listed for review. Awakened and AW2 icons are recognized too.", "ゲーム内のユニット一覧のスクリーンショットを最大 {n} 枚まで選んでください。アイコンはブラウザ内で認識します (アップロードはされません)。確実な一致はすぐ所持に追加し、不確かなものは確認用に表示します。覚醒・第二覚醒のアイコンも認識します。", { n: MAX_FILES })}
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
              {L("add {n} selected as owned", "選択した {n} 件を所持に追加", { n: selected.length })}
            </button>
            <button type="button" disabled={scanning} onClick={() => { setCandidates([]); setNote(""); }}>
              {L("dismiss", "閉じる")}
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
                title={L("match {c}% ({d}/{b} bits differ)", "一致度 {c}% ({d}/{b} ビット相違)", { c: confidence, d: c.dist, b: HASH_BITS })}
              >
                <input type="checkbox" checked={c.checked} onChange={() => toggle(c.unit.id)} />
                <img className="collection-scan-crop" src={c.cropUrl} alt="" />
                <span aria-hidden="true">→</span>
                <UnitImage kind="icon" id={c.unit.id} tier={c.tier} className="collection-scan-icon" alt="" />
                <span className="collection-scan-name">
                  <Link to={`/units/${c.unit.id}`}>{unitName(c.unit)}</Link>
                  <span className="muted small">{L("uncertain ({c}%)", "不確か ({c}%)", { c: confidence })}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </details>
  );
}
