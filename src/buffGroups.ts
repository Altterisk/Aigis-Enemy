// Display names for buff_index rows carrying a `grp` override, shared by the
// buff ranking (pages/Buffs.tsx) and the team builder (pages/Team.tsx).
export const GRP_NAME: Record<string, string> = {
  sortie_atk: "Sortie ATK Buff", deploy_atk: "Deployment ATK Buff",
  sortie_def: "Sortie DEF Buff", deploy_def: "Deployment DEF Buff",
  war_god_blessing_atk: "War God Blessing ATK Buff",
  war_god_blessing_def: "War God Blessing DEF Buff",
  bard_hp_stack_1: "Bard HP Buff (stack 1)",
  bard_atk_stack_1: "Bard ATK Buff (stack 1)",
  bard_def_stack_1: "Bard DEF Buff (stack 1)",
  bard_mr_stack_1: "Bard MR Buff (stack 1)",
  bard_hp_stack_2: "Bard-like Token HP Buff (stack 2)",
  bard_atk_stack_2: "Bard-like Token ATK Buff (stack 2)",
  bard_def_stack_2: "Bard-like Token DEF Buff (stack 2)",
  bard_mr_stack_2: "Bard-like Token MR Buff (stack 2)",
  makai_reduction: "Makai Effect Reduction (ability 73/74/75)",
  makai_immunity: "Makai Adaptation (ability 112/113)",
  tenkai_reduction: "Tenkai Effect Reduction (ability 181/182/183)",
  tenkai_immunity: "Tenkai Immunity (ability 184/185/186)",
  special_stealth: "Stealth (special property 16)",
  special_limit: "Doesn't count against deployment limit (special property 13)",
  missile_timestop: "100% slow missile (time stop on hit)",
  field_hpcut: "Max-HP damage field",
  class_omni: "Omni placement (melee or ranged spot)",
  possession_hp: "Possession HP buff", possession_atk: "Possession ATK buff",
  possession_def: "Possession DEF buff", possession_mr: "Possession MR buff",
  possession_range: "Possession range buff",
};

/** A group's title: its `grp` name, "<ability name> (stack N)", or the grp itself. */
export function groupName(grp: string, influenceName: (t: number) => string | null | undefined, t: number): string {
  const known = GRP_NAME[grp];
  if (known) return known;
  const stack = /^ability_(\d+)_stack_(\d+)$/.exec(grp);
  if (stack) return `${influenceName(t) || `ability ${t}`} (stack ${stack[2]})`;
  const invoke = /^ability_(\d+)_(sortie|deployed)$/.exec(grp);
  if (invoke) return `${influenceName(t) || `ability ${t}`} (${invoke[2] === "sortie" ? "sortie" : "while deployed"})`;
  return grp;
}
