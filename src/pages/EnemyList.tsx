import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, ListToolbar, Pager, SearchBox } from "@altterisk/game-hub";
import { listState, searchParamsAdapter } from "@altterisk/game-hub/filters";
import { useEnemies, useSpecialtyConfig, useInfluenceLabels, useExprNames } from "../data";
import { Sprite, DamageBadge, fillLabel } from "../components";
import type { GlobalEnemy, SpecialtyConfig } from "../types";
import { useHubLabels, useL } from "../i18n";

const PAGE = 60;
const FILTER_KEYS = ["q", "dmg", "tag", "infl"];

// resolve an enemy's influence ids from its SpEff, skipping cosmetic visuals.
const COSMETIC = new Set([1, 31, 49, 50]);
function enemyInfluences(e: GlobalEnemy, spcfg: SpecialtyConfig | null): number[] {
  const rows = (e.special_effect_id && spcfg?.[String(e.special_effect_id)]) || [];
  return rows.map((r) => r.influence).filter((i) => !COSMETIC.has(i));
}

export default function EnemyList() {
  const L = useL();
  const hub = useHubLabels();
  useExprNames();
  const { loading, enemies } = useEnemies();
  const spcfg = useSpecialtyConfig();
  const labels = useInfluenceLabels();

  // search/filter/page state lives in the URL (absent = "all"); ?page= is 0-based
  const [params, setParams] = useSearchParams();
  const adapter = searchParamsAdapter(params, setParams);
  const list = listState(adapter);
  const q = list.text("q");
  const dmg = list.text("dmg", "all");
  const tag = list.text("tag", "all");
  const infl = list.text("infl", "all");
  const page = Number(params.get("page") || "0");
  const setFilter = (key: string) => (value: string) => list.setText(key, value === "all" ? "" : value);
  const activeFilters = FILTER_KEYS.filter((k) => params.get(k)).length;

  const { tagOpts, inflOpts } = useMemo(() => {
    const tags = new Set<string>();
    const infls = new Set<number>();
    if (enemies && spcfg) {
      for (const e of enemies) {
        (e.tags || []).forEach((t) => tags.add(t));
        enemyInfluences(e, spcfg).forEach((i) => infls.add(i));
      }
    }
    return {
      tagOpts: [...tags].sort(),
      inflOpts: [...infls].sort((a, b) => a - b),
    };
  }, [enemies, spcfg]);

  const filtered = useMemo(() => {
    if (!enemies) return [] as GlobalEnemy[];
    const term = q.trim().toLowerCase();
    const inflN = infl === "all" ? null : Number(infl);
    return enemies.filter((e) => {
      if (dmg !== "all" && e.damage_type !== dmg) return false;
      if (tag !== "all" && !(e.tags || []).includes(tag)) return false;
      if (inflN != null && !enemyInfluences(e, spcfg).includes(inflN)) return false;
      if (term) {
        const hay = [String(e.id), e.type, (e.tags || []).join(",")]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [enemies, spcfg, q, dmg, tag, infl]);

  if (loading) return <p className="loading">{L("Loading enemies…", "敵を読み込み中…")}</p>;

  const pages = Math.ceil(filtered.length / PAGE);
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const inflLabel = (i: number) => {
    const tpl = labels?.specialty?.[String(i)];
    return tpl ? `${i} — ${fillLabel(tpl, []).slice(0, 40)}` : `influence ${i}`;
  };

  return (
    <div>
      <ListToolbar
        search={(
          <>
            <SearchBox value={q} onChange={setFilter("q")} placeholder={L("Search id / type / tag", "ID・タイプ・タグで検索")} clearLabel={hub.clearSearch} />
            <select className="hub-select" value={dmg} onChange={(e) => setFilter("dmg")(e.target.value)}>
              <option value="all">{L("all damage", "すべての攻撃")}</option>
              <option value="physical">{L("physical", "物理")}</option>
              <option value="magical">{L("magical", "魔法")}</option>
              <option value="true">{L("true", "貫通")}</option>
            </select>
            <select className="hub-select" value={tag} onChange={(e) => setFilter("tag")(e.target.value)}>
              <option value="all">{L("all tags", "すべてのタグ")}</option>
              {tagOpts.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select className="hub-select" value={infl} onChange={(e) => setFilter("infl")(e.target.value)}>
              <option value="all">{L("all abilities", "すべての特性")}</option>
              {inflOpts.map((i) => (
                <option key={i} value={String(i)}>{inflLabel(i)}</option>
              ))}
            </select>
          </>
        )}
        count={L("{n} enemies", "{n} 体", { n: filtered.length.toLocaleString() })}
        activeFilters={activeFilters}
        onClearFilters={() => list.clear(FILTER_KEYS)}
        labels={hub.toolbar}
      />

      {shown.length === 0 && <EmptyState title={L("No enemies match these filters.", "条件に合う敵がいません。")} hint={L("Change the search or clear the filters.", "検索条件を変えるか、絞り込みを解除してください。")} />}

      <div className="enemy-grid">
        {shown.map((e) => (
          <Link to={`/enemies/${e.id}`} className="enemy-tile" key={e.id}>
            <span className="sprite-box">
              <Sprite patternId={e.pattern_id} size={52} fit alt={String(e.id)} />
            </span>
            <div className="enemy-tile-body">
              <div className="enemy-tile-id">
                #{e.id} {e.boss && <span className="badge boss">BOSS</span>}
              </div>
              <div className="enemy-tile-attr">
                {e.tags && e.tags.length ? e.tags.join(" · ") : e.type}
              </div>
              <div><DamageBadge type={e.damage_type} /></div>
              <div className="muted small">
                HP {(e.hp ?? 0).toLocaleString()} · {L("ATK", "攻撃力")} {(e.attack ?? 0).toLocaleString()}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Pager page={page + 1} pages={pages} onPage={(p) => adapter.set({ page: p > 1 ? String(p - 1) : null })} labels={hub.pager} />
    </div>
  );
}
