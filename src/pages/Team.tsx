// /team -- pick a unit to buff, build a formation of up to 15 around her with
// as many deployed as the stage allows, and rank who to add next by the buffs
// that would reach her (team.ts has the rules).
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FilterChip, FilterRow, PageHeader, Panel, SearchBox, SegmentedButtons } from "@altterisk/game-hub";
import { loadJSONFile, unitImageUrl, useLocalisation, useStages, useUnitInfluenceLabels, useUnits } from "../data";
import { useUiStore } from "../store";
import { groupName } from "../buffGroups";
import { humanize } from "../humanize";
import {
  MAX_TEAM, MODE_STATS, STAT_LABEL, bestVariant, byKey, fmtAmount, total, unitRows, variantLabel,
  type Contribution, type Mode, type UnitRows, type Variant,
} from "../team";
import type { BuffRow, Stage, UnitIndexEntry } from "../types";

const PAGE = 20;

const nameOf = (u?: UnitIndexEntry) => (u ? u.name_en || u.name : "");
const matchesQuery = (u: UnitIndexEntry, q: string) => {
  const s = q.trim().toLowerCase();
  return !s || (u.name_en ?? "").toLowerCase().includes(s) || (u.name ?? "").includes(q.trim()) || String(u.id) === s;
};
const playable = (u: UnitIndexEntry) => !u.npc;

function Face({ id, size = 40 }: { id: number; size?: number }) {
  return <img className="team-face" src={unitImageUrl("icon", id)} alt="" width={size} height={size} loading="lazy" />;
}

