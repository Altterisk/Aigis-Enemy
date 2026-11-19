import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useEnemies, useStages, useEnemyStages, useSpecialtyConfig, useExprNames } from "../data";
import { Sprite, DamageBadge, Stat, Tags, Effects, ColorCodedText } from "../components";
import { LIST_META, NOT_FOUND_META, enemyMeta } from "../meta";
import { usePageMeta } from "../usePageMeta";
import { useL } from "../i18n";

export default function EnemyDetail() {
  useExprNames();
  const { id } = useParams();
  const enemyId = Number(id);
  const { loading, byId } = useEnemies();
  const { byQuest } = useStages();         // slim index keyed by quest_id
  const enemyStages = useEnemyStages();    // global_id -> [quest_id]
  const spcfg = useSpecialtyConfig();
  const L = useL();

  // Stage appearances from the precise reverse index (global_id -> quest_ids),
  // resolved against the stage index for names.
  const appearsIn = useMemo(() => {
    if (!enemyStages || !byQuest) return [];
    const qids = enemyStages[String(enemyId)] || [];
    return qids
      .map((qid) => byQuest.get(qid))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .sort((a, b) => a.quest_id - b.quest_id);
  }, [enemyStages, byQuest, enemyId]);

  const e = byId?.get(enemyId);
  usePageMeta(loading ? LIST_META["/enemies"] : e ? enemyMeta(e) : NOT_FOUND_META);
  if (loading) return <p className="loading">{L("Loading…", "読み込み中…")}</p>;
  if (!e) return <p>{L("Enemy not found.", "敵が見つかりません。")} <Link to="/enemies">{L("Back", "戻る")}</Link></p>;

  const effects =
    (e.special_effect_id && spcfg?.[String(e.special_effect_id)]) || [];

  return (
    <div className="detail">
      <Link to="/enemies" className="back">{L("← enemies", "← 敵一覧")}</Link>
      <div className="enemy-hero">
        <span className="sprite-box sprite-box--lg">
          <Sprite patternId={e.pattern_id} size={112} fit alt={String(e.id)} />
        </span>
        <div>
          <h2>{L("Enemy #{id}", "敵 #{id}", { id: e.id })}</h2>
          <div className="meta">
            <span>{L("type", "タイプ")} {e.type}</span>
            <DamageBadge type={e.damage_type} />
            {e.boss && <span className="badge boss">BOSS</span>}
            {e.sky && <span className="badge sky">SKY</span>}
          </div>
          <Tags tags={e.tags} />
        </div>
      </div>

      <section className="stats-grid">
        <Stat label="HP" value={(e.hp ?? 0).toLocaleString()} />
        <Stat label={L("Attack", "攻撃力")} value={(e.attack ?? 0).toLocaleString()} />
        <Stat label={L("Armor DEF", "物理防御")} value={e.armor_defense ?? 0} />
        <Stat label={L("Magic RES", "魔法耐性")} value={e.magic_defense ?? 0} />
        <Stat label={L("Range", "射程")} value={e.attack_range ?? 0} />
        <Stat label={L("Atk interval", "攻撃間隔")} value={e.attack_speed ?? 0} />
        <Stat label={L("Move speed", "移動速度")} value={e.move_speed ?? 0} />
        <Stat label={L("Weather", "天候")} value={e.weather ?? "NONE"} />
      </section>

      {effects.length > 0 && (
        <section>
          <h3>{L("Abilities", "特性")}</h3>
          <Effects effects={effects} />
        </section>
      )}

      <section>
        <h3>{L("Raw damage fields", "攻撃種別の生データ")}</h3>
        <p className="muted small">
          {L("Shown unexplained: damage type is derived from these. TypeAttack=300 → true; MagicAttack=1 → magical.", "そのまま表示: 攻撃種別はこれらから判定します。TypeAttack=300 → 貫通、MagicAttack=1 → 魔法。")}
        </p>
        <ul className="effects">
          <li><code>MagicAttack</code> = {e.raw?.MagicAttack ?? 0}</li>
          <li><code>TypeAttack</code> = {e.raw?.TypeAttack ?? 0}</li>
          <li><code>ATTACK_TYPE</code> = {e.raw?.ATTACK_TYPE ?? 0}</li>
          <li><code>SpecialEffect</code> = {e.special_effect_id ?? 0}</li>
          <li><code>PatternID</code> = {e.pattern_id}</li>
        </ul>
      </section>

      {e.change_to && (
        <section>
          <h3>{L("Form change", "形態変化")}</h3>
          <p>
            {L("Changes into", "変化先:")}{" "}
            <Link to={`/enemies/${e.change_to}`}>{L("enemy #{id}", "敵 #{id}", { id: e.change_to })}</Link>{" "}
            <span className="muted">
              {L("(condition {c} — trigger type, raw)", "(条件 {c} — 発動タイプ、生データ)", { c: e.change_condition ?? "" })}
            </span>
          </p>
        </section>
      )}

      <section>
        <h3>{L("Appears in {n} stage(s)", "出現ステージ {n} 件", { n: appearsIn.length })}</h3>
        {appearsIn.length === 0 ? (
          <p className="muted">
            {L("No stage references this global enemy id (it may appear only as a map-local enemy, or in maps not in this data version).", "この敵IDを参照するステージはありません (マップ固有の敵としてのみ出現するか、このデータにないマップの可能性があります)。")}
          </p>
        ) : (
          <ul className="stage-links">
            {appearsIn.slice(0, 60).map((s) => (
              <li key={s.quest_id}>
                <Link to={`/stages/${s.quest_id}`}>
                  <ColorCodedText text={s.name} /> <span className="muted">(×{s.multiplier ?? 1})</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
