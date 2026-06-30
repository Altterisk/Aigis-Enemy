import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useEnemies, useStages, useEnemyStages, useSpecialtyConfig } from "../data";
import { Sprite, DamageBadge, Stat, Tags, Effects } from "../components";

export default function EnemyDetail() {
  const { id } = useParams();
  const enemyId = Number(id);
  const { loading, byId } = useEnemies();
  const { byQuest } = useStages();         // slim index keyed by quest_id
  const enemyStages = useEnemyStages();    // global_id -> [quest_id]
  const spcfg = useSpecialtyConfig();

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

  if (loading) return <p className="loading">Loading…</p>;
  const e = byId?.get(enemyId);
  if (!e) return <p>Enemy not found. <Link to="/enemies">Back</Link></p>;

  const effects =
    (e.special_effect_id && spcfg?.[String(e.special_effect_id)]) || [];

  return (
    <div className="detail">
      <Link to="/enemies" className="back">← enemies</Link>
      <div className="enemy-hero">
        <Sprite patternId={e.pattern_id} size={120} alt={String(e.id)} />
        <div>
          <h2>Enemy #{e.id}</h2>
          <div className="meta">
            <span>type {e.type}</span>
            <DamageBadge type={e.damage_type} />
            {e.boss && <span className="badge boss">BOSS</span>}
            {e.sky && <span className="badge sky">SKY</span>}
          </div>
          <Tags tags={e.tags} />
        </div>
      </div>

      <section className="stats-grid">
        <Stat label="HP" value={(e.hp ?? 0).toLocaleString()} />
        <Stat label="Attack" value={(e.attack ?? 0).toLocaleString()} />
        <Stat label="Armor DEF" value={e.armor_defense ?? 0} />
        <Stat label="Magic RES" value={e.magic_defense ?? 0} />
        <Stat label="Range" value={e.attack_range ?? 0} />
        <Stat label="Atk interval" value={e.attack_speed ?? 0} />
        <Stat label="Move speed" value={e.move_speed ?? 0} />
        <Stat label="Weather" value={e.weather ?? "NONE"} />
      </section>

      {effects.length > 0 && (
        <section>
          <h3>Abilities</h3>
          <Effects effects={effects} />
        </section>
      )}

      <section>
        <h3>Raw damage fields</h3>
        <p className="muted small">
          Shown unexplained: damage type is derived from these. TypeAttack=300 →
          true; MagicAttack=1 → magical.
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
          <h3>Form change</h3>
          <p>
            Changes into{" "}
            <Link to={`/enemies/${e.change_to}`}>enemy #{e.change_to}</Link>{" "}
            <span className="muted">
              (condition {e.change_condition} — trigger type, raw)
            </span>
          </p>
        </section>
      )}

      <section>
        <h3>Appears in {appearsIn.length} stage(s)</h3>
        {appearsIn.length === 0 ? (
          <p className="muted">
            No stage references this global enemy id (it may appear only as a
            map-local enemy, or in maps not in this data version).
          </p>
        ) : (
          <ul className="stage-links">
            {appearsIn.slice(0, 60).map((s) => (
              <li key={s.quest_id}>
                <Link to={`/stages/${s.quest_id}`}>
                  {s.name} <span className="muted">(×{s.multiplier ?? 1})</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
