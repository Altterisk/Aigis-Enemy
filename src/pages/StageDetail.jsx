import { useParams, Link } from "react-router-dom";
import { useStages } from "../data.js";
import { Sprite, DamageBadge, Effects, Tags, auraRadius } from "../components.jsx";

import { useInfluenceLabels, useRaceLabels } from "../data.js";

// Human label for HOW a form is reached, from the raw fields the export dumps:
//   from_condition = departing node's Param_ChangeCondition (verified taxonomy;
//     thresholds 3=50% / 5=99% are from the old Lua parse_enemy.lua).
//   trigger_ticks  = number of times it must act before this form (CC=4).
//   timed_wait     = route-script timer in ticks (60/sec) for sp_change forms.
function triggerText(d) {
  const c = d.from_condition;
  if (c == null) return null; // base/spawn form
  if (c === "sp_change") {
    return d.timed_wait ? `after ${Math.round(d.timed_wait / 60)}s` : "alternate attack mode";
  }
  switch (c) {
    case 2: return "on death";
    case 4: {
      const n = d.trigger_ticks;
      return n && n > 1 ? `after attacking ${n} times` : "after attacking";
    }
    case 5: return "at 99% HP (on first damage)";
    case 3: return "at 50% HP";
    case 1: return "while blocked";
    case 0:
      // CC=0 route-driven: show the gating flag if we resolved one.
      return d.from_flag ? `when stage flag ${d.from_flag[0]} is set` : "next state";
    default: return "next state";
  }
}

// The condition under which THIS form changes into the next one, phrased as an
// outgoing action with the GLOBAL id it becomes: "on death → transform into
// #35095". Uses to_condition/to_ticks/to_global_id/to_flag.
function becomesText(d) {
  const c = d.to_condition;
  if (c == null) return null;
  const dest =
    d.to_global_id != null ? `transform into #${d.to_global_id}` : "change form";
  let when;
  switch (c) {
    case 2: when = "on death"; break;
    case 4: {
      const n = d.to_ticks;
      when = n && n > 1 ? `after attacking ${n} times` : "after attacking";
      break;
    }
    case 5: when = "at 99% HP (first damage)"; break;
    case 3: when = "at 50% HP"; break;
    case 1: when = "while blocked"; break;
    case 0:
      when = d.to_flag ? `when stage flag ${d.to_flag[0]} is set` : null;
      break;
    default: when = null;
  }
  return when ? `${when} → ${dest}` : `→ ${dest}`;
}

// Resolve effect rows for the effect column. Always keep the influence id +
// params visible (for cross-referencing) and append the readable meaning when
// known.
function effectLines(effects, labels) {
  if (!effects) return [];
  return effects.map((e) => {
    const id = `influence ${e.influence}${e.params?.length ? " [" + e.params.join(",") + "]" : ""}`;
    let m = labels?.[e.kind]?.[String(e.influence)];
    if (m) {
      m = m.replace(/\[\[\?p([1-4])\|([\s\S]*?)\|([\s\S]*?)\]\]/g, (_, n, a, b) =>
        (e.params?.[n - 1] ? a : b)
      );
      m = m.replace(/\[\[\?p([1-4]):([\s\S]*?)\]\]/g, (_, n, t) => (e.params?.[n - 1] ? t : ""));
      m = m.replace(/\{p([1-4])\}/g, (_, n) => String(e.params?.[n - 1] ?? 0)).trim();
    }
    return { id, meaning: m, expr: e.expression, ext: e.ext, aura: auraRadius(e) };
  });
}

