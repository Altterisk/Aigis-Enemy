import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useEnemies, useStages } from "../data.js";
import { Sprite, DamageBadge, Stat, Tags } from "../components.jsx";

export default function EnemyDetail() {
  const { id } = useParams();
  const enemyId = Number(id);
  const { loading, byId } = useEnemies();
  const { stages } = useStages();

  // Stage enemies are map-local (their stats are tuned per map), so a global
  // enemy page can't reliably list its stage appearances. Match by sprite
  // (pattern_id) as a best-effort cross-reference instead.
  const appearsIn = useMemo(() => {
    if (!stages || !byId) return [];
    const me = byId.get(enemyId);
    if (!me) return [];
    return stages.filter((s) =>
      s.enemies.some((en) =>
        en.forms.some((f) => f.pattern_id === me.pattern_id)
      )
    );
  }, [stages, byId, enemyId]);

  if (loading) return <p className="loading">Loading…</p>;
  const e = byId.get(enemyId);
  if (!e) return <p>Enemy not found. <Link to="/enemies">Back</Link></p>;

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
        <Stat label="HP" value={e.hp.toLocaleString()} />
        <Stat label="Attack" value={e.attack.toLocaleString()} />
        <Stat label="Armor DEF" value={e.armor_defense} />
        <Stat label="Magic RES" value={e.magic_defense} />
        <Stat label="Range" value={e.attack_range} />
        <Stat label="Atk interval" value={e.attack_speed} />
        <Stat label="Move speed" value={e.move_speed} />
        <Stat label="Weather" value={e.weather} />
      </section>

      <section>
        <h3>Raw damage fields</h3>
        <p className="muted small">
          Shown unexplained: damage type is derived from these. TypeAttack=300 →
          true; MagicAttack=1 → magical.
        </p>
        <ul className="effects">
          <li><code>MagicAttack</code> = {e.raw.MagicAttack}</li>
          <li><code>TypeAttack</code> = {e.raw.TypeAttack}</li>
          <li><code>ATTACK_TYPE</code> = {e.raw.ATTACK_TYPE}</li>
          <li><code>SpecialEffect</code> = {e.special_effect_id}</li>
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
                  {s.name} <span className="muted">(Lv{s.level})</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
