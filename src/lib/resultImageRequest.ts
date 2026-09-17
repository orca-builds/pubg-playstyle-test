import { resultTypes } from "@/data/resultTypes";
import { allRounderTag, subTraitTags } from "@/data/subTraits";
import type { ScoringResult } from "@/lib/scoring";

// Public keys only. Display strings remain owned by the existing data module.
const tags = Object.fromEntries([
  ...Object.entries(subTraitTags).flatMap(([axis, values]) =>
    Object.entries(values).map(([trait, label]) => [`${axis}.${trait}`, label])),
  ["allRounder", allRounderTag],
]);

export function parseResultImageRequest(params: URLSearchParams) {
  if ([...params.keys()].some(key => !["main_type", "tag"].includes(key))) return;
  const mainType = params.get("main_type") ?? "";
  const keys = params.getAll("tag");
  if (params.getAll("main_type").length !== 1 || !Object.hasOwn(resultTypes, mainType) ||
    keys.length < 1 || keys.length > 2 || new Set(keys).size !== keys.length ||
    keys.some(key => !Object.hasOwn(tags, key))) return;
  return { mainResult: resultTypes[mainType as keyof typeof resultTypes], displaySubTags: keys.map(key => tags[key]) };
}

export function resultImageRequestUrl(result: ScoringResult): string {
  const params = new URLSearchParams({ main_type: result.mainResult.id });
  for (const label of result.displaySubTags.slice(0, 2)) {
    const key = Object.keys(tags).find(key => tags[key] === label);
    if (!key) throw new Error("INVALID_IMAGE_TAG");
    params.append("tag", key);
  }
  if (!parseResultImageRequest(params)) throw new Error("INVALID_IMAGE_RESULT");
  return `/api/result-image?${params}`;
}
