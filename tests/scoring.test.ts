import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, contributionPoints, globalScore, longestStreak, mergeConfig, scoreMember, validateConfig, epochOf, type MemberInputs } from "../lib/scoring.ts";

const base: MemberInputs = { holdingDays: null, approved: [], strikes: 0, voteEpochs: [], meaningfulProposals: 0, currentEpoch: 10 };

test("empty member scores 0 with every component explained", () => {
  const r = scoreMember(base);
  assert.equal(r.total, 0);
  assert.equal(r.max, 1000);
  assert.equal(r.components.length, 5);
  for (const c of r.components) assert.ok(c.explain.length > 0);
});

test("holding: time only, capped, amount is not an input", () => {
  const year = scoreMember({ ...base, holdingDays: 365 }).components[0];
  assert.equal(year.points, 250);
  const twoYears = scoreMember({ ...base, holdingDays: 730 }).components[0];
  assert.equal(twoYears.points, 250, "capped at full days");
  const week = scoreMember({ ...base, holdingDays: 7 }).components[0].points;
  const month = scoreMember({ ...base, holdingDays: 30 }).components[0].points;
  assert.ok(week > 0 && week < month && month < 250);
  assert.ok(!("balance" in base), "no balance field exists in the scoring inputs");
});

test("contributions: diminishing returns inside an epoch defeat spam", () => {
  const spam = Array.from({ length: 30 }, () => ({ type: "meme" as const, quality: 1, epoch: 3 }));
  const twoGood = [
    { type: "research" as const, quality: 5, epoch: 3 },
    { type: "artwork" as const, quality: 5, epoch: 4 },
  ];
  // 30 low-effort memes: 1.5 × (1 + 0.5 + 0.25 + …) < 3
  assert.ok(contributionPoints(spam, DEFAULT_CONFIG) < 3.0001);
  assert.ok(contributionPoints(twoGood, DEFAULT_CONFIG) === 35);
  const s = scoreMember({ ...base, approved: spam }).total;
  const g = scoreMember({ ...base, approved: twoGood }).total;
  assert.ok(g > s * 3, `quality ${g} should dwarf spam ${s}`);
});

test("strikes cut the contribution component", () => {
  const approved = [{ type: "research" as const, quality: 5, epoch: 1 }];
  const clean = scoreMember({ ...base, approved }).components[2].points;
  const two = scoreMember({ ...base, approved, strikes: 2 }).components[2].points;
  const four = scoreMember({ ...base, approved, strikes: 4 }).components[2].points;
  assert.ok(two < clean);
  assert.equal(four, 0);
});

test("consistency ramps in and rewards regular work", () => {
  const regular = [6, 7, 8, 9, 10].map((epoch) => ({ type: "education" as const, quality: 3, epoch }));
  const burst = [{ type: "education" as const, quality: 3, epoch: 10 }];
  const r = scoreMember({ ...base, approved: regular }).components[4];
  const b = scoreMember({ ...base, approved: burst }).components[4];
  assert.equal(r.points, 100);
  assert.ok(b.points < 40, "one epoch of work can't look perfectly consistent");
});

test("governance and participation", () => {
  const r = scoreMember({ ...base, voteEpochs: [1, 2, 3], meaningfulProposals: 1 });
  assert.ok(r.components[3].points > 0);
  assert.equal(r.components[1].inputs.activeEpochs, 3);
});

test("max score is reachable and never exceeded", () => {
  const approved = Array.from({ length: 40 }, (_, i) => ({ type: "research" as const, quality: 5, epoch: i % 12 }));
  const r = scoreMember({ ...base, holdingDays: 400, approved, voteEpochs: Array.from({ length: 60 }, (_, i) => i % 12), meaningfulProposals: 10, currentEpoch: 11 });
  assert.ok(r.total <= 1000 && r.total >= 990, String(r.total));
});

test("config validation and merge", () => {
  assert.deepEqual(validateConfig(DEFAULT_CONFIG), []);
  const bad = mergeConfig({ weights: { holding: 900 } });
  assert.ok(validateConfig(bad).some((e) => e.includes("total 1000")));
  const ok = mergeConfig({ weights: { holding: 0, contributions: 600 } });
  assert.deepEqual(validateConfig(ok), []);
  assert.equal(scoreMember({ ...base, holdingDays: 365 }, ok).components[0].points, 0, "a project can switch holding off");
});

test("portable global score", () => {
  assert.equal(globalScore([]).total, 0);
  assert.equal(globalScore([400]).total, 400);
  assert.equal(globalScore([400, 200, 200]).total, 500);
  assert.equal(globalScore([900, 900, 900]).total, 1000);
  assert.equal(globalScore([10, 10, 10, 10, 10, 10, 10, 10]).total, 28, "many tiny communities don't add up to much");
});

test("helpers", () => {
  assert.equal(longestStreak([1, 2, 3, 5, 6]), 3);
  assert.equal(longestStreak([]), 0);
  const start = Date.UTC(2026, 0, 1);
  assert.equal(epochOf(start, start, 14), 0);
  assert.equal(epochOf(start + 15 * 86_400_000, start, 14), 1);
});
