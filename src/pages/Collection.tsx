import { useMemo, useState } from "react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { UnitImage } from "../components";
import { loadJSONFile, useLocalisation, useUnits } from "../data";
import { useUiStore } from "../store";
import type { UnitIndexEntry } from "../types";

const CODE_PREFIX = "AIGC3.";
const V2_CODE_PREFIX = "AIGC2.";
const LEGACY_CODE_PREFIX = "AIGC1.";
const UI_ASSET = `${import.meta.env.BASE_URL}ui/`;
const PRINCE_NAME_OVERRIDES: Record<number, string> = {
  741: "Chibi Prince",
  1111: "Prince (Gungnir)",
  1135: "Prince (Nandi)",
  2408: "Prince (Kung Fu)",
};

function collectionName(unit: UnitIndexEntry): string {
  return unit.name_en || PRINCE_NAME_OVERRIDES[unit.id] || unit.name || `(unit #${unit.id})`;
}

function collectionRarity(rarity: string): string {
  return rarity;
}

function rarityGroup(unit: UnitIndexEntry): string {
  if (unit.genus_id === 108) return "Chibi";
  if ((unit.rarity === "Black" || unit.rarity === "Platinum") && unit.acquisition) {
    return `${unit.rarity} — ${unit.acquisition === "gacha_paid" ? "Gacha / Paid" : "Event"}`;
  }
  return unit.rarity;
}

const RARITY_GROUP_ORDER: Record<string, number> = {
  "Black Hero": 100,
  "Black — Gacha / Paid": 95,
  "Black — Event": 94,
  "Platinum Hero": 90,
  "Platinum — Gacha / Paid": 85,
  "Platinum — Event": 84,
  Chibi: 75,
  Support: 72,
  Gold: 70,
  Silver: 60,
  Bronze: 50,
  Iron: 40,
};

function isCollectionPrince(unit: UnitIndexEntry): boolean {
  return Boolean(unit.prince || unit.class === "ちび王子" || /^王子【/.test(unit.class || ""));
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
}

function pushVarint(out: number[], value: number) {
  let n = value >>> 0;
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
}

function pushIdList(out: number[], values: number[]) {
  const sorted = uniqueSorted(values);
  pushVarint(out, sorted.length);
  let previous = 0;
  sorted.forEach((id) => {
    pushVarint(out, id - previous);
    previous = id;
  });
}

function pushCompactIdList(out: number[], values: number[]) {
  const sorted = uniqueSorted(values);
  const deltas: number[] = [];
  pushIdList(deltas, sorted);
  const bitset = sorted.length ? new Array(Math.floor(sorted[sorted.length - 1] / 8) + 1).fill(0) : [];
  sorted.forEach((id) => { bitset[Math.floor(id / 8)] |= 1 << (id % 8); });
  const bitsetLength: number[] = [];
  pushVarint(bitsetLength, bitset.length);
  if (bitset.length && bitset.length + bitsetLength.length < deltas.length) {
    out.push(1, ...bitsetLength, ...bitset);
  } else {
    out.push(0, ...deltas);
  }
}

function checksum(bytes: number[]): number {
  let hash = 0x811c9dc5;
  bytes.forEach((byte) => {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  });
  return hash >>> 0;
}

