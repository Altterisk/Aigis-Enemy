// Skill/ability influence id -> display name/template. Edit directly; Vite
// hot-reloads this file, no Python export needed. python/aigis/
// unit_influence_map.py holds the fuller investigation notes per id if
// deeper context is needed, but is not read at runtime.
import type { InfluenceSelectionRule, UnitInfluenceLabels } from "./types";

interface InfluenceSelectionConfig {
  rule?: InfluenceSelectionRule;
  groupModes?: Record<number, InfluenceSelectionRule>;
  requiresParam4?: boolean;
}

// Common engine-selection metadata. These rules belong to influence types,
// not to individual units; per-unit JSON keeps only values and raw group
// fields. `groupModes` handles the one conditional case without pretending
// Type_ChangeFunction is a universal overwrite enum.
const INFLUENCE_SELECTION: {
  skill: Record<number, InfluenceSelectionConfig>;
  ability: Record<number, InfluenceSelectionConfig>;
} = {
  skill: {
    2: { rule: "highest_value" }, 3: { rule: "highest_value" },
    4: { rule: "highest_value" }, 5: { rule: "highest_value" },
    6: { rule: "highest_value" }, 89: { rule: "highest_value" },
    90: { rule: "highest_value" }, 103: { rule: "highest_value" },
    200: { rule: "highest_value" }, 204: { rule: "highest_value" },
    233: { rule: "shared_healing_slot" },
    234: { groupModes: { 3: "forced_priority" } },
    235: { rule: "new_instance" },
    236: { rule: "replaces_existing" },
  },
  ability: {
    70: { rule: "additive" }, 82: { rule: "additive" },
    87: { rule: "additive_then_sortie_multiplicative" },
    89: { rule: "highest_duration" }, 90: { rule: "highest_duration" },
    194: { rule: "highest_within_stack_id", requiresParam4: true },
    195: { rule: "highest_within_stack_id", requiresParam4: true },
    196: { rule: "highest_within_stack_id", requiresParam4: true },
    220: { rule: "shared_healing_slot" },
    305: { rule: "highest_value" },
  },
};

export function influenceSelectionRule(
  namespace: "skill" | "ability",
  influenceType?: number,
  groupChangeFunction?: number,
  params?: number[] | null,
): InfluenceSelectionRule | undefined {
  if (influenceType == null) return undefined;
  const config = INFLUENCE_SELECTION[namespace][influenceType];
  if (!config) return undefined;
  if (config.requiresParam4 && !params?.[3]) return undefined;
  const mode = groupChangeFunction == null ? undefined : groupChangeFunction & 3;
  return (mode == null ? undefined : config.groupModes?.[mode]) ?? config.rule;
}

