import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

// The influence-audit worklist (data/influence_audit.json, built by
// python/export_influence_audit.py). Lists EVERY influence id in use across
// all four namespaces with its label status, the distinct param signatures
// seen (the same id can encode different meanings per signature), and example
// carriers to check in-game: units for skill/ability ids, stage + enemy for
// specialty ids, stage for term ids.

interface AuditExample {
  unit?: number;
  name?: string;
  slot?: string;
  quest?: number;
  enemy?: number;
  speff?: number;
}
interface AuditSignature {
  sig: string;
  count: number;
  values: (number | null)[][];
  examples: AuditExample[];
}
interface AuditLabel {
  name?: string;
  verified?: boolean;
  note?: string;
  hidden?: boolean;
}
interface AuditEntry {
  count: number;
  label?: AuditLabel | null;
  signatures: AuditSignature[];
  examples: AuditExample[];
}
interface Audit {
  generated?: string;
  namespaces: Record<string, Record<string, AuditEntry>>;
}

const NAMESPACES = ["skill", "ability", "specialty", "term"] as const;
type Namespace = (typeof NAMESPACES)[number];
// which raw fields the signature keys refer to, per namespace.
const SIG_HELP: Record<Namespace, string> = {
  skill: "signature keys = which of mul / mul2 / mul3 / add are set; values are [mul, mul2, mul3, add]",
  ability: "signature keys = which of Param_1..4 are set; values are the params array",
  specialty: "signature keys = which of Param_1..4 are set; values are the params array",
  term: "signature keys = which of Data_Param1..4 are set; values are the params array",
};

type Status = "unlabeled" | "unverified" | "verified";
function statusOf(e: AuditEntry): Status {
  if (!e.label) return "unlabeled";
  return e.label.verified ? "verified" : "unverified";
}

function ExampleLink({ ex }: { ex: AuditExample }) {
  if (ex.unit != null) {
    return (
      <Link to={`/units/${ex.unit}`}>
        #{ex.unit} {ex.name}
        {ex.slot ? <span className="muted"> — {ex.slot}</span> : null}
      </Link>
    );
  }
  if (ex.quest != null) {
    return (
      <Link to={`/stages/${ex.quest}`}>
        {ex.name || `quest ${ex.quest}`}
        {ex.enemy != null ? <span className="muted"> — enemy E{ex.enemy}{ex.speff ? ` (SpEff ${ex.speff})` : ""}</span> : null}
      </Link>
    );
  }
  return null;
}

function EntryRow({
  id, entry, note, onNote,
}: {
  id: string; entry: AuditEntry;
  note: string; onNote: (text: string) => void;
}) {
  const status = statusOf(entry);
  return (
    <details className="admin-entry">
      <summary>
        <code className="admin-id">{id}</code>
        <span className={`admin-status admin-status--${status}`}>{status}</span>
        <span className="admin-count">{entry.count.toLocaleString()}×</span>
        {entry.label?.name && <span className="admin-label">{entry.label.name}</span>}
        {note && <span className="admin-has-note" title={note}>📝</span>}
        <span className="muted small">
          {entry.signatures.length} signature{entry.signatures.length !== 1 ? "s" : ""}
        </span>
      </summary>
      {entry.label?.note && <p className="muted small admin-note">{entry.label.note}</p>}
      <textarea
        className="admin-note-input"
        placeholder="your test notes for this id… (saved in this browser as you type)"
        value={note}
        onChange={(e) => onNote(e.target.value)}
      />
      {entry.signatures.map((s) => (
        <div className="admin-sig" key={s.sig}>
          <div>
            <code>{s.sig}</code> <span className="muted small">{s.count}×</span>
            {s.values.length > 0 && (
              <span className="params small">
                {" "}values: {s.values.map((v) => `[${v.map((x) => x ?? "·").join(",")}]`).join(" ")}
              </span>
            )}
          </div>
          <ul className="admin-examples">
            {s.examples.map((ex, i) => (
              <li key={i}><ExampleLink ex={ex} /></li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  );
}

// per-id verification notes, persisted in localStorage keyed "<ns>:<id>".
const NOTES_KEY = "aigis-influence-notes";
function loadNotes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function Admin() {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [failed, setFailed] = useState(false);
  const [ns, setNs] = useState<Namespace>("skill");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"count" | "id">("count");
  const [notes, setNotes] = useState<Record<string, string>>(loadNotes);

  const setNote = (key: string, text: string) => {
    setNotes((prev) => {
      const next = { ...prev };
      if (text) next[key] = text;
      else delete next[key];
      localStorage.setItem(NOTES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const downloadNotes = () => {
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "influence_notes.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/influence_audit.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setAudit)
      .catch(() => setFailed(true));
  }, []);

  const rows = useMemo(() => {
    const table = audit?.namespaces?.[ns] || {};
    const term = q.trim().toLowerCase();
    let out = Object.entries(table).filter(([id, e]) => {
      if (status !== "all" && statusOf(e) !== status) return false;
      if (term) {
        const hay = `${id} ${e.label?.name || ""} ${e.label?.note || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    out = out.sort(([a, ea], [b, eb]) =>
      sort === "count" ? eb.count - ea.count : Number(a) - Number(b)
    );
    return out;
  }, [audit, ns, status, q, sort]);

  if (failed) {
    return (
      <p className="muted">
        influence_audit.json not found — run <code>python export_influence_audit.py</code> first.
      </p>
    );
  }
  if (!audit) return <p className="loading">Loading audit…</p>;

  const counts = { all: 0, unlabeled: 0, unverified: 0, verified: 0 };
  for (const e of Object.values(audit.namespaces?.[ns] || {})) {
    counts.all++;
    counts[statusOf(e)]++;
  }

  return (
    <div>
      <h2>Influence audit</h2>
      <p className="muted small">
        generated {audit.generated} · every influence id in live use, its label status, the
        distinct param signatures seen, and example carriers to verify in-game.
        {" "}{SIG_HELP[ns]}
      </p>
      <div className="toolbar">
        <select value={ns} onChange={(e) => setNs(e.target.value as Namespace)}>
          {NAMESPACES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">all ({counts.all})</option>
          <option value="unlabeled">unlabeled ({counts.unlabeled})</option>
          <option value="unverified">labeled, unverified ({counts.unverified})</option>
          <option value="verified">verified ({counts.verified})</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="count">by usage count</option>
          <option value="id">by id</option>
        </select>
        <input
          placeholder="filter id / label text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="admin-dl-btn" onClick={downloadNotes}
          title="download all saved notes as influence_notes.json">
          ⬇ notes ({Object.keys(notes).length})
        </button>
        <span className="count">{rows.length} ids</span>
      </div>
      <div className="admin-list">
        {rows.map(([id, e]) => (
          <EntryRow
            id={id} entry={e} key={`${ns}-${id}`}
            note={notes[`${ns}:${id}`] || ""}
            onNote={(text) => setNote(`${ns}:${id}`, text)}
          />
        ))}
      </div>
    </div>
  );
}
