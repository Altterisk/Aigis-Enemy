import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useUnits, useUnitInfluenceLabels, useLocalisation, loadJSONFile } from "../data";
import { UnitImage } from "../components";
import type { UnitIndexEntry, UnitInfluenceLabel, TagMentions } from "../types";

const PAGE = 60;

// dropdown text for an influence id: "12 — Block" when labeled, else raw id.
function influenceOption(
  id: number,
  labels?: Record<string, UnitInfluenceLabel>
): string {
  const lab = labels?.[String(id)];
  return lab?.name ? `${id} — ${lab.name}` : `influence ${id}`;
}

// pager with first/last + jump-to-page
function Pager({ page, pages, setPage }: {
  page: number; pages: number; setPage: (p: number) => void;
}) {
  const [jump, setJump] = useState("");
  if (pages <= 1) return null;
  const go = (p: number) => setPage(Math.min(pages - 1, Math.max(0, p)));
  return (
    <div className="pager">
      <button disabled={page === 0} onClick={() => go(0)}>« first</button>
      <button disabled={page === 0} onClick={() => go(page - 1)}>‹ prev</button>
      <span className="muted small">page {page + 1} / {pages}</span>
      <input
        className="pager-jump"
        placeholder="#"
        value={jump}
        onChange={(e) => setJump(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const n = Number(jump);
            if (Number.isFinite(n) && n >= 1) go(n - 1);
            setJump("");
          }
        }}
        title="type a page number and press Enter"
      />
      <button disabled={page >= pages - 1} onClick={() => go(page + 1)}>next ›</button>
      <button disabled={page >= pages - 1} onClick={() => go(pages - 1)}>last »</button>
    </div>
  );
}

