// A stage's deploy restriction (stage term 24, its expression) evaluated
// against every unit of the list index: which cards may deploy there.
// A card may deploy when the expression holds at any of its class tiers.
import { evaluate, type TargetFacts, type Tri } from "./condEval";
import type { Stage, UnitIndexEntry } from "./types";

// stage term 24 = which units may deploy
const DEPLOY_TERM = 24;

// CRC32 (signed, like the game's registry ids) of a UTF-8 string
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(s: string): number {
  let c = 0xffffffff;
  for (const b of new TextEncoder().encode(s)) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) | 0;
}

// GetGender(): 0 male, 1 female; other codes (100 support, 4 genderless) as written
function genderCode(g: string | number | undefined): number | null {
  if (g === "Male") return 0;
  if (g === "Female") return 1;
  const n = Number(g);
  return g !== undefined && g !== "" && Number.isFinite(n) ? n : null;
}

/** The stage's deploy-restriction expression, or null when it has none. */
export function deployExpression(stage: Pick<Stage, "modifiers"> | null | undefined): string | null {
  const m = (stage?.modifiers ?? []).find((x) => x.kind === "term" && x.influence === DEPLOY_TERM && x.expression);
  return m?.expression ?? null;
}

/** True when the expression limits more than duplicate units (IsOverlapMember). */
export function restrictsUnits(expr: string): boolean {
  return [...expr.matchAll(/([A-Za-z_]\w*)\s*\(/g)].some((m) => m[1] !== "IsOverlapMember");
}

function facts(u: UnitIndexEntry, classId: number, battleStyle: number | null): TargetFacts {
  return {
    unitId: u.id,
    classId,
    gender: genderCode(u.gender),
    rarityId: u.rarity_id,
    race: u.race ?? null,
    genus: u.genus ?? null,
    faction: u.faction ?? null,
    identities: u.identity_tags ?? [],
    prince: !!u.prince,
    battleStyle,
    initialCost: null,
  };
}

/** Whether the card may deploy under `expr` (null = cannot tell). The name
 * functions read the card's Japanese name as the game's name table holds it. */
export function canDeploy(expr: string, u: UnitIndexEntry): Tri {
  // `;` ends a statement inside the game's scripts; the evaluator reads it as &&
  const src = expr.replace(/;/g, " ");
  const name = u.name || "";
  const tiers = u.tiers?.length ? u.tiers : [[u.base_class_id ?? 0, null, null, false] as const];
  let result: Tri = false;
  for (const [classId, block, style, hasToken] of tiers) {
    const r = evaluate(src, {
      skillActive: false, skillId: null, skillUnknown: true, classChange: 0,
      target: facts(u, classId ?? 0, style ?? null),
      fns: {
        // a formation without duplicates: the card is not a second copy
        IsOverlapMember: () => 0,
        GetRaryty: () => u.rarity_id,
        // the class's BlockNum (block-count buffs during battle are not counted)
        GetBlockCount: () => block ?? null,
        HasToken: () => !!hasToken,
        GetNameCharCount: () => [...name].length,
        IsContainsChar: (args) => args.some((c) => name.includes(String(c))),
        // the game hashes the argument (CRC32) and compares it with the
        // faction's PlayerAssignType _ResID (the display label can differ)
        IsAssign: (args) => u.faction_res_id != null && args.some((a) => crc32(String(a)) === u.faction_res_id),
      },
    });
    if (r === true) return true;
    if (r === null) result = null;
  }
  return result;
}