function encodeCollection(
  unitIds: number[],
  princeDots: number[],
  hall: Record<number, number>,
  bondDone: number[]
): string {
  const payload: number[] = [];
  pushCompactIdList(payload, unitIds);
  pushCompactIdList(payload, princeDots);
  pushCompactIdList(payload, Object.keys(hall).map(Number).filter((id) => hall[id] === 1));
  pushCompactIdList(payload, Object.keys(hall).map(Number).filter((id) => hall[id] === 2));
  pushCompactIdList(payload, Object.keys(hall).map(Number).filter((id) => hall[id] === 3));
  pushCompactIdList(payload, bondDone);
  const sum = checksum(payload);
  payload.push(sum & 0xff, (sum >>> 8) & 0xff, (sum >>> 16) & 0xff, (sum >>> 24) & 0xff);
  const binary = String.fromCharCode(...payload);
  return CODE_PREFIX + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCollection(code: string): {
  unitIds: number[];
  princeDots: number[];
  hall: Record<number, number>;
  bondDone: number[];
} {
  const compact = code.trim();
  const prefix = compact.startsWith(CODE_PREFIX)
    ? CODE_PREFIX
    : compact.startsWith(V2_CODE_PREFIX) ? V2_CODE_PREFIX
      : compact.startsWith(LEGACY_CODE_PREFIX) ? LEGACY_CODE_PREFIX : "";
  if (!prefix) throw new Error("not an Aigis collection code");
  const encoded = compact.slice(prefix.length).replace(/-/g, "+").replace(/_/g, "/");
  const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
  let bytes: number[];
  try {
    bytes = [...atob(padded)].map((char) => char.charCodeAt(0));
  } catch {
    throw new Error("invalid collection code");
  }
  if (bytes.length < 6) throw new Error("collection code is incomplete");
  const body = bytes.slice(0, -4);
  const tail = bytes.length - 4;
  const stored = (bytes[tail] | (bytes[tail + 1] << 8) | (bytes[tail + 2] << 16) | (bytes[tail + 3] << 24)) >>> 0;
  if (checksum(body) !== stored) throw new Error("collection code is damaged or mistyped");

  let cursor = 0;
  const readVarint = () => {
    let value = 0;
    let shift = 0;
    while (cursor < body.length && shift <= 28) {
      const byte = body[cursor++];
      value += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return value;
      shift += 7;
    }
    throw new Error("invalid collection code data");
  };
  const readIdList = () => {
    const count = readVarint();
    if (count > 10000) throw new Error("collection code contains too many entries");
    const result: number[] = [];
    let previous = 0;
    for (let i = 0; i < count; i += 1) {
      const id = previous + readVarint();
      if (id <= previous || id > 10_000_000) throw new Error("invalid collection id");
      result.push(id);
      previous = id;
    }
    return result;
  };

  const readCompactIdList = () => {
    const mode = body[cursor++];
    if (mode === 0) return readIdList();
    if (mode !== 1) throw new Error("unsupported collection list encoding");
    const length = readVarint();
    if (length > 1_250_001 || cursor + length > body.length) {
      throw new Error("invalid collection bitset");
    }
    const result: number[] = [];
    for (let byteIndex = 0; byteIndex < length; byteIndex += 1) {
      const byte = body[cursor + byteIndex];
      for (let bit = 0; bit < 8; bit += 1) {
        const id = byteIndex * 8 + bit;
        if (id > 0 && (byte & (1 << bit)) !== 0) result.push(id);
      }
    }
    cursor += length;
    if (result.length > 10000) throw new Error("collection code contains too many entries");
    return result;
  };

  const readList = prefix === CODE_PREFIX ? readCompactIdList : readIdList;
  const unitIds = readList();
  const princeDots = readList();
  const hall: Record<number, number> = {};
  let bondDone: number[] = [];
  if (prefix === CODE_PREFIX || prefix === V2_CODE_PREFIX) {
    readList().forEach((id) => { hall[id] = 1; });
    readList().forEach((id) => { hall[id] = 2; });
    readList().forEach((id) => { hall[id] = 3; });
    bondDone = readList();
  }
  if (cursor !== body.length) throw new Error("collection code has unsupported data");
  return { unitIds, princeDots, hall, bondDone };
}

function decodeCharaStatOwned(input: string): number[] {
  const value = input.trim();
  const match = value.match(/[?&]oryu=([^&#\s]+)/);
  const encoded = decodeURIComponent(match ? match[1] : value).replace(/-/g, "+").replace(/_/g, "/");
  if (!encoded || !/^[A-Za-z0-9+/=]+$/.test(encoded)) {
    throw new Error("not a valid chara-stat.us checker URL or oryu code");
  }
  const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
  let bytes: number[];
  try {
    bytes = [...atob(padded)].map((char) => char.charCodeAt(0));
  } catch {
    throw new Error("invalid chara-stat.us oryu code");
  }
  const ids: number[] = [];
  bytes.forEach((byte, byteIndex) => {
    for (let bit = 0; bit < 8; bit += 1) {
      const id = byteIndex * 8 + bit;
      if (id > 0 && (byte & (1 << bit)) !== 0) ids.push(id);
    }
  });
  return ids;
}

function toggleNumber(values: number[], value: number): number[] {
  return values.includes(value) ? values.filter((n) => n !== value) : [...values, value];
}

function FilterGroup({
  title, options, selected, onToggle,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div className="filter-group">
      <div className="filter-group-title">{title}</div>
      <div className="filter-group-options">
        {options.map((option) => (
          <label key={option.value} className={`cg-pill${selected.includes(option.value) ? " on" : ""}`}>
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => onToggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

const POSITION_OPTIONS = [
  { value: "melee", label: "Melee" },
  { value: "ranged", label: "Ranged" },
  { value: "omni", label: "Omni" },
];
const GENDER_OPTIONS = [
  { value: "Female", label: "Female" },
  { value: "Male", label: "Male" },
];

function ProgressMeter({ value, total, label }: { value: number; total: number; label: string }) {
  const percent = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <span
      className="collection-progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
    >
      <span className="collection-progress-fill" style={{ width: `${percent}%` }} />
    </span>
  );
}

function ProgressRow({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <div className="collection-progress-row">
      <span>{label}</span>
      <strong>{value.toLocaleString()} / {total.toLocaleString()}</strong>
      <ProgressMeter value={value} total={total} label={`${label}: ${value} of ${total}`} />
    </div>
  );
}

function BondProgress({ completed, have, total }: { completed: number; have: number; total: number }) {
  const havePercent = total > 0 ? Math.min(100, (have / total) * 100) : 0;
  const completedPercent = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
  return (
    <div className="collection-progress-row collection-bond-progress">
      <span>Bond quests</span>
      <strong>{completed.toLocaleString()} completed / {have.toLocaleString()} have / {total.toLocaleString()} all</strong>
      <span
        className="collection-progress-track"
        role="progressbar"
        aria-label={`Bond quests: ${completed} completed, ${have} owned, ${total} total`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
      >
        <span className="collection-progress-fill bond-have" style={{ width: `${havePercent}%` }} />
        <span className="collection-progress-fill bond-completed" style={{ width: `${completedPercent}%` }} />
      </span>
    </div>
  );
}

function CollectionGroupSummary({ title, selected, total, onSelectAll, onClear }: {
  title: string;
  selected: number;
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <summary className="collection-group-head">
      <span className="collection-accordion-chevron" aria-hidden="true" />
      <h3>{title}</h3>
      <span className="collection-section-progress">
        <ProgressMeter value={selected} total={total} label={`${title}: ${selected} of ${total} shown selected`} />
        <span>{selected} / {total}</span>
      </span>
      <span className="collection-group-meta">
        <span className="collection-section-actions">
          <button
            type="button"
            disabled={total === 0 || selected === total}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onSelectAll(); }}
          >Select all</button>
          <button
            type="button"
            disabled={selected === 0}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClear(); }}
          >Deselect all</button>
        </span>
        <span className="collection-accordion-action">
          <span className="when-open">Collapse</span>
          <span className="when-closed">Expand</span>
          {" section"}
        </span>
      </span>
    </summary>
  );
}

function CollectionTile({
  unit, owned, onToggle, subtitle, hallState, onHallChange, hasBondQuest, bondDone, onBondToggle,
}: {
  unit: UnitIndexEntry;
  owned: boolean;
  onToggle: () => void;
  subtitle?: string;
  hallState?: number;
  onHallChange?: (next: number) => void;
  hasBondQuest?: boolean;
  bondDone?: boolean;
  onBondToggle?: () => void;
}) {
  const hasHallBranches = unit.rarity.startsWith("Black") && unit.aw2_branches === 2;
  const currentHall = hallState || 0;
  return (
    <article className={`collection-tile${owned ? " owned" : ""}`}>
      <button
        type="button"
        className="collection-tile-select"
        onClick={onToggle}
        aria-pressed={owned}
        title={`${owned ? "remove" : "add"} ${collectionName(unit)}`}
      >
        <span className="collection-check" aria-hidden="true">{owned ? "✓" : ""}</span>
        <UnitImage kind="icon" id={unit.id} className="collection-icon" alt="" />
      </button>
      <Link className="collection-tile-name" to={`/units/${unit.id}`}>{collectionName(unit)}</Link>
      <span className="collection-tile-sub">{subtitle || `#${unit.id} · ${unit.implementation_date || unit.release_year || "?"}`}</span>
      {(onHallChange || hasBondQuest) && (
        <span className="collection-marks">
          {onHallChange && hasHallBranches && ([1, 2] as const).map((path) => {
            const active = (currentHall & path) !== 0;
            return (
              <button
                type="button"
                key={path}
                className={`collection-mark-btn hall active-path-${path}${active ? " active" : ""}`}
                onClick={() => onHallChange(currentHall ^ path)}
                aria-pressed={active}
                title={`${active ? "Clear" : "Mark"} Hall of Fame for AW2 path ${path}`}
              >
                <img src={`${UI_ASSET}hall-f${path}.png`} alt="" aria-hidden="true" />
              </button>
            );
          })}
          {onHallChange && !hasHallBranches && (
            <button
              type="button"
              className={`collection-mark-btn hall${currentHall ? " active" : ""}`}
              onClick={() => onHallChange(currentHall ? 0 : 1)}
              aria-pressed={currentHall > 0}
              title={currentHall ? "Hall of Fame completed — click to clear" : "Mark Hall of Fame completed"}
            >
              <img src={`${UI_ASSET}hall-f0.png`} alt="" aria-hidden="true" />
            </button>
          )}
          {hasBondQuest && onBondToggle && (
            <button
              type="button"
              className={`collection-mark-btn bond${bondDone ? " active" : ""}`}
              onClick={onBondToggle}
              aria-pressed={bondDone}
              title={bondDone ? "Bond quest completed — click to clear" : "Mark bond quest completed"}
            >
              <img src={`${UI_ASSET}bond-quest.png`} alt="" aria-hidden="true" />
            </button>
          )}
        </span>
      )}
    </article>
  );
}

export default function Collection() {
  const { loading, units, byId } = useUnits();
  const loc = useLocalisation();
  const owned = useUiStore((s) => s.collectionOwned);
  const setOwned = useUiStore((s) => s.setCollectionOwned);
  const princeDots = useUiStore((s) => s.collectionPrinceDots);
  const setPrinceDots = useUiStore((s) => s.setCollectionPrinceDots);
  const hall = useUiStore((s) => s.collectionHall);
  const setHall = useUiStore((s) => s.setCollectionHall);
  const bondDone = useUiStore((s) => s.collectionBondDone);
  const setBondDone = useUiStore((s) => s.setCollectionBondDone);
  const [bondQuestIds, setBondQuestIds] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [bondStatus, setBondStatus] = useState<"all" | "available" | "completed" | "incomplete">("all");
  const [rarityFilters, setRarityFilters] = useState<string[]>([]);
  const [positionFilters, setPositionFilters] = useState<string[]>([]);
  const [genderFilters, setGenderFilters] = useState<string[]>([]);
  const [factionFilters, setFactionFilters] = useState<string[]>([]);
  const [raceFilters, setRaceFilters] = useState<string[]>([]);
  const [attributeFilters, setAttributeFilters] = useState<string[]>([]);
  const [seasonFilters, setSeasonFilters] = useState<string[]>([]);
  const [yearFilters, setYearFilters] = useState<string[]>([]);
  const [status, setStatus] = useState<"all" | "owned" | "missing">("all");
  const [groupBy, setGroupBy] = useState<"rarity" | "implementation">("rarity");
  const [sortBy, setSortBy] = useState<"id" | "implementation" | "class">("id");
  const [reverseSort, setReverseSort] = useState(false);
  const [restoreCode, setRestoreCode] = useState("");
  const [charaStatCode, setCharaStatCode] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    loadJSONFile<number[]>("bond_quest_ids")
      .then((ids) => { if (alive) setBondQuestIds(new Set(ids)); })
      .catch(() => { if (alive) setBondQuestIds(new Set()); });
    return () => { alive = false; };
  }, []);

  const supportUnits = useMemo(
    () => (units || []).filter((unit) => !unit.npc && unit.support),
    [units]
  );
  const normalUnits = useMemo(
    () => (units || []).filter((unit) => !unit.npc && !unit.support && !isCollectionPrince(unit)),
    [units]
  );
  const princeUnits = useMemo(
    () => (units || []).filter((unit) => !unit.npc && isCollectionPrince(unit)),
    [units]
  );
  const princeGroups = useMemo(() => {
    const parent = princeUnits.map((_, index) => index);
    const find = (index: number): number => {
      if (parent[index] !== index) parent[index] = find(parent[index]);
      return parent[index];
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };
    const byDot = new Map<number, number>();
    const byTitleClass = new Map<string, number>();
    princeUnits.forEach((unit, index) => {
      const dotMatch = byDot.get(unit.dot_id);
      if (dotMatch != null) union(index, dotMatch); else byDot.set(unit.dot_id, index);
      if (unit.class) {
        const titleClass = unit.class.replace(/Lv\d+$/, "");
        const titleMatch = byTitleClass.get(titleClass);
        if (titleMatch != null) union(index, titleMatch); else byTitleClass.set(titleClass, index);
      }
    });
    const groups = new Map<number, UnitIndexEntry[]>();
    princeUnits.forEach((unit, index) => {
      const root = find(index);
      groups.set(root, [...(groups.get(root) || []), unit]);
    });
    return [...groups.values()].map((members) => {
      members.sort((a, b) => a.id - b.id);
      const dots = uniqueSorted(members.map((unit) => unit.dot_id));
      return { members, dots, canonicalDot: dots[0], unit: members[0] };
    });
  }, [princeUnits]);
  const supportGroups = useMemo(() => {
    const groups = new Map<number, UnitIndexEntry[]>();
    supportUnits.forEach((unit) => groups.set(unit.dot_id, [...(groups.get(unit.dot_id) || []), unit]));
    return [...groups.entries()].map(([dot, members]) => {
      members.sort((a, b) => a.id - b.id);
      return { dot, members, unit: members[0] };
    });
  }, [supportUnits]);

  const ownedSet = useMemo(() => new Set(owned), [owned]);
  const princeSet = useMemo(() => new Set(princeDots), [princeDots]);
  const bondDoneSet = useMemo(() => new Set(bondDone), [bondDone]);
  const filterOptions = useMemo(() => {
    const all = [...normalUnits, ...supportUnits, ...princeUnits];
    const strings = (values: (string | null | undefined)[], labels?: Record<string, string>) =>
      [...new Set(values.filter((value): value is string => Boolean(value)))]
        .sort((a, b) => (labels?.[a] || a).localeCompare(labels?.[b] || b))
        .map((value) => ({ value, label: labels?.[value] || value }));
    const classes = strings(all.flatMap((unit) => unit.class_names || []), loc?.classes);
    const rarities = strings(all.map((unit) => collectionRarity(unit.rarity)));
    const factions = strings(all.map((unit) => unit.faction), loc?.races);
    const races = strings(all.map((unit) => unit.race), loc?.races);
    const attributes = strings(all.flatMap((unit) => unit.identity_tags || []), loc?.tags);
    const seasons = strings(all.map((unit) => unit.genus), loc?.tags);
    const years = [...new Set(all.map((unit) => unit.release_year).filter((value): value is number => Boolean(value)))]
      .sort((a, b) => a - b).map((value) => ({ value: String(value), label: String(value) }));
    return { classes, rarities, factions, races, attributes, seasons, years };
  }, [normalUnits, supportUnits, princeUnits, loc]);

  const toggleFilter = (values: string[], setValues: (next: string[]) => void, value: string) =>
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);

  const matches = (unit: UnitIndexEntry, isOwned: boolean) => {
    const term = query.trim().toLowerCase();
    if (term) {
      const haystack = [unit.id, unit.name, collectionName(unit), unit.class].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    if (classFilter && !(unit.class_names || []).includes(classFilter)) return false;
    const hasBondQuest = bondQuestIds.has(unit.id);
    const hasCompletedBondQuest = bondDoneSet.has(unit.id);
    if (bondStatus === "available" && !hasBondQuest) return false;
    if (bondStatus === "completed" && (!hasBondQuest || !hasCompletedBondQuest)) return false;
    if (bondStatus === "incomplete" && (!hasBondQuest || hasCompletedBondQuest)) return false;
    if (rarityFilters.length && !rarityFilters.includes(collectionRarity(unit.rarity))) return false;
    if (positionFilters.length && !positionFilters.includes(unit.position || "")) return false;
    if (genderFilters.length && !genderFilters.includes(String(unit.gender))) return false;
    if (factionFilters.length && !(unit.faction && factionFilters.includes(unit.faction))) return false;
    if (raceFilters.length && !(unit.race && raceFilters.includes(unit.race))) return false;
    if (attributeFilters.length && !(unit.identity_tags || []).some((tag) => attributeFilters.includes(tag))) return false;
    if (seasonFilters.length && !(unit.genus && seasonFilters.includes(unit.genus))) return false;
    if (yearFilters.length && !(unit.release_year && yearFilters.includes(String(unit.release_year)))) return false;
    if (status === "owned" && !isOwned) return false;
    if (status === "missing" && isOwned) return false;
    return true;
  };

  const implementationValue = (unit: UnitIndexEntry) =>
    unit.implementation_date || `${unit.release_year || 0}-01-01`;
  const compareUnits = (a: UnitIndexEntry, b: UnitIndexEntry) => {
    if (sortBy === "class") {
      const positionOrder = { melee: 0, ranged: 1, omni: 2 };
      const position = (a.position ? positionOrder[a.position] : 3)
        - (b.position ? positionOrder[b.position] : 3);
      if (position) return position;
      const order = (a.base_class_id ?? Number.MAX_SAFE_INTEGER)
        - (b.base_class_id ?? Number.MAX_SAFE_INTEGER) || a.id - b.id;
      return reverseSort ? -order : order;
    }
    const order = sortBy === "implementation"
      ? implementationValue(a).localeCompare(implementationValue(b)) || a.id - b.id
      : a.id - b.id;
    return reverseSort ? -order : order;
  };
  const shownNormal = normalUnits.filter((unit) => matches(unit, ownedSet.has(unit.id)));
  const groups = useMemo(() => {
    if (groupBy === "implementation") {
      const result = new Map<string, UnitIndexEntry[]>();
      shownNormal.forEach((unit) => {
        const year = unit.implementation_date?.slice(0, 4) || String(unit.release_year || "Unknown");
        result.set(year, [...(result.get(year) || []), unit]);
      });
      return [...result.entries()]
        .map(([key, items]) => ({ key, items: items.sort(compareUnits) }))
        .sort((a, b) => {
          if (a.key === "Unknown") return 1;
          if (b.key === "Unknown") return -1;
          const aYear = Number(a.key);
          const bYear = Number(b.key);
          const order = Number.isFinite(aYear) && Number.isFinite(bYear)
            ? aYear - bYear
            : a.key.localeCompare(b.key);
          return -order;
        });
    }
    const result = new Map<string, UnitIndexEntry[]>();
    shownNormal.forEach((unit) => {
      const key = rarityGroup(unit);
      result.set(key, [...(result.get(key) || []), unit]);
    });
    return [...result.entries()]
      .map(([key, items]) => ({
        key,
        items: items.sort(compareUnits),
      }))
      .sort((a, b) => (RARITY_GROUP_ORDER[b.key] || 0) - (RARITY_GROUP_ORDER[a.key] || 0));
  }, [shownNormal, groupBy, sortBy, reverseSort]);

  const princeOwned = (group: { dots: number[] }) => group.dots.some((dot) => princeSet.has(dot));
  const supportOwned = (group: { members: UnitIndexEntry[] }) =>
    group.members.some((unit) => ownedSet.has(unit.id));
  const shownPrinces = princeGroups
    .filter((group) => group.members.some((unit) => matches(unit, princeOwned(group))))
    .sort((a, b) => compareUnits(a.unit, b.unit));
  const shownSupport = supportGroups
    .filter((group) => group.members.some((unit) => matches(unit, supportOwned(group))))
    .sort((a, b) => compareUnits(a.unit, b.unit));
  const sections: ({ kind: "units"; key: string; items: UnitIndexEntry[] }
    | { kind: "support"; key: "Support" })[] = [
      ...groups.map((group) => ({ kind: "units" as const, ...group })),
      ...(shownSupport.length ? [{ kind: "support" as const, key: "Support" as const }] : []),
    ];
  if (groupBy === "rarity") {
    sections.sort((a, b) => (RARITY_GROUP_ORDER[b.key] || 0) - (RARITY_GROUP_ORDER[a.key] || 0));
  }
  const exportCode = useMemo(
    () => encodeCollection(owned, princeDots, hall, bondDone),
    [owned, princeDots, hall, bondDone]
  );
  const totalOwned = normalUnits.filter((unit) => ownedSet.has(unit.id)).length;
  const totalSupportOwned = supportGroups.filter(supportOwned).length;
  const totalPrinceOwned = princeGroups.filter(princeOwned).length;
  const totalCollectionCount = normalUnits.length + supportGroups.length + princeGroups.length;
  const totalCollectionOwned = totalOwned + totalSupportOwned + totalPrinceOwned;
  const allBondQuestUnits = normalUnits.filter((unit) => bondQuestIds.has(unit.id));
  const ownedBondQuestCount = allBondQuestUnits.filter((unit) => ownedSet.has(unit.id)).length;
  const completedBondQuestCount = allBondQuestUnits.filter((unit) => bondDoneSet.has(unit.id)).length;
  const activeFilterCount = rarityFilters.length + positionFilters.length + genderFilters.length
    + factionFilters.length + raceFilters.length + attributeFilters.length
    + seasonFilters.length + yearFilters.length + Number(Boolean(classFilter))
    + Number(bondStatus !== "all");
  const clearFilters = () => {
    setClassFilter("");
    setBondStatus("all");
    setRarityFilters([]);
    setPositionFilters([]);
    setGenderFilters([]);
    setFactionFilters([]);
    setRaceFilters([]);
    setAttributeFilters([]);
    setSeasonFilters([]);
    setYearFilters([]);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(exportCode);
      setMessage("Restore code copied.");
    } catch {
      setMessage("Copy was blocked; select the code and copy it manually.");
    }
  };
  const restore = () => {
    try {
      const decoded = decodeCollection(restoreCode);
      setOwned(decoded.unitIds);
      setPrinceDots(decoded.princeDots);
      setHall(decoded.hall);
      setBondDone(decoded.bondDone);
      setMessage(
        `Restored ${decoded.unitIds.length} units, ${decoded.princeDots.length} Prince icons, `
        + `${Object.keys(decoded.hall).length} Hall marks, and ${decoded.bondDone.length} bond quests.`
      );
      setRestoreCode("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "could not restore collection");
    }
  };
  const importCharaStat = () => {
    try {
      const selected = decodeCharaStatOwned(charaStatCode);
      const unitIds: number[] = [];
      const importedPrinceDots: number[] = [];
      let excluded = 0;
      let unknown = 0;
      selected.forEach((id) => {
        const unit = byId?.get(id);
        if (!unit) {
          unknown += 1;
        } else if (unit.npc) {
          excluded += 1;
        } else if (isCollectionPrince(unit)) {
          importedPrinceDots.push(unit.dot_id);
        } else {
          unitIds.push(unit.id);
        }
      });
      const nextUnits = uniqueSorted(unitIds);
      const nextPrinces = uniqueSorted(importedPrinceDots);
      setOwned(nextUnits);
      setPrinceDots(nextPrinces);
      setMessage(
        `Imported ${nextUnits.length} units and ${nextPrinces.length} Prince icons from chara-stat.us.`
        + (excluded ? ` ${excluded} selected records are excluded by this site's current NPC classification.` : "")
        + (unknown ? ` ${unknown} card ids are not present in this export.` : "")
      );
      setCharaStatCode("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "could not import chara-stat.us collection");
    }
  };

  if (loading) return <p className="loading">Loading collection…</p>;

  return (
    <div className="collection-page">
      <div className="collection-head">
        <div>
          <h2>Collection</h2>
          <p className="muted">Checks are saved in this browser. Use a restore code to move or back up the collection.</p>
        </div>
        <div className="collection-overall-progress">
          <ProgressRow label="All collection" value={totalCollectionOwned} total={totalCollectionCount} />
          <BondProgress
            completed={completedBondQuestCount}
            have={ownedBondQuestCount}
            total={allBondQuestUnits.length}
          />
        </div>
      </div>

      <div className="collection-tools">
        <input placeholder="Search id / name / class" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option value="">all classes</option>
          {filterOptions.classes.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
        <select value={bondStatus} onChange={(e) => setBondStatus(e.target.value as typeof bondStatus)}>
          <option value="all">all bond quests</option>
          <option value="available">has bond quest</option>
          <option value="completed">bond quest completed</option>
          <option value="incomplete">bond quest not completed</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">owned + missing</option>
          <option value="owned">owned only</option>
          <option value="missing">missing only</option>
        </select>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
          <option value="rarity">group by rarity</option>
          <option value="implementation">group by implementation year</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
          <option value="id">sort within group by ID</option>
          <option value="implementation">sort within group by implementation date</option>
          <option value="class">sort within group by base class ID</option>
        </select>
        <button
          type="button"
          onClick={() => setReverseSort((value) => !value)}
          title="Reverse sort direction"
          aria-label={`Sort direction: ${reverseSort ? "descending" : "ascending"}. Click to reverse.`}
        >
          {reverseSort ? "Sort: descending ↓" : "Sort: ascending ↑"}
        </button>
      </div>

      <details className="collection-filters">
        <summary>Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</summary>
        <FilterGroup title="Rarity" options={filterOptions.rarities} selected={rarityFilters} onToggle={(value) => toggleFilter(rarityFilters, setRarityFilters, value)} />
        <FilterGroup title="Position" options={POSITION_OPTIONS} selected={positionFilters} onToggle={(value) => toggleFilter(positionFilters, setPositionFilters, value)} />
        <FilterGroup title="Gender" options={GENDER_OPTIONS} selected={genderFilters} onToggle={(value) => toggleFilter(genderFilters, setGenderFilters, value)} />
        <FilterGroup title="Affiliation" options={filterOptions.factions} selected={factionFilters} onToggle={(value) => toggleFilter(factionFilters, setFactionFilters, value)} />
        <FilterGroup title="Race" options={filterOptions.races} selected={raceFilters} onToggle={(value) => toggleFilter(raceFilters, setRaceFilters, value)} />
        <FilterGroup title="Attribute" options={filterOptions.attributes} selected={attributeFilters} onToggle={(value) => toggleFilter(attributeFilters, setAttributeFilters, value)} />
        <FilterGroup title="Season" options={filterOptions.seasons} selected={seasonFilters} onToggle={(value) => toggleFilter(seasonFilters, setSeasonFilters, value)} />
        <FilterGroup title="Implementation year" options={filterOptions.years} selected={yearFilters} onToggle={(value) => toggleFilter(yearFilters, setYearFilters, value)} />
        {activeFilterCount > 0 && <button type="button" className="filter-clear-btn" onClick={clearFilters}>clear all filters</button>}
      </details>

      <details className="collection-transfer">
        <summary>Copy / restore collection</summary>
        <div className="collection-transfer-grid">
          <label>
            Current restore code
            <textarea readOnly value={exportCode} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={copyCode}>copy code</button>
          </label>
          <label>
            Restore from a code
            <textarea value={restoreCode} onChange={(e) => setRestoreCode(e.target.value)} placeholder="Paste an AIGC1, AIGC2, or AIGC3 code" />
            <button type="button" disabled={!restoreCode.trim()} onClick={restore}>restore</button>
          </label>
          <label>
            Import from chara-stat.us
            <textarea
              value={charaStatCode}
              onChange={(e) => setCharaStatCode(e.target.value)}
              placeholder="Paste a checker URL or raw oryu code"
            />
            <button type="button" disabled={!charaStatCode.trim()} onClick={importCharaStat}>replace from checker</button>
          </label>
        </div>
        {message && <p className="collection-message">{message}</p>}
      </details>

      {shownPrinces.length > 0 && (
        <details className="collection-group collection-prince-group" open>
          <CollectionGroupSummary
            title="Prince"
            selected={shownPrinces.filter(princeOwned).length}
            total={shownPrinces.length}
            onSelectAll={() => setPrinceDots((current) => uniqueSorted([
              ...current,
              ...shownPrinces.map((group) => group.canonicalDot),
            ]))}
            onClear={() => {
              const dots = new Set(shownPrinces.flatMap((group) => group.dots));
              setPrinceDots((current) => current.filter((dot) => !dots.has(dot)));
            }}
          />
          <p className="muted small">Prince cards sharing the same icon count once.</p>
          <div className="collection-grid">
            {shownPrinces.map((group) => (
              <CollectionTile
                key={group.canonicalDot}
                unit={group.unit}
                owned={princeOwned(group)}
                onToggle={() => setPrinceDots((current) => {
                  const groupDots = new Set(group.dots);
                  return princeOwned(group)
                    ? current.filter((dot) => !groupDots.has(dot))
                    : uniqueSorted([...current, group.canonicalDot]);
                })}
                subtitle={`${group.members.length} card record${group.members.length === 1 ? "" : "s"}`}
              />
            ))}
          </div>
        </details>
      )}

      {sections.map((section) => section.kind === "support" ? (
        <details className="collection-group collection-support-group" key={section.key} open>
          <CollectionGroupSummary
            title="Support"
            selected={shownSupport.filter(supportOwned).length}
            total={shownSupport.length}
            onSelectAll={() => setOwned((current) => uniqueSorted([
              ...current,
              ...shownSupport.map((group) => group.unit.id),
            ]))}
            onClear={() => {
              const ids = new Set(shownSupport.flatMap((group) => group.members.map((unit) => unit.id)));
              setOwned((current) => current.filter((id) => !ids.has(id)));
            }}
          />
          <p className="muted small">Support card records sharing one icon count once.</p>
          <div className="collection-grid">
            {shownSupport.map((group) => (
              <CollectionTile
                key={group.dot}
                unit={group.unit}
                owned={supportOwned(group)}
                onToggle={() => setOwned((current) => {
                  const groupIds = new Set(group.members.map((unit) => unit.id));
                  return supportOwned(group)
                    ? current.filter((id) => !groupIds.has(id))
                    : uniqueSorted([...current, group.unit.id]);
                })}
                subtitle={group.members.length > 1
                  ? `${group.members.length} card records`
                  : undefined}
              />
            ))}
          </div>
        </details>
      ) : (
        <details className="collection-group" key={section.key} open>
          <CollectionGroupSummary
            title={section.key}
            selected={section.items.filter((unit) => ownedSet.has(unit.id)).length}
            total={section.items.length}
            onSelectAll={() => setOwned((current) => uniqueSorted([
              ...current,
              ...section.items.map((unit) => unit.id),
            ]))}
            onClear={() => {
              const ids = new Set(section.items.map((unit) => unit.id));
              setOwned((current) => current.filter((id) => !ids.has(id)));
            }}
          />
          <div className="collection-grid">
            {section.items.map((unit) => (
              <CollectionTile
                key={unit.id}
                unit={unit}
                owned={ownedSet.has(unit.id)}
                onToggle={() => setOwned((current) => toggleNumber(current, unit.id))}
                hallState={hall[unit.id] || 0}
                onHallChange={unit.hall_of_fame ? (next) => setHall((current) => {
                    const updated = { ...current };
                    if (next) updated[unit.id] = next; else delete updated[unit.id];
                    return updated;
                  }) : undefined}
                hasBondQuest={bondQuestIds.has(unit.id)}
                bondDone={bondDoneSet.has(unit.id)}
                onBondToggle={() => setBondDone((current) => toggleNumber(current, unit.id))}
              />
            ))}
          </div>
        </details>
      ))}

      {shownNormal.length === 0 && shownSupport.length === 0 && shownPrinces.length === 0
        && <p className="muted">No collection entries match these filters.</p>}
    </div>
  );
}
