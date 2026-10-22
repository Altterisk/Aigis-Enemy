import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { INFLUENCE_LABELS } from "../src/influenceLabels";
import { RACE_LABELS, TAG_LABELS } from "../src/tagLabels";

// The site shows influence labels from src/influenceLabels.ts and tag names
// from src/tagLabels.ts (falling back to the exported localisation.json), not
// from the exported label files. These checks fail when an export carries a
// label or tag the site would not show.

const readData = (name: string) => JSON.parse(fs.readFileSync(`public/data/${name}.json`, "utf-8"));

test("every influence verified in the export is verified on the site", () => {
  const exported = readData("unit_influence_labels");
  const missing: string[] = [];
  for (const ns of ["skill", "ability"] as const) {
    for (const [id, label] of Object.entries<{ name: string; verified?: boolean }>(exported[ns])) {
      if (label.verified && !INFLUENCE_LABELS[ns][id]?.verified) {
        missing.push(`${ns} ${id} "${label.name}" -> add it to src/influenceLabels.ts`);
      }
    }
  }
  expect(missing).toEqual([]);
});

test("every unit tag has an English name", () => {
  const loc = readData("localisation");
  const names = { ...loc.races, ...loc.tags, ...RACE_LABELS, ...TAG_LABELS };
  const missing = new Map<string, number>();
  for (const u of readData("units")) {
    for (const tag of [...(u.identity_tags || []), u.genus, u.faction, u.race, u.big_race]) {
      if (tag && !names[tag] && !missing.has(tag)) missing.set(tag, u.id);
    }
  }
  expect([...missing].map(([tag, id]) => `${tag} (e.g. #${id}) -> add it to src/tagLabels.ts`)).toEqual([]);
});
