import { useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Breadcrumbs, FallbackImage, MetaChip, MetaChips, PageHeader, Panel, SegmentedButtons, TabPanel, UrlTabs, tabParam } from "@altterisk/game-hub";
import { searchParamsAdapter } from "@altterisk/game-hub/filters";
import { LIST_META, NOT_FOUND_META, plainText, stageMeta } from "../meta";
import { usePageMeta } from "../usePageMeta";
import { useStageDetail, useInfluenceLabels, useRaceLabels, useSpecialtyConfig, useStoryTalk, talkFaceUrl, bannerUrl, useExprNames, useSpriteAlias, sameSprite, useEventInfo, useDialogueTl, type DialogueTl } from "../data";
import { deployExpression, restrictsUnits } from "../deployRule";
import { Sprite, DamageBadge, Effects, Tags, auraRadius, periodicRate, missileOnHitText, HumanText, routerLink, extDisplay, ColorCodedText, MtlText } from "../components";
import { humanize } from "../humanize";
import { StageMap } from "../stageMap";
import type {
  StageEnemy,
  StageEnemyForm,
  Effect,
  RouteBehaviour as RB,
  InfluenceLabels,
  RaceLabels,
  SpecialtyConfig,
  DialogueSection,
  DialogueLine,
} from "../types";
import { altName, gameName, useL, useLang } from "../i18n";

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

// Label for an HP-threshold phase row (Param_ChangeCondition 3/5/6/7).
function hpPhaseText(c: number): string {
  switch (c) {
    case 3: return "at 50% HP";
    case 5: return "at 99% HP (first damage)";
    case 6: return "at 25% HP";
    case 7: return "at 75% HP";
    default: return `change condition ${c} (UNVERIFIED trigger)`;
  }
}

// Human label for HOW a form is reached (from_condition + flags/ticks/wait).
function triggerText(d: StageEnemy): string | null {
  const c = d.from_condition;
  if (c == null) return null;
  if (c === "sp_change") {
    return d.timed_wait ? `after ${Math.round(d.timed_wait / 60)}s` : "alternate attack mode";
  }
  if (d.from_flag) return `reached when stage flag ${d.from_flag[0]} is set`;
  switch (c) {
    case 2: return "on death";
    case 4: {
      const n = d.trigger_ticks;
      return n && n > 1 ? `after attacking ${n} times` : "after attacking";
    }
    case 5: return "at 99% HP (on first damage)";
    case 3: return "at 50% HP";
    case 6: return "at 25% HP";
    case 7: return "at 75% HP";
    case 1: return "while blocked";
    case 0:
      return d.from_flag ? `when stage flag ${d.from_flag[0]} is set` : "next state";
    // codes outside 0-7 have no decoded meaning: show the raw code.
    default: return `change condition ${c} (UNVERIFIED trigger)`;
  }
}

// The condition under which THIS form changes into the next, with the global id.
function becomesText(d: StageEnemy): string | null {
  const c = d.to_condition;
  // nothing to show if neither a condition nor a known next form exists.
  if (c == null && d.to_global_id == null) return null;
  const dest =
    d.to_global_id != null
      ? `transform into #${d.to_global_id}`
      : `transform into form ${(d.form_index ?? 0) + 2}`;
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
    case 6: when = "at 25% HP"; break;
    case 7: when = "at 75% HP"; break;
    case 1: when = "while blocked"; break;
    case 0:
      when = d.to_flag ? `when stage flag ${d.to_flag[0]} is set` : null;
      break;
    // codes outside 0-7 have no decoded meaning: show the raw code.
    default: when = `change condition ${c} (UNVERIFIED trigger)`;
  }
  return when ? `${when} → ${dest}` : `→ ${dest}`;
}