// A stat row: the main form, or a variant (indented sub-row).
// Columns: Attack (type+range) | HP | ATK | DEF | MR | Speed (interval/move) |
// Support (cost/resists) | Effect (special-effect text + notes).
function StatRow({ d, variant, labels }) {
  return (
    <tr className={variant ? "variant-row" : ""}>
      <td className="c-attack">
        {variant && <span className="block-label">alt. attack</span>}
        <DamageBadge type={d.damage_type} />
        <div className="muted small">
          {d.attack_range > 0
            ? `ranged (${Math.round((d.attack_range * 4) / 3)})`
            : "melee"}
        </div>
        {d.missile?.splash && (
          <div className="muted small" title="area-of-effect splash radius">
            splash {d.missile.splash}
          </div>
        )}
        {d.missile?.slow && (
          <div className="muted small" title="slows hit units">
            slow {d.missile.slow[0]}% / {d.missile.slow[1]}f
          </div>
        )}
        {d.missile?.deflectable && (
          <div className="muted small" title="can be deflected by deflect units">
            deflectable
          </div>
        )}
      </td>
      <td className="num" title={`base ${d.base_hp?.toLocaleString()} × mult`}>
        {d.hp.toLocaleString()}
      </td>
      <td
        className="num"
        title={
          d.attack_range > 0
            ? `base ${d.base_attack?.toLocaleString()} (ranged ATK is NOT multiplied)`
            : `base ${d.base_attack?.toLocaleString()} × mult`
        }
      >
        {d.attack.toLocaleString()}
      </td>
      <td className="num">{d.armor_defense}</td>
      <td className="num">{d.magic_defense}</td>
      <td className="c-speed">
        <div className="muted small" title="movement speed">move {d.move_speed}</div>
        <div className="muted small" title="The full attack interval (and its windup/move/missile breakdown shown on wikis) comes from the attack animation, which is not in this dataset. Raw fields: ATTACK_SPEED and AttackWait.">
          interval n/a
        </div>
      </td>
      <td className="c-support muted small">
        <div title="cost/UP the player gains when this enemy is killed">
          kill reward {d.gain_cost}
        </div>
        <div title="resistance to instant-death / assassination (0x = immune)">
          assassinate {(d.assassin_resist / 100)}x
        </div>
        <div title="resistance to being transformed by the player, e.g. frog (0x = immune)">
          transform {(d.transform_resist / 100)}x
        </div>
      </td>
      <td className="c-effect">
        {effectLines(d.effects, labels).map((f, i) => (
          <div key={i} className="eff-note">
            <code className="eff-id">{f.id}</code>
            {f.meaning && <span className="eff-meaning"> {f.meaning}</span>}
            {f.aura && <span className="eff-meaning"> ({f.aura})</span>}
            {f.expr && <span className="eff-cond"> if {f.expr}</span>}
            {f.ext && <span className="eff-cond"> {f.ext}</span>}
          </div>
        ))}
      </td>
    </tr>
  );
}

// One enemy = a card: a large sprite (real scale) + a stat table of its
// form(s) and attack-method/state variants.
// Raw structured behaviour pulled from this enemy's route scripts: gated
// transforms, flag sets, events, reroutes, etc. Shown verbatim for now.
function RouteBehaviour({ rb }) {
  const t = (x) =>
    x.flag != null
      ? `when flag ${x.flag}==${x.val} → transform${x.to ? ` to #${x.to}` : ""}`
      : `transform${x.to ? ` to #${x.to}` : ""}${x.wait > 0 ? ` after ${Math.round(x.wait / 60)}s` : ""}`;
  return (
    <details className="commands">
      <summary>route behaviour</summary>
      {rb.transforms && (
        <div>transforms: {rb.transforms.map(t).join(" · ")}</div>
      )}
      {rb.sets_flags && (
        <div>
          sets flags:{" "}
          {rb.sets_flags
            .map(([f, v, w]) => `${f}=${v}${w ? ` @${Math.round(w / 60)}s` : ""}`)
            .join(", ")}
        </div>
      )}
      {rb.calls_event && <div>calls event: {rb.calls_event.join(", ")}</div>}
      {rb.reroutes && <div>reroute: {rb.reroutes.join(", ")}</div>}
      {rb.creates_obj && <div>creates {rb.creates_obj} map object(s) (barrier/gate)</div>}
      {rb.creates_guest && <div>creates {rb.creates_guest} guest unit(s)</div>}
      {rb.force_dead && <div>force-dies</div>}
      {rb.battle_styles && <div>battle style: {rb.battle_styles.join(", ")}</div>}
    </details>
  );
}