export const INFLUENCE_LABELS: UnitInfluenceLabels = {
  "skill": {
    "1": {
      "name": "Dummy",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "2": {
      "name": "ATK Buff (Type-A)",
      "verified": true,
      "note": "target self = self ATK buff; any other target = Type-A ATK buff, highest applies, does not stack within type."
    },
    "3": {
      "name": "ATK Buff (Type-B, global)",
      "verified": true,
      "note": "Type-B ATK buff (all allies), highest applies, does not stack within type."
    },
    "4": {
      "name": "DEF Buff (Type-A)",
      "verified": true,
      "note": "DEF mirror of skill 2 (Type-A, highest applies, does not stack within type)."
    },
    "5": {
      "name": "DEF Buff (Type-B, global)",
      "verified": true,
      "note": "DEF mirror of skill 3 (Type-B, highest applies, does not stack within type)."
    },
    "6": {
      "name": "Range",
      "verified": true,
      "note": "target!=self = range buff for allies, mul3 is percent of base (130 = x1.3 range), highest applies."
    },
    "7": {
      "name": "Attack count",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test).",
      "tpl": "{add} hits"
    },
    "8": {
      "name": "Damage-area modifier",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "9": {
      "name": "Dodge",
      "verified": true,
      "note": "wiki-maintainer-sourced. mul3 is a percent chance, not a x-multiplier -- was rendering as a nonsensical x0.70.",
      "tpl": "{mul3pct} chance"
    },
    "10": {
      "name": "Foresee",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "11": {
      "name": "HP",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "12": {
      "name": "Block",
      "verified": true,
      "note": "Block count (add = the block count).",
      "tpl": "blocks {add} enemies"
    },
    "13": {
      "name": "Melee target count",
      "verified": true,
      "note": "wiki-maintainer-sourced.",
      "tpl": "{add}"
    },
    "14": {
      "name": "Set PAD",
      "verified": true,
      "note": "PAD = post-attack delay, the pause after an attack before the next one can start. Probably shares 170's add+1 offset (PAD is set to add+1, not add directly) -- not yet independently confirmed for this id."
    },
    "15": {
      "name": "Support-effect increase",
      "verified": true,
      "note": "Official influence name 支援効果アップ. No current carriers are available to decode its parameters; the earlier PAD label conflicts with the official registry."
    },
    "16": {
      "name": "Dancer ATK support",
      "verified": false,
      "note": "official influence name: 攻撃支援(踊り子); no current carriers available for parameter verification."
    },
    "17": {
      "name": "Dancer DEF support",
      "verified": false,
      "note": "official influence name: 防御支援(踊り子); no current carriers available for parameter verification."
    },
    "18": {
      "name": "Healing-power buff",
      "verified": false,
      "note": "official influence name: 治癒力向上; no current carriers available for parameter verification."
    },
    "20": {
      "name": "MR modifier 2",
      "verified": false,
      "note": "official influence name: 魔法耐性アップ2; no current carriers available to establish how it differs from skill influence 19."
    },
    "26": {
      "name": "Convert to magic damage",
      "verified": false,
      "note": "official influence name: 魔法攻撃化; no current carriers available for parameter verification."
    },
    "27": {
      "name": "Morale boost increase",
      "verified": false,
      "note": "official influence name: 士気高揚アップ; no current carriers available for parameter verification."
    },
    "28": {
      "name": "Anna ATK support",
      "verified": false,
      "note": "official influence name: 攻撃支援(アンナ専用); no current carriers available for parameter verification."
    },
    "29": {
      "name": "Anna DEF support",
      "verified": false,
      "note": "official influence name: 防御支援(アンナ専用); no current carriers available for parameter verification."
    },
    "19": {
      "name": "Magic resist",
      "verified": true,
      "note": "multiplicative of base MR (percent)."
    },
    "21": {
      "name": "Change projectile",
      "verified": true,
      "note": "official name チェンジミサイル and carrier rows identify the replacement projectile by id."
    },
    "22": {
      "name": "Simultaneous target count",
      "verified": true,
      "note": "official name 同時攻撃数アップ; used by both simultaneous attacks and simultaneous healing.",
      "tpl": "{add}"
    },
    "30": {
      "name": "Assassination",
      "verified": true,
      "note": "wiki-maintainer-sourced. add is a small percent-like number (e.g. 10 on Bearca) -- likely instant-kill chance.",
      "tpl": "{add}% chance"
    },
    "31": {
      "name": "Restore HP on skill activation",
      "verified": true,
      "note": "wiki-maintainer-sourced. mul3 is the percent directly, not a x-multiplier.",
      "tpl": "{mul3pct}"
    },
    "32": {
      "name": "Generate UP",
      "verified": true,
      "note": "official influence name コスト回復; carrier text gives the generated deployment cost directly.",
      "tpl": "generates {mul3} UP"
    },
    "33": {
      "name": "Physical damage reduction",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). mul3 is the reduction percent directly (same shape as 214/215/216), not a x(mul3/100) multiplier.",
      "tpl": "-{mul3pct}"
    },
    "34": {
      "name": "Magic damage reduction",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). mul3 is the reduction percent directly (same shape as 214/215/216), not a x(mul3/100) multiplier.",
      "tpl": "-{mul3pct}"
    },
    "35": {
      "name": "Attack restores HP",
      "verified": true,
      "note": "each attack heals the unit for a percent of the damage dealt. mul3 is the percent directly, not a x-multiplier.",
      "tpl": "{mul3pct} of damage dealt"
    },
    "36": {
      "name": "Immortal",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). add is a constant 1 flag across every carrier  -- no 'value 1' text needed.",
      "tpl": ""
    },
    "37": {
      "name": "Reduce enemy ATK",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). mul3 is the reduction percent directly, same shape as 103/104/105/214/215/216  -- not a x(mul3/100) multiplier.",
      "tpl": "-{mul3pct}"
    },
    "38": {
      "name": "Magic damage",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). add is a one-shot flag (always 1), not a value -- confirmed no 'value 1' text is needed.",
      "tpl": ""
    },
    "39": {
      "name": "True damage",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). add is a constant 1 flag across every carrier (same shape as 38/93/171) -- no 'value 1' text needed.",
      "tpl": ""
    },
    "40": {
      "name": "Auto-revive",
      "verified": true,
      "note": "revives once with HP restored to a percent of max. mul3 is the percent directly.",
      "tpl": "to {mul3pct} HP"
    },
    "41": {
      "name": "Paralyze on skill end",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). add is a constant 1 flag across every carrier  -- no 'value 1' text needed.",
      "tpl": ""
    },
    "42": {
      "name": "Lose HP on skill end",
      "verified": true,
      "note": "mul3 is the percent lost directly, not a x-multiplier.",
      "tpl": "-{mul3pct} HP"
    },
    "44": {
      "name": "Toggle collision",
      "verified": true,
      "note": "official influence name コリジョン切り替え; carried by flight-mode skills. add is a constant 1 flag, so no value text is needed.",
      "tpl": ""
    },
    "45": {
      "name": "Damage override",
      "verified": true,
      "note": "official influence name ダメージ変更; covers fixed-damage values and zero/no-damage attack modes.",
      "tpl": "{add}"
    },
    "46": {
      "name": "Cure status ailments",
      "verified": true,
      "note": "official influence name 状態異常治療; carrier text explicitly cures or prevents status ailments. mul3 is filler 100 and is suppressed.",
      "tpl": ""
    },
    "47": {
      "name": "Animation change",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "49": {
      "name": "Skill swap",
      "verified": true,
      "note": "user-confirmed: after use, this unit's skill changes to another skill. `add` holds the target SkillList id (e.g. target=self, mul=0, add=3818 -> swaps to skill 3818)."
    },
    "50": {
      "name": "Auto-use",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). add is a constant 1 flag across every carrier  -- no 'value 1' text needed.",
      "tpl": ""
    },
    "51": {
      "name": "Regeneration",
      "verified": true,
      "note": "mul = interval in frames @60fps, add = HP restored per tick (e.g. mul=30, add=45 = 45 HP every 30f). Rendered with the computed HP/s rate too -- special-cased in skillRowValue since it needs both fields combined.",
      "tpl": "{add} HP / {mulf}"
    },
    "52": {
      "name": "Valkyrie UP modifier",
      "verified": true,
      "note": "mul is the multiplier directly, never Power-filled -- mul=200 matched Meer (Swimsuit)'s text \"コスト回復2倍\" (x2 cost recovery)."
    },
    "53": {
      "name": "Ground only area attack",
      "verified": true,
      "note": "wiki-maintainer-sourced."
    },
    "54": {
      "name": "Nullify attack chance",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test).",
      "tpl": "{add}% chance to nullify attacks"
    },
    "55": {
      "name": "Permanent mode change",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). add is a constant 1 flag across every carrier  -- no 'value 1' text needed.",
      "tpl": ""
    },
    "57": {
      "name": "Counter (physical attack when blocked)",
      "verified": true,
      "note": "counters with a physical attack when this unit blocks an attack. mul3 is the counter damage as a percent of the enemy's ATK (mul3=300 = 300% of enemy ATK).",
      "tpl": "{x} of enemy's ATK"
    },
    "162": {
      "name": "Counter (all attack types when blocked)",
      "verified": true,
      "note": "modifies/extends 57's counter to trigger on ALL attack types (not just physical) when blocked. Always co-occurs with 57 (0 skills have 162 without 57) -- dependent modifier, not a standalone counter. mul3 is the counter damage as a percent of the enemy's ATK, same as 57.",
      "tpl": "{x} of enemy's ATK"
    },
    "59": {
      "name": "Reduce enemy MR",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). mul3 is the reduction percent directly, same shape as 37/60/103/104/105/214/215/216  -- not a x(mul3/100) multiplier.",
      "tpl": "-{mul3pct}"
    },
    "60": {
      "name": "Reduce enemy DEF",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). mul3 is the reduction percent directly, same shape as 37/59/103/104/105/214/215/216  -- not a x(mul3/100) multiplier.",
      "tpl": "-{mul3pct}"
    },
    "61": {
      "name": "Cannot be targeted",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). add is a constant 1 flag across every carrier  -- no 'value 1' text needed.",
      "tpl": ""
    },
    "62": {
      "name": "Curse-effect increase",
      "verified": false,
      "note": "official influence name 呪術効果アップ; no current carriers available for parameter verification."
    },
    "63": {
      "name": "Curse instant-kill effect increase",
      "verified": false,
      "note": "official influence name 呪術即死アップ; no current carriers available for parameter verification."
    },
    "64": {
      "name": "Heal by ATK",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "65": {
      "name": "Unit points over time",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). add varies (1 or 2) across carriers -- a real value, NOT a flag (not a universal add==1-is-a-flag pattern); no confirmed interval/unit for it yet, shown as a bare number.",
      "tpl": "{add}"
    },
    "66": {
      "name": "Bonus damage vs flying",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "67": {
      "name": "Bonus damage vs ground",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "73": {
      "name": "Change projectile 2",
      "verified": false,
      "note": "official influence name チェンジミサイル2; no current carriers available for parameter verification."
    },
    "74": {
      "name": "Restore token HP",
      "verified": false,
      "note": "official influence name 回復(トークン); no current carriers available for parameter verification."
    },
    "78": {
      "name": "Damage-nullification proc chance",
      "verified": false,
      "note": "official influence name ダメージ無効上昇(アビリティ); no current carriers available for parameter verification."
    },
    "80": {
      "name": "Special-attack effect increase",
      "verified": false,
      "note": "official influence name 特攻効果上昇(アビリティ); no current carriers available for parameter verification."
    },
    "82": {
      "name": "Instant-kill proc chance",
      "verified": false,
      "note": "official influence name 即死発動率上昇(アビリティ); no current carriers available for parameter verification."
    },
    "71": {
      "name": "Attack heals nearby allies",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "84": {
      "name": "Unit cost",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "85": {
      "name": "ATK buff (rarity-gated)",
      "verified": true,
      "note": "only applies to units of the given rarity. mul3 (Power-filled when the row has no explicit multiplier) = the buff, add = target rarity id (2 = silver). Some real carriers omit mul3 entirely.",
      "tpl": "{x} (rarity {add})"
    },
    "86": {
      "name": "Lose HP on skill end (rarity-gated)",
      "verified": true,
      "note": "only applies to units of the given rarity. mul = percent HP lost, add = target rarity id (2 = silver).",
      "tpl": "-{mul}% HP (rarity {add})"
    },
    "87": {
      "name": "DEF buff (rarity-gated)",
      "verified": true,
      "note": "only applies to units of the given rarity. mul3 (Power-filled when the row has no explicit multiplier) = the buff, add = target rarity id (2 = silver). Some real carriers omit mul3 entirely.",
      "tpl": "{x} (rarity {add})"
    },
    "88": {
      "name": "Paralyzing attacks",
      "verified": true,
      "note": "official influence name 麻痺属性化; carrier text applies paralysis buildup over several attacks."
    },
    "92": {
      "name": "Cannot activate skill",
      "verified": false,
      "note": "official influence name スキル発動不可; no current carriers available for parameter verification."
    },
    "94": {
      "name": "Remove true-damage attribute",
      "verified": false,
      "note": "official influence name 貫通属性解除; no current carriers available for parameter verification."
    },
    "97": {
      "name": "Magic-damage proc chance",
      "verified": false,
      "note": "official influence name 魔法属性(確率発動); no current carriers available for parameter verification."
    },
    "99": {
      "name": "Drain 2",
      "verified": false,
      "note": "official influence name ドレイン2; no current carriers available to establish how it differs from skill influence 35."
    },
    "89": {
      "name": "ATK Buff (Type-C, conditional)",
      "verified": true,
      "note": "Type-C ATK buff (conditional targets), highest applies, does not stack within type."
    },
    "90": {
      "name": "DEF Buff (Type-C, conditional)",
      "verified": true,
      "note": "Type-C DEF buff (conditional targets), highest applies, does not stack within type."
    },
    "95": {
      "name": "Current HP damage",
      "verified": true,
      "note": "deals damage equal to a percent of the TARGET's current HP. add is the percent directly (no mul3 on this id).",
      "tpl": "{add}%"
    },
    "100": {
      "name": "On-Hit HP drain",
      "verified": true,
      "note": "wiki-maintainer-sourced."
    },
    "108": {
      "name": "Lose HP",
      "verified": true,
      "note": "loses HP on some trigger. mul3 is the percent directly, not a x-multiplier.",
      "tpl": "-{mul3pct}"
    },
    "173": {
      "name": "Scaling Attack",
      "verified": true,
      "note": "formula confirmed against 4 independent wiki datapoints: mul=frames/tick @60fps, mul2=amount/tick, mul3=cap, add=direction (+1 inc/-1 dec). aigis.unit exposes this decoded as the row's `tick_scale` field, rendered by its OWN dedicated UI (ts.per_sec/ts.cap) -- tpl suppressed so the generic mul3 x-multiplier render doesn't also show a redundant x-multiplier alongside it.",
      "tpl": ""
    },
    "177": {
      "name": "Scaling number of targets",
      "verified": true,
      "note": "formula confirmed against 4 independent wiki datapoints: mul=frames/tick @60fps, mul2=amount/tick, mul3=cap, add=direction (+1 inc/-1 dec). aigis.unit exposes this decoded as the row's `tick_scale` field, rendered by its OWN dedicated UI -- tpl suppressed (see 173's note).",
      "tpl": ""
    },
    "122": {
      "name": "Linked ability",
      "verified": true,
      "note": "the skill ALSO grants the referenced AbilityConfig._ConfigID's rows (`add` holds the id). aigis.unit exposes these under the skill stage's `linked_ability_influences`, not merged into `influences`."
    },
    "48": {
      "name": "Attack mode change",
      "verified": true,
      "hidden": true,
      "note": "user-confirmed: internal engine mechanism, no known player-facing effect. Hidden from the UI by default."
    },
    "107": {
      "name": "Permanent skill",
      "verified": true,
      "note": "Official name スキル永続化 and current carrier text identify this as making the skill permanent. add is a constant 1 flag, so no value text is needed.",
      "tpl": ""
    },
    "121": {
      "name": "Skill-text override",
      "verified": true,
      "hidden": true,
      "note": "Official name スキルテキスト変更 identifies this internal skill-text override. Hidden from the UI by default because it has no separate player-facing effect."
    },
    "141": {
      "name": "Permanent ATK modification",
      "verified": true,
      "note": "Verified."
    },
    "142": {
      "name": "Permanent DEF modification",
      "verified": true,
      "note": "Verified."
    },
    "195": {
      "name": "Attack once",
      "verified": true,
      "note": "Official 攻撃停止 and current carrier texts identify one-shot skills that stop attacking after the single attack. add=1 is a flag and needs no value text.",
      "tpl": ""
    },
    "120": {
      "name": "Restore token charge",
      "verified": true,
      "note": "Verified. add is the amount restored (Sanara (Black)'s add=1 matches her text '1回復').",
      "tpl": "+{add}"
    },
    "56": {
      "name": "Time stop",
      "verified": true,
      "note": "Verified. mul2 = duration in 60fps frames (240 = 4s; survey: 30/120/180/240/300/360/480/600/780, all multiples of 30). mul survey (86 rows): mul=1000 dominant (66), mul=-1 secondary (19), one outlier mul=40. Confirmed: mul=1000 = all enemies (global sentinel, as elsewhere e.g. aura range), mul=-1 = enemies WITHIN RANGE only. mul3 is NOT used by this id -- never display it as a Power multiplier (see unit.py itype!=56 Power-fill exclusion).",
      "tpl": "for {mul2s}"
    },
    "110": {
      "name": "Ignore skill-duration extensions",
      "verified": true,
      "note": "Official name スキル時間延長無視 identifies this flag. add is always 1, so no value text is needed.",
      "tpl": ""
    },
    "81": {
      "name": "True damage chance",
      "verified": true,
      "note": "Verified. add is the chance percent directly -- verified via Colum's text '貫通攻撃の確率が60%上昇' matching add=60 exactly .",
      "tpl": "+{add}%"
    },
    "179": {
      "name": "Cannot be set to auto-use",
      "verified": true,
      "note": "Official name このスキルは自動発動の対象外にする; this excludes the skill from automatic activation."
    },
    "83": {
      "name": "Permanent HP modification",
      "verified": true,
      "note": "Verified."
    },
    "156": {
      "name": "Execute skill command",
      "verified": true,
      "note": "Official name スキルコマンド. Current carriers include explicit event-command rows as well as skill-specific command flags, so the former BGM-only label was too narrow."
    },
    "145": {
      "name": "Dancer ATK share modifier",
      "verified": true,
      "note": "Official 応援(攻撃+); current Dancer skills multiply their ATK support contribution."
    },
    "146": {
      "name": "Dancer DEF share modifier",
      "verified": true,
      "note": "Official 応援(防御+); current Dancer skills multiply their DEF support contribution."
    },
    "106": {
      "name": "Taunt",
      "verified": true,
      "note": "Verified.",
      "tpl": ""
    },
    "96": {
      "name": "Heal target count",
      "verified": true,
      "note": "Mary's add=3 matches her text '味方3人への回復' (heals 3 allies) exactly. Not a duplicate of 167 (attack target count) -- that id's own sample matched a different, attack-side phrase.",
      "tpl": "{add} allies"
    },
    "167": {
      "name": "Permanent target-count change",
      "verified": true,
      "note": "Official 同時攻撃数アップ(永続). Current carriers use it for both attack and healing target counts; add stores the resulting target count.",
      "tpl": "to {add}"
    },
    "203": {
      "name": "Max cost consumption",
      "verified": true,
      "note": "means two different things depending on whether the same skill also carries 204/205 (UP-consuming ATK/DEF buff): with them, this is the max UP consumed to reach the buff's max value; without them, it's just the flat cost required to activate the skill at all. Name is picked accordingly in the renderer. add is the cost (Tram (Platinum)'s add=100 matches her text '最大100コスト消費').",
      "tpl": "{add}"
    },
    "204": {
      "name": "UP-Consuming ATK Buff",
      "verified": true,
      "note": "buff scales with UP (cost) consumed on activation; max value is the row's own mul3; value is percent to add; highest applies. SKILL namespace -- do not confuse with ABILITY type 204 (different id space). Was rendering as a bogus x(mul3/100) multiplier -- mul3 is the percent to ADD directly (e.g. mul3=80 = +80%, not x0.80).",
      "tpl": "+{mul3pct}"
    },
    "205": {
      "name": "UP-Consuming DEF Buff",
      "verified": true,
      "note": "same mechanic as type 204 but for DEF; max is mul3, additive percent (see 204's note).",
      "tpl": "+{mul3pct}"
    },
    "247": {
      "name": "Skill can be ended manually",
      "verified": true,
      "note": "Verified."
    },
    "43": {
      "name": "Enable collision",
      "verified": true,
      "hidden": true,
      "note": "Official influence name コリジョン有効. It has no known direct player-facing text and remains hidden by default."
    },
    "125": {
      "name": "Restore all allies' HP on skill end",
      "verified": true,
      "note": "A flag-only, target=all effect, distinct from the percentage-bearing skill influence 124."
    },
    "124": {
      "name": "Restore HP on skill end",
      "verified": true,
      "note": "mul3 is the percent of maximum HP restored when the skill ends; target selects the recipient.",
      "tpl": "{mul3pct}"
    },
    "103": {
      "name": "Enemy ATK debuff",
      "verified": true,
      "note": "skill-based ATK debuff, highest applies; value = percent to reduce BY. mul3 is the percent directly, not a x-multiplier .",
      "tpl": "-{mul3pct}"
    },
    "104": {
      "name": "Enemy DEF debuff",
      "verified": true,
      "note": "DEF debuff (not ATK). mul3 is the percent directly, not a x-multiplier (same shape as 103).",
      "tpl": "-{mul3pct}"
    },
    "105": {
      "name": "Enemy MR debuff",
      "verified": true,
      "note": "Verified. mul3 is the percent directly, not a x-multiplier (same shape as 103/104).",
      "tpl": "-{mul3pct}"
    },
    "116": {
      "name": "Ally magic damage amplification",
      "verified": true,
      "note": "Verified."
    },
    "214": {
      "name": "Target receives reduced damage (magic)",
      "verified": true,
      "note": "Part of a 214/215/216 physical/magic/true damage-reduction trio -- surveyed every skill carrying ONLY 214 (no 215/216) and read its own in-game text: all 9 singleton carriers (Kaoru, Trisha, Ionami, Eoris, Chibi Trisha, ...) explicitly say \"魔法ダメージを...軽減/減少\" (reduces MAGIC damage), none say 物理 or 固定/真. mul3 IS the reduction percent directly (Kaoru mul3=40, text says 40%軽減 -- not a x(mul3/100) final-damage multiplier like the generic mul3 fallback assumes).",
      "tpl": "-{mul3pct}"
    },
    "215": {
      "name": "Target receives reduced damage (true)",
      "verified": true,
      "note": "Official name 貫通ダメージ軽減 confirms true/piercing-damage reduction. It shares the trio's direct-percent mul3 shape.",
      "tpl": "-{mul3pct}"
    },
    "216": {
      "name": "Target receives reduced damage (physical)",
      "verified": true,
      "note": "Part of a 214/215/216 physical/magic/true damage-reduction trio -- surveyed every skill carrying ONLY 216 (no 214/215) and read its own in-game text: singleton carriers with an explicit damage-reduction line (Heraclea, Anna (Summer Uniform), Judithe (Christmas)) all say \"物理ダメージを...軽減/減少\" (reduces PHYSICAL damage). mul3 is the reduction percent directly, same as 214 (see its note) -- not a x(mul3/100) multiplier.",
      "tpl": "-{mul3pct}"
    },
    "160": {
      "name": "Death treated as retreat",
      "verified": true,
      "note": "Verified."
    },
    "161": {
      "name": "Can be redeployed after death",
      "verified": true,
      "note": "mul2 is the redeploy delay in frames (Yoshino's mul2=2400 = 40s, matching her text '一定時間後に再出撃可能').",
      "tpl": "after {mul2s}"
    },
    "76": {
      "name": "Remove forced action",
      "verified": true,
      "note": "Official 強制行動の解除. Carrier text says the unit no longer focuses exclusively on healing, removing its class-forced action."
    },
    "134": {
      "name": "Target auto-uses skill",
      "verified": true,
      "note": "Verified. add is a constant 1 flag across every carrier  -- no 'value 1' text needed.",
      "tpl": ""
    },
    "139": {
      "name": "Target skill cooldown reduction",
      "verified": true,
      "note": "add is the percent directly (Gratia's add=60 matches her text '60％減少').",
      "tpl": "-{add}%"
    },
    "98": {
      "name": "Chance to deal true damage",
      "verified": true,
      "note": "same mul3/add structure as 72/77/79: mul3 is a multiplier of the base chance, add is a flat +percent added on top. Rendered in skillRowValue since either field can be absent and mul3=100 is a no-op."
    },
    "140": {
      "name": "Flat MR reduction to all enemies",
      "verified": true,
      "note": "add is the flat MR reduction (Tsukiko's add=-15). mul3 on this row is 100 (neutral/Power-filled), not the value -- was rendering as a meaningless x1.00 via the generic mul3 fallback.",
      "tpl": "{add}"
    },
    "170": {
      "name": "Permanent PAD (post-attack delay) modification",
      "verified": true,
      "note": "sets PAD permanently to add+1 (not a reduction delta). Aleese (Swimsuit)'s add=5, so PAD is set to 6."
    },
    "24": {
      "name": "Projectile interval",
      "verified": false,
      "note": "Official influence name MSインターバル. Carrier rows store small integers, but the unit and parameter are not yet text-confirmed."
    },
    "25": {
      "name": "Skill duration increase",
      "verified": true,
      "note": "Two row shapes are in use: non-neutral mul3 sets duration to that percent of normal; neutral mul3=100 with add uses add as a flat number of seconds. Rendering is special-cased in skillRowValue."
    },
    "151": {
      "name": "Revive condition",
      "verified": true,
      "note": "Verified (part of a 151/152/153 revive trio)."
    },
    "152": {
      "name": "Revive count",
      "verified": true,
      "note": "Verified (part of a 151/152/153 revive trio). add varies (1 or 3 across carriers) -- a real value, not a flag.",
      "tpl": "{add}"
    },
    "153": {
      "name": "Revive timer",
      "verified": true,
      "note": "Verified (part of a 151/152/153 revive trio). add = frames (timer field is in frames).",
      "tpl": "{addf}"
    },
    "183": {
      "name": "Chef HP support multiplier",
      "verified": true,
      "note": "Official 料理支援(最大HP+); current Chef texts say the ability's per-second increase values are multiplied."
    },
    "184": {
      "name": "Chef ATK support multiplier",
      "verified": true,
      "note": "Official 料理支援(攻撃力+); current Chef texts say the ability's per-second increase values are multiplied."
    },
    "185": {
      "name": "Chef DEF support multiplier",
      "verified": true,
      "note": "Official 料理支援(防御力+); current Chef texts say the ability's per-second increase values are multiplied."
    },
    "118": {
      "name": "Permanent block count modification",
      "verified": true,
      "note": "Verified. add is the block count change.",
      "tpl": "{add}"
    },
    "137": {
      "name": "Class/ability ATK debuff multiplier",
      "verified": true,
      "note": "Verified."
    },
    "187": {
      "name": "Class/ability instant-death debuff multiplier",
      "verified": true,
      "note": "Verified."
    },
    "147": {
      "name": "Ignore counterattacks",
      "verified": true,
      "hidden": true,
      "note": "Official name 反撃無効 identifies this internal attack flag. Hidden from the UI by default because carrier text does not expose it separately."
    },
    "68": {
      "name": "Field projectile (visual)",
      "verified": true,
      "hidden": true,
      "note": "cosmetic/visual effect, no gameplay impact. Hidden from the UI by default."
    },
    "69": {
      "name": "Field effect (visual)",
      "verified": true,
      "hidden": true,
      "note": "cosmetic/visual effect, no gameplay impact. Hidden from the UI by default."
    },
    "70": {
      "name": "Field sound (audio)",
      "verified": true,
      "hidden": true,
      "note": "cosmetic/visual effect, no gameplay impact. Hidden from the UI by default."
    },
    "58": {
      "name": "Field damage",
      "verified": true,
      "note": "official influence name フィールド(ダメージ). Carriers include cross-shaped, radial, and full-range one-shot damage fields, so the former Cross slash label was too narrow."
    },
    "159": {
      "name": "Heal unhealable units",
      "verified": true,
      "note": "heals units that are normally flagged as un-healable."
    },
    "75": {
      "name": "Gold GET!",
      "verified": true,
      "note": "Verified."
    },
    "93": {
      "name": "Physical damage",
      "verified": true,
      "note": "Verified. add is a constant 1 flag across every carrier (same shape as 38/39/171) -- no 'value 1' text needed.",
      "tpl": ""
    },
    "227": {
      "name": "Skill aura effect (visual)",
      "verified": true,
      "hidden": true,
      "note": "Official name スキルオーラエフェクト指定 identifies this as the skill aura's visual-effect selector. Hidden because it has no separate gameplay effect."
    },
    "226": {
      "name": "Scholar debuff multiplier",
      "verified": true,
      "note": "Verified."
    },
    "228": {
      "name": "ATK buff (race-conditional, NPC token)",
      "verified": true,
      "note": "race-conditional ATK buff; observed on the 英雄の剣（妖精） (Hero's Sword - Fairy) summon token, buffing Elf/Dark Elf/Half Elf/Half Dark Elf/Dwarf allies. Only observed on NPC/token-type carriers so far.",
      "tpl": "{x}"
    },
    "229": {
      "name": "DEF buff (race-conditional, NPC token)",
      "verified": true,
      "note": "race-conditional DEF buff; observed on the 英雄の盾（人） (Hero's Shield - Human) summon token, buffing Human/Half-God allies. Only observed on NPC/token-type carriers so far.",
      "tpl": "{x}"
    },
    "163": {
      "name": "Take no damage",
      "verified": true,
      "note": "Verified. add is a constant 1 flag across every carrier  -- no 'value 1' text needed.",
      "tpl": ""
    },
    "72": {
      "name": "Multihit proc chance",
      "verified": true,
      "note": "Official マルチショット上昇(アビリティ). mul3 is a multiplier of the base chance and add is a flat percentage-point increase."
    },
    "77": {
      "name": "Critical-hit proc chance",
      "verified": true,
      "note": "Official クリティカル上昇(アビリティ). mul3 is a multiplier of the base chance and add is a flat percentage-point increase."
    },
    "79": {
      "name": "Special-attack proc chance",
      "verified": true,
      "note": "Official 特攻発動率上昇(アビリティ). Applies to abilities with random/special attack effects; mul3 is multiplicative and add is flat."
    },
    "91": {
      "name": "Cannot be healed",
      "verified": true,
      "note": "Verified. add is a constant 1 flag across every carrier  -- no 'value 1' text needed.",
      "tpl": ""
    },
    "155": {
      "name": "Lifelinker damage-share value",
      "verified": true,
      "note": "Official ライフセーバー[上昇]; current Lifelinker carrier text and ability influence 130 confirm that add sets the damage-share percentage.",
      "tpl": "{add}%"
    },
    "236": {
      "name": "Enemy damage-taken amplification",
      "verified": true,
      "note": "pairs with ABILITY_INFLUENCE type 221."
    },
    "23": {
      "name": "Projectile delay",
      "verified": true,
      "hidden": true,
      "note": "Official influence name MSディレイ. Official skill 21 is the separate projectile-change mechanic; this row stores delay-like values and remains hidden by default."
    },
    "138": {
      "name": "Class/ability DEF debuff multiplier",
      "verified": true,
      "note": "same mechanic as 137 (Class/ability ATK debuff multiplier) but for DEF."
    },
    "233": {
      "name": "Healing received increase",
      "verified": true,
      "note": "Same effect category as ability influence 220; they do not stack with each other. mul3 is the resulting percent (130 = 1.3x healing received)."
    },
    "234": {
      "name": "Further healing received increase",
      "verified": true,
      "note": "A separate further modifier from skill influence 233 / ability influence 220. mul3 is the multiplier x100 -- 帝国聖盾騎士クリッペ's アダマントシールド carries mul3=130 for its 自身が受ける回復量をさらに1.3倍上昇. target/expression picks who it applies to (self via IsOwnerUnit, nearby allies, or a genus)."
    },
    "252": {
      "name": "Bard HP support interval modifier",
      "verified": true,
      "note": "Official 歌支援インターバル変動(最大HP); Prucia's text confirms faster gradual HP-support growth. add is the interval change in frames.",
      "tpl": "{addf}"
    },
    "253": {
      "name": "Bard ATK support interval modifier",
      "verified": true,
      "note": "Official 歌支援インターバル変動(攻撃力); current Bard texts confirm faster gradual ATK-support growth. add is the interval change in frames.",
      "tpl": "{addf}"
    },
    "254": {
      "name": "Bard DEF support interval modifier",
      "verified": true,
      "note": "Official 歌支援インターバル変動(防御力); current Bard texts confirm faster gradual DEF-support growth. add is the interval change in frames.",
      "tpl": "{addf}"
    },
    "255": {
      "name": "Bard MR support interval modifier",
      "verified": true,
      "note": "Official 歌支援インターバル変動(魔法耐性); current Bard texts confirm faster gradual MR-support growth. add is the interval change in frames.",
      "tpl": "{addf}"
    },
    "248": {
      "name": "Bard gradual-increase max-cap boost (HP)",
      "verified": true,
      "note": "Official 歌支援上限値アップ(最大HP); Prucia's text confirms the Bard HP support cap multiplier."
    },
    "249": {
      "name": "Bard gradual-increase max-cap boost (ATK)",
      "verified": true,
      "note": "Official 歌支援上限値アップ(攻撃力); current Bard texts confirm the ATK support cap multiplier."
    },
    "250": {
      "name": "Bard gradual-increase max-cap boost (DEF)",
      "verified": true,
      "note": "Official 歌支援上限値アップ(防御力); current Bard texts confirm the DEF support cap multiplier."
    },
    "251": {
      "name": "Bard gradual-increase max-cap boost (MR)",
      "verified": true,
      "note": "Official 歌支援上限値アップ(魔法耐性); current Tristella/Uscias text confirms the MR support cap multiplier."
    },
    "165": {
      "name": "Permanent projectile change",
      "verified": true,
      "note": "Official チェンジミサイル(永続). Faust and Hu Ximei texts confirm the projectile/attack form persists until the next skill."
    },
    "193": {
      "name": "Detonate token",
      "verified": true,
      "note": "explodes the unit's servant token, dealing magic-type damage and stopping nearby enemies' movement for a duration. Row shape: target=all, mul=0, gated by ExtendProperty condition IsServantToken; carries Range/Missile/Effect/Sound extend keys for the explosion's AOE and VFX/SFX. Was earlier miscited as id 293 (typo) -- corrected to 193."
    },
    "178": {
      "name": "Transform into selected unit",
      "verified": true,
      "note": "transforms into a selected unit at a percentage of that unit's stats. mul3 is the percent directly, not a x-multiplier.",
      "tpl": "at {mul3pct} of its stats"
    },
    "217": {
      "name": "Conditional ATK debuff",
      "verified": true,
      "note": "conditional ATK debuff (was 'enemy global atk debuff?'). mul3 is the reduction percent directly, same shape as 37/59/60/103/104/105  -- not a x(mul3/100) multiplier.",
      "tpl": "-{mul3pct}"
    },
    "115": {
      "name": "Attacks cannot reduce enemy HP to 0",
      "verified": true,
      "note": "outgoing effect, not self-survival: Christa (Swimsuit)'s text '敵に止めを刺さない遠距離攻撃' says her attacks don't deliver the finishing blow, leaving struck enemies at 1 HP. add is a constant 1 flag across every carrier -- no 'value 1' text needed.",
      "tpl": ""
    },
    "196": {
      "name": "Deep Sea effect reduction",
      "verified": true,
      "note": "Verified. add is the reduction percent directly (no mul3 on this id).",
      "tpl": "-{add}%"
    },
    "169": {
      "name": "Permanent block attack target count change",
      "verified": true,
      "note": "sets the number of enemies attacked while blocking to add (same 'modification' shape as 118/167). Riven (Black)'s add=2 -- her text says '攻撃対象数+1' (+1), so add likely stores the resulting total (e.g. base 1 + 1 = 2) rather than the delta.",
      "tpl": "to {add}"
    },
    "133": {
      "name": "Force ally to retreat",
      "verified": true,
      "note": "Verified."
    },
    "176": {
      "name": "Scaling number of multi-hit",
      "verified": true,
      "note": "worth checking the 'nearby' field for a possible scaling-ATK or scaling-number-of-target variant near this id -- not yet investigated. Same tick_scale shape as 173/177 (mul=frames/tick, mul2=amount/tick, mul3=cap, add=direction) -- verified via Solais text '攻撃回数最大9回' matching mul3=9; tpl suppressed, rendered by the dedicated tick_scale UI instead (same reasoning as 173/177).",
      "tpl": ""
    },
    "267": {
      "name": "Charge skill",
      "verified": true,
      "note": "a charge-up skill. The ExtendProperty key 切り替わりスキルリスト (\"switch-to skill id\") holds the charged-tier skill id -- aigis.unit.UnitDB.skill() now follows this the same way it follows type-49 swaps, appending the charged stage with via='charge'. Verified example: 3748 聖剣ガラティン charges into 3749 聖剣ガラティン【天頂】, which swaps back to 3748 via its own type-49 row."
    },
    "268": {
      "name": "Stop attacking",
      "verified": true,
      "note": "the unit stops performing normal attacks for the skill's duration, replaced by whatever the skill's other rows describe instead (e.g. Rina's pure self-ATK-buff-no-attacking, or a stationary damage field powered by a fired missile as seen with Tram (Triumphal Black)'s ability influence 210). add is a constant 4 flag across every carrier observed -- no 'value 4' text needed.",
      "tpl": ""
    },
    "171": {
      "name": "Permanent magic damage",
      "verified": true,
      "note": "Verified. add is a constant 1 flag across every carrier (same shape as 38/39/93) -- no 'value 1' text needed.",
      "tpl": ""
    },
    "235": {
      "name": "Enemy damage-taken amplification (additive/new instance)",
      "verified": true,
      "note": "same family as 236 but CREATES A NEW instance instead of overriding an existing one."
    },
    "200": {
      "name": "Range Buff (multiplicative)",
      "verified": true,
      "note": "multiplicative with skill 6 range buffs, but also highest-apply within its own type."
    },
    "262": {
      "name": "Create barrier",
      "verified": true,
      "note": "add is the barrier's total damage capacity (Olympus Fortress Palace's add=3000 matches its text 'ダメージを合計3000まで防ぐ').",
      "tpl": "{add} HP"
    },
    "148": {
      "name": "Reset target skill duration",
      "verified": true,
      "note": "Official スキル再起 and both current carrier texts say the targeted token's skill effect duration is reset. add=1 is a flag and needs no value text.",
      "tpl": ""
    },
    "257": {
      "name": "Increase ATK shared to parent unit",
      "verified": true,
      "note": "Official 親ユニットにステータス加算(攻撃力+); Shinno Akugorou's text confirms increased ATK contribution from the overlaid token to its parent/owner. add is the share change.",
      "tpl": "+{add}%"
    },
    "258": {
      "name": "Increase DEF shared to parent unit",
      "verified": true,
      "note": "Official 親ユニットにステータス加算(防御力+); Shinno Akugorou's text confirms increased DEF contribution from the overlaid token to its parent/owner. add is the share change.",
      "tpl": "+{add}%"
    },
    "263": {
      "name": "Gradual UP consumption",
      "verified": true,
      "note": "Official 徐々にコスト減少. Both current Tram carriers explicitly consume deployment cost gradually while active; インターバル=30 is the consumption tick interval.",
      "tpl": ""
    },
    "264": {
      "name": "ATK buff during gradual UP consumption",
      "verified": true,
      "note": "Official 攻撃アップ(徐々にコスト減少用). The same Tram skills carry ordinary ATK multipliers (mul3=130/210) alongside skill influence 263."
    },
    "166": {
      "name": "Permanent attack-count change",
      "verified": true,
      "note": "Official 複数回攻撃(永続). Hu Ximei's add=2 row matches her persistent 2-shot text; the zero row resets it on the alternate skill.",
      "tpl": "to {add}"
    },
    "206": {
      "name": "Cost-consumption-based MR buff",
      "verified": true,
      "note": "same mechanic as 205 (cost-consumption-based DEF buff) but for MR. Only 1 example unit observed. Additive percent (see 204's note).",
      "tpl": "+{mul3pct}"
    },
    "150": {
      "name": "Restore flight state",
      "verified": true,
      "note": "Official 飛行状態フラグ and Isabelle's current text say she becomes able to fly again."
    },
    "101": {
      "name": "Revert awakened skill",
      "verified": true,
      "note": "Official name スキル覚醒解除 and Rakshasa's current skill text say the awakened skill changes back to 鬼神の刻."
    },
    "102": {
      "name": "Restore token on enemy kill",
      "verified": true,
      "note": "Official name トークン回復 and Metus's current text identify killing an enemy as the trigger for restoring token stock. add is a constant 1 flag, so no value text is needed.",
      "tpl": ""
    },
    "109": {
      "name": "Execute command",
      "verified": false,
      "note": "Official name コマンド実行; no current carrier text is available to establish the command semantics."
    },
    "111": {
      "name": "Convert skill-duration extension to reduction",
      "verified": false,
      "note": "Conservative translation of official name スキル時間延長を短縮に変換; no current carriers."
    },
    "112": {
      "name": "Skill-duration reduction",
      "verified": false,
      "note": "Official name スキル時間短縮; no current carriers."
    },
    "113": {
      "name": "Special field",
      "verified": false,
      "note": "Official name 特殊フィールド; no current carriers."
    },
    "114": {
      "name": "Utsusemi",
      "verified": false,
      "note": "Official name 空蝉の術; no current carrier text is available to establish the exact mechanic."
    },
    "117": {
      "name": "Base block-count modifier",
      "verified": false,
      "note": "Official name 基礎ブロック数変化; no current carriers."
    },
    "119": {
      "name": "Revert base block-count change",
      "verified": false,
      "note": "Official name 基礎ブロック数変化解除; no current carriers."
    },
    "123": {
      "name": "Status-ailment mitigation",
      "verified": false,
      "note": "Official name 状態異常軽減; no current carriers."
    },
    "126": {
      "name": "Substitution effect",
      "verified": false,
      "note": "Official name 身代わり効果; no current carriers."
    },
    "127": {
      "name": "HP-increase effect",
      "verified": false,
      "note": "Official name HP上昇効果; no current carriers."
    },
    "128": {
      "name": "ATK contribution",
      "verified": false,
      "note": "Conservative translation of official name 攻撃力(寄付); no current carriers."
    },
    "129": {
      "name": "ATK contribution +",
      "verified": false,
      "note": "Conservative translation of official name 攻撃力(寄付+); no current carriers."
    },
    "130": {
      "name": "DEF contribution",
      "verified": false,
      "note": "Conservative translation of official name 防御力(寄付); no current carriers."
    },
    "131": {
      "name": "DEF contribution +",
      "verified": false,
      "note": "Conservative translation of official name 防御力(寄付+); no current carriers."
    },
    "132": {
      "name": "Doom",
      "verified": false,
      "note": "Official name 死の宣告; no current carriers."
    },
    "135": {
      "name": "Curse (ATK)",
      "verified": false,
      "note": "Official name 呪術(攻撃); no current carriers."
    },
    "136": {
      "name": "Curse (DEF)",
      "verified": false,
      "note": "Official name 呪術(防御); no current carriers."
    },
    "143": {
      "name": "Support (ATK)",
      "verified": false,
      "note": "Official name 応援(攻撃); no current carriers."
    },
    "144": {
      "name": "Support (DEF)",
      "verified": false,
      "note": "Official name 応援(防御); no current carriers."
    },
    "149": {
      "name": "Disable skill restart",
      "verified": false,
      "note": "Official name スキル再起無効; no current carriers."
    },
    "154": {
      "name": "Life Saver (base)",
      "verified": false,
      "note": "Official name ライフセーバー[基本]; no current carriers."
    },
    "157": {
      "name": "Ability-based skill-duration extension",
      "verified": false,
      "note": "Official name スキル延長[アビリティ]; no current carriers."
    },
    "158": {
      "name": "Ability-based skill-duration reduction",
      "verified": false,
      "note": "Official name スキル短縮[アビリティ]; no current carriers."
    },
    "164": {
      "name": "Ignore taunt",
      "verified": false,
      "note": "Official name アテンションを無視する; no current carriers."
    },
    "168": {
      "name": "Permanent block-count increase",
      "verified": false,
      "note": "Official name ブロック数アップ(永続); no current carriers."
    },
    "172": {
      "name": "UP penalty",
      "verified": false,
      "note": "Official name コストペナルティ; no current carriers."
    },
    "174": {
      "name": "Astrology DEF scaling",
      "verified": false,
      "note": "Official name 占星術(防御力); no current carriers."
    },
    "175": {
      "name": "Astrology MR scaling",
      "verified": false,
      "note": "Official name 占星術(魔耐); no current carriers."
    },
    "180": {
      "name": "Chef support (max HP)",
      "verified": false,
      "note": "Official name 料理支援(最大HP); no current carriers."
    },
    "181": {
      "name": "Chef support (ATK)",
      "verified": false,
      "note": "Official name 料理支援(攻撃力); no current carriers."
    },
    "182": {
      "name": "Chef support (DEF)",
      "verified": false,
      "note": "Official name 料理支援(防御力); no current carriers."
    },
    "186": {
      "name": "Curse instant-kill threshold",
      "verified": false,
      "note": "Official name 呪術(即死閾値); no current carriers."
    },
    "188": {
      "name": "Retreat-support marker",
      "verified": false,
      "hidden": true,
      "note": "Official name 離脱支援(マーカー); no current carriers and no separate player-facing effect is established."
    },
    "189": {
      "name": "Retreat support (max HP)",
      "verified": false,
      "note": "Official name 離脱支援(最大HP); no current carriers."
    },
    "190": {
      "name": "Retreat support (ATK)",
      "verified": false,
      "note": "Official name 離脱支援(攻撃力); no current carriers."
    },
    "191": {
      "name": "Retreat support (DEF)",
      "verified": false,
      "note": "Official name 離脱支援(防御力); no current carriers."
    },
    "192": {
      "name": "Retreat support (MR)",
      "verified": false,
      "note": "Official name 離脱支援(魔法耐性); no current carriers."
    },
    "194": {
      "name": "Self-destruct",
      "verified": false,
      "note": "Official name 自爆; no current carriers."
    },
    "197": {
      "name": "Tenkai effect reduction (ATK)",
      "verified": false,
      "note": "Official name 天界抑止力軽減[攻撃]; no current carriers."
    },
    "198": {
      "name": "Tenkai effect reduction (DEF)",
      "verified": false,
      "note": "Official name 天界抑止力軽減[防御]; no current carriers."
    },
    "199": {
      "name": "Tenkai effect reduction (MR)",
      "verified": false,
      "note": "Official name 天界抑止力軽減[魔耐]; no current carriers."
    },
    "201": {
      "name": "Charge: ATK",
      "verified": false,
      "note": "Official name チャージ：攻撃; no current carriers."
    },
    "202": {
      "name": "Attack command",
      "verified": false,
      "note": "Official name 攻撃指示; no current carriers."
    },
    "207": {
      "name": "Curse (MR)",
      "verified": false,
      "note": "Official name 呪術(魔耐); no current carriers."
    },
    "208": {
      "name": "Inspiration (ATK)",
      "verified": false,
      "note": "Official name 鼓舞(攻撃); no current carriers."
    },
    "209": {
      "name": "Inspiration (DEF)",
      "verified": false,
      "note": "Official name 鼓舞(防御); no current carriers."
    },
    "210": {
      "name": "Inspiration (MR)",
      "verified": false,
      "note": "Official name 鼓舞(魔耐); no current carriers."
    },
    "211": {
      "name": "Encouragement (ATK)",
      "verified": false,
      "note": "Official name 激励(攻撃); no current carriers."
    },
    "212": {
      "name": "Encouragement (DEF)",
      "verified": false,
      "note": "Official name 激励(防御); no current carriers."
    },
    "213": {
      "name": "Encouragement (MR)",
      "verified": false,
      "note": "Official name 激励(魔耐); no current carriers."
    },
    "218": {
      "name": "Enemy physical-ATK debuff",
      "verified": false,
      "note": "Official name 敵の物理攻撃力を低下; no current carriers."
    },
    "219": {
      "name": "Enemy magic-ATK debuff",
      "verified": false,
      "note": "Official name 敵の魔法攻撃力を低下; no current carriers."
    },
    "220": {
      "name": "Enemy true-ATK debuff",
      "verified": false,
      "note": "Official name 敵の貫通攻撃力を低下; no current carriers."
    },
    "221": {
      "name": "Preserve forced-retreat delay",
      "verified": false,
      "note": "Official name 強制撤退遅延時間保持; no current carriers."
    },
    "222": {
      "name": "Preserve forced-retreat UP refund",
      "verified": false,
      "note": "Official name 強制撤退還元コスト保持; no current carriers."
    },
    "223": {
      "name": "Goddess's blessing (ATK)",
      "verified": false,
      "note": "Official name 女神の加護[攻撃]; no current carriers."
    },
    "224": {
      "name": "Goddess's blessing (DEF)",
      "verified": false,
      "note": "Official name 女神の加護[防御]; no current carriers."
    },
    "225": {
      "name": "Goddess's blessing (MR)",
      "verified": false,
      "note": "Official name 女神の加護[魔耐]; no current carriers."
    },
    "230": {
      "name": "Gimmick MR buff",
      "verified": false,
      "note": "Official name 魔法耐性アップ(ギミック); no current carriers."
    },
    "231": {
      "name": "Skill cooldown reduction on enemy kill",
      "verified": false,
      "note": "Official name 敵撃破でスキル待ち時間短縮; no current carriers."
    },
    "232": {
      "name": "Skill-duration extension on enemy kill",
      "verified": false,
      "note": "Official name 敵撃破でスキル使用時間延長; no current carriers."
    },
    "237": {
      "name": "In-range status-ailment mitigation",
      "verified": false,
      "note": "Official name 状態異常軽減(射程内); no current carriers."
    },
    "238": {
      "name": "Enemy attack-delay increase",
      "verified": false,
      "note": "Official name 敵攻撃待ち時間増加; no current carriers."
    },
    "239": {
      "name": "Bard support (max HP)",
      "verified": false,
      "note": "Official name 歌支援(最大HP); no current carriers."
    },
    "240": {
      "name": "Bard support (ATK)",
      "verified": false,
      "note": "Official name 歌支援(攻撃力); no current carriers."
    },
    "241": {
      "name": "Bard support (DEF)",
      "verified": false,
      "note": "Official name 歌支援(防御力); no current carriers."
    },
    "242": {
      "name": "Bard support (MR)",
      "verified": false,
      "note": "Official name 歌支援(魔法耐性); no current carriers."
    },
    "243": {
      "name": "Bard support multiplier (max HP)",
      "verified": false,
      "note": "Official name 歌支援(最大HP+); no current carriers."
    },
    "244": {
      "name": "Bard support multiplier (ATK)",
      "verified": false,
      "note": "Official name 歌支援(攻撃力+); no current carriers."
    },
    "245": {
      "name": "Bard support multiplier (DEF)",
      "verified": false,
      "note": "Official name 歌支援(防御力+); no current carriers."
    },
    "246": {
      "name": "Bard support multiplier (MR)",
      "verified": false,
      "note": "Official name 歌支援(魔法耐性+); no current carriers."
    },
    "256": {
      "name": "Add max HP to parent unit",
      "verified": false,
      "note": "Official name 親ユニットにステータス加算(最大HP+); no current carriers."
    },
    "259": {
      "name": "Add MR to parent unit",
      "verified": false,
      "note": "Official name 親ユニットにステータス加算(魔法耐性+); no current carriers."
    },
    "260": {
      "name": "Distribute own damage",
      "verified": false,
      "note": "Official name 自身のダメージを分散; no current carriers."
    },
    "261": {
      "name": "Swap ATK and DEF",
      "verified": false,
      "note": "Official name 攻防力入れ替え; no current carriers."
    },
    "265": {
      "name": "DEF buff during gradual UP consumption",
      "verified": false,
      "note": "Official name 防御アップ(徐々にコスト減少用); no current carriers."
    },
    "266": {
      "name": "MR buff during gradual UP consumption",
      "verified": false,
      "note": "Official name 魔法耐性アップ(徐々にコスト減少用); no current carriers."
    },
    "269": {
      "name": "Weather-interference ATK buff (allies in range)",
      "verified": false,
      "note": "Official name 天候干渉(攻撃)(射程内味方); no current carriers."
    },
    "270": {
      "name": "Weather-interference range buff (allies in range)",
      "verified": false,
      "note": "Official name 天候干渉(射程)(射程内味方); no current carriers."
    },
    "271": {
      "name": "Overheal",
      "verified": false,
      "note": "Official name オーバーヒール; no current carriers."
    },
    "272": {
      "name": "Overheal +",
      "verified": false,
      "note": "Official name オーバーヒール+; no current carriers."
    },
    "273": {
      "name": "ATK buff for overhealed targets",
      "verified": false,
      "note": "Official name 攻撃アップ(オーバーヒール対象のみ); no current carriers."
    },
    "274": {
      "name": "DEF buff for overhealed targets",
      "verified": false,
      "note": "Official name 防御アップ(オーバーヒール対象のみ); no current carriers."
    },
    "275": {
      "name": "MR buff for overhealed targets",
      "verified": false,
      "note": "Official name 魔法耐性アップ(オーバーヒール対象のみ); no current carriers."
    }
  },
  "ability": {
    "1": {
      "name": "ATK on-hit mod",
      "verified": true,
      "note": "user-tested: param 1 is value, param 2 is chance to activate",
      "tpl": "{p1}% ({p2}% chance)"
    },
    "2": {
      "name": "ATK dragon mod",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "3": {
      "name": "ATK yokai mod",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "4": {
      "name": "ATK undead mod",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "5": {
      "name": "ATK demon mod",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "6": {
      "name": "ATK armored mod",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "8": {
      "name": "Critical hit",
      "verified": true,
      "note": "p1 is chance, p2 is the critical damage multiplier (190 = x1.9), p3 is extra chance during skill",
      "tpl": "{p1}% chance, {p2x} damage[[?p3:, +{p3}% chance during skill]]"
    },
    "9": {
      "name": "Critical heal",
      "verified": true,
      "note": "same shape as 8 but for healing: p1 is chance, p2 is the critical heal multiplier, p3 is extra chance during skill",
      "tpl": "{p1}% chance, {p2x} healing[[?p3:, +{p3}% chance during skill]]"
    },
    "10": {
      "name": "Cost reduction",
      "verified": true,
      "note": "p1 is a flat number to reduce by, not a percent-of-normal (unlike 12/13/14). Confirmed via Fedora's awakened ability 出撃コスト減少 (Deployment Cost Reduction), p1=2, matching the wiki's listed ability at her Saint (awakened) stage; her default (CC0/Healer) ability is null, matching the wiki's 'N/A'.",
      "tpl": "-{p1}"
    },
    "11": {
      "name": "Enemy HP and ATK mod",
      "verified": true,
      "note": "user-tested: p1 is percent increase to",
      "tpl": "→ {p1}%"
    },
    "12": {
      "name": "HP mod",
      "verified": true,
      "note": "invoke=inherent, target=self: p1 is percent OF NORMAL (p1=80 means -20% HP, shown in the stat box); a MISSING p1 on this invoke/target shape is still p1=0 (export compaction drops all-zero params), a real \"set to 0x\" effect, not \"no modification\". Every OTHER invoke (1st barrack, sortie, deployed, ...) is a buff row instead, where the SAME p1 slot is an additive buff percent for other units (p1=7 means +7%, not -93%). Rendered in AbilityInfluenceRow to pick the right reading by invoke.",
      "tpl": "→ {p1}%"
    },
    "13": {
      "name": "ATK mod",
      "verified": true,
      "note": "invoke=inherent, target=self: p1 is percent OF NORMAL (p1=110 means +10% ATK, shown in the stat box); a MISSING p1 on this invoke/target shape is still p1=0 (export compaction drops all-zero params), a real \"set to 0x\" effect, not \"no modification\". Every OTHER invoke (1st barrack, sortie, deployed, ...) is a buff row instead, where the SAME p1 slot is an additive buff percent for other units. Rendered in AbilityInfluenceRow to pick the right reading by invoke.",
      "tpl": "→ {p1}%"
    },
    "14": {
      "name": "DEF mod",
      "verified": true,
      "note": "same shape as ATK/HP mod: invoke=inherent/self reads p1 as percent OF NORMAL (Suiren (Bride)'s p1=150 means +50% DEF); a MISSING p1 on this invoke/target shape is still p1=0 (export compaction drops all-zero params), a real \"set to 0x\" effect confirmed on Leona (Bedwear) and Chiyome (Steamy Kunoichi)'s DEF mod rows. Every OTHER invoke (1st barrack, sortie, deployed, ...) reads the same p1 as an additive buff percent instead. Rendered in AbilityInfluenceRow to pick the right reading by invoke.",
      "tpl": "→ {p1}%"
    },
    "15": {
      "name": "MR mod",
      "verified": true,
      "note": "p1 is a flat increase (unlike ATK/DEF/HP mod, this one is not percent-of-normal). p2 is the 1st barrack buff value.",
      "tpl": "+{p1} flat[[?p2:, 1st barrack: +{p2} flat]]"
    },
    "16": {
      "name": "Skill duration mod",
      "verified": true,
      "note": "user-tested: p1 is percent to increase to",
      "tpl": "→ {p1}%"
    },
    "17": {
      "name": "Heal HP",
      "verified": true,
      "note": "user-tested: param less -> based on atk\np1 is percent\np2 is flat",
      "tpl": "[[?p1:{p1}%]][[?p2: +{p2} flat]]"
    },
    "18": {
      "name": "Eliminate cooldown",
      "verified": true,
      "note": "chance to attack again without delay. p1 is the percent chance.",
      "tpl": "{p1}% chance"
    },
    "19": {
      "name": "Nullify attack",
      "verified": true,
      "note": "user-tested: p1 is percent to null",
      "tpl": "{p1}%"
    },
    "20": {
      "name": "Physical Evasion",
      "verified": true,
      "note": "user-tested: value is percent chance",
      "tpl": "{p1}% chance"
    },
    "21": {
      "name": "Range",
      "verified": true,
      "note": "p1 is the base flat range, p2 is a 1st-barrack flat bonus; either can be present alone. Rendered in AbilityInfluenceRow to avoid showing a spurious +0 flat when p1 is unset.",
      "tpl": "+{p1} flat[[?p2:, 1st barrack: +{p2} flat]]"
    },
    "22": {
      "name": "True damage",
      "verified": true,
      "note": "user-tested: p1 is chance\nparamless is just 0% chance, to be modified with skill influence 81",
      "tpl": "{p1}% chance"
    },
    "23": {
      "name": "Assassinate",
      "verified": true,
      "note": "user-tested: p1 is assassination chance",
      "tpl": "{p1}% chance"
    },
    "24": {
      "name": "Gold GET!",
      "verified": true,
      "note": "user-tested: p1 is percent",
      "tpl": "{p1}%"
    },
    "25": {
      "name": "Priority change",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "26": {
      "name": "Multi-hit",
      "verified": true,
      "note": "p1 is chance, p2 is number of hits, p3 is delay between hits",
      "tpl": "{p1}% chance to hit {p2} times, {p3f} apart"
    },
    "27": {
      "name": "Weather cost reduction",
      "verified": true,
      "note": "p2 is the cost reduction value; a row without p2 should be ignored.",
      "tpl": "-{p2}"
    },
    "28": {
      "name": "Weather ATK Modifier",
      "verified": true,
      "note": "p1 is a constant flag (always 1), not a weather-type index. p2=100 is plain resist (immune to the ATK cut from bad weather); p2>100 is a real ATK buff during bad weather; p2<100 is a real (lesser) reduction still applying. Rendered in AbilityInfluenceRow to word all three cases correctly."
    },
    "29": {
      "name": "Weather Range Modifier",
      "verified": true,
      "note": "p1 is a constant flag (always 1). p2=100 is plain resist (immune to the range cut from bad weather); p2>100 is a real range buff during bad weather; p2<100 would be a real (lesser) reduction still applying (no real carrier seen yet, same shape as ability 28). Rendered in AbilityInfluenceRow to word all three cases correctly."
    },
    "30": {
      "name": "Regenerate HP",
      "verified": true,
      "note": "user-tested: param 1 is value, param 2 is frame to generate value, calc per sec in display",
      "tpl": "{p1} / {p2f}"
    },
    "31": {
      "name": "Regeneration restriction",
      "verified": false,
      "note": "user-tested: need to check each type, not enough data\nnote for later",
      "marker": true
    },
    "32": {
      "name": "Regeneration mod",
      "verified": true,
      "note": "p3 is the percent to increase self-regeneration to, active only during the skill (p1=2 marks that condition). Affects the unit's own regen only, not allies.",
      "tpl": "→ {p3}% (during skill)"
    },
    "33": {
      "name": "Starting UP",
      "verified": true,
      "note": "user-tested: p1 is extra starting UP",
      "tpl": "+{p1} UP"
    },
    "34": {
      "name": "Prevent status ailment",
      "verified": true,
      "note": "p1=100 means Status Immunity; any other value means Status Effect Reduction by that percent. Rendered in AbilityInfluenceRow since it's two different sentences, not a number substitution."
    },
    "35": {
      "name": "Assassinate mod",
      "verified": true,
      "note": "p1 is a multiplier of the base assassinate chance (200 = x2).",
      "tpl": "{p1x}"
    },
    "36": {
      "name": "On Hit HP Drain",
      "verified": true,
      "note": "heals a percent of max HP on hit, not based on damage dealt. p1 is the percent.",
      "tpl": "{p1}%"
    },
    "37": {
      "name": "Received damage heals allies",
      "verified": true,
      "note": "heals all allies, including self, for p1 percent of damage received (e.g. 1000 damage received, p1=30, heals 300).",
      "tpl": "{p1}%"
    },
    "38": {
      "name": "Execute",
      "verified": true,
      "note": "execute effect, same shape as skill 153 but for self.",
      "tpl": "below {p1}% HP"
    },
    "39": {
      "name": "Nullify attack restriction",
      "verified": true,
      "note": "p1 is an enum; 3 means 'while not using skill'. Other values are unconfirmed and shown as a raw number. Rendered in AbilityInfluenceRow."
    },
    "40": {
      "name": "Reduce terrain effects",
      "verified": true,
      "note": "user-tested: p1 is percent",
      "tpl": "{p1}%"
    },
    "43": {
      "name": "Skill attack change",
      "verified": false,
      "note": "user-tested: not sure, it's skill related like wiki maintiner said, check p3 and various id to see what match",
      "marker": true
    },
    "44": {
      "name": "Mutex (ATK/DEF/Cost)",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "45": {
      "name": "Skill cooldown timer reduction",
      "verified": true,
      "note": "user-tested: p1 is value to reduce by",
      "tpl": "-{p1}%"
    },
    "46": {
      "name": "ATK flying mod",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "47": {
      "name": "Recover UP upon withdrawal",
      "verified": true,
      "note": "p1 is the percent of original UP recovered. A paramless row means 0.",
      "tpl": "{p1}%"
    },
    "48": {
      "name": "Additional assassinate chance",
      "verified": true,
      "note": "flat percentage-point addition to the assassinate chance.",
      "tpl": "+{p1}%"
    },
    "49": {
      "name": "Low HP DEF bonus",
      "verified": true,
      "note": "user-tested: p1 is HP percent threshold\np2 is percent increase by",
      "tpl": "below {p1}% HP: +{p2}%"
    },
    "50": {
      "name": "Nearby status ailment recovery rate",
      "verified": true,
      "note": "p1 is a multiplier of the base recovery rate (200 = x2).",
      "tpl": "{p1x}"
    },
    "51": {
      "name": "Tokenize",
      "verified": true,
      "note": "p1 is a flag, not a meaningful value -- no tpl needed.",
      "tpl": ""
    },
    "52": {
      "name": "Mutex (HP)",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "53": {
      "name": "Mutex (skill duration)",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "55": {
      "name": "Token count mod",
      "verified": true,
      "note": "user-tested: additional token count p1",
      "tpl": "+{p1}"
    },
    "56": {
      "name": "Area attack",
      "verified": true,
      "note": "user-tested: Attack all ground enemy \np1 is chance\np3 is AoE (affected by range buff / chance)\np2???\nif p1 = 100, then set p3 to range in stat box",
      "tpl": "{p1}% chance[[?p3:, AoE {p3}]]"
    },
    "57": {
      "name": "Drop boost (affection gift)",
      "verified": true,
      "note": "p1 is percent, same shape as ability 80.",
      "tpl": "{p1}%"
    },
    "58": {
      "name": "Drop boost (trust gift)",
      "verified": true,
      "note": "p1 is percent, same shape as ability 80.",
      "tpl": "{p1}%"
    },
    "59": {
      "name": "Drop boost (demon crystal)",
      "verified": true,
      "note": "p1 is percent, same shape as ability 80.",
      "tpl": "{p1}%"
    },
    "60": {
      "name": "Drop boost (armor)",
      "verified": true,
      "note": "p1 is percent, same shape as ability 80.",
      "tpl": "{p1}%"
    },
    "61": {
      "name": "Drop boost (spirit)",
      "verified": true,
      "note": "p1 is percent, same shape as ability 80.",
      "tpl": "{p1}%"
    },
    "62": {
      "name": "Skill initial timer mod",
      "verified": true,
      "note": "user-tested: p1 is value to reduce to\nparamless is reduce to 0",
      "tpl": "[[?p1|→ {p1}%|→ 0%]]"
    },
    "64": {
      "name": "(Deprecated?) Enemy type filter",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "65": {
      "name": "Can't be healed",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "66": {
      "name": "Reincarnate",
      "verified": true,
      "note": "p2 is the frames needed to revive. p1 is unknown; investigate non-100 values.",
      "tpl": "revive after {p2f}"
    },
    "67": {
      "name": "Reincarnate (regeneration)",
      "verified": true,
      "note": "user-tested: p1 is hp to regen, p2 is frame to regen value",
      "tpl": "{p1} HP / {p2f}"
    },
    "69": {
      "name": "Cost increase",
      "verified": true,
      "note": "user-tested: p1 is increase by",
      "tpl": "+{p1}"
    },
    "70": {
      "name": "Sortie/Deployment ATK Buff",
      "verified": true,
      "note": "sortie/deployment buff, stacks additively with others in the same invoke; p1 = percent.",
      "tpl": "{p1}%"
    },
    "71": {
      "name": "Sortie/Deployment DEF Buff",
      "verified": true,
      "note": "DEF mirror of 70 (ability namespace); p1 = percent.",
      "tpl": "{p1}%"
    },
    "72": {
      "name": "Command",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "76": {
      "name": "MR mod (new)",
      "verified": true,
      "note": "sortie/deployment family like abilities 70/71/82, but the value field itself also switches by invoke: p1 on sortie rows, p2 on deployed rows. Marked for later use on the MR buff page.",
      "tpl": "+{p2} flat"
    },
    "78": {
      "name": "Gold boost",
      "verified": true,
      "note": "p1 is the percent increase.",
      "tpl": "+{p1}%"
    },
    "79": {
      "name": "Drop boost (silver)",
      "verified": true,
      "note": "p1 is percent, same shape as ability 80.",
      "tpl": "{p1}%"
    },
    "80": {
      "name": "Drop boost (non-unit)",
      "verified": true,
      "note": "user-tested: p1 is percent",
      "tpl": "{p1}%"
    },
    "81": {
      "name": "Cost Reduction",
      "verified": true,
      "note": "p1 is the flat value.",
      "tpl": "-{p1} flat"
    },
    "82": {
      "name": "Sortie HP Buff",
      "verified": true,
      "note": "sortie HP buff, stacks additively with each other; p1 = percent.",
      "tpl": "{p1}%"
    },
    "83": {
      "name": "Conditional ATK Buff (invisible)",
      "verified": true,
      "note": "conditional ATK buff, not shown in the in-battle stat display. p1 is percent of normal, same shape as 84.",
      "tpl": "→ {p1}%"
    },
    "86": {
      "name": "Substitute own death for ally death",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "87": {
      "name": "Ally HP Buff",
      "verified": true,
      "note": "HP buff (often granted via a skill's linked ability); stacks additively with each other, multiplicatively with sortie buffs; p1 = percent.",
      "tpl": "+{p1}%"
    },
    "88": {
      "name": "Gold GET! bonus",
      "verified": true,
      "note": "additional percent from a Gold GET! proc.",
      "tpl": "+{p1}%"
    },
    "90": {
      "name": "Reduce enemy DEF on hit",
      "verified": true,
      "note": "user-tested: p1 is percent reduction, p2 is duration by frame",
      "tpl": "-{p1}% for {p2f}"
    },
    "91": {
      "name": "Reduce PAD",
      "verified": true,
      "note": "PAD = post-attack delay. p1 is the percent to reduce by.",
      "tpl": "-{p1}%"
    },
    "92": {
      "name": "Ranged target count",
      "verified": true,
      "note": "p1 is chance, p2 is target count",
      "tpl": "{p1}% chance to hit {p2} targets"
    },
    "97": {
      "name": "Doesn't count against deployment limit",
      "verified": true,
      "note": "p1 is how many deployments of this unit are exempt from the limit.",
      "tpl": "first {p1} deployed"
    },
    "98": {
      "name": "Degenerate HP",
      "verified": true,
      "note": "user-tested: p1 is flat value\np2 is frame per tick\np3 is percent value",
      "tpl": "[[?p1|{p1} flat / {p2f}|{p3}% / {p2f}]]"
    },
    "106": {
      "name": "Conditional Cost Reduction",
      "verified": true,
      "note": "p1 is the percent set value, p2 is a flat reduction.",
      "tpl": "→ {p1}%[[?p2:, -{p2} flat]]"
    },
    "108": {
      "name": "Nekomata ATK debuff",
      "verified": true,
      "note": "p1 = percent to reduce enemy, p2 = percent to reduce ally. skill 137 multiplies it; ability 319 grows it per condition (cap in its extend).",
      "tpl": "-{p1}% (enemy)[[?p2:, -{p2}% (ally)]]"
    },
    "109": {
      "name": "Nekomata DEF penalty",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test). Single param, percent.",
      "tpl": "-{p1}%"
    },
    "110": {
      "name": "ATK mod per unit",
      "verified": true,
      "note": "p1 is the percent gained per matching unit, p2 is the cap.",
      "tpl": "+{p1}% per unit, cap {p2}%"
    },
    "111": {
      "name": "DEF mod per unit",
      "verified": true,
      "note": "p1 is the percent gained per matching unit, p2 is the cap.",
      "tpl": "+{p1}% per unit, cap {p2}%"
    },
    "112": {
      "name": "Makai adaptation (ATK)",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "113": {
      "name": "Makai adaptation (DEF)",
      "verified": true,
      "note": "wiki-maintainer-sourced (community-compiled, not our own in-game test)."
    },
    "115": {
      "name": "Dancer attack bonus",
      "verified": true,
      "note": "user-tested: p1 is the percent to share\naffected by skill influence 146, where mul3 is multiplier, add is flat addition to p1",
      "tpl": "grants {p1}%"
    },
    "116": {
      "name": "Dancer defense bonus",
      "verified": true,
      "note": "user-tested: p1 is percent to grant, affected by skill influence 146, similar to dance atk buff",
      "tpl": "grants {p1}%"
    },
    "119": {
      "name": "Reduce enemy HP",
      "verified": true,
      "note": "user-tested: p1 is percent to reduce by",
      "tpl": "-{p1}%"
    },
    "120": {
      "name": "Reduce enemy ATK",
      "verified": true,
      "note": "user-tested: param 1 is percent value",
      "tpl": "-{p1}%"
    },
    "85": {
      "name": "Self Damage Reduction",
      "verified": true,
      "note": "user-tested: Self Damage Reduction, p1 is value to reduce to\ninvestigate non 100 p2",
      "tpl": "→ {p1}%"
    },
    "148": {
      "name": "One Unit per team",
      "verified": true,
      "note": "user-tested: One Unit per team"
    },
    "159": {
      "name": "Marker for perma stat gain",
      "verified": true,
      "note": "user-tested: Marker for perma stat gain (160, 161, 162, etc)"
    },
    "121": {
      "name": "Reduce enemy DEF",
      "verified": true,
      "note": "reduces enemy DEF. p1 is percent.",
      "tpl": "-{p1}%"
    },
    "122": {
      "name": "Reduce enemy MR",
      "verified": true,
      "note": "p1 is a percent reduction, p2 is a flat reduction; either can be present alone. Rendered in AbilityInfluenceRow to avoid showing a spurious -0% when p1 is unset.",
      "tpl": "-{p1}%[[?p2:, -{p2} flat]]"
    },
    "176": {
      "name": "Deep Sea Effect Reduction",
      "verified": true,
      "note": "user-tested: Deep Sea Effect Reduction, p1 is value to reduce by",
      "tpl": "-{p1}%"
    },
    "184": {
      "name": "Tenkai Immunity",
      "verified": true,
      "note": "user-tested: Tenkai Immunity (similar to Makai, 184 185 186 order is probably similar to Makai order)"
    },
    "161": {
      "name": "Perma ATK gain on condition",
      "verified": true,
      "note": "same either/or shape as 160 (see its note): p1 percent or p2 flat, whichever the carrier uses."
    },
    "204": {
      "name": "Placement buff",
      "verified": true,
      "note": "user-tested: Placement buff\nhas extra param for type, percent value, flat value, duration, range etc"
    },
    "220": {
      "name": "Healing received increase",
      "verified": true,
      "note": "Same effect category as skill influence 233; they do not stack with each other. p1 is the resulting percent.",
      "tpl": "→ {p1}%"
    },
    "125": {
      "name": "Stealth",
      "verified": true,
      "note": "user-tested: Stealth"
    },
    "118": {
      "name": "Self skill CD reduction",
      "verified": true,
      "note": "user-tested: self skill cd reduction, p1 is value to reduce by",
      "tpl": "-{p1}%"
    },
    "180": {
      "name": "Movement attack",
      "verified": true,
      "note": "user-tested: movement attack, check missile ID and atk mod in extra params"
    },
    "193": {
      "name": "Nekomata-like MR debuff",
      "verified": true,
      "note": "user-tested: Nekomata-like mr debuff\np1 for enemy\np2 for ally\ncheck other nekomata debuff",
      "tpl": "-{p1}% (enemy)[[?p2:, -{p2}% (ally)]]"
    },
    "89": {
      "name": "On-hit ATK debuff",
      "verified": true,
      "note": "user-tested: on hit atk debuff\np1 is value to reduce by\np2 is duration in frames\ncheck def equivalent",
      "tpl": "-{p1}% for {p2f}"
    },
    "73": {
      "name": "Makai Effect Reduction",
      "verified": true,
      "note": "user-tested: 73 74 75 is Makai Effect Reduction, p1 is value to reduce by, order is atk / def / mr?\nno way to test since they are all together",
      "tpl": "-{p1}%"
    },
    "191": {
      "name": "Gradual Attack Increase",
      "verified": true,
      "note": "gradual ATK increase over time; default direction is while NOT attacking, but extend key 増減反転=1 inverts it to increase after each attack instead -- the direction is folded into the displayed name via abilityLabelName, not shown as a buried extend annotation. Details (interval, value increase, cap, decay on attack) are in extra params, all in percent of ATK."
    },
    "173": {
      "name": "Magic attack conversion",
      "verified": true,
      "note": "similar to ability 128, applies to the stat box's attack attribute when self/inherent."
    },
    "107": {
      "name": "Weather Effect Resist",
      "verified": true,
      "note": "Verified (supersedes the earlier 'unknown, give me more value' note)."
    },
    "282": {
      "name": "Chance to attack again",
      "verified": true,
      "note": "user-tested: chance to attack again\np1 is percent, investigate p2",
      "tpl": "{p1}% chance"
    },
    "223": {
      "name": "War God Blessing ATK Buff",
      "verified": true,
      "note": "p1 is the percent buff. Almost all carriers are the ダミー(戦) test unit (gated behind a battle_god_bless possession item), but Himiko (units/1950, 2640 chibi) is a real playable-unit carrier.",
      "tpl": "+{p1}%"
    },
    "213": {
      "name": "Lower targeting priority",
      "verified": true,
      "note": "user-tested: Lower targeting priority"
    },
    "197": {
      "name": "Conqueror type ATK buff",
      "verified": true,
      "note": "user-tested: Conqueror type atk buff, p1 is percent to increase to\n",
      "tpl": "→ {p1}%"
    },
    "160": {
      "name": "Perma HP gain on condition",
      "verified": true,
      "note": "160 is HP (161 is ATK, 162 is DEF, 163 is MR). Real carriers use EITHER p1 (percent, with a mulLim extend cap) OR p2 (flat, with an addLim extend cap) -- rendered in AbilityInfluenceRow to show whichever is set."
    },
    "190": {
      "name": "Default multi-hit attack",
      "verified": true,
      "note": "p2 is the number of hits, p3 is delay between hits. p1 is 100 across every carrier observed so far.",
      "tpl": "hits {p2} times, {p3f} apart"
    },
    "224": {
      "name": "War God Blessing DEF Buff",
      "verified": true,
      "note": "DEF mirror of 223. Same ダミー(戦) test-unit carriers, plus Himiko as the real playable-unit carrier.",
      "tpl": "+{p1}%"
    },
    "261": {
      "name": "Counterattack",
      "verified": true,
      "note": "p1 is the counter damage percent; school and hit effect are in extras.",
      "tpl": "{p1}%"
    },
    "84": {
      "name": "Conditional DEF Buff (invisible)",
      "verified": true,
      "note": "DEF mirror of 83.",
      "tpl": "→ {p1}%"
    },
    "181": {
      "name": "Tenkai effect reduction",
      "verified": true,
      "note": "user-tested: tenkai effect reduction, similar to makai, can't test which is which\n182 183 as well",
      "tpl": "-{p1}%"
    },
    "205": {
      "name": "Enemy ATK/DEF/MR debuff over time",
      "verified": true,
      "note": "user-tested: scholar debuff, type is in extra\np1 is initial value\np2 is gain per tick\np3 is inteval by frames\np4 is cap",
      "tpl": "{p1} initial, +{p2} / {p3f}, cap {p4}"
    },
    "211": {
      "name": "Conditional skill CD reduction",
      "verified": true,
      "note": "user-tested: conditional skill cd reduction\np1 is reduce amount by frame\nextra include cap and condition for trigger, cap is actual flat frame count and not percent",
      "tpl": "-{p1f}"
    },
    "283": {
      "name": "Ranged attack evasion",
      "verified": true,
      "note": "p1 is the evasion chance.",
      "tpl": "{p1}% chance"
    },
    "162": {
      "name": "Perma DEF gain on condition",
      "verified": true,
      "note": "same either/or shape as 160 (see its note): p1 percent or p2 flat, whichever the carrier uses."
    },
    "284": {
      "name": "HP increase when dodge",
      "verified": true,
      "note": "user-tested: HP increase when dodge\np1 is percent\np3 is cap",
      "tpl": "+{p1}%[[?p3:, cap {p3}]]"
    },
    "177": {
      "name": "Deep Sea ATK mod",
      "verified": true,
      "note": "p1 is percent of normal.",
      "tpl": "→ {p1}%"
    },
    "77": {
      "name": "HP regen (allies)",
      "verified": false,
      "note": "user-tested: HP regen, p1 is value, p2 is frame per tick\nfor allies, maybe as opposed to #30 for self\nneed to check",
      "tpl": "{p1} HP / {p2f}"
    },
    "234": {
      "name": "War God Blessing HP Buff",
      "verified": true,
      "note": "HP mirror of 224 (percent buff, p1).",
      "tpl": "+{p1}%"
    },
    "138": {
      "name": "Prohibit unit combination",
      "verified": true,
      "note": "user-tested: Prohibit unit combination"
    },
    "150": {
      "name": "Chef Type flat HP buff",
      "verified": true,
      "note": "flat HP buff for Chef-type units; params don't matter, the value is in extras. Similar to 151 (ATK) and 152 (DEF)."
    },
    "188": {
      "name": "Gain ranged attack",
      "verified": true,
      "note": "p1 is range, p2 is a Missile.atb id resolved against the published missiles table. Rendered in AbilityInfluenceRow."
    },
    "210": {
      "name": "Change attack attribute",
      "verified": true,
      "note": "alternates attack attribute between hits; can also be used to fire a special missile instead. Info is in extras."
    },
    "203": {
      "name": "No initial and cooldown between skills",
      "verified": true,
      "note": "user-tested: No initial and cooldown between skills"
    },
    "102": {
      "name": "Cannot be sold",
      "verified": true,
      "note": "user-tested: Cannot be sold"
    },
    "170": {
      "name": "Gradual UP increase when on skill",
      "verified": true,
      "note": "user-tested: Gradual UP increase when on skill, p1 is frame between, p2 is value",
      "tpl": "+{p2} UP / {p1f}"
    },
    "222": {
      "name": "Attack independent of body",
      "verified": true,
      "note": "p1 is frame between attacks, p2 is number of targets, p3 is a Missile.atb id (already resolved separately via the row's missiles field, not repeated here), p4 is percent of ATK to use.",
      "tpl": "every {p1f}, {p2} targets, {p4}% ATK"
    },
    "129": {
      "name": "Zhenren Damage Redirect",
      "verified": true,
      "note": "p1 is the percent of damage redirected.",
      "tpl": "{p1}%"
    },
    "200": {
      "name": "Grant Barrier",
      "verified": true,
      "note": "user-tested: Grant Barrier, p2 is value",
      "tpl": "{p2} flat"
    },
    "201": {
      "name": "Withdraw on skill end",
      "verified": false,
      "note": "user-tested: need more exmaples\nlikely withdraw on skill end, with redeploy time in extra"
    },
    "123": {
      "name": null,
      "verified": false,
      "marker": true,
      "note": "user-tested: some sort of NPC ability, need for examples\n"
    },
    "127": {
      "name": "Block Count",
      "verified": true,
      "note": "affects the stat box's block count when invoke=inherent, target=self. p1 is the count.",
      "tpl": "{p1}"
    },
    "189": {
      "name": "Grant ability",
      "verified": true,
      "note": "p1 is an AbilityConfig._ConfigID, resolved client-side against the published ability_configs.json table (no backend embedding)."
    },
    "240": {
      "name": "Set PAD",
      "verified": true,
      "note": "sets PAD (post-attack delay) to p1, in frames.",
      "tpl": "to {p1f}"
    },
    "101": {
      "name": null,
      "verified": false,
      "marker": true,
      "note": "user-tested: Sythesis fodder?"
    },
    "124": {
      "name": "Allied ranged Attack prioritize blocked enemy",
      "verified": true,
      "note": "similar to ability 192 (Allied ranged attack priority enemy); supersedes the earlier 'none of your examples work' note."
    },
    "275": {
      "name": "Medic buff",
      "verified": true,
      "note": "user-tested: Medic buff\nExtra include buff value, buff cap, target priority, and duration of buff\ncheck if any doesn't actuall have buff and just for target\n"
    },
    "258": {
      "name": "Gunner multihit",
      "verified": true,
      "note": "user-tested: Gunner multihit, p1 is number of hit, p2 is fixed attack speed, p3 is fixed delay?\nneed more info, but the point is that they attack multiple time in a single animation",
      "tpl": "{p1} hits[[?p2:, atk speed {p2}]][[?p3:, delay {p3}]]"
    },
    "128": {
      "name": "Magic Attack",
      "verified": true,
      "note": "user-tested: Magic Attack, check self / inherent to add to stat box"
    },
    "153": {
      "name": "Execute low HP enemy",
      "verified": true,
      "note": "user-tested: Execute low HP enemy, p1 is the percent HP, affected by skill influence 187 mul3",
      "tpl": "below {p1}% HP"
    },
    "294": {
      "name": "HP lost based ATK buff",
      "verified": true,
      "note": "user-tested: HP lost based ATK buff; p1 percent per p2 HP lost, p3 = HP lost cap; p4 = target (0 self, 1 in range, 2 global).",
      "tpl": "+{p1}% per {p2} HP lost, cap {p3}"
    },
    "298": {
      "name": "Auto deploy token",
      "verified": true,
      "note": "user-tested: Auto deploy token\np1 is frame between each tick\np2 is token ID\np3 p4 is ???\nmaybe p4 = 1 is in range like 294",
      "tpl": "token {p2} every {p1f}"
    },
    "262": {
      "name": "Gradual UP increase",
      "verified": true,
      "note": "user-tested: Gradual UP increase, p2 is frame between, p1 is value",
      "tpl": "+{p1} UP / {p2f}"
    },
    "305": {
      "name": "Bard ATK buff",
      "verified": true,
      "note": "bard ATK buff; exclude self-only rows on the buff page; cap = extend MulMax, raised by the bard's skill (type 249): e.g. cap +2% per target, max final cap 40%. Highest applies."
    },
    "306": {
      "name": "Bard DEF buff",
      "verified": true,
      "note": "user-tested: 305 but def"
    },
    "165": {
      "name": "Death Count based ATK buff",
      "verified": true,
      "note": "same either/or shape as 164 (see its note): p1 percent or p2 flat, cap and condition are in extras."
    },
    "198": {
      "name": "Conqueror type DEF buff",
      "verified": true,
      "note": "user-tested: 197 but for def",
      "tpl": "→ {p1}%"
    },
    "192": {
      "name": "Allied ranged attack priority enemy",
      "verified": true,
      "note": "user-tested: Allied ranged attack priority enemy"
    },
    "130": {
      "name": "Lifelinker damage share",
      "verified": true,
      "note": "p1 is the base share percent; the effective value is set via skill influence 155.",
      "tpl": "{p1}%"
    },
    "174": {
      "name": "Healing Amount increase",
      "verified": true,
      "note": "user-tested: Healing Amount increase\np1 is percent to increase to",
      "tpl": "→ {p1}%"
    },
    "221": {
      "name": "Enemy Damage Taken Increased",
      "verified": true,
      "note": "user-tested: Enemy Damage Taken Increased, p1 is percent to increase to",
      "tpl": "→ {p1}%"
    },
    "264": {
      "name": "Nullify all damage",
      "verified": true,
      "note": "user-tested: Nullify all damage below p1",
      "tpl": "below {p1}"
    },
    "276": {
      "name": "Grants Status Immunity",
      "verified": true,
      "note": "user-tested: Grants Status Immunity (#34 is self?)"
    },
    "135": {
      "name": "Deployment Spot ATK buff",
      "verified": true,
      "note": "user-tested: Deployment Spot ATK buff, p1 is percent to increase to, p2 is flat",
      "tpl": "→ {p1}%[[?p2:, +{p2} flat]]"
    },
    "216": {
      "name": "Token can be used without deploying",
      "verified": true,
      "note": "user-tested: Token can be used without deploying"
    },
    "143": {
      "name": null,
      "verified": false,
      "marker": true,
      "note": "user-tested: Fodder unit info, unknown"
    },
    "312": {
      "name": "Catalyst Skill",
      "verified": true,
      "note": "user-tested: Catalyst Skill, p1 is cost to activate skill, p2 is max, p3 is initial\ncondition to gain catalyst is in extra",
      "tpl": "cost {p1}, max {p2}, initial {p3}"
    },
    "99": {
      "name": "Skill EXP on synthesis",
      "verified": true,
      "note": "grants skill EXP when this unit is used as synthesis fodder. p1 is the EXP amount.",
      "tpl": "{p1} EXP"
    },
    "166": {
      "name": "Death Count based DEF buff",
      "verified": true,
      "note": "same either/or shape as 164/165 (see 164's note): p1 percent or p2 flat, for DEF."
    },
    "277": {
      "name": "Grants HP regen (in range)",
      "verified": true,
      "note": "applies to allies in range by default, even though the raw target field reads self. p1=p2 is the value, p3 is frames between ticks.",
      "tpl": "{p1} HP / {p3f}"
    },
    "295": {
      "name": "HP lost based DEF buff",
      "verified": true,
      "note": "DEF mirror of 294; p4 = target (0 self, 1 in range, 2 global).",
      "tpl": "+{p1}% per {p2} HP lost, cap {p3}"
    },
    "325": {
      "name": "Skill can be used immediately by consuming UP",
      "verified": true,
      "note": "user-tested: Skill can be used immediately by consuming UP"
    },
    "206": {
      "name": "Can deploy Alternative Unit",
      "verified": true,
      "note": "params are unit IDs for the alternative units, rendered as links in AbilityInfluenceRow. Still need to work their stats into the stat box."
    },
    "134": {
      "name": "Deployment Spot HP buff",
      "verified": true,
      "note": "user-tested: #135 but for HP",
      "tpl": "→ {p1}%[[?p2:, +{p2} flat]]"
    },
    "164": {
      "name": "Death Count based HP buff",
      "verified": true,
      "note": "same as 165 but for HP. Real carriers use EITHER p1 (percent, with mulLim) OR p2 (flat, with addLim) -- rendered in AbilityInfluenceRow to show whichever is set."
    },
    "279": {
      "name": "ATK buff per ally within range",
      "verified": true,
      "note": "user-tested: Increase ATK based on number of allies within range, p1 is percent increase per, p2 is cap",
      "tpl": "+{p1}% per ally in range, cap {p2}"
    },
    "104": {
      "name": "Cost Reduction EXP",
      "verified": true,
      "note": "user-tested: Cost Reduction EXP (fodder unit)",
      "tpl": "{p1}"
    },
    "280": {
      "name": "DEF buff per ally within range",
      "verified": true,
      "note": "user-tested: #279 but for DEF",
      "tpl": "+{p1}% per ally in range, cap {p2}"
    },
    "133": {
      "name": "Deployment Spot duration",
      "verified": true,
      "note": "p1 is the duration in frames when present (e.g. Ame-no-Uzume-no-Mikoto Token's p1=3600 = 60s). Token-summoned carriers aren't present in the currently exported unit dataset, so most surveyed carriers show no params at all.",
      "tpl": "{p1f}"
    },
    "169": {
      "name": "UP gen on skill activation",
      "verified": true,
      "note": "user-tested: UP gen on skill activation",
      "tpl": "+{p1} UP"
    },
    "196": {
      "name": "Conqueror type MR buff (flat)",
      "verified": true,
      "note": "user-tested: Conqueror type MR buff, p1 is flat increase",
      "tpl": "+{p1} flat"
    },
    "168": {
      "name": "Restore HP on skill end",
      "verified": true,
      "note": "user-tested: Restore HP on skill end, p1 is percent",
      "tpl": "{p1}% HP"
    },
    "178": {
      "name": "Deep Sea DEF mod",
      "verified": true,
      "note": "#177 but for DEF. p1 is percent of normal.",
      "tpl": "→ {p1}%"
    },
    "302": {
      "name": "Bard Reduce PAD",
      "verified": true,
      "note": "PAD = post-attack delay. p1 is the percent to reduce by.",
      "tpl": "-{p1}%"
    },
    "103": {
      "name": null,
      "verified": false,
      "marker": true,
      "note": "user-tested: Sysnthesis Fodder"
    },
    "199": {
      "name": "Conqueror type MR buff (percent)",
      "verified": true,
      "note": "user-tested: Conq type MR buff, but this time it's percentage and not flat",
      "tpl": "→ {p1}%"
    },
    "285": {
      "name": "ATK increase when dodge",
      "verified": true,
      "note": "user-tested: #284 but ATK",
      "tpl": "+{p1}%[[?p3:, cap {p3}]]"
    },
    "136": {
      "name": "Deployment Spot DEF buff",
      "verified": true,
      "note": "user-tested: #135 but for DEF",
      "tpl": "→ {p1}%[[?p2:, +{p2} flat]]"
    },
    "212": {
      "name": "Conditional skill duration increase",
      "verified": true,
      "note": "user-tested: #211 but for skill duration increase",
      "tpl": "{p1f}"
    },
    "219": {
      "name": "Deployment Spot Unit",
      "verified": true,
      "note": "user-tested: Deployment Spot Unit"
    },
    "266": {
      "name": "Block based ATK buff",
      "verified": true,
      "note": "based on the number of blocked enemies. p1 is percent increase per.",
      "tpl": "+{p1}% per blocked enemy"
    },
    "267": {
      "name": "Block based DEF buff",
      "verified": true,
      "note": "user-tested: #266 but for DEF",
      "tpl": "+{p1}% per blocked enemy"
    },
    "343": {
      "name": "Zero Initial Skill Timer",
      "verified": true,
      "note": "user-tested: Zero Initial Skill Timer"
    },
    "175": {
      "name": "Mark enemies for targeting",
      "verified": true,
      "note": "user-tested: Mark enemies for targeting"
    },
    "114": {
      "name": "Makai Adaptation MR",
      "verified": false,
      "note": "user-tested: Makai Adaptation MR?"
    },
    "265": {
      "name": "Block based HP buff",
      "verified": true,
      "note": "user-tested: #266 but HP",
      "tpl": "+{p1}% per blocked enemy"
    },
    "319": {
      "name": "Nekomata ATK debuff modifier",
      "verified": true,
      "note": "user-tested: Nekomata ATK debuff modifier (for #108), p1 is increase per condition, condition and cap is in extra",
      "tpl": "+{p1} per condition"
    },
    "321": {
      "name": "Nekomata MR debuff modifier",
      "verified": true,
      "note": "user-tested: #319 but for MR, affect #193",
      "tpl": "+{p1} per condition"
    },
    "132": {
      "name": "Possession Mission EXP gain",
      "verified": true,
      "note": "increases EXP gained from mission clears. p1 is the percent increase.",
      "tpl": "+{p1}%"
    },
    "137": {
      "name": "Deployment Spot MR buff",
      "verified": true,
      "note": "p1 is percent (100 = neutral, hidden), p2 is a flat addition; either can be present alone. Rendered in AbilityInfluenceRow.",
      "tpl": "→ {p1}%[[?p2:, +{p2} flat]]"
    },
    "154": {
      "name": "Lukifer Death Buff marker",
      "verified": true,
      "note": "user-tested: Lukifer Death Buff marker"
    },
    "226": {
      "name": "War God Blessing On-hit ATK buff",
      "verified": true,
      "note": "p1 is the ATK mod (e.g. 110 = +10%); p2's meaning is not yet identified.",
      "tpl": "{p1}% ATK"
    },
    "233": {
      "name": "War God Blessing Cost Reduction",
      "verified": true,
      "note": "p1 is the flat value to reduce by; stacks with ability 81 on the same unit. Real playable-unit carriers exist (Mary (Summer Exchange Student), Leora (Black)) alongside the ダミー(戦) test unit's battle_god_bless possession-item rows.",
      "tpl": "-{p1} flat"
    },
    "274": {
      "name": "Taunt Ranged Attack",
      "verified": true,
      "note": "user-tested: Taunt Ranged Attack"
    },
    "304": {
      "name": "Bard HP buff",
      "verified": true,
      "note": "user-tested: #305 but for HP"
    },
    "172": {
      "name": "Heal Token on skill use",
      "verified": true,
      "note": "user-tested: Heal Token on skill use p1 is percent HP",
      "tpl": "{p1}% HP"
    },
    "202": {
      "name": null,
      "verified": false,
      "marker": true,
      "note": "user-tested: Placement NPC exclusive, unknown"
    },
    "268": {
      "name": "Block based MR buff (percent)",
      "verified": true,
      "note": "user-tested: #266 but for MR, is percentage and not flat",
      "tpl": "+{p1}% per blocked enemy"
    },
    "328": {
      "name": "Transform enemy",
      "verified": true,
      "note": "user-tested: Transform enemy\np1 is chance, p2 is duration in frames, p3 is stat modifier (percent of original)",
      "tpl": "{p1}% chance, {p2f}, stats → {p3}%"
    },
    "335": {
      "name": "Current UP based ATK buff",
      "verified": true,
      "note": "user-tested: Current UP based ATK buff\np1 is increase per 1 UP\np2 is base increase\np3 is max UP to achieve max buff\np4 is min UP (start at base)",
      "tpl": "+{p1}% per UP, base +{p2}%, max at {p3} UP[[?p4:, from {p4} UP]]"
    },
    "336": {
      "name": "Current UP based DEF buff",
      "verified": true,
      "note": "user-tested: #335 but for DEF",
      "tpl": "+{p1}% per UP, base +{p2}%, max at {p3} UP[[?p4:, from {p4} UP]]"
    },
    "156": {
      "name": "Lukifer Death ATK buff",
      "verified": true,
      "note": "gain per death is p1-100, computed in AbilityInfluenceRow (was rendering the raw subtraction unevaluated). Cap is in extras."
    },
    "157": {
      "name": "Lukifer Death DEF buff",
      "verified": true,
      "note": "same shape as 156 but for DEF. gain per death is p1-100, computed in AbilityInfluenceRow (was rendering the raw subtraction unevaluated)."
    },
    "171": {
      "name": "Conditional Healing Amp",
      "verified": true,
      "note": "user-tested: Conditional Healing Amp, p1 is value to increase to",
      "tpl": "→ {p1}%"
    },
    "167": {
      "name": "Death Count based MR buff",
      "verified": true,
      "note": "same either/or shape as 164 (see its note): class-ability carriers use p1 (percent, with mulLim); unit-ability carriers observed so far use p2 (flat, with addLim) instead. Both are shown when present."
    },
    "214": {
      "name": "Synthesis unit EXP multiplier",
      "verified": true,
      "note": "p1 is percent increase to, p2 is rarity ID.",
      "tpl": "→ {p1}% (rarity {p2})"
    },
    "236": {
      "name": "Mech Unit (deploy unit to pilot)",
      "verified": true,
      "note": "user-tested: Mech Unit (Deploy unit to pilot), add 100% of HP, ATK, DEF, MR of mounted unit to this unit"
    },
    "237": {
      "name": "ATK multiplier when not mounted",
      "verified": true,
      "note": "tied to ability 236 (Mech Unit). p1 is percent to reduce to (30 = 30% ATK when not mounted).",
      "tpl": "→ {p1}%"
    },
    "238": {
      "name": "DEF multiplier when not mounted",
      "verified": true,
      "note": "user-tested: #237 but DEF",
      "tpl": "→ {p1}%"
    },
    "260": {
      "name": "War God Blessing Range buff",
      "verified": true,
      "note": "p1 is the flat range increase. Volka (a real playable unit) carries this WITHOUT the battle_god_bless wrapper (p4=26, not a War God Blessing stack-id) -- genuine dual-use id, also seen on the ダミー(戦) test unit in the War God Blessing shape (p4=10001/12001).",
      "tpl": "+{p1} flat"
    },
    "307": {
      "name": "Bard MR buff",
      "verified": true,
      "note": "user-tested: #305 but MR"
    },
    "195": {
      "name": "Conqueror-like Flat DEF buff",
      "verified": true,
      "note": "p1 is the flat value.",
      "tpl": "+{p1} flat"
    },
    "290": {
      "name": "Restore Token HP based on damage dealt",
      "verified": true,
      "note": "user-tested: Restore Token HP based on Damage dealt. Also carried by the ダミー(戦) War God Blessing dummy row (p4=10001, Class group) as a blessing-granted variant of the same mechanic.",
      "tpl": "{p1}%"
    },
    "215": {
      "name": "Additional Team restriction",
      "verified": true,
      "note": "Factor extend values (e.g. 1255, 2255) were hypothesized to be Chef class IDs, but neither matches any class ID in the current export (1253 classes tracked) -- hypothesis not confirmed, shown as raw numbers."
    },
    "241": {
      "name": "HP modifier for mounted unit",
      "verified": true,
      "note": "user-tested: HP modifier for mounted unit (see #236), overwriting default 100%",
      "tpl": "→ {p1}%"
    },
    "242": {
      "name": "ATK modifier for mounted unit",
      "verified": true,
      "note": "user-tested: #241 but ATK",
      "tpl": "→ {p1}%"
    },
    "243": {
      "name": "DEF modifier for mounted unit",
      "verified": true,
      "note": "user-tested: #241 but DEF",
      "tpl": "→ {p1}%"
    },
    "244": {
      "name": "MR modifier for mounted unit",
      "verified": true,
      "note": "user-tested: #241 but MR",
      "tpl": "→ {p1}%"
    },
    "263": {
      "name": "Percent UP Cost Reduction",
      "verified": true,
      "note": "p1 is percent to reduce to.",
      "tpl": "→ {p1}%"
    },
    "272": {
      "name": "War God Blessing Regen",
      "verified": true,
      "note": "p1 is the regen amount per tick, p2 is the frames between ticks.",
      "tpl": "{p1} every {p2f}"
    },
    "293": {
      "name": null,
      "verified": false,
      "marker": true,
      "note": "real carrier found: Lukifer, Bringer of Dawn (黎明を齎す者ルキファ), self-target, inherent invoke, always params=[130], gated on specific skills (2211/2375/2376/2377 or 2213) being active -- effect not yet identified."
    },
    "301": {
      "name": "Placed on top of other unit",
      "verified": true,
      "note": "user-tested: Placed on top of other unit"
    },
    "326": {
      "name": "Distribute damage to allies in Range",
      "verified": true,
      "note": "user-tested: Distribute Damage to self to allies in Range, p1 is percent to displace",
      "tpl": "{p1}%"
    },
    "100": {
      "name": null,
      "verified": false,
      "marker": true,
      "note": "user-tested: Synthesis fodder unit"
    },
    "141": {
      "name": null,
      "verified": false,
      "marker": true,
      "note": "possibly synthesis limit (fodder unit) -- unconfirmed hypothesis."
    },
    "194": {
      "name": "Conqueror-like flat ATK buff",
      "verified": true,
      "note": "same shape as 195 but flat ATK. p1 is the flat value.",
      "tpl": "+{p1} flat"
    },
    "217": {
      "name": "Grants Barrier on Skill",
      "verified": true,
      "note": "p1 is the flat barrier value.",
      "tpl": "{p1} flat"
    },
    "225": {
      "name": "War God Blessing MR Buff",
      "verified": true,
      "note": "MR mirror of 224 -- still a percentage buff (p1), not flat.",
      "tpl": "+{p1}%"
    },
    "291": {
      "name": "War God Blessing PAD Reduction During Skill",
      "verified": true,
      "note": "p1 is the percent reduction.",
      "tpl": "-{p1}%"
    },
    "296": {
      "name": "HP lost based MR buff (flat)",
      "verified": true,
      "note": "MR (flat) mirror of 294; p4 = target (0 self, 1 in range, 2 global).",
      "tpl": "+{p1} per {p2} HP lost, cap {p3}"
    },
    "327": {
      "name": "Natural UP recovery increase",
      "verified": false,
      "note": "user-tested: Natural UP recovery increase\nnot enough data, p2 is max unit count, p1 is min?, p4 is frame reduction?"
    },
    "105": {
      "name": "Possession synthesis EXP gain",
      "verified": true,
      "note": "increases EXP gained from possession-item synthesis. p1 is the percent increase.",
      "tpl": "+{p1}%"
    },
    "145": {
      "name": "Select All Targets in Area",
      "verified": true,
      "note": "user-tested: Select All Targets in Area"
    },
    "155": {
      "name": "Lukifer Death HP buff",
      "verified": true,
      "note": "same shape as 156 but for HP. gain per death is p1-100, computed in AbilityInfluenceRow (was rendering the raw subtraction unevaluated)."
    },
    "158": {
      "name": "Lukifer Death MR buff",
      "verified": true,
      "note": "same p1-100 percent shape as 155/156/157. Computed in AbilityInfluenceRow (was rendering the raw subtraction unevaluated)."
    },
    "163": {
      "name": "Perma MR gain on condition",
      "verified": true,
      "note": "same either/or shape as 160 (see its note): p1 percent or p2 flat, whichever the carrier uses."
    },
    "179": {
      "name": null,
      "verified": false,
      "marker": true,
      "note": "user-tested: not enough data"
    },
    "207": {
      "name": "Placement HP mod",
      "verified": true,
      "note": "user-tested: Placement HP mod, p1 is percent to increase to",
      "tpl": "→ {p1}%"
    },
    "230": {
      "name": "War God Blessing On-hit ATK debuff",
      "verified": true,
      "note": "ATK mirror of 231 (p1 debuff percent, p2 duration in frames).",
      "tpl": "-{p1}% for {p2f}"
    },
    "231": {
      "name": "War God Blessing On-hit DEF debuff",
      "verified": true,
      "note": "p1 is the debuff percent, p2 is the duration in frames.",
      "tpl": "-{p1}% for {p2f}"
    },
    "341": {
      "name": "Grants Weather Immunity",
      "verified": true,
      "note": "user-tested: Grants Weather Immunity"
    },
    "311": {
      "name": "War God Blessing UP Regeneration Speed Increase",
      "verified": true,
      "note": "p1 is the increase percent.",
      "tpl": "+{p1}%"
    },
    "309": {
      "name": "War God Blessing Weather Duration Reduction",
      "verified": true,
      "note": "p1 is the reduction percentage.",
      "tpl": "-{p1}%"
    },
    "308": {
      "name": "War God Blessing HP heal on Skill Use",
      "verified": true,
      "note": "p1 is the max HP heal percentage.",
      "tpl": "{p1}% max HP"
    },
    "303": {
      "name": "Bard-like PAD Increase",
      "verified": true,
      "note": "PAD = post-attack delay."
    },
    "288": {
      "name": "War God Blessing On-hit MR debuff",
      "verified": true,
      "note": "MR mirror of 231 (p1 debuff percent, p2 duration in frames).",
      "tpl": "-{p1}% for {p2f}"
    },
    "287": {
      "name": "MR increase when dodge (flat)",
      "verified": true,
      "note": "user-tested: #284 but flat MR, p2 is flat gain, p4 is flat cap",
      "tpl": "+{p2} flat[[?p4:, cap {p4}]]"
    },
    "271": {
      "name": "War God Blessing On Death Explosion Increased Damage",
      "verified": true,
      "note": "p1 is the increased damage percentage.",
      "tpl": "+{p1}%"
    },
    "250": {
      "name": "War God Blessing UP on Kill Chance",
      "verified": true,
      "note": "p1 is the UP gain on proc, p2 is the proc chance percent.",
      "tpl": "+{p1} UP, {p2}% chance"
    },
    "249": {
      "name": "War God Blessing Initial Skill Timer Mod",
      "verified": true,
      "note": "p1 is the percent to reduce to (85 = skill timer starts at 85% of normal, not a -85% reduction).",
      "tpl": "{p1}%"
    },
    "232": {
      "name": "War God Blessing Barrier",
      "verified": true,
      "note": "p2 is the flat Barrier value; p1's meaning is not yet identified.",
      "tpl": "{p2} flat"
    },
    "229": {
      "name": "War God Blessing True Damage Chance",
      "verified": true,
      "note": "p1 is the chance percent.",
      "tpl": "{p1}% chance"
    },
    "228": {
      "name": "War God Blessing Physical Attack Evasion",
      "verified": true,
      "note": "p1 is the evade chance percent.",
      "tpl": "{p1}% chance"
    },
    "149": {
      "name": "Move main unit",
      "verified": true,
      "note": "Verified (token-only ability, supersedes the earlier 'can't test' note)."
    },
    "140": {
      "name": null,
      "verified": false,
      "marker": true,
      "note": "user-tested: Synthesis fodder"
    },
    "131": {
      "name": null,
      "verified": false,
      "marker": true,
      "note": "user-tested: NPC only"
    },
    "342": {
      "name": "Base Live Count cannot decrease",
      "verified": true,
      "note": "user-tested: Base Live Count cannot decrease"
    },
    "339": {
      "name": "Current UP based range buff (flat)",
      "verified": true,
      "note": "user-tested: #335 but flat range",
      "tpl": "+{p1} per UP, base +{p2}, max at {p3} UP[[?p4:, from {p4} UP]]"
    },
    "322": {
      "name": "On-hit ATK debuff modifier",
      "verified": true,
      "note": "modifier for on hit atk debuff #89, functions like the Nekomata debuff (#319/#321): p1 is increase per condition, condition and cap are in extend.",
      "tpl": "+{p1} per condition"
    },
    "310": {
      "name": "War God Blessing PAD Reduction",
      "verified": true,
      "note": "p1 is the percent reduction.",
      "tpl": "-{p1}%"
    },
    "292": {
      "name": "War God Blessing HP Heal on Skill End",
      "verified": true,
      "note": "p1 is the max HP heal percentage.",
      "tpl": "{p1}% max HP"
    },
    "289": {
      "name": "War God Blessing Damage Taken Amp",
      "verified": true,
      "note": "p1 is the damage-taken amp (e.g. 110 = +10%), p2 is the duration in frames. extend flags (魔法/物理/貫通) mark which damage school the amp applies to.",
      "tpl": "{p1}% for {p2f}"
    },
    "273": {
      "name": "War God Blessing Skill Cooldown Reduction",
      "verified": true,
      "note": "p1 is the reduction percentage.",
      "tpl": "-{p1}%"
    },
    "251": {
      "name": "War God Blessing HP Drain Chance",
      "verified": true,
      "note": "p1 is the max HP percent drained on proc, p2 is the proc chance percent.",
      "tpl": "{p1}% max HP, {p2}% chance"
    },
    "297": {
      "name": "Grants Life Steal effect",
      "verified": true,
      "note": "user-tested: Grants Life Steal effect (heal % HP on attack)\np1 is steal value, p2 is the number of received target",
      "tpl": "{p1}%[[?p2:, {p2} targets]]"
    },
    "151": {
      "name": "Chef Type flat ATK buff",
      "verified": true,
      "note": "user-tested: similar for 151 ATK and 152 DEF (from 150's note)"
    },
    "152": {
      "name": "Chef Type flat DEF buff",
      "verified": true,
      "note": "user-tested: 152 is Chef DEF buff similar to 150"
    },
    "182": {
      "name": "Tenkai effect reduction",
      "verified": true,
      "note": "user-tested: tenkai effect reduction, similar to makai, can't test which is which (182 183 as well)",
      "tpl": "-{p1}%"
    },
    "183": {
      "name": "Tenkai effect reduction",
      "verified": true,
      "note": "user-tested: tenkai effect reduction, similar to makai, can't test which is which (182 183 as well)",
      "tpl": "-{p1}%"
    },
    "185": {
      "name": "Tenkai Immunity (185)",
      "verified": false,
      "note": "user-tested: 184 185 186 order is probably similar to Makai order"
    },
    "186": {
      "name": "Tenkai Immunity (186)",
      "verified": false,
      "note": "user-tested: 184 185 186 order is probably similar to Makai order"
    },
    "270": {
      "name": "Chronosia token PAD Reduction",
      "verified": true,
      "note": "p1 is the reduction percent, p2 is the duration in frames.",
      "tpl": "-{p1}% for {p2f}"
    },
    "300": {
      "name": "Create projectile",
      "verified": false,
      "note": "user-tested: create projectile p1 with p3 hit and p4 delay between, need to investigate more",
      "tpl": "missile {p1}, {p3} hits, {p4} delay"
    },
    "144": {
      "name": "Change target of main unit (token effect)",
      "verified": true,
      "note": "user-tested: change target of main unit (token effect)"
    },
    "314": {
      "name": "Share attached unit ATK to main unit",
      "verified": true,
      "note": "user-tested: Share p1% of attached unit atk to main unit (314/315 = ATK/DEF pair)",
      "tpl": "share {p1}%"
    },
    "315": {
      "name": "Share attached unit DEF to main unit",
      "verified": true,
      "note": "user-tested: Share p1% of attached unit def to main unit (314/315 = ATK/DEF pair)",
      "tpl": "share {p1}%"
    },
    "317": {
      "name": "Move main unit Range circle",
      "verified": true,
      "note": "user-tested: move main unit Range circle"
    },
    "235": {
      "name": "Can be placed anywhere (marker?)",
      "verified": false,
      "note": "user-tested: another mark for can be placed anywhere?"
    },
    "218": {
      "name": "Grants Barrier (flat)",
      "verified": true,
      "note": "p1 is the flat value.",
      "tpl": "{p1} flat"
    },
    "299": {
      "name": "Cannot be healed except by",
      "verified": true,
      "note": "Verified."
    },
    "318": {
      "name": "Reuse change Token location",
      "verified": true,
      "note": "Verified."
    },
    "74": {
      "name": "Makai Effect Reduction",
      "verified": true,
      "tpl": "-{p1}%",
      "note": "user-tested: 73 74 75 is Makai Effect Reduction, p1 is value to reduce by, order is atk / def / mr? no way to test since they are all together"
    },
    "75": {
      "name": "Makai Effect Reduction",
      "verified": true,
      "tpl": "-{p1}%",
      "note": "user-tested: 73 74 75 is Makai Effect Reduction, p1 is value to reduce by, order is atk / def / mr? no way to test since they are all together"
    }
  }
};

// Canonical display terminology. These overrides change wording only; decoded
// mechanics, verification state, notes, and value templates remain untouched.
const CANONICAL_SKILL_NAMES: Record<string, string> = {
  "2": "ATK buff (Type-A)",
  "3": "ATK buff (Type-B, global)",
  "4": "DEF buff (Type-A)",
  "5": "DEF buff (Type-B, global)",
  "8": "Damage-area modifier",
  "9": "Physical attack evasion",
  "10": "Ranged attack evasion",
  "14": "Set PAD",
  "15": "Support-effect increase",
  "19": "MR modifier",
  "35": "Attack restores HP (percent)",
  "40": "Auto-revive (percent HP)",
  "50": "Auto-use skill",
  "53": "Ground-only area attack",
  "57": "Counterattack when blocking (physical)",
  "59": "Enemy MR reduction",
  "60": "Enemy DEF reduction",
  "64": "Restore HP based on ATK",
  "65": "Generate UP over time",
  "66": "Bonus damage against flying enemies",
  "67": "Bonus damage against ground enemies",
  "83": "Permanent HP modifier",
  "84": "Unit cost modifier",
  "85": "ATK modifier by rarity",
  "86": "Lose HP on skill end (rarity-scaled)",
  "87": "DEF modifier by rarity",
  "89": "ATK buff (Type-C, conditional)",
  "90": "DEF buff (Type-C, conditional)",
  "95": "Current-HP percentage damage",
  "100": "On-hit HP-drain multiplier",
  "102": "Restore token on enemy kill",
  "108": "Lose HP (percent)",
  "115": "Attacks cannot reduce enemy HP to 0",
  "118": "Permanent block-count modifier",
  "133": "Force target ally to retreat",
  "134": "Target automatically uses skill",
  "141": "Permanent ATK modifier",
  "142": "Permanent DEF modifier",
  "148": "Reset target skill duration",
  "156": "Execute skill command",
  "159": "Restore HP to normally unhealable units",
  "160": "Treat death as retreat",
  "161": "Redeploy after death",
  "170": "Permanent PAD reduction",
  "173": "Scaling attack",
  "176": "Scaling multihit count",
  "177": "Scaling target count",
  "178": "Transform into selected unit (percentage of stats)",
  "179": "Cannot use skills automatically",
  "196": "Deep-sea effect reduction",
  "200": "Range buff (multiplicative)",
  "203": "Maximum UP consumption",
  "204": "UP-consuming ATK buff",
  "205": "UP-consuming DEF buff",
  "206": "UP-consumption-based MR buff",
  "257": "Increase ATK shared to parent unit",
  "258": "Increase DEF shared to parent unit",
  "263": "Gradual UP consumption",
  "264": "ATK buff during gradual UP consumption"
};

const CANONICAL_ABILITY_NAMES: Record<string, string> = {
  "1": "ATK modifier on hit",
  "2": "ATK modifier against dragons",
  "3": "ATK modifier against yokai",
  "4": "ATK modifier against undead",
  "5": "ATK modifier against demons",
  "6": "ATK modifier against armored enemies",
  "11": "Enemy HP/ATK modifier",
  "12": "HP modifier",
  "13": "ATK modifier",
  "14": "DEF modifier",
  "15": "MR modifier",
  "16": "Skill duration modifier",
  "17": "Restore HP",
  "20": "Physical attack evasion",
  "23": "Assassination",
  "25": "Targeting priority change",
  "28": "Weather ATK modifier",
  "29": "Weather range-reduction resistance",
  "30": "Regeneration",
  "32": "Regeneration modifier",
  "34": "Status-ailment reduction",
  "35": "Assassination modifier",
  "36": "Attack restores HP (percent)",
  "37": "Damage received restores ally HP",
  "38": "Instantly kill enemies below HP threshold",
  "45": "Skill cooldown reduction",
  "46": "ATK modifier against flying enemies",
  "49": "DEF bonus at low HP",
  "55": "Token count modifier",
  "62": "Initial skill timer modifier",
  "64": "Deprecated enemy-type filter",
  "65": "Cannot be healed",
  "70": "Sortie/deployment ATK buff",
  "71": "Sortie/deployment DEF buff",
  "73": "Makai effect reduction",
  "74": "Makai effect reduction",
  "75": "Makai effect reduction",
  "76": "MR modifier (new)",
  "77": "Ally regeneration",
  "82": "Sortie HP buff",
  "83": "Conditional ATK buff (invisible)",
  "84": "Conditional DEF buff (invisible)",
  "85": "Self damage reduction",
  "87": "Ally HP buff",
  "91": "Reduce PAD",
  "97": "First unit does not count toward deployment limit",
  "99": "Skill EXP from synthesis",
  "104": "Cost-reduction EXP from synthesis",
  "105": "Possession EXP from synthesis",
  "107": "Weather effect resistance",
  "110": "ATK modifier per unit",
  "111": "DEF modifier per unit",
  "114": "Makai adaptation (MR)",
  "115": "Dancer ATK bonus",
  "116": "Dancer DEF bonus",
  "118": "Self skill cooldown reduction",
  "124": "Allied ranged attacks prioritize blocked enemies",
  "127": "Block count",
  "128": "Magic attack",
  "129": "Zhenren damage redirection",
  "133": "Deployment-spot duration",
  "134": "Deployment-spot HP buff",
  "135": "Deployment-spot ATK buff",
  "136": "Deployment-spot DEF buff",
  "137": "Deployment-spot MR buff (flat)",
  "145": "Can be placed anywhere (outside deployment spots)",
  "148": "One unit per team",
  "150": "Chef-type flat HP buff",
  "151": "Chef-type flat ATK buff",
  "152": "Chef-type flat DEF buff",
  "154": "Lukifer death-buff marker",
  "155": "Lukifer death HP buff",
  "156": "Lukifer death ATK buff",
  "157": "Lukifer death DEF buff",
  "158": "Lukifer death MR buff (flat)",
  "159": "Permanent-stat-gain marker",
  "160": "Permanent HP gain on condition",
  "161": "Permanent ATK gain on condition",
  "162": "Permanent DEF gain on condition",
  "163": "Permanent MR gain on condition",
  "164": "Death-count-based HP/ATK/DEF buff",
  "165": "Death-count-based ATK buff",
  "166": "Death-count-based DEF buff",
  "167": "Death-count-based MR buff",
  "169": "Generate UP on skill activation",
  "170": "Gradual UP increase while skill is active",
  "171": "Conditional healing output increase",
  "172": "Restore token HP on skill activation",
  "174": "Healing output increase",
  "176": "Deep-sea effect reduction",
  "177": "Deep-sea ATK modifier",
  "178": "Deep-sea DEF modifier",
  "191": "Gradual ATK increase while not attacking",
  "192": "Allied ranged attacks prioritize blocked enemies",
  "194": "Conqueror-like flat ATK buff",
  "195": "Conqueror-like flat DEF buff",
  "196": "Conqueror-type MR buff (flat)",
  "197": "Conqueror-type ATK buff",
  "198": "Conqueror-type DEF buff",
  "199": "Conqueror-type MR buff (percent)",
  "200": "Grant barrier",
  "206": "Deploy alternative unit",
  "207": "Placement HP modifier",
  "210": "Alternate attack attribute between hits",
  "211": "Conditional skill cooldown reduction",
  "214": "Synthesis EXP multiplier",
  "215": "Additional team restriction",
  "217": "Grant barrier on skill activation",
  "218": "Grant barrier (flat)",
  "219": "Deployment-spot unit",
  "221": "Enemy damage taken increase",
  "223": "Sortie/deployment ATK buff (deploy invoke)",
  "224": "Sortie/deployment DEF buff (deploy invoke)",
  "236": "Mech unit (deploy unit to pilot)",
  "240": "Set PAD",
  "260": "Conditional range buff",
  "263": "Percentage UP cost reduction",
  "265": "Block-based HP buff",
  "266": "Block-based ATK buff",
  "267": "Block-based DEF buff",
  "268": "Block-based MR buff (percent)",
  "270": "Chronosia token PAD reduction",
  "274": "Taunt ranged attacks",
  "276": "Status-ailment reduction (in range)",
  "277": "Grant regeneration",
  "284": "HP increase on dodge",
  "285": "ATK increase on dodge",
  "287": "MR increase on dodge (flat)",
  "290": "Restore token HP based on damage dealt",
  "294": "HP-lost-based ATK buff",
  "295": "HP-lost-based DEF buff",
  "296": "HP-lost-based MR buff (flat)",
  "297": "Grant life steal",
  "298": "Automatically deploy token",
  "302": "Bard PAD reduction",
  "303": "Bard-like PAD increase",
  "312": "Catalyst skill",
  "317": "Move main unit's range circle",
  "326": "Distribute damage to allies in range",
  "335": "Current-UP-based ATK buff",
  "336": "Current-UP-based DEF buff",
  "339": "Current-UP-based range buff (flat)",
  "341": "Weather range modifier (allies in range)",
  "342": "Base life count cannot decrease",
  "343": "Zero initial skill timer",
  "0": "No effect",
  "42": "Spinning slash",
  "51": "Rogue salvage / redeploy",
  "56": "Spinning slash (ground area)",
  "66": "Redeploy after withdrawal",
  "98": "Death sentence / delayed revival",
  "93": "ATK donation modifier",
  "94": "ATK donation modifier (+)",
  "95": "DEF donation modifier",
  "96": "DEF donation modifier (+)",
  "117": "Nullify counterattacks",
  "123": "Nullify evasion",
  "131": "Debuff",
  "173": "Magic attack conversion",
  "187": "Conditional regeneration",
  "202": "Deployment-spot range buff",
  "205": "Enemy ATK/DEF/MR debuff over time",
  "313": "Share attached unit HP to main unit",
  "314": "Share attached unit ATK to main unit",
  "315": "Share attached unit DEF to main unit",
  "316": "Share attached unit MR to main unit",
  "340": "Weather ATK modifier (allies in range)",
  "344": "Overheal",
  "345": "Overheal-target ATK modifier",
  "346": "Overheal-target DEF modifier",
  "347": "Overheal-target MR modifier"
};

for (const [id, name] of Object.entries(CANONICAL_SKILL_NAMES)) {
  const label = INFLUENCE_LABELS.skill[id];
  if (label) label.name = name;
}
for (const [id, name] of Object.entries(CANONICAL_ABILITY_NAMES)) {
  const label = INFLUENCE_LABELS.ability[id] ?? (INFLUENCE_LABELS.ability[id] = {
    name,
    verified: false,
    note: "official recovered name; no current carrier evidence."
  });
  label.name = name;
}
