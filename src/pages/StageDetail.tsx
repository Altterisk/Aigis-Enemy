import { useParams, Link } from "react-router-dom";
import {
  useStageDetail,
  useInfluenceLabels,
  useRaceLabels,
  useSpecialtyConfig,
} from "../data";
import { Sprite, DamageBadge, Effects, Tags, auraRadius } from "../components";
import type {
  StageEnemy,
  StageEnemyForm,
  Effect,
  RouteBehaviour as RB,
  InfluenceLabels,
  RaceLabels,
  SpecialtyConfig,
} from "../types";

// safe number formatter: the exported data omits zero/empty fields (compacted),
// so a missing numeric value means 0.
const num = (v?: number) => (v ?? 0).toLocaleString();

// In-game attack range = ATTACK_RANGE * DotRate / 1.5 (the enemy's own sprite
// scale, per old parse_enemy.lua: `range * dotscale / 1.5`). DotRate defaults to
// 1.5 (-> unchanged). This is NOT a fixed *4/3 -- that factor is only for missile
// splash (DamageArea * 4/3).
function displayRange(range?: number, dotRate?: number): number {
  const dr = dotRate || 1.5;
  return Math.round(((range ?? 0) * dr) / 1.5);
}

// Human label for HOW a form is reached (from_condition + flags/ticks/wait).
function triggerText(d: StageEnemy): string | null {
  const c = d.from_condition;
  if (c == null) return null;
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
      return d.from_flag ? `when stage flag ${d.from_flag[0]} is set` : "next state";
    default: return "next state";
  }
}