function EnemyCard({ e }) {
  const labels = useInfluenceLabels();
  const races = useRaceLabels();
  const race = races?.[String(e.race_id)];
  const blocks = [{ d: e }, ...(e.variants || []).map((v) => ({ d: v, variant: "variant" }))];

  return (
    <article className={`enemy-card${e.flag_enemy ? " flag-card" : ""}`}>
      <div className="enemy-row">
        <div className="enemy-sprite-cell">
          <Sprite patternId={e.pattern_id} size={128} alt={String(e.enemy_id)} fit />
        </div>
        <div className="enemy-main">
          <div className="enemy-name">
            Enemy #{e.enemy_id}
            {e.global_id != null && (
              <span className="muted small" title="stable global enemy id (Enemy.atb row)">
                {" "}#{e.global_id}
              </span>
            )}
            {/* Only the base form announces its OWN incoming trigger. A transform
                RESULT (form_index > 0) does not show "on death" etc. -- that's
                stated on the base enemy as "→ transform into #X". */}
            {e.form_index === 0 && triggerText(e) && (
              <span className="trigger-badge" title="how this form is reached">
                {triggerText(e)}
              </span>
            )}
            {becomesText(e) && (
              <span className="trigger-badge" title="how this form changes into the next">
                {becomesText(e)}
              </span>
            )}
            {e.spawned_on_death_by && (
              <span className="muted small" title="enemies that transform into this on death">
                {" "}(from death of #{e.spawned_on_death_by.join(", #")})
              </span>
            )}
            {e.flag_enemy && (
              <span
                className="trigger-badge"
                title="off-map controller: never enters the field; cycles states to set stage flags that gate the real enemies"
              >
                flag controller (off-map)
              </span>
            )}
            {race && (
              <span className="muted small" title={`race / category (${race.name})`}>
                {" · "}{race.en}
              </span>
            )}
            {e.count > 1 && <span className="muted small"> ×{e.count}</span>}
            {e.level > 0 && <span className="muted small"> Lv{e.level}</span>}
            {e.spawn_sec > 0 && (
              <span className="muted small" title="approximate first-appearance time (cumulative spawn schedule)">
                {" "}· spawns ~{Math.floor(e.spawn_sec / 60)}:{String(e.spawn_sec % 60).padStart(2, "0")}
              </span>
            )}
          </div>
          {e.flag_enemy && e.flag_sets && e.flag_sets.length > 0 && (
            <div className="muted small" title="stage flags this controller sets (gate the real enemies)">
              sets stage flags:{" "}
              {e.flag_sets.map(([f, v, w], i) => (
                <span key={i}>
                  {i > 0 && ", "}
                  {f}={v}{w ? ` @${Math.round(w / 60)}s` : ""}
                </span>
              ))}
            </div>
          )}
          <Tags tags={e.tags} />
          <table className="enemy-stat-table">
            <thead>
              <tr>
                <th>attack</th><th>HP</th><th>ATK</th><th>DEF</th>
                <th>MR</th><th>speed</th><th>support</th><th>effect</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b, i) => (
                <StatRow key={i} d={b.d} variant={b.variant} labels={labels} />
              ))}
            </tbody>
          </table>

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
                <div>transforms when: {e.commands.flag_checks.join(" | ")}</div>
              )}
              <pre className="cmd-raw">{e.commands.raw}</pre>
            </details>
          )}

          {e.route_behaviour && <RouteBehaviour rb={e.route_behaviour} />}
        </div>
      </div>
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

      {stage.popups && stage.popups.length > 0 && (
        <section>
          <h3>Ability popups ({stage.popups.length})</h3>
          <div className="muted small">
            In-game explanation popups shown in this stage (the official text for
            the special enemy abilities here).
          </div>
          <div className="popups">
            {stage.popups.map((p, i) => (
              <div className="popup" key={i}>{p}</div>
            ))}
          </div>
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