export default function Team() {
  const [rows, setRows] = useState<BuffRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { units, byId } = useUnits();
  const { stages } = useStages();
  const labels = useUnitInfluenceLabels();
  const loc = useLocalisation();
  const owned = useUiStore((s) => s.collectionOwned);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [addQ, setAddQ] = useState("");
  const [stageQ, setStageQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [stage, setStage] = useState<Stage | null>(null);

  useEffect(() => {
    loadJSONFile<BuffRow[]>("buff_index").then(setRows).catch(() => setFailed(true));
  }, []);

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const csvNums = (k: string) => (params.get(k) || "").split(",").map(Number).filter(Boolean);
  const targetId = Number(params.get("t")) || null;
  const members = csvNums("m").filter((n) => n !== targetId);
  const bench = new Set(csvNums("b"));
  const mode: Mode = params.get("mode") === "def" ? "def" : params.get("mode") === "util" ? "util" : "off";
  const skillsOn = params.get("sk") !== "0";
  const fromCollection = owned.length > 0 && params.get("pool") !== "all";
  const questId = Number(params.get("q")) || null;

  useEffect(() => {
    if (!questId) { setStage(null); return; }
    let alive = true;
    loadJSONFile<Stage>(`stage/${questId}`).then((s) => { if (alive) setStage(s); }).catch(() => { if (alive) setStage(null); });
    return () => { alive = false; };
  }, [questId]);
  // deploy slots: the stage's capacity, else a typed number, else the whole team
  const capacity = stage?.capacity || Number(params.get("cap")) || MAX_TEAM;

  // rows by giver, at each unit's top form
  const rowsOf = useMemo(() => {
    const by = new Map<number, BuffRow[]>();
    for (const r of rows || []) by.set(r.u, [...(by.get(r.u) || []), r]);
    return by;
  }, [rows]);
  // units that don't take a deployment slot (special property 13)
  const noSlot = useMemo(() => new Set((rows || []).filter((r) => r.grp === "special_limit").map((r) => r.u)), [rows]);
  const urCache = useMemo(() => new Map<number, UnitRows>(), [rowsOf]);
  const urOf = (u: UnitIndexEntry) => {
    let ur = urCache.get(u.id);
    if (!ur) urCache.set(u.id, (ur = unitRows(u, rowsOf.get(u.id) || [])));
    return ur;
  };

  const target = targetId != null ? byId?.get(targetId) : undefined;
  const team = target ? [target.id, ...members] : [];
  const isDeployed = (id: number) => id === targetId || !bench.has(id);
  const slotsUsed = team.filter((id) => isDeployed(id) && !noSlot.has(id)).length;

  // each member's best variant, picked in formation order over what the
  // members before her already give
  const formation = useMemo(() => {
    const out: Record<Mode, { picks: Map<number, Variant>; contrib: Map<string, Contribution[]> }> = {
      off: { picks: new Map(), contrib: new Map() },
      def: { picks: new Map(), contrib: new Map() },
      util: { picks: new Map(), contrib: new Map() },
    };
    if (!target || !byId || !rows) return out;
    for (const m of ["off", "def", "util"] as Mode[]) {
      const acc: Contribution[] = [];
      for (const id of team) {
        const u = byId.get(id);
        if (!u) continue;
        const best = bestVariant(urOf(u), u, isDeployed(id), target, m, byKey(acc), skillsOn);
        out[m].picks.set(id, best.v);
        acc.push(...best.contrib);
      }
      out[m].contrib = byKey(acc);
    }
    return out;
  }, [team.join(), params.get("b"), target, byId, rows, skillsOn]);
  const current = formation[mode].contrib;

  const excluded = useMemo(() => {
    const ex = new Set<number>();
    for (const id of team) for (const c of byId?.get(id)?.formation_exclusion?.cards ?? []) ex.add(c.id);
    return ex;
  }, [team.join(), byId]);

  const ranked = useMemo(() => {
    if (!target || !units || !rows || team.length >= MAX_TEAM) return [];
    const pool = units.filter((u) => playable(u) && (!fromCollection || owned.includes(u.id)));
    return pool
      .filter((u) => !team.includes(u.id) && !excluded.has(u.id)
        && !(u.formation_exclusion?.cards ?? []).some((c) => team.includes(c.id)))
      .map((u) => {
        const deployed = slotsUsed < capacity || noSlot.has(u.id);
        return { u, deployed, ...bestVariant(urOf(u), u, deployed, target, mode, current, skillsOn) };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score || b.fresh - a.fresh);
  }, [units, rows, current, fromCollection, owned, excluded, slotsUsed, capacity, mode, skillsOn]);

  if (failed) return <p className="muted">buff_index.json not found — re-run export_units.py.</p>;
  if (!rows || !units || !byId) return <p className="loading">Loading…</p>;

  const keyTitle = (key: string, r: BuffRow) => {
    const [stat, g] = key.split("|");
    const lab = (r.ns === "skill" ? labels?.skill : r.ns === "ability" ? labels?.ability : undefined)?.[String(r.t)];
    const name = r.grp ? groupName(r.grp, (t) => (r.ns === "skill" ? labels?.skill : labels?.ability)?.[String(t)]?.name, r.t)
      : g === "dmg_amp" ? "Damage taken" : lab?.name || `${r.ns} ${r.t}`;
    return `${STAT_LABEL[stat] ?? stat} · ${name}${r.fl ? " (flat)" : r.vk === "share" ? " (share)" : ""}`;
  };
  const describe = (c: Contribution) => {
    const giver = byId.get(c.giver);
    const tr = c.r.tr ? humanize(c.r.tr) : "";
    return [`${nameOf(giver)}: ${fmtAmount(c.r, c.m)}`, loc?.classes[c.r.s] || c.r.s, c.r.tgt ? String(c.r.tgt) : "",
      tr, c.state === null ? "conditional" : ""].filter(Boolean).join(" · ");
  };
  const sortKeys = (m: Map<string, Contribution[]>) =>
    [...m.entries()].sort((a, b) => keyTitle(a[0], a[1][0].r).localeCompare(keyTitle(b[0], b[1][0].r)));

  const setTeam = (ids: number[], nextBench = bench) => {
    const next = new URLSearchParams(params);
    if (ids.length) next.set("m", ids.join(",")); else next.delete("m");
    const b = [...nextBench].filter((id) => ids.includes(id));
    if (b.length) next.set("b", b.join(",")); else next.delete("b");
    setParams(next, { replace: true });
    setShown(PAGE);
  };
  /** add a member: deployed while a slot is free, else in the formation only */
  const addMember = (id: number) => {
    const nb = new Set(bench);
    if (slotsUsed >= capacity && !noSlot.has(id)) nb.add(id);
    setTeam([...members, id], nb);
  };
  const toggleDeploy = (id: number) => {
    const nb = new Set(bench);
    if (nb.has(id)) nb.delete(id); else nb.add(id);
    setTeam(members, nb);
  };
  const makeTarget = (id: number) => {
    const next = new URLSearchParams(params);
    next.set("t", String(id));
    next.set("m", [target!.id, ...members.filter((x) => x !== id)].join(","));
    const b = [...bench].filter((x) => x !== id);
    if (b.length) next.set("b", b.join(",")); else next.delete("b");
    setParams(next, { replace: true });
  };
  const setMode = (m: Mode) => set("mode", m === "off" ? null : m);

  const picks = q ? units.filter((u) => playable(u) && matchesQuery(u, q)).slice(0, 24) : [];
  const addPicks = addQ
    ? units.filter((u) => playable(u) && !team.includes(u.id) && matchesQuery(u, addQ))
      .sort((a, b) => Number(owned.includes(b.id)) - Number(owned.includes(a.id))).slice(0, 24)
    : [];
  const stagePicks = stageQ.trim()
    ? (stages || []).filter((s) => (s.name || "").includes(stageQ.trim()) || (s.event || "").includes(stageQ.trim())
      || String(s.quest_id) === stageQ.trim()).slice(0, 20)
    : [];
  const pickLabel = (v?: Variant) => (v && (v.cls || v.skill) ? variantLabel(v, loc?.classes) : "");

  return (
    <div className="page team-page">
      <PageHeader title="Team builder" subtitle="Pick a unit to buff, build her formation and see who adds the most buffs next." />
      <div className="team-options">
        <SegmentedButtons label="Candidates" selected={fromCollection ? "own" : "all"}
          options={[{ value: "own", label: `My collection (${owned.length})` }, { value: "all", label: "All units" }]}
          onToggle={(v) => set("pool", v === "all" ? "all" : null)} />
        <label className="team-check">
          <input type="checkbox" checked={skillsOn} onChange={(e) => set("sk", e.target.checked ? null : "0")} /> Count skill buffs
        </label>
      </div>
      {!owned.length && <p className="muted small">No collection yet — suggestions come from every unit. <Link to="/collection">Collection</Link></p>}

      <Panel title="Stage">
        <div className="team-stage">
          {stage ? (
            <span>
              <Link to={`/stages/${stage.quest_id}`}>{stage.name}</Link>
              {stage.event ? <span className="muted"> · {stage.event}</span> : null}
              <span className="team-num"> · deploy limit {stage.capacity}</span>
              <button className="hub-btn hub-btn--sm team-stage__x" onClick={() => set("q", null)}>clear</button>
            </span>
          ) : (
            <label className="cg-ctl">Deploy limit
              <input type="number" min={1} max={MAX_TEAM} value={Number(params.get("cap")) || ""} placeholder={String(MAX_TEAM)}
                onChange={(e) => set("cap", e.target.value && Number(e.target.value) < MAX_TEAM ? String(Number(e.target.value)) : null)} />
            </label>
          )}
          {!stage && <SearchBox value={stageQ} onChange={setStageQ} placeholder="or pick a stage (name / event / quest id)" />}
        </div>
        {!stage && stageQ && (
          <div className="team-picks">
            {stagePicks.map((s) => (
              <button key={s.quest_id} className="team-pick" onClick={() => { set("q", String(s.quest_id)); setStageQ(""); }}>
                <span>{s.name}{s.event ? <span className="muted"> · {s.event}</span> : null}</span>
              </button>
            ))}
            {!stagePicks.length && <span className="muted small">No stage matches.</span>}
          </div>
        )}
      </Panel>

      <Panel title="Unit to buff">
        {target ? (
          <div className="team-target">
            <Link className="team-unit" to={`/units/${target.id}`}>
              <Face id={target.id} size={56} />
              <span>
                <span className="team-unit__name">{nameOf(target)}</span>
                <span className="team-unit__meta">{target.rarity} · {loc?.classes[target.class ?? ""] || target.class}</span>
              </span>
            </Link>
            <button className="hub-btn" onClick={() => { set("t", null); setQ(""); }}>change</button>
          </div>
        ) : (
          <>
            <SearchBox value={q} onChange={setQ} placeholder="search units (name / id)" />
            <div className="team-picks">
              {picks.map((u) => (
                <button key={u.id} className="team-pick" onClick={() => { set("t", String(u.id)); setQ(""); }}>
                  <Face id={u.id} size={36} /><span>{nameOf(u)}</span>
                </button>
              ))}
              {q && !picks.length && <span className="muted small">Nothing matches.</span>}
              {!q && <span className="muted small">Search for the unit the formation should buff.</span>}
            </div>
          </>
        )}
      </Panel>

      {target && (
        <>
          <Panel title={`Formation (${team.length}/${MAX_TEAM}) · deployed ${slotsUsed}/${capacity}`}>
            {slotsUsed > capacity && <p className="team-warn small">More units deployed than the deploy limit — set some to formation only.</p>}
            <div className="team-members">
              {team.map((id) => {
                const u = byId.get(id);
                const dep = isDeployed(id);
                const pick = pickLabel(formation[mode].picks.get(id));
                return (
                  <span key={id} className={`team-member${id === target.id ? " is-target" : ""}${dep ? "" : " is-bench"}`}>
                    <Link to={`/units/${id}`} title={nameOf(u) || String(id)}><Face id={id} size={44} /></Link>
                    <span className="team-member__name">{nameOf(u) || `#${id}`}</span>
                    {pick && <span className="team-member__pick" title="the class / skill counted for her">{pick}</span>}
                    {noSlot.has(id) && <span className="team-member__pick">no deploy slot</span>}
                    {id !== target.id && (
                      <>
                        <button className="team-member__x" aria-label="remove" title="remove" onClick={() => setTeam(members.filter((m) => m !== id))}>×</button>
                        <button className="team-member__t" disabled={!dep && slotsUsed >= capacity && !noSlot.has(id)}
                          title={dep ? "deployed — click for formation only (sortie buffs only)" : "formation only — click to deploy"}
                          onClick={() => toggleDeploy(id)}>{dep ? "deployed" : "bench"}</button>
                        <button className="team-member__t" title="buff her instead" onClick={() => makeTarget(id)}>buff her</button>
                      </>
                    )}
                  </span>
                );
              })}
            </div>
            {team.length < MAX_TEAM && (
              <div className="team-add-manual">
                <SearchBox value={addQ} onChange={setAddQ} placeholder="add a unit by hand (name / id)" />
                {addQ && (
                  <div className="team-picks">
                    {addPicks.map((u) => (
                      <button key={u.id} className={`team-pick${owned.includes(u.id) ? " is-own" : ""}`} onClick={() => { addMember(u.id); setAddQ(""); }}>
                        <Face id={u.id} size={36} /><span>{nameOf(u)}</span>
                      </button>
                    ))}
                    {!addPicks.length && <span className="muted small">Nothing matches.</span>}
                  </div>
                )}
              </div>
            )}
            {members.length > 0 && <button className="hub-btn team-clear" onClick={() => setTeam([], new Set())}>clear formation</button>}
          </Panel>

          <Panel title={`What the formation gives ${nameOf(target)}`}>
            <div className="team-overall">
              {(["off", "def", "util"] as const).map((m) => (
                <div key={m} className="team-overall__col">
                  <h3 className="team-overall__h">{m === "off" ? "Offense" : m === "def" ? "Defense" : "Utility"}</h3>
                  {formation[m].contrib.size ? (
                    <ul className="team-overall__list">
                      {sortKeys(formation[m].contrib).map(([k, cs]) => (
                        <li key={k} title={cs.map(describe).join("\n")}>
                          <span>{keyTitle(k, cs[0].r)}{cs.every((c) => c.state === null) ? " ?" : ""}</span>
                          <strong className="team-num">{fmtAmount(cs[0].r, total(cs))}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="muted small">Nothing yet.</p>}
                </div>
              ))}
            </div>
            <p className="muted small">One line per buff group: buffs in the same group don't stack (except additive ones); different groups are listed separately. "?" = depends on a condition (enemy kind, HP, class-change state…).</p>
          </Panel>

          <FilterRow label="Suggest">
            {(["off", "def", "util"] as const).map((m) => (
              <FilterChip key={m} active={mode === m} onClick={() => setMode(m)}>
                {m === "off" ? "Offense" : m === "def" ? "Defense" : "Utility"}
              </FilterChip>
            ))}
          </FilterRow>
          <p className="muted small">{MODE_STATS[mode].map((s) => STAT_LABEL[s]).join(" · ")}</p>

          <h2 className="team-h">Who to add next</h2>
          {team.length >= MAX_TEAM ? <p className="muted">The formation is full ({MAX_TEAM}).</p> : (
            <>
              <p className="muted small">
                Ranked by what each unit would add for {nameOf(target)}: new buff groups first, then the share of each group's new total.
                {slotsUsed >= capacity ? " The deploy limit is reached, so a new unit joins the formation only: only her sortie buffs count." : ""}
              </p>
              <ol className="team-cands">
                {ranked.slice(0, shown).map(({ u, list, fresh, score, v, deployed }) => (
                  <li key={u.id} className="team-cand">
                    <div className="team-cand__head">
                      <Link className="team-unit" to={`/units/${u.id}`}>
                        <Face id={u.id} size={44} />
                        <span>
                          <span className="team-unit__name">{nameOf(u)}</span>
                          <span className="team-unit__meta">
                            {u.rarity} · {loc?.classes[u.class ?? ""] || u.class}
                            {pickLabel(v) ? ` · ${pickLabel(v)}` : ""}
                            {noSlot.has(u.id) ? " · no deploy slot" : deployed ? "" : " · formation only"}
                          </span>
                        </span>
                      </Link>
                      <span className="team-cand__score" title="ranking score">
                        {fresh > 0 && <span className="team-new">{fresh} new</span>}
                        <span className="muted small">{score.toFixed(2)}</span>
                      </span>
                      <button className="hub-btn team-add" onClick={() => addMember(u.id)}>add</button>
                    </div>
                    <div className="team-gains">
                      {list.map((g) => {
                        const up = g.after > g.before;
                        return (
                          <span key={g.key}
                            className={`team-gain${g.isNew ? " is-new" : up ? " is-up" : " is-none"}${g.best.near ? " is-near" : ""}${g.best.state === null ? " is-cond" : ""}`}
                            title={`${describe(g.best)}\n${up ? `${fmtAmount(g.best.r, g.before)} → ${fmtAmount(g.best.r, g.after)}` : "no gain: the formation already has as much"}`}>
                            {keyTitle(g.key, g.best.r)} <strong>{fmtAmount(g.best.r, g.best.m)}</strong>
                          </span>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ol>
              {!ranked.length && <p className="muted">No unit adds anything here.</p>}
              {ranked.length > shown && <button className="hub-btn" onClick={() => setShown(shown + PAGE)}>show {Math.min(PAGE, ranked.length - shown)} more ({ranked.length - shown} left)</button>}
            </>
          )}
          <p className="muted small">
            Every unit counts at its top form: the awakened ability if she has one, her last class (the better 2nd-awakening branch), and the one skill that adds the most.
            Values are each buff's cap, as on <Link to="/buffs">Buffs</Link>. Dashed = depends on placement (in range / nearby); faded = conditional.
            Set-PAD skills and the 1st-barrack (possession) buffs are left out.
          </p>
        </>
      )}
    </div>
  );
}
