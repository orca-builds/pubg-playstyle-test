import type { ScoringResult } from "@/lib/scoring";

export const SCORE_FIELDS = [
  "combat_score", "position_score", "frontline_score", "support_score",
  "pressure_score", "design_score", "risk_score", "safe_score",
  "main_body_score", "flank_score", "hotdrop_score", "tail_score", "full_loot_score",
  "fast_loot_score", "center_score", "edge_score", "standard_gear_score", "special_gear_score",
] as const;
export const RESULT_FIELDS = ["main_type", ...SCORE_FIELDS, "top_sub_tag_1", "top_sub_tag_2"] as const;

// Serialization only. All scoring remains in the existing scoring module.
export function toResultColumns(result: ScoringResult) {
  const main = result.mainScores;
  const sub = result.subScores;
  return {
    main_type: result.mainResult.id,
    combat_score: main.combat, position_score: main.position,
    frontline_score: main.frontline, support_score: main.support,
    pressure_score: main.pressure, design_score: main.design, risk_score: main.risk, safe_score: main.safe,
    main_body_score: sub.mainBody, flank_score: sub.flank, hotdrop_score: sub.hotdrop, tail_score: sub.tail,
    full_loot_score: sub.fullLoot, fast_loot_score: sub.fastLoot, center_score: sub.center, edge_score: sub.edge,
    standard_gear_score: sub.standardGear, special_gear_score: sub.specialGear,
    top_sub_tag_1: result.displaySubTags[0] ?? null, top_sub_tag_2: result.displaySubTags[1] ?? null,
  };
}

export function matchesResult(value: Record<string, unknown>, result: ScoringResult): boolean {
  const canonical = toResultColumns(result);
  return RESULT_FIELDS.every(field => value[field] === canonical[field]);
}
