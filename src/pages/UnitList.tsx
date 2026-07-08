import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useUnits, useUnitInfluenceLabels, useLocalisation, loadJSONFile } from "../data";
import { UnitImage } from "../components";
import { useUiStore } from "../store";
import type { UnitIndexEntry, UnitInfluenceLabel, TagMentions } from "../types";

const PAGE = 60;

// "Platinum Hero" / "Black Hero" are a card-art variant of Platinum/Black,
// not a distinct rarity tier. Strip the suffix so the checkbox list shows
// one entry per real tier and selecting it matches both.
function baseRarity(r: string): string {
  return r.replace(/ Hero$/, "");
}

// Searchable single-select combobox: a text input that filters a long
// option list live, for dropdowns too large to scan by scrolling (class
// names, skill/ability influence ids). value="" means "no filter".
function SearchableSelect({
  value, options, placeholder, onChange, wide,
}: {
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (v: string) => void;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selected = options.find((o) => o.value === value);
  const term = query.trim().toLowerCase();
  const filtered = term
    ? options.filter((o) => o.label.toLowerCase().includes(term) || o.value.toLowerCase().includes(term))
    : options;
  // the option list's onMouseDown preventDefault (below) keeps the input
  // natively focused through a click, so close() must blur it explicitly --
  // otherwise the next click on an already-focused input fires no focus
  // event and never reopens the list.
  const close = () => { setOpen(false); setQuery(""); inputRef.current?.blur(); };
  const pick = (v: string) => { onChange(v); close(); };
  // opening always resets to a blank, unfiltered search box; the current
  // selection is surfaced via scrollIntoView + the .selected highlight
  // below instead of prefilling the query.
  const openAt = () => setOpen(true);
  useEffect(() => {
    if (open) selectedRef.current?.scrollIntoView({ block: "center" });
  }, [open]);
  return (
    <div
      className={`searchable-select${wide ? " searchable-select--wide" : ""}`}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) close(); }}
    >
      <input
        ref={inputRef}
        value={open ? query : (selected?.label || "")}
        placeholder={placeholder}
        onFocus={openAt}
        onChange={(e) => setQuery(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="searchable-select-clear"
          onClick={() => { onChange(""); close(); }}
          title={`clear ${placeholder}`}
        >
          ×
        </button>
      )}
      {open && (
        <div className="searchable-select-list" onMouseDown={(e) => e.preventDefault()}>
          <div className="searchable-select-option searchable-select-all" onClick={() => pick("")}>
            {placeholder}
          </div>
          {filtered.slice(0, 300).map((o) => (
            <div
              key={o.value}
              ref={o.value === value ? selectedRef : undefined}
              className={`searchable-select-option${o.value === value ? " selected" : ""}`}
              onClick={() => pick(o.value)}
            >
              {o.label}
            </div>
          ))}
          {filtered.length === 0 && <div className="searchable-select-empty">no matches</div>}
        </div>
      )}
    </div>
  );
}

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