export default function UnitList() {
  const { loading, units } = useUnits();
  const influenceLabels = useUnitInfluenceLabels();
  const loc = useLocalisation();
  // class / tag filters arrive as query params from clickable links on the
  // detail pages (?class=<JP name> / ?tag=<JP tag>).
  const [params, setParams] = useSearchParams();
  const classFilter = params.get("class") || "";
  const tagFilter = params.get("tag") || "";

  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState("all");
  const [ranged, setRanged] = useState("all");
  const [sInf, setSInf] = useState("all");
  const [aInf, setAInf] = useState("all");
  const [cls, setCls] = useState("all");
  const [faction, setFaction] = useState("all");
  const [showNpc, setShowNpc] = useState(false);
  const [page, setPage] = useState(0);
  const [mentions, setMentions] = useState<TagMentions | null>(null);

  // "skills/abilities that mention this tag" list (tag-filtered view only)
  useEffect(() => {
    if (tagFilter && !mentions) {
      loadJSONFile<TagMentions>("tag_mentions").then(setMentions).catch(() => setMentions({}));
    }
  }, [tagFilter, mentions]);

  const princeCount = useMemo(
    () => (units || []).filter((u) => u.prince && u.id !== 1).length,
    [units]
  );

  const rarityOpts = useMemo(() => {
    const s = new Set<string>();
    (units || []).forEach((u) => s.add(u.rarity));
    return [...s].sort();
  }, [units]);

  // every skill / ability influence id in use across the index.
  const { sInfOpts, aInfOpts } = useMemo(() => {
    const s = new Set<number>();
    const a = new Set<number>();
    (units || []).forEach((u) => {
      (u.s_inf || []).forEach((i) => s.add(i));
      (u.a_inf || []).forEach((i) => a.add(i));
    });
    const num = (x: number, y: number) => x - y;
    return { sInfOpts: [...s].sort(num), aInfOpts: [...a].sort(num) };
  }, [units]);

  // base classes + factions in use (dropdown filters)
  const { classOpts, factionOpts } = useMemo(() => {
    const c = new Set<string>();
    const f = new Set<string>();
    (units || []).forEach((u) => {
      if (!u.npc) {
        if (u.classes?.[0]) c.add(u.classes[0]);
        if (u.faction) f.add(u.faction);
      }
    });
    return { classOpts: [...c].sort(), factionOpts: [...f].sort() };
  }, [units]);

  const filtered = useMemo(() => {
    if (!units) return [] as UnitIndexEntry[];
    const term = q.trim().toLowerCase();
    const sInfN = sInf === "all" ? null : Number(sInf);
    const aInfN = aInf === "all" ? null : Number(aInf);
    const anyExplicit = Boolean(term || classFilter || tagFilter);
    return units.filter((u) => {
      if (!showNpc && u.npc && !anyExplicit) return false;
      // prince titles collapse into the CardID 1 tile (explicit search /
      // class / tag lookups still surface them individually)
      if (u.prince && u.id !== 1 && !anyExplicit) return false;
      if (classFilter && !(u.classes || []).includes(classFilter)) return false;
      if (tagFilter && !(u.tags || []).includes(tagFilter)) return false;
      if (cls !== "all" && !(u.classes || []).includes(cls)) return false;
      if (faction !== "all" && u.faction !== faction) return false;
      if (rarity !== "all" && u.rarity !== rarity) return false;
      if (ranged !== "all" && String(u.ranged) !== ranged) return false;
      if (sInfN != null && !(u.s_inf || []).includes(sInfN)) return false;
      if (aInfN != null && !(u.a_inf || []).includes(aInfN)) return false;
      if (term) {
        const hay = [String(u.id), u.name || "", u.name_en || "", u.class || ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [units, q, rarity, ranged, sInf, aInf, cls, faction, showNpc, classFilter, tagFilter]);

  const resetPage =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(0);
    };

  if (loading) return <p className="loading">Loading units…</p>;

  const pages = Math.ceil(filtered.length / PAGE);
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div>
      <div className="toolbar unit-toolbar">
        <input
          placeholder="Search id / name / class"
          value={q}
          onChange={(e) => resetPage(setQ)(e.target.value)}
        />
        <select value={rarity} onChange={(e) => resetPage(setRarity)(e.target.value)}>
          <option value="all">all rarities</option>
          {rarityOpts.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select value={ranged} onChange={(e) => resetPage(setRanged)(e.target.value)}>
          <option value="all">melee + ranged</option>
          <option value="true">ranged</option>
          <option value="false">melee</option>
        </select>
        <select value={cls} onChange={(e) => resetPage(setCls)(e.target.value)}>
          <option value="all">all classes</option>
          {classOpts.map((c) => (
            <option key={c} value={c}>{loc?.classes[c] || c}</option>
          ))}
        </select>
        <select value={faction} onChange={(e) => resetPage(setFaction)(e.target.value)}>
          <option value="all">all factions</option>
          {factionOpts.map((f) => (
            <option key={f} value={f}>{loc?.races[f] || f}</option>
          ))}
        </select>
        <select value={sInf} onChange={(e) => resetPage(setSInf)(e.target.value)}>
          <option value="all">all skill influences</option>
          {sInfOpts.map((i) => (
            <option key={i} value={String(i)}>{influenceOption(i, influenceLabels?.skill)}</option>
          ))}
        </select>
        <select value={aInf} onChange={(e) => resetPage(setAInf)(e.target.value)}>
          <option value="all">all ability influences</option>
          {aInfOpts.map((i) => (
            <option key={i} value={String(i)}>{influenceOption(i, influenceLabels?.ability)}</option>
          ))}
        </select>
        <label className="muted small npc-toggle">
          <input
            type="checkbox"
            checked={showNpc}
            onChange={(e) => resetPage(setShowNpc)(e.target.checked)}
          />
          {" "}NPC / test / fodder
        </label>
        <span className="count">{filtered.length.toLocaleString()} units</span>
      </div>

      {(classFilter || tagFilter) && (
        <div className="active-filters">
          {classFilter && (
            <span className="filter-chip">
              class: {loc?.classes[classFilter] || classFilter}
              <button onClick={() => { params.delete("class"); setParams(params); setPage(0); }}>×</button>
            </span>
          )}
          {tagFilter && (
            <span className="filter-chip">
              tag: {loc?.tags[tagFilter] || loc?.races[tagFilter] || tagFilter}
              <button onClick={() => { params.delete("tag"); setParams(params); setPage(0); }}>×</button>
            </span>
          )}
        </div>
      )}

      {tagFilter && mentions && (["unit", "enemy"] as const).map((bucket) => {
        const list = mentions[tagFilter]?.[bucket] || [];
        if (list.length === 0) return null;
        const tagEn = loc?.tags[tagFilter] || loc?.races[tagFilter] || tagFilter;
        return (
          <details className="tag-mentions" key={bucket}>
            <summary>
              {list.length} skills / abilities{" "}
              {bucket === "unit"
                ? `condition on ally/unit tag ${tagEn}`
                : `target ENEMIES tagged ${tagEn} (enemy race/element namespace)`}
            </summary>
            <ul className="admin-examples">
              {list.map((m, i) => (
                <li key={i}>
                  <Link to={`/units/${m.unit}`}>#{m.unit} {m.name}</Link>
                  <span className="muted"> — {m.slot} ({m.kind})</span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}

      <Pager page={page} pages={pages} setPage={setPage} />

      <div className="unit-grid">
        {shown.map((u) => (
          <Link to={`/units/${u.id}`} className="enemy-tile unit-tile" key={u.id}>
            <UnitImage kind="icon" id={u.dot_id} className="unit-icon-thumb" alt={String(u.id)} />
            <div className="enemy-tile-body unit-tile-body">
              <div className="unit-tile-name">
                {u.name_en || u.name || "(unnamed)"}
              </div>
              <div className="muted small unit-tile-sub">
                #{u.id}{u.name_en && u.name ? ` · ${u.name}` : ""}
              </div>
              <div className="enemy-tile-attr">
                {u.rarity} · {(u.class && loc?.classes[u.class]) || u.class || "?"} {u.ranged ? "(ranged)" : ""}
                {u.id === 1 && princeCount > 0 && ` · +${princeCount} titles`}
              </div>
              <div className="muted small">
                HP {(u.hp ?? 0).toLocaleString()} · ATK {(u.atk ?? 0).toLocaleString()} ·
                {" "}DEF {(u.def ?? 0).toLocaleString()}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Pager page={page} pages={pages} setPage={setPage} />
    </div>
  );
}