interface EffectLine {
  id: string;
  meaning: string | null;
  ext?: string;
  extRaw?: string;
  aura: string | null;
  rate: string | null;
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
      ext: extDisplay(e),
      extRaw: e.ext,
      aura: auraRadius(e),
      rate: periodicRate(e, effects),
      expr: humanize(e.expression) || e.expression,
      exprRaw: e.expression,
    };
  });
}

function StatRow({
  d,
  variant,
  phase,
  sprite,
  mult,
  labels,
  spcfg,
}: {
  d: StageEnemyForm;
  variant?: boolean;
  /** HP-threshold label when this row is a phase of the form. */
  phase?: string;
  /** the phase's own PatternID, when its art differs from the state before it. */
  sprite?: number;
  /** stat multiplier override (the 4★ multiplier); the exported hp/attack use the 3★ one. */
  mult?: number;
  labels: InfluenceLabels | null;
  spcfg: SpecialtyConfig | null;
}) {
  const effects = (d.special_effect_id && spcfg?.[String(d.special_effect_id)]) || [];
  const L = useL();
  const ranged = (d.attack_range ?? 0) > 0;
  // multiplier hits HP and melee ATK only; ranged ATK stays at base.
  const hp = mult != null ? Math.round((d.base_hp ?? 0) * mult) : d.hp;
  const attack = mult != null ? (ranged ? d.base_attack ?? 0 : Math.round((d.base_attack ?? 0) * mult)) : d.attack;
  return (
    <tr className={variant || phase ? "variant-row" : ""}>
      <td className="c-attack">
        {variant && <span className="block-label">{L("alt. attack", "別の攻撃")}</span>}
        {phase && (
          <span className="phase-label trigger-badge" title={L("same body, changed in place at this HP", "同じ個体がこのHPで変化")}>
            {phase}
          </span>
        )}
        {sprite != null && (
          <div className="phase-sprite" title={L("this phase's sprite", "この段階のドット")}>
            <Sprite patternId={sprite} size={64} alt="" fit />
          </div>
        )}
        <DamageBadge type={d.damage_type} />
        <div className="muted small">
          {(d.attack_range ?? 0) > 0
            ? `${L("ranged", "遠距離")} (${displayRange(d.attack_range, d.dot_rate)})`
            : L("melee", "近接")}
        </div>
        {d.missile?.splash && (
          <div className="muted small" title="area-of-effect splash radius">
            splash {d.missile.splash}
          </div>
        )}
        {d.missile?.penetrate && (
          <div className="muted small" title="travelling projectile that hits every enemy it passes through">
            penetrates all in path{d.missile.width ? ` (width ${d.missile.width})` : ""}
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
        {d.missile?.on_hit && (
          <div className="muted small dot-calc" title="on-hit status effect from the missile">
            {missileOnHitText(d.missile.on_hit)}
          </div>
        )}
      </td>
      <td className="num" title={`base ${num(d.base_hp)} × mult`}>{num(hp)}</td>
      <td
        className="num"
        title={
          ranged
            ? `base ${num(d.base_attack)} (ranged ATK is NOT multiplied)`
            : `base ${num(d.base_attack)} × mult`
        }
      >
        {num(attack)}
      </td>
      <td className="num">{d.armor_defense ?? 0}</td>
      <td className="num">{d.magic_defense ?? 0}</td>
      <td className="c-speed">
        <div className="muted small" title={L("movement speed", "移動速度")}>{L("move", "移動")} {d.move_speed ?? 0}</div>
        {d.attack_interval ? (
          <div
            className="muted small"
            title={`attack interval: ${d.attack_interval} engine frames (60fps) = ${(d.attack_interval / 60).toFixed(2)}s, decoded from the attack animation`}
          >
            {L("interval", "攻撃間隔")} {d.attack_interval}f ({(d.attack_interval / 60).toFixed(1)}s)
          </div>
        ) : (
          <div className="muted small" title="attack animation not available for this enemy">
            {L("interval n/a", "攻撃間隔 不明")}
          </div>
        )}
      </td>
      <td className="c-support muted small">
        <div title={L("cost/UP the player gains when this enemy is killed", "撃破時に得られるコスト")}>
          {L("kill reward", "撃破コスト")} {d.gain_cost ?? 0}
        </div>
        <div title={L("resistance to instant-death / assassination (0x = immune)", "即死・暗殺への耐性 (0x = 無効)")}>
          {L("assassinate", "暗殺")} {(d.assassin_resist ?? 0) / 100}x
        </div>
        <div title={L("resistance to being transformed by the player (0x = immune)", "変身させられることへの耐性 (0x = 無効)")}>
          {L("transform", "変身")} {(d.transform_resist ?? 0) / 100}x
        </div>
      </td>
      <td className="c-effect">
        {effectLines(effects, labels).map((f, i) => (
          <div key={i} className="eff-note">
            <code className="eff-id">{f.id}</code>
            {f.meaning && <span className="eff-meaning"> {f.meaning}</span>}
            {f.aura && <span className="eff-meaning"> ({f.aura})</span>}
            {f.rate && <span className="dot-calc"> {f.rate}</span>}
            {f.expr && <span className="eff-cond" title={f.exprRaw}> if <HumanText text={f.expr} /></span>}
            {f.ext && <span className="eff-cond" title={f.extRaw}> {f.ext}</span>}
          </div>
        ))}
      </td>
    </tr>
  );
}

// Movement on its route: a waypoint wait of -1 parks the enemy there for good,
// unless a stage flag releases it.
function holdText(h: RB["hold"]): string | null {
  if (!h) return null;
  const some = h.held < h.routes ? ` (on ${h.held} of ${h.routes} routes)` : "";
  return h.release_flags?.length
    ? `stays put until stage flag ${h.release_flags.join(" / ")} is set${some}`
    : `never moves${some}`;
}

// Structured route behaviour: gated transforms, flag sets, events, reroutes.
// A ModeChange with no MasterId moves the enemy to its next form.
function RouteBehaviour({ rb, formIndex }: { rb: RB; formIndex: number }) {
  const dest = (x: NonNullable<RB["transforms"]>[number]) =>
    x.to ? `transform to #${x.to}` : `transform into form ${formIndex + 2}`;
  const t = (x: NonNullable<RB["transforms"]>[number]) =>
    x.flag != null
      ? `when flag ${x.flag}==${x.val} → ${dest(x)}`
      : `${dest(x)}${x.wait && x.wait > 0 ? ` after ${Math.round(x.wait / 60)}s` : ""}`;
  const hold = holdText(rb.hold);
  return (
    <details className="commands">
      <summary>route behaviour</summary>
      {hold && <div>movement: {hold}</div>}
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
  mult,
  labels,
  races,
  spcfg,
}: {
  e: StageEnemy;
  mult?: number;
  labels: InfluenceLabels | null;
  races: RaceLabels | null;
  spcfg: SpecialtyConfig | null;
}) {
  const race = e.race_id != null ? races?.[String(e.race_id)] : null;
  const L = useL();
  const alias = useSpriteAlias();
  // a phase shows its own sprite when its art differs from the state before it
  let shown = e.pattern_id;
  const blocks: { d: StageEnemyForm; variant?: boolean; phase?: string; sprite?: number }[] = [
    { d: e },
    ...(e.variants || []).map((v) => ({ d: v, variant: true })),
    ...(e.phases || []).flatMap((p) => {
      const changed = alias != null && p.pattern_id != null && !sameSprite(alias, p.pattern_id, shown);
      if (changed) shown = p.pattern_id;
      return [
        { d: p as StageEnemyForm, phase: hpPhaseText(p.condition), sprite: changed ? p.pattern_id ?? undefined : undefined },
        ...(p.variants || []).map((v) => ({ d: v, variant: true })),
      ];
    }),
  ];

  return (
    <article className="enemy-card">
      <div className="enemy-row">
        <div className="enemy-sprite-cell">
          <Sprite patternId={e.pattern_id} size={128} alt={String(e.enemy_id)} fit />
        </div>
        <div className="enemy-main">
          <div className="enemy-name">
            {L("Enemy #{id}", "敵 #{id}", { id: e.enemy_id })}
            {e.global_id != null && (
              <Link
                to={`/enemies/${e.global_id}`}
                className="global-link"
                title={L("open this enemy's global page (stable Enemy.atb id)", "この敵の共通ページを開く (Enemy.atb ID)")}
              >
                {" "}#{e.global_id}
              </Link>
            )}
            {e.uncounted && (
              <span
                className="badge marker"
                title={L("置物 / 分身: the game leaves it out of the enemy count — a marker, not a kill target", "置物 / 分身: 敵の数に含まれません")}
              >
                {L("marker", "置物")}
              </span>
            )}
            {(e.form_count ?? 1) > 1 && (
              <span className="muted small">{L(" · form {a}/{b}", " · 形態 {a}/{b}", { a: (e.form_index ?? 0) + 1, b: e.form_count ?? 1 })}</span>
            )}
            {holdText(e.route_behaviour?.hold) && (
              <span className="trigger-badge" title="route waypoint wait of -1: parked on its route">
                {holdText(e.route_behaviour?.hold)}
              </span>
            )}
            {(e.form_index ?? 0) > 0 && triggerText(e) && (
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
                {" "}· {L("spawns", "出現")} ~{Math.floor((e.spawn_sec ?? 0) / 60)}:
                {String((e.spawn_sec ?? 0) % 60).padStart(2, "0")}
              </span>
            )}
          </div>
          <Tags tags={e.tags} />
          <table className="enemy-stat-table">
            <thead>
              <tr>
                <th>{L("attack", "攻撃")}</th><th>HP</th><th>{L("ATK", "攻撃力")}</th><th>{L("DEF", "防御力")}</th>
                <th>{L("MR", "魔法耐性")}</th><th className="col-speed">{L("speed", "速度")}</th>
                <th className="col-support">{L("support", "その他")}</th><th>{L("effect", "特性")}</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b, i) => (
                <StatRow key={i} d={b.d} variant={b.variant} phase={b.phase} sprite={b.sprite} mult={mult} labels={labels} spcfg={spcfg} />
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

          {e.route_behaviour && <RouteBehaviour rb={e.route_behaviour} formIndex={e.form_index ?? 0} />}
        </div>
      </div>
    </article>
  );
}

// Human label for how a dialogue scene is triggered.
function dialogueTriggerText(s: DialogueSection): string {
  switch (s.trigger) {
    case "start": return "at stage start";
    case "battle": {
      const t = s.at_sec ?? 0;
      return `during battle (~${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")})`;
    }
    case "end": return "at stage end (on clear)";
    case "enemy_spawn": return `when enemy #${s.enemy_id} appears`;
    case "enemy_event": return `enemy #${s.enemy_id} event`;
    case "enemy_death": return `when enemy #${s.enemy_id} dies`;
    case "route": {
      const ids = s.enemy_ids ?? [];
      return ids.length
        ? `route event (enemy #${ids.join(", #")})`
        : "route event";
    }
    case "story": return "event story";
    default: return "scene";
  }
}

function TalkFace({ line }: { line: DialogueLine }) {
  const url = talkFaceUrl(line.face);
  // no portrait (narration / unknown speaker): initial in a placeholder well
  return (
    <FallbackImage
      className="dlg-face"
      srcs={[url]}
      alt={line.name || ""}
      missing={<div className="dlg-face dlg-face--none">{(line.name || "…").slice(0, 1)}</div>}
    />
  );
}

// stage-direction "speakers" like （オーバーレイ）: a caption, not a person.
const isCaption = (l: DialogueLine) =>
  !l.face && !!l.name && /^[（(].*[）)]$/.test(l.name);

// A "u<cardId>[a<tier>]" face IS that unit's own icon -> the speaker is that
// unit; link face + name to its page. Local NPC faces have no unit.
const faceUnitId = (face?: string | null): number | null => {
  const m = face ? /^u(\d+)/.exec(face) : null;
  return m ? Number(m[1]) : null;
};

function DialogueSectionBlock({ s, tl }: { s: DialogueSection; tl: DialogueTl }) {
  const L = useL();
  const lang = useLang();
  const name = (n: string) => gameName(tl.speakers[n], n, lang);
  return (
    <div className="dlg-section">
      <div className="dlg-trigger">{dialogueTriggerText(s)}</div>
      {(s.lines ?? []).map((l, i) => {
        if (isCaption(l)) return <div className="dlg-caption" key={i}><MtlText jp={l.text ?? ""} en={tl.text[l.text ?? ""]} /></div>;
        const uid = faceUnitId(l.face);
        return (
          <div className="dlg-line" key={i}>
            {uid != null ? (
              <Link to={`/units/${uid}`} className="dlg-face-link" title={L("open this unit's page", "ユニットのページを開く")}>
                <TalkFace line={l} />
              </Link>
            ) : (
              <TalkFace line={l} />
            )}
            <div className="dlg-body">
              {l.name && (
                <div className="dlg-name">
                  {uid != null ? <Link to={`/units/${uid}`}>{name(l.name)}</Link> : name(l.name)}
                </div>
              )}
              <div className="dlg-text"><MtlText jp={l.text ?? ""} en={tl.text[l.text ?? ""]} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// mission id of the Tower of Evil Spirits (悪霊の塔)
const TOWER_OF_EVIL_SPIRITS = 110003;

export default function StageDetail() {
  useExprNames();
  const { questId } = useParams();
  const { loading, stage } = useStageDetail(Number(questId));
  const labels = useInfluenceLabels();
  const races = useRaceLabels();
  const spcfg = useSpecialtyConfig();
  const [params, setParams] = useSearchParams();
  const { available: hasStoryTalk, talk: storyTalk } =
    useStoryTalk(stage?.mission_id);
  const [bannerFailed, setBannerFailed] = useState(false);
  const L = useL();
  const lang = useLang();
  const eventInfo = useEventInfo();
  const tl = useDialogueTl(stage?.mission_id != null ? `m${stage.mission_id}` : null);
  usePageMeta(loading ? LIST_META["/stages"] : stage ? stageMeta(stage) : NOT_FOUND_META);
  if (loading) return <p className="loading">{L("Loading…", "読み込み中…")}</p>;
  if (!stage) return <p>{L("Stage not found.", "ステージが見つかりません。")} <Link to="/stages">{L("Back", "戻る")}</Link></p>;

  const enemies = stage.enemies ?? [];
  const dialogue = stage.dialogue ?? [];
  const eventEn = stage.mission_id != null ? eventInfo?.[String(stage.mission_id)]?.en : undefined;
  const eventName = stage.event ? gameName(eventEn, stage.event, lang) : "";
  const eventAlt = stage.event ? altName(eventEn, stage.event, lang) : "";
  const stageName = gameName(stage.name_en, stage.name, lang);
  // Tower of Evil Spirits floors: link to the units the deploy restriction allows
  const rule = deployExpression(stage);
  const ruleLink = stage.mission_id === TOWER_OF_EVIL_SPIRITS && !!rule && restrictsUnits(rule);
  const storySections = storyTalk?.sections ?? [];
  const dialogueCount = dialogue.length + storySections.length;
  const hasDialogue = dialogueCount > 0 || hasStoryTalk;
  const hasMap = !!stage.map;
  const TABS = [
    { id: "enemies", label: L("Enemies", "敵"), count: enemies.length },
    { id: "map", label: L("Map", "マップ"), hidden: !hasMap },
    { id: "dialogue", label: L("Dialogue", "会話"), count: dialogueCount, hidden: !hasDialogue },
  ];
  const [activeTab, setTab] = tabParam(searchParamsAdapter(params, setParams), TABS);
  // ?diff=4 shows the 4★ (hard) stat multiplier; default is the 3★ one.
  const hard = !!stage.hard && params.get("diff") === "4";

  return (
    <div className="detail stage-page">
      <Breadcrumbs
        renderLink={routerLink}
        items={[
          { label: L("Stages", "ステージ"), href: "/stages" },
          ...(stage.event ? [{ label: eventName, href: "/stages" }] : []),
          { label: <ColorCodedText text={stageName} /> },
        ]}
      />

      <PageHeader
        className="stage-header"
        level={2}
        art={stage.mission_id != null && !bannerFailed ? (
          <img
            className="stage-banner"
            src={bannerUrl(stage.mission_id)}
            alt=""
            onError={() => setBannerFailed(true)}
          />
        ) : undefined}
        title={<ColorCodedText text={stageName} />}
        subtitle={stage.event ? (
          <span className="event-line">
            <span className="cat-badge">{stage.event_category}</span> {eventName}
            {eventAlt && <span className="muted small"> {eventAlt}</span>}
          </span>
        ) : undefined}
        meta={(
          <MetaChips>
            <MetaChip label={L("Quest", "クエスト")} value={stage.quest_id} />
            <MetaChip label={L("Map / Entry", "マップ / エントリー")} value={<>{stage.map_no} / {stage.entry_no}</>} />
            <MetaChip value={L("×{n} mult", "倍率 ×{n}", { n: stage.multiplier ?? 1 })} title={L("stat multiplier on HP and melee ATK", "HPと近接攻撃力の倍率")} />
            <MetaChip label={L("Charisma", "カリスマ")} value={stage.charisma ?? 0} />
            <MetaChip label={L("Capacity", "出撃上限")} value={stage.capacity ?? 0} />
            {stage.active === false && <MetaChip className="past-chip" value={L("past content", "終了したコンテンツ")} />}
          </MetaChips>
        )}
      />

      {stage.description && (
        <p className="stage-desc"><MtlText jp={stage.description} en={stage.description_en} /></p>
      )}

      {stage.modifiers && stage.modifiers.length > 0 && (
        <Panel title={L("Stage modifiers", "ステージ効果")}>
          <Effects effects={stage.modifiers} />
          {ruleLink && (
            <p className="deploy-rule-link">
              <Link to={`/units?stage=${stage.quest_id}`}>
                {L("Units allowed to deploy here", "このステージに出撃可能なユニット")}
              </Link>
              <span className="muted small">{L(" · the Prince and tokens are not in the list", " · 王子・トークンは一覧に含まれません")}</span>
            </p>
          )}
        </Panel>
      )}

      {stage.hard && (
        <Panel
          className="hard-box"
          title={(
            <>
              <span className="cat-badge">{L("4★ / hard", "★4 / 高難度")}</span> {L("alternative", "別バージョン")}
              <span className="muted small">{L(" · same map, ×{n} mult", " · 同じマップ、倍率 ×{n}", { n: stage.hard.multiplier ?? 1 })}</span>
            </>
          )}
        >
          {(stage.hard.modifiers?.length ?? 0) > 0 && (
            <>
              <div className="muted small">{L("extra modifiers:", "追加の効果:")}</div>
              <Effects effects={stage.hard.modifiers} />
            </>
          )}
          <div className="muted small">
            {L("Enemy HP/ATK are rescaled to ×{n} (same enemies). Switch the enemy list with its 3★ / 4★ buttons.", "敵のHP・攻撃力は ×{n} に再計算されます (敵は同じ)。敵一覧の ★3 / ★4 ボタンで切り替えできます。", { n: stage.hard.multiplier ?? 1 })}
          </div>
        </Panel>
      )}

      {(hasDialogue || hasMap) && <UrlTabs tabs={TABS} active={activeTab} onChange={setTab} label={L("Stage sections", "ステージの項目")} idBase="stage" />}

      {activeTab === "enemies" && (
        <TabPanel tab="enemies" idBase="stage">
          {stage.popups && stage.popups.length > 0 && (
            <Panel title={L("Ability popups", "特性の説明")} note={L("In-game explanation popups shown in this stage.", "このステージでゲーム内に表示される説明。")}>
              <details className="popups-details">
                <summary>{L("{n} popups", "{n} 件", { n: stage.popups.length })}</summary>
                <div className="popups">
                  {stage.popups.map((p, i) => (
                    <div className="popup" key={i}>{p}</div>
                  ))}
                </div>
              </details>
            </Panel>
          )}
          <section>
            {!hasDialogue && !hasMap && <h3>{L("Enemies ({n})", "敵 ({n})", { n: enemies.length })}</h3>}
            {stage.hard && (
              <div className="difficulty-pick">
                <SegmentedButtons
                  label={L("Enemy stats for", "敵ステータス")}
                  options={[
                    { value: "3", label: L("3★ ×{n}", "★3 ×{n}", { n: stage.multiplier ?? 1 }) },
                    { value: "4", label: L("4★ ×{n}", "★4 ×{n}", { n: stage.hard.multiplier ?? 1 }) },
                  ]}
                  selected={hard ? "4" : "3"}
                  onToggle={(v) => setParams((p) => {
                    const n = new URLSearchParams(p);
                    if (v === "4") n.set("diff", "4"); else n.delete("diff");
                    return n;
                  }, { replace: true })}
                />
              </div>
            )}
            <div className="enemy-cards">
              {enemies.map((e, i) => (
                <EnemyCard key={`${e.enemy_id}-${i}`} e={e} mult={hard ? stage.hard!.multiplier ?? 1 : undefined} labels={labels} races={races} spcfg={spcfg} />
              ))}
            </div>
          </section>
        </TabPanel>
      )}

      {activeTab === "map" && stage.map && (
        <TabPanel tab="map" idBase="stage">
          <StageMap map={stage.map} questId={stage.quest_id} name={plainText(stage.name) || `Stage ${stage.quest_id}`} />
        </TabPanel>
      )}

      {activeTab === "dialogue" && (
        <TabPanel tab="dialogue" idBase="stage" className="dlg">
          {dialogue.length > 0 && (
            <>
              <h3>{L("In-stage dialogue", "ステージ内の会話")}</h3>
              <div className="muted small">
                {L("Scenes triggered inside this stage, in trigger order. Conditional scenes (e.g. a specific enemy dying) are listed too.", "このステージ内で発生する会話 (発生順)。条件付きの会話 (特定の敵の撃破など) も含みます。")}
              </div>
              {dialogue.map((s, i) => <DialogueSectionBlock key={i} s={s} tl={tl} />)}
            </>
          )}
          {storySections.length > 0 && (
            <>
              <h3>{L("Event story", "イベントストーリー")}</h3>
              <div className="muted small">
                {L("Story scenes of this event shown outside battle (on entering or after clearing its stages). The exact stage each scene belongs to is not recorded in the map data, so all of the event's scenes are listed in order.", "戦闘外で表示されるイベントのストーリー (ステージ開始時・クリア後)。各シーンがどのステージのものかはマップデータにないため、イベントの全シーンを順に表示します。")}
              </div>
              {storySections.map((s, i) => <DialogueSectionBlock key={i} s={s} tl={tl} />)}
            </>
          )}
          {dialogue.length === 0 && storySections.length === 0 && (
            <p className="muted">{L("No dialogue found for this stage.", "このステージの会話はありません。")}</p>
          )}
        </TabPanel>
      )}
    </div>
  );
}