// The condition under which THIS form changes into the next, with the global id.
function becomesText(d: StageEnemy): string | null {
  const c = d.to_condition;
  // nothing to show if neither a condition nor a known next form exists.
  if (c == null && d.to_global_id == null) return null;
  const dest =
    d.to_global_id != null ? `transform into #${d.to_global_id}` : "change form";
  // CC=0 / unknown trigger but a known next form -> show the link without a "when".
  if (c == null) return `→ ${dest}`;
  let when: string | null;
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

interface EffectLine {
  id: string;
  meaning: string | null;
  ext?: string;
  aura: string | null;
  expr?: string;
  exprRaw?: string;
}

// Resolve effect rows for the effect column.
function effectLines(effects: Effect[], labels: InfluenceLabels | null): EffectLine[] {
  return effects.map((e) => {
    const id = `influence ${e.influence}${e.params?.length ? " [" + e.params.join(",") + "]" : ""}`;
    let m: string | null = (e.kind && labels?.[e.kind]?.[String(e.influence)]) || null;
    if (m) {
      m = m.replace(/\[\[\?p([1-4])\|([\s\S]*?)\|([\s\S]*?)\]\]/g, (_x, n, a, b) =>
        (e.params?.[Number(n) - 1] ? a : b)
      );
      m = m.replace(/\[\[\?p([1-4]):([\s\S]*?)\]\]/g, (_x, n, t) =>
        (e.params?.[Number(n) - 1] ? t : "")
      );
      m = m.replace(/\{p([1-4])\}/g, (_x, n) => String(e.params?.[Number(n) - 1] ?? 0)).trim();
    }
    return {
      id,
      meaning: m,
      ext: e.ext,
      aura: auraRadius(e),
      expr: e.expression_human || e.expression,
      exprRaw: e.expression,
    };
  });
}

function StatRow({
  d,
  variant,
  labels,
  spcfg,
}: {
  d: StageEnemyForm;
  variant?: boolean;
  labels: InfluenceLabels | null;
  spcfg: SpecialtyConfig | null;
}) {
  const effects = (d.special_effect_id && spcfg?.[String(d.special_effect_id)]) || [];
  return (
    <tr className={variant ? "variant-row" : ""}>
      <td className="c-attack">
        {variant && <span className="block-label">alt. attack</span>}
        <DamageBadge type={d.damage_type} />
        <div className="muted small">
          {(d.attack_range ?? 0) > 0
            ? `ranged (${displayRange(d.attack_range, d.dot_rate)})`
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
      <td className="num" title={`base ${num(d.base_hp)} × mult`}>{num(d.hp)}</td>
      <td
        className="num"
        title={
          (d.attack_range ?? 0) > 0
            ? `base ${num(d.base_attack)} (ranged ATK is NOT multiplied)`
            : `base ${num(d.base_attack)} × mult`
        }
      >
        {num(d.attack)}
      </td>
      <td className="num">{d.armor_defense ?? 0}</td>
      <td className="num">{d.magic_defense ?? 0}</td>
      <td className="c-speed">
        <div className="muted small" title="movement speed">move {d.move_speed ?? 0}</div>
        {d.attack_interval ? (
          <div
            className="muted small"
            title={`attack interval: ${d.attack_interval} engine frames (60fps) = ${(d.attack_interval / 60).toFixed(2)}s, decoded from the attack animation`}
          >
            interval {d.attack_interval}f ({(d.attack_interval / 60).toFixed(1)}s)
          </div>
        ) : (
          <div className="muted small" title="attack animation not available for this enemy">
            interval n/a
          </div>
        )}
      </td>
      <td className="c-support muted small">
        <div title="cost/UP the player gains when this enemy is killed">
          kill reward {d.gain_cost ?? 0}
        </div>
        <div title="resistance to instant-death / assassination (0x = immune)">
          assassinate {(d.assassin_resist ?? 0) / 100}x
        </div>
        <div title="resistance to being transformed by the player (0x = immune)">
          transform {(d.transform_resist ?? 0) / 100}x
        </div>
      </td>
      <td className="c-effect">
        {effectLines(effects, labels).map((f, i) => (
          <div key={i} className="eff-note">
            <code className="eff-id">{f.id}</code>
            {f.meaning && <span className="eff-meaning"> {f.meaning}</span>}
            {f.aura && <span className="eff-meaning"> ({f.aura})</span>}
            {f.expr && <span className="eff-cond" title={f.exprRaw}> if {f.expr}</span>}
            {f.ext && <span className="eff-cond"> {f.ext}</span>}
          </div>
        ))}
      </td>
    </tr>
  );
}

// Structured route behaviour: gated transforms, flag sets, events, reroutes.
function RouteBehaviour({ rb }: { rb: RB }) {
  const t = (x: NonNullable<RB["transforms"]>[number]) =>
    x.flag != null
      ? `when flag ${x.flag}==${x.val} → transform${x.to ? ` to #${x.to}` : ""}`
      : `transform${x.to ? ` to #${x.to}` : ""}${x.wait && x.wait > 0 ? ` after ${Math.round(x.wait / 60)}s` : ""}`;
  return (
    <details className="commands">
      <summary>route behaviour</summary>
      {rb.transforms && <div>transforms: {rb.transforms.map(t).join(" · ")}</div>}
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

function EnemyCard({
  e,
  labels,
  races,
  spcfg,
}: {
  e: StageEnemy;
  labels: InfluenceLabels | null;
  races: RaceLabels | null;
  spcfg: SpecialtyConfig | null;
}) {
  const race = e.race_id != null ? races?.[String(e.race_id)] : null;
  const blocks: { d: StageEnemyForm; variant?: boolean }[] = [
    { d: e },
    ...(e.variants || []).map((v) => ({ d: v, variant: true })),
  ];

  return (
    <article className="enemy-card">
      <div className="enemy-row">
        <div className="enemy-sprite-cell">
          <Sprite patternId={e.pattern_id} size={128} alt={String(e.enemy_id)} fit />
        </div>
        <div className="enemy-main">
          <div className="enemy-name">
            Enemy #{e.enemy_id}
            {e.global_id != null && (
              <Link
                to={`/enemies/${e.global_id}`}
                className="global-link"
                title="open this enemy's global page (stable Enemy.atb id)"
              >
                {" "}#{e.global_id}
              </Link>
            )}
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
            {race && (
              <span className="muted small" title={`race / category (${race.name})`}>
                {" · "}{race.en}
              </span>
            )}
            {(e.count ?? 0) > 1 && <span className="muted small"> ×{e.count}</span>}
            {(e.level ?? 0) > 0 && <span className="muted small"> Lv{e.level}</span>}
            {(e.spawn_sec ?? 0) > 0 && (
              <span className="muted small" title="approximate first-appearance time">
                {" "}· spawns ~{Math.floor((e.spawn_sec ?? 0) / 60)}:
                {String((e.spawn_sec ?? 0) % 60).padStart(2, "0")}
              </span>
            )}
          </div>
          <Tags tags={e.tags} />
          <table className="enemy-stat-table">
            <thead>
              <tr>
                <th>attack</th><th>HP</th><th>ATK</th><th>DEF</th>
                <th>MR</th><th className="col-speed">speed</th>
                <th className="col-support">support</th><th>effect</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b, i) => (
                <StatRow key={i} d={b.d} variant={b.variant} labels={labels} spcfg={spcfg} />
              ))}
            </tbody>
          </table>

          {e.commands && (
            <details className="commands">
              <summary>
                triggers / flags
                {(e.commands.mode_changes ?? 0) > 0 && ` · ${e.commands.mode_changes} transform(s)`}
                {(e.commands.sets_flags?.length ?? 0) > 0 &&
                  ` · sets flag ${e.commands.sets_flags!.map((f) => f[0]).join(",")}`}
              </summary>
              {(e.commands.sets_flags?.length ?? 0) > 0 && (
                <div>sets stage flags: {e.commands.sets_flags!.map((f) => `${f[0]}=${f[1]}`).join(", ")}</div>
              )}
              {(e.commands.flag_checks?.length ?? 0) > 0 && (
                <div>transforms when: {e.commands.flag_checks!.join(" | ")}</div>
              )}
              {e.commands.raw && <pre className="cmd-raw">{e.commands.raw}</pre>}
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
  const { loading, stage } = useStageDetail(Number(questId));
  const labels = useInfluenceLabels();
  const races = useRaceLabels();
  const spcfg = useSpecialtyConfig();
  if (loading) return <p className="loading">Loading…</p>;
  if (!stage) return <p>Stage not found. <Link to="/stages">Back</Link></p>;

  const enemies = stage.enemies ?? [];

  return (
    <div className="detail">
      <Link to="/stages" className="back">← stages</Link>
      <h2>{stage.name}</h2>
      {stage.event && (
        <div className="event-line">
          <span className="cat-badge">{stage.event_category}</span> {stage.event}
        </div>
      )}
      {stage.description && (
        <p className="muted small" style={{ whiteSpace: "pre-line" }}>{stage.description}</p>
      )}
      <div className="meta">
        <span>Quest {stage.quest_id}</span>
        <span>Map {stage.map_no} / Entry {stage.entry_no}</span>
        <span title="stat multiplier on HP and melee ATK">×{stage.multiplier ?? 1} mult</span>
        <span>Charisma {stage.charisma ?? 0}</span>
        <span>Capacity {stage.capacity ?? 0}</span>
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
            In-game explanation popups shown in this stage.
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
            <span className="muted small"> · same map, ×{stage.hard.multiplier ?? 1} mult</span>
          </h3>
          {(stage.hard.modifiers?.length ?? 0) > 0 && (
            <>
              <div className="muted small">extra modifiers:</div>
              <Effects effects={stage.hard.modifiers} />
            </>
          )}
          <div className="muted small">
            Enemy HP/ATK are rescaled to ×{stage.hard.multiplier ?? 1} (same enemies as below).
          </div>
        </section>
      )}

      <section>
        <h3>Enemies ({enemies.length})</h3>
        <div className="enemy-cards">
          {enemies.map((e, i) => (
            <EnemyCard key={`${e.enemy_id}-${i}`} e={e} labels={labels} races={races} spcfg={spcfg} />
          ))}
        </div>
      </section>
    </div>
  );
}