// A checkbox group for one filter category (multi-select, OR within the
// group). Empty selection = no filter applied for that category. Mirrors
// the in-game unit-list filter menu's category layout, skipping player-
// account-specific categories (Lock Status, Trust/Affection) and 出撃条件
// (per-map deploy restriction -- not in our data).
function CheckboxGroup({
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
        {options.map((o) => (
          <label key={o.value} className={`cg-pill${selected.includes(o.value) ? " on" : ""}`}>
            <input
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={() => onToggle(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

const POSITION_OPTS = [
  { value: "melee", label: "Melee" },
  { value: "ranged", label: "Ranged" },
  { value: "omni", label: "Omni (deployable either spot)" },
];
const GENDER_OPTS = [
  { value: "Female", label: "Female" },
  { value: "Male", label: "Male" },
];

export default function UnitList() {
  const { loading, units } = useUnits();
  const influenceLabels = useUnitInfluenceLabels();
  const loc = useLocalisation();
  // ALL filter/search/page state lives in the URL: a plain useState resets
  // on remount, so browser back/forward would otherwise drop the previous
  // view; a URL param survives since it's part of the history entry.
  const [params, setParams] = useSearchParams();

  const q = params.get("q") || "";
  const cls = params.get("cls") || "";
  const sInf = params.get("sInf") || "";
  const aInf = params.get("aInf") || "";
  const showNpc = params.get("npc") === "1";
  const page = Number(params.get("page") || "0");
  // class / tag filters arrive as query params from clickable links on the
  // detail pages (?class=<JP name> / ?tag=<JP tag>).
  const classFilter = params.get("class") || "";
  const tagFilter = params.get("tag") || "";

  const csv = (key: string): string[] => {
    const v = params.get(key);
    return v ? v.split(",").filter(Boolean) : [];
  };
  const rarityF = csv("rarity");
  const positionF = csv("position");
  const genderF = csv("gender");
  const factionF = csv("faction");
  const raceF = csv("race");
  const attrF = csv("attr");
  const seasonF = csv("season");
  const yearF = csv("year");

  // sets one param, resetting pagination (any filter/search change goes
  // back to page 0 -- an old page number could be out of range otherwise).
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    setParams(next, { replace: true });
  };
  const toggleCsv = (key: string, list: string[], value: string) => {
    const next = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
    setParam(key, next.join(","));
  };
  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p) next.set("page", String(p)); else next.delete("page");
    setParams(next, { replace: true });
  };

  const [mentions, setMentions] = useState<TagMentions | null>(null);
  // "skills/abilities that mention this tag" only makes sense for a single
  // concrete value -- the legacy ?tag= link, or a checkbox category with
  // exactly one box checked (faction/race/attr/season all key the same
  // mentions table as the old single-value tag filter did).
  const singleton = (list: string[]): string => (list.length === 1 ? list[0] : "");
  const mentionTag = tagFilter || singleton(factionF) || singleton(raceF)
    || singleton(attrF) || singleton(seasonF);
  // panel open/closed is a UI preference, not filter data -- lives in the
  // Zustand store (not the URL) so it survives navigation without
  // cluttering the shareable link.
  const showFilters = useUiStore((s) => s.unitFiltersOpen);
  const setShowFilters = useUiStore((s) => s.setUnitFiltersOpen);

  // "skills/abilities that mention this tag" list (single concrete tag only)
  useEffect(() => {
    if (mentionTag && !mentions) {
      loadJSONFile<TagMentions>("tag_mentions").then(setMentions).catch(() => setMentions({}));
    }
  }, [mentionTag, mentions]);

  const princeCount = useMemo(
    () => (units || []).filter((u) => u.prince && u.id !== 1).length,
    [units]
  );

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

  // base classes in use (existing single-select dropdown, unaffected by
  // the new checkbox categories below).
  const classOpts = useMemo(() => {
    const c = new Set<string>();
    (units || []).forEach((u) => {
      if (!u.npc && u.class_names?.[0]) c.add(u.class_names[0]);
    });
    return [...c].sort();
  }, [units]);

  // distinct values in use for every checkbox category, translated where a
  // localisation entry exists. Rarity/Position/Gender have a small fixed
  // vocabulary; the rest are whatever the data actually contains (no
  // hand-maintained list to fall out of sync with new units).
  const {
    rarityOpts, factionOpts, raceOpts, attrOpts, seasonOpts, yearOpts,
  } = useMemo(() => {
    // track the game's own internal id for each value (its minimum seen id
    // across carriers) so options list in the game's own menu order, not
    // an arbitrary string sort.
    const ids = new Map<string, number>();
    const track = (v: string, id?: number | null) => {
      if (id == null) return;
      const cur = ids.get(v);
      if (cur == null || id < cur) ids.set(v, id);
    };
    const rarity = new Set<string>();
    const faction = new Set<string>();
    const race = new Set<string>();
    const attr = new Set<string>();
    const season = new Set<string>();
    const year = new Set<number>();
    (units || []).forEach((u) => {
      if (u.npc) return;
      if (u.rarity) { rarity.add(baseRarity(u.rarity)); track(baseRarity(u.rarity), u.rarity_id); }
      if (u.faction) { faction.add(u.faction); track(u.faction, u.faction_id); }
      if (u.race) { race.add(u.race); track(u.race, u.race_id); }
      (u.identity_tags || []).forEach((t, i) => { attr.add(t); track(t, u.identity_ids?.[i]); });
      if (u.genus) { season.add(u.genus); track(u.genus, u.genus_id); }
      if (u.release_year) year.add(u.release_year);
    });
    const byId = (a: string, b: string) => (ids.get(a) ?? 1e9) - (ids.get(b) ?? 1e9);
    const toOpts = (s: Set<string>, tr?: Record<string, string>) =>
      [...s].sort(byId).map((v) => ({ value: v, label: tr?.[v] || v }));
    return {
      rarityOpts: [...rarity].sort(byId).map((v) => ({ value: v, label: v })),
      factionOpts: toOpts(faction, loc?.races),
      raceOpts: toOpts(race, loc?.races),
      attrOpts: toOpts(attr, loc?.tags),
      seasonOpts: toOpts(season, loc?.tags),
      yearOpts: [...year].sort((a, b) => a - b).map((y) => ({ value: String(y), label: String(y) })),
    };
  }, [units, loc]);

  const filtered = useMemo(() => {
    if (!units) return [] as UnitIndexEntry[];
    const term = q.trim().toLowerCase();
    const sInfN = sInf ? Number(sInf) : null;
    const aInfN = aInf ? Number(aInf) : null;
    const anyExplicit = Boolean(term || classFilter || tagFilter);
    return units.filter((u) => {
      if (!showNpc && u.npc && !anyExplicit) return false;
      // prince titles collapse into the CardID 1 tile (explicit search /
      // class / tag lookups still surface them individually)
      if (u.prince && u.id !== 1 && !anyExplicit) return false;
      if (classFilter && !(u.class_names || []).includes(classFilter)) return false;
      if (tagFilter && !(u.tags || []).includes(tagFilter)) return false;
      if (cls && !(u.class_names || []).includes(cls)) return false;
      if (rarityF.length && !rarityF.includes(baseRarity(u.rarity))) return false;
      if (positionF.length && !positionF.includes(u.position || "")) return false;
      if (genderF.length && !genderF.includes(String(u.gender))) return false;
      if (factionF.length && !(u.faction && factionF.includes(u.faction))) return false;
      if (raceF.length && !(u.race && raceF.includes(u.race))) return false;
      if (attrF.length && !(u.identity_tags || []).some((t) => attrF.includes(t))) return false;
      if (seasonF.length && !(u.genus && seasonF.includes(u.genus))) return false;
      if (yearF.length && !(u.release_year && yearF.includes(String(u.release_year)))) return false;
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
  }, [
    units, q, sInf, aInf, cls, showNpc, classFilter, tagFilter,
    rarityF, positionF, genderF, factionF, raceF, attrF, seasonF, yearF,
  ]);

  const activeCount = rarityF.length + positionF.length + genderF.length + factionF.length
    + raceF.length + attrF.length + seasonF.length + yearF.length;
  const anyFilterActive = Boolean(
    q || cls || sInf || aInf || showNpc || classFilter || tagFilter || activeCount
  );
  const resetAll = () => setParams(new URLSearchParams(), { replace: true });

  if (loading) return <p className="loading">Loading units…</p>;

  const pages = Math.ceil(filtered.length / PAGE);
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div>
      <div className="toolbar unit-toolbar">
        <div className="unit-toolbar-row">
          <input
            placeholder="Search id / name / class"
            value={q}
            onChange={(e) => setParam("q", e.target.value)}
          />
          <SearchableSelect
            value={cls}
            placeholder="all classes"
            options={classOpts.map((c) => ({ value: c, label: loc?.classes[c] || c }))}
            onChange={(v) => setParam("cls", v || null)}
          />
        </div>
        <div className="unit-toolbar-row">
          <SearchableSelect
            wide
            value={sInf}
            placeholder="all skill influences"
            options={sInfOpts.map((i) => ({ value: String(i), label: influenceOption(i, influenceLabels?.skill) }))}
            onChange={(v) => setParam("sInf", v || null)}
          />
          <SearchableSelect
            wide
            value={aInf}
            placeholder="all ability influences"
            options={aInfOpts.map((i) => ({ value: String(i), label: influenceOption(i, influenceLabels?.ability) }))}
            onChange={(v) => setParam("aInf", v || null)}
          />
        </div>
        <div className="unit-toolbar-row">
          <label className={`cg-pill${showNpc ? " on" : ""}`}>
            <input
              type="checkbox"
              checked={showNpc}
              onChange={(e) => setParam("npc", e.target.checked ? "1" : null)}
            />
            NPC / test / fodder
          </label>
          <div className="unit-toolbar-actions">
            <button className="filter-toggle-btn" onClick={() => setShowFilters(!showFilters)}>
              {showFilters ? "hide filters ▲" : "filters ▼"}{activeCount ? ` (${activeCount})` : ""}
            </button>
            {anyFilterActive && (
              <button className="filter-toggle-btn filter-reset-btn" onClick={resetAll} title="clear every filter and search term">
                reset
              </button>
            )}
          </div>
          <span className="count">{filtered.length.toLocaleString()} units</span>
        </div>
      </div>

      {showFilters && (
        <div className="filter-panel">
          <CheckboxGroup title="Rarity" options={rarityOpts} selected={rarityF} onToggle={(v) => toggleCsv("rarity", rarityF, v)} />
          <CheckboxGroup title="Position" options={POSITION_OPTS} selected={positionF} onToggle={(v) => toggleCsv("position", positionF, v)} />
          <CheckboxGroup title="Gender" options={GENDER_OPTS} selected={genderF} onToggle={(v) => toggleCsv("gender", genderF, v)} />
          <CheckboxGroup title="Affiliation" options={factionOpts} selected={factionF} onToggle={(v) => toggleCsv("faction", factionF, v)} />
          <CheckboxGroup title="Race" options={raceOpts} selected={raceF} onToggle={(v) => toggleCsv("race", raceF, v)} />
          <CheckboxGroup title="Attribute" options={attrOpts} selected={attrF} onToggle={(v) => toggleCsv("attr", attrF, v)} />
          <CheckboxGroup title="Season" options={seasonOpts} selected={seasonF} onToggle={(v) => toggleCsv("season", seasonF, v)} />
          <CheckboxGroup title="Release Year" options={yearOpts} selected={yearF} onToggle={(v) => toggleCsv("year", yearF, v)} />
          {activeCount > 0 && (
            <button
              className="filter-clear-btn"
              onClick={() => {
                const next = new URLSearchParams(params);
                ["rarity", "position", "gender", "faction", "race", "attr", "season", "year", "page"]
                  .forEach((k) => next.delete(k));
                setParams(next, { replace: true });
              }}
            >
              clear all filters
            </button>
          )}
        </div>
      )}

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

      {mentionTag && mentions && (["unit", "enemy"] as const).map((bucket) => {
        const list = mentions[mentionTag]?.[bucket] || [];
        if (list.length === 0) return null;
        const tagEn = loc?.tags[mentionTag] || loc?.races[mentionTag] || mentionTag;
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
              {u.tags && u.tags.length > 0 && (
                <div className="muted small unit-tile-tags">
                  {u.tags.map((t) => loc?.tags[t] || t).join(", ")}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      <Pager page={page} pages={pages} setPage={setPage} />
    </div>
  );
}
