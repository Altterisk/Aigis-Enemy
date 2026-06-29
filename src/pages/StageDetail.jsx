import { useParams, Link } from "react-router-dom";
import { useStages } from "../data.js";
import { Sprite, DamageBadge, Effects, Tags } from "../components.jsx";

// One stat/attack block: a form, or an attack-method/state variant of it.
function StatBlock({ data, label }) {
  return (
    <div className={label === "variant" ? "variant" : ""}>
      {label && <span className="block-label">{label}</span>}
      <span style={{ marginLeft: 6 }}>
        <DamageBadge type={data.damage_type} />
      </span>
      <div className="enemy-stats">
        <span title={`base ${data.base_hp.toLocaleString()} × map multiplier`}>
          HP {data.hp.toLocaleString()}
        </span>
        <span title={`base ${data.base_attack.toLocaleString()} × map multiplier (melee only)`}>
          Attack {data.attack.toLocaleString()}
        </span>
        <span title="physical defense">Defense {data.armor_defense}</span>
        <span title="magic resistance">Magic Res {data.magic_defense}</span>
        <span title="attack range (0 = melee)">Range {data.attack_range}</span>
        <span title="attack interval in frames (lower = attacks faster)">
          Attack Interval {data.attack_speed}
        </span>
        <span title="movement speed">Move Speed {data.move_speed}</span>
        <span title="cost the player gains when this enemy is killed">
          Kill Reward {data.gain_cost}
        </span>
        <span title="instant-death / assassination resistance (0x = immune)">
          Assassin Resist {(data.assassin_resist / 100).toLocaleString()}x
        </span>
        <span title="resistance to being transformed by the player (e.g. frog) (0x = immune)">
          Transform Resist {(data.transform_resist / 100).toLocaleString()}x
        </span>
      </div>
      {data.effects && data.effects.length > 0 && (
        <details>
          <summary>special effect {data.special_effect_id}</summary>
          <Effects effects={data.effects} />
        </details>
      )}
    </div>
  );
}

// Each stage enemy entry is ONE form (its own card). A form's same-HP
// attack-method/state variants are nested inside.
function EnemyCard({ e }) {
  return (
    <article className="enemy-card">
      <div className="enemy-card-head">
        <Sprite patternId={e.pattern_id} size={64} alt={String(e.enemy_id)} />
        <div>
          <div className="enemy-name">
            Enemy #{e.enemy_id}
            {e.form_count > 1 && (
              <span className="badge" style={{ marginLeft: 6 }}>
                form {e.form_index + 1}/{e.form_count}
              </span>
            )}
          </div>
          <div className="enemy-sub">
            <Tags tags={e.tags} />
            {e.count > 1 && <span className="muted">×{e.count}</span>}
            {e.level > 0 && <span className="muted">Lv{e.level}</span>}
          </div>
        </div>
      </div>
      <StatBlock data={e} />
      {e.variants && e.variants.length > 0 && (
        <div className="variants">
          {e.variants.map((v, i) => (
            <StatBlock key={i} data={v} label="variant" />
          ))}
        </div>
      )}
      {e.commands && (
        <details className="commands">
          <summary>
            triggers / flags
            {e.commands.mode_changes > 0 && ` · ${e.commands.mode_changes} transform(s)`}
            {e.commands.sets_flags.length > 0 &&
              ` · sets flag ${e.commands.sets_flags.map((f) => f[0]).join(",")}`}
          </summary>
          {e.commands.sets_flags.length > 0 && (
            <div>sets stage flags: {e.commands.sets_flags.map((f) => `${f[0]}=${f[1]}`).join(", ")}</div>
          )}
          {e.commands.flag_checks.length > 0 && (
            <div>transforms when (FlagCheckCommandOrder): {e.commands.flag_checks.join(" | ")}</div>
          )}
          <pre className="cmd-raw">{e.commands.raw}</pre>
        </details>
      )}
    </article>
  );
}

export default function StageDetail() {
  const { questId } = useParams();
  const { loading, byQuest } = useStages();
  if (loading) return <p className="loading">Loading…</p>;

  const stage = byQuest.get(Number(questId));
  if (!stage) return <p>Stage not found. <Link to="/stages">Back</Link></p>;

  return (
    <div className="detail">
      <Link to="/stages" className="back">← stages</Link>
      <h2>{stage.name}</h2>
      {stage.event && (
        <div className="event-line">
          <span className="cat-badge">{stage.event_category}</span> {stage.event}
        </div>
      )}
      <div className="meta">
        <span>Quest {stage.quest_id}</span>
        <span>Map {stage.map_no} / Entry {stage.entry_no}</span>
        <span title="stat multiplier on HP and melee ATK">×{stage.multiplier} mult</span>
        <span>Charisma {stage.charisma}</span>
        <span>Capacity {stage.capacity}</span>
      </div>

      {stage.modifiers && stage.modifiers.length > 0 && (
        <section>
          <h3>Stage modifiers</h3>
          <Effects effects={stage.modifiers} />
        </section>
      )}

      {stage.hard && (
        <section className="hard-box">
          <h3>
            <span className="cat-badge">4★ / hard</span> alternative
            <span className="muted small"> · same map, ×{stage.hard.multiplier} mult</span>
          </h3>
          {stage.hard.modifiers.length > 0 && (
            <>
              <div className="muted small">extra modifiers:</div>
              <Effects effects={stage.hard.modifiers} />
            </>
          )}
          <div className="muted small">
            Enemy HP/ATK are rescaled to ×{stage.hard.multiplier} (same enemies as below).
          </div>
        </section>
      )}

      <section>
        <h3>Enemies ({stage.enemies.length})</h3>
        <div className="enemy-cards">
          {stage.enemies.map((e, i) => (
            <EnemyCard key={`${e.enemy_id}-${i}`} e={e} />
          ))}
        </div>
      </section>
    </div>
  );
}
