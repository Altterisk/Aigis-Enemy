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
import { gameName, rarityName, useL } from "../i18n";

const PAGE = 20;
const STAT_LABEL_JA: Record<string, string> = {
  ATK: "攻撃力", DEF: "防御力", HP: "HP", MR: "魔法耐性", RNG: "射程", PAD_REDUCTION: "攻撃後の待ち時間短縮",
  CDR: "スキル再使用時間短縮", ATK_DEBUFF: "敵の攻撃力低下", DEF_DEBUFF: "敵の防御力低下",
  MR_DEBUFF: "敵の魔法耐性低下", PAD_DEBUFF: "敵の攻撃後の待ち時間増加", DMG_AMP: "敵の被ダメージ増加",
};

const nameOf = (u?: UnitIndexEntry) => (u ? gameName(u.name_en, u.name) : "");
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
  const L = useL();

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

  if (failed) return <p className="muted">{L("buff_index.json not found — re-run export_units.py.", "buff_index.json がありません — export_units.py を再実行してください。")}</p>;
  if (!rows || !units || !byId) return <p className="loading">{L("Loading…", "読み込み中…")}</p>;

  const keyTitle = (key: string, r: BuffRow) => {
    const [stat, g] = key.split("|");
    const lab = (r.ns === "skill" ? labels?.skill : r.ns === "ability" ? labels?.ability : undefined)?.[String(r.t)];
    const name = r.grp ? groupName(r.grp, (t) => (r.ns === "skill" ? labels?.skill : labels?.ability)?.[String(t)]?.name, r.t)
      : g === "dmg_amp" ? L("Damage taken", "被ダメージ") : lab?.name || `${r.ns} ${r.t}`;
    return `${L(STAT_LABEL[stat] ?? stat, STAT_LABEL_JA[stat] ?? stat)} · ${name}${r.fl ? L(" (flat)", " (固定値)") : r.vk === "share" ? L(" (share)", " (割合付与)") : ""}`;
  };
  const describe = (c: Contribution) => {
    const giver = byId.get(c.giver);
    const tr = c.r.tr ? humanize(c.r.tr) : "";
    return [`${nameOf(giver)}: ${fmtAmount(c.r, c.m)}`, loc?.classes[c.r.s] || c.r.s, c.r.tgt ? String(c.r.tgt) : "",
      tr, c.state === null ? L("conditional", "条件付き") : ""].filter(Boolean).join(" · ");
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
  const modeLabel = (m: Mode) => (m === "off" ? L("Offense", "攻撃") : m === "def" ? L("Defense", "防御") : L("Utility", "補助"));

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
      <PageHeader title={L("Team builder", "編成ビルダー")} subtitle={L("Pick a unit to buff, build her formation and see who adds the most buffs next.", "強化したいユニットを選んで編成を組み、次にバフを多く与えるユニットを確認します。")} />
      <div className="team-options">
        <SegmentedButtons label={L("Candidates", "候補")} selected={fromCollection ? "own" : "all"}
          options={[{ value: "own", label: L("My collection ({n})", "所持ユニット ({n})", { n: owned.length }) }, { value: "all", label: L("All units", "全ユニット") }]}
          onToggle={(v) => set("pool", v === "all" ? "all" : null)} />
        <label className="team-check">
          <input type="checkbox" checked={skillsOn} onChange={(e) => set("sk", e.target.checked ? null : "0")} /> {L("Count skill buffs", "スキルのバフを含める")}
        </label>
      </div>
      {!owned.length && <p className="muted small">{L("No collection yet — suggestions come from every unit.", "所持ユニットが未登録のため、全ユニットから提案します。")} <Link to="/collection">{L("Collection", "所持")}</Link></p>}

      <Panel title={L("Stage", "ステージ")}>
        <div className="team-stage">
          {stage ? (
            <span>
              <Link to={`/stages/${stage.quest_id}`}>{stage.name}</Link>
              {stage.event ? <span className="muted"> · {stage.event}</span> : null}
              <span className="team-num">{L(" · deploy limit {n}", " · 出撃上限 {n}", { n: stage.capacity ?? 0 })}</span>
              <button className="hub-btn hub-btn--sm team-stage__x" onClick={() => set("q", null)}>{L("clear", "解除")}</button>
            </span>
          ) : (
            <label className="cg-ctl">{L("Deploy limit", "出撃上限")}
              <input type="number" min={1} max={MAX_TEAM} value={Number(params.get("cap")) || ""} placeholder={String(MAX_TEAM)}
                onChange={(e) => set("cap", e.target.value && Number(e.target.value) < MAX_TEAM ? String(Number(e.target.value)) : null)} />
            </label>
          )}
          {!stage && <SearchBox value={stageQ} onChange={setStageQ} placeholder={L("or pick a stage (name / event / quest id)", "またはステージを選択 (名前・イベント・クエストID)")} />}
        </div>
        {!stage && stageQ && (
          <div className="team-picks">
            {stagePicks.map((s) => (
              <button key={s.quest_id} className="team-pick" onClick={() => { set("q", String(s.quest_id)); setStageQ(""); }}>
                <span>{s.name}{s.event ? <span className="muted"> · {s.event}</span> : null}</span>
              </button>
            ))}
            {!stagePicks.length && <span className="muted small">{L("No stage matches.", "該当するステージがありません。")}</span>}
          </div>
        )}
      </Panel>

      <Panel title={L("Unit to buff", "強化するユニット")}>
        {target ? (
          <div className="team-target">
            <Link className="team-unit" to={`/units/${target.id}`}>
              <Face id={target.id} size={56} />
              <span>
                <span className="team-unit__name">{nameOf(target)}</span>
                <span className="team-unit__meta">{rarityName(target.rarity)} · {loc?.classes[target.class ?? ""] || target.class}</span>
              </span>
            </Link>
            <button className="hub-btn" onClick={() => { set("t", null); setQ(""); }}>{L("change", "変更")}</button>
          </div>
        ) : (
          <>
            <SearchBox value={q} onChange={setQ} placeholder={L("search units (name / id)", "ユニットを検索 (名前・ID)")} />
            <div className="team-picks">
              {picks.map((u) => (
                <button key={u.id} className="team-pick" onClick={() => { set("t", String(u.id)); setQ(""); }}>
                  <Face id={u.id} size={36} /><span>{nameOf(u)}</span>
                </button>
              ))}
              {q && !picks.length && <span className="muted small">{L("Nothing matches.", "該当なし")}</span>}
              {!q && <span className="muted small">{L("Search for the unit the formation should buff.", "編成で強化したいユニットを検索してください。")}</span>}
            </div>
          </>
        )}
      </Panel>

      {target && (
        <>
          <Panel title={L("Formation ({n}/{max}) · deployed {d}/{cap}", "編成 ({n}/{max}) · 出撃 {d}/{cap}", { n: team.length, max: MAX_TEAM, d: slotsUsed, cap: capacity })}>
            {slotsUsed > capacity && <p className="team-warn small">{L("More units deployed than the deploy limit — set some to formation only.", "出撃上限を超えています — 一部を編成のみにしてください。")}</p>}
            <div className="team-members">
              {team.map((id) => {
                const u = byId.get(id);
                const dep = isDeployed(id);
                const pick = pickLabel(formation[mode].picks.get(id));
                return (
                  <span key={id} className={`team-member${id === target.id ? " is-target" : ""}${dep ? "" : " is-bench"}`}>
                    <Link to={`/units/${id}`} title={nameOf(u) || String(id)}><Face id={id} size={44} /></Link>
                    <span className="team-member__name">{nameOf(u) || `#${id}`}</span>
                    {pick && <span className="team-member__pick" title={L("the class / skill counted for her", "計算に使うクラス・スキル")}>{pick}</span>}
                    {noSlot.has(id) && <span className="team-member__pick">{L("no deploy slot", "出撃枠を使わない")}</span>}
                    {id !== target.id && (
                      <>
                        <button className="team-member__x" aria-label={L("remove", "外す")} title={L("remove", "外す")} onClick={() => setTeam(members.filter((m) => m !== id))}>×</button>
                        <button className="team-member__t" disabled={!dep && slotsUsed >= capacity && !noSlot.has(id)}
                          title={dep ? L("deployed — click for formation only (sortie buffs only)", "出撃中 — クリックで編成のみ (出撃時バフのみ)") : L("formation only — click to deploy", "編成のみ — クリックで出撃")}
                          onClick={() => toggleDeploy(id)}>{dep ? L("deployed", "出撃") : L("bench", "控え")}</button>
                        <button className="team-member__t" title={L("buff her instead", "このユニットを強化対象にする")} onClick={() => makeTarget(id)}>{L("buff her", "対象")}</button>
                      </>
                    )}
                  </span>
                );
              })}
            </div>
            {team.length < MAX_TEAM && (
              <div className="team-add-manual">
                <SearchBox value={addQ} onChange={setAddQ} placeholder={L("add a unit by hand (name / id)", "ユニットを手動で追加 (名前・ID)")} />
                {addQ && (
                  <div className="team-picks">
                    {addPicks.map((u) => (
                      <button key={u.id} className={`team-pick${owned.includes(u.id) ? " is-own" : ""}`} onClick={() => { addMember(u.id); setAddQ(""); }}>
                        <Face id={u.id} size={36} /><span>{nameOf(u)}</span>
                      </button>
                    ))}
                    {!addPicks.length && <span className="muted small">{L("Nothing matches.", "該当なし")}</span>}
                  </div>
                )}
              </div>
            )}
            {members.length > 0 && <button className="hub-btn team-clear" onClick={() => setTeam([], new Set())}>{L("clear formation", "編成をクリア")}</button>}
          </Panel>

          <Panel title={L("What the formation gives {name}", "編成から{name}への効果", { name: nameOf(target) })}>
            <div className="team-overall">
              {(["off", "def", "util"] as const).map((m) => (
                <div key={m} className="team-overall__col">
                  <h3 className="team-overall__h">{modeLabel(m)}</h3>
                  {formation[m].contrib.size ? (
                    <ul className="team-overall__list">
                      {sortKeys(formation[m].contrib).map(([k, cs]) => (
                        <li key={k} title={cs.map(describe).join("\n")}>
                          <span>{keyTitle(k, cs[0].r)}{cs.every((c) => c.state === null) ? " ?" : ""}</span>
                          <strong className="team-num">{fmtAmount(cs[0].r, total(cs))}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="muted small">{L("Nothing yet.", "まだありません。")}</p>}
                </div>
              ))}
            </div>
            <p className="muted small">{L("One line per buff group: buffs in the same group don't stack (except additive ones); different groups are listed separately. \"?\" = depends on a condition (enemy kind, HP, class-change state…).", "バフの種類ごとに1行: 同じ種類のバフは重複しません (加算型を除く)。種類が違うものは別々に表示します。「?」= 条件付き (敵の種類・HP・クラスチェンジ段階など)。")}</p>
          </Panel>

          <FilterRow label={L("Suggest", "提案")}>
            {(["off", "def", "util"] as const).map((m) => (
              <FilterChip key={m} active={mode === m} onClick={() => setMode(m)}>
                {modeLabel(m)}
              </FilterChip>
            ))}
          </FilterRow>
          <p className="muted small">{MODE_STATS[mode].map((s) => L(STAT_LABEL[s], STAT_LABEL_JA[s] ?? s)).join(" · ")}</p>

          <h2 className="team-h">{L("Who to add next", "次に追加するユニット")}</h2>
          {team.length >= MAX_TEAM ? <p className="muted">{L("The formation is full ({n}).", "編成が満員です ({n})。", { n: MAX_TEAM })}</p> : (
            <>
              <p className="muted small">
                {L("Ranked by what each unit would add for {name}: new buff groups first, then the share of each group's new total.", "{name}に追加される効果で順位付け: 新しい種類のバフを優先し、次に各種類の合計に占める割合。", { name: nameOf(target) })}
                {slotsUsed >= capacity ? L(" The deploy limit is reached, so a new unit joins the formation only: only her sortie buffs count.", " 出撃上限に達しているため、追加するユニットは編成のみ: 出撃時バフだけが有効です。") : ""}
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
                            {rarityName(u.rarity)} · {loc?.classes[u.class ?? ""] || u.class}
                            {pickLabel(v) ? ` · ${pickLabel(v)}` : ""}
                            {noSlot.has(u.id) ? L(" · no deploy slot", " · 出撃枠を使わない") : deployed ? "" : L(" · formation only", " · 編成のみ")}
                          </span>
                        </span>
                      </Link>
                      <span className="team-cand__score" title={L("ranking score", "スコア")}>
                        {fresh > 0 && <span className="team-new">{L("{n} new", "新規 {n}", { n: fresh })}</span>}
                        <span className="muted small">{score.toFixed(2)}</span>
                      </span>
                      <button className="hub-btn team-add" onClick={() => addMember(u.id)}>{L("add", "追加")}</button>
                    </div>
                    <div className="team-gains">
                      {list.map((g) => {
                        const up = g.after > g.before;
                        return (
                          <span key={g.key}
                            className={`team-gain${g.isNew ? " is-new" : up ? " is-up" : " is-none"}${g.best.near ? " is-near" : ""}${g.best.state === null ? " is-cond" : ""}`}
                            title={`${describe(g.best)}\n${up ? `${fmtAmount(g.best.r, g.before)} → ${fmtAmount(g.best.r, g.after)}` : L("no gain: the formation already has as much", "効果なし: 編成に同等以上の効果があります")}`}>
                            {keyTitle(g.key, g.best.r)} <strong>{fmtAmount(g.best.r, g.best.m)}</strong>
                          </span>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ol>
              {!ranked.length && <p className="muted">{L("No unit adds anything here.", "効果を追加できるユニットはありません。")}</p>}
              {ranked.length > shown && <button className="hub-btn" onClick={() => setShown(shown + PAGE)}>{L("show {n} more ({left} left)", "さらに{n}件表示 (残り{left}件)", { n: Math.min(PAGE, ranked.length - shown), left: ranked.length - shown })}</button>}
            </>
          )}
          <p className="muted small">
            {L("Every unit counts at its top form: the awakened ability if she has one, her last class (the better 2nd-awakening branch), and the one skill that adds the most. Values are each buff's cap, as on", "各ユニットは最終形態で計算: 覚醒アビリティ (あれば)、最終クラス (第二覚醒は効果の高い方)、最も効果の高いスキル1つ。数値は各バフの上限値です。参照:")}{" "}
            <Link to="/buffs">{L("Buffs", "バフ")}</Link>.{" "}
            {L("Dashed = depends on placement (in range / nearby); faded = conditional. Set-PAD skills and the 1st-barrack (possession) buffs are left out.", "破線 = 配置次第 (射程内・周囲)、薄色 = 条件付き。攻撃後の待ち時間固定のスキルと所持効果は含みません。")}
          </p>
        </>
      )}
    </div>
  );
}
