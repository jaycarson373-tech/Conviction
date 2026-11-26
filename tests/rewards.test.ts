import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, epochPot, splitByWeight } from "../lib/rewards.ts";

const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

test("splitByWeight sums exactly", () => {
  for (const pot of [1n, 7n, 999_999_937n, 10_000_000_000n]) {
    const parts = splitByWeight(pot, [1, 2, 3.3, 0.0001, 17]);
    assert.equal(sum(parts), pot);
  }
  assert.deepEqual(splitByWeight(100n, [0, 0]), [0n, 0n]);
});

test("pot never exceeds verified unspent funding", () => {
  assert.equal(epochPot({ budget: 5n, funded: 10n, alreadyAllocated: 0n }), 5n);
  assert.equal(epochPot({ budget: 50n, funded: 10n, alreadyAllocated: 4n }), 6n);
  assert.equal(epochPot({ budget: 50n, funded: 10n, alreadyAllocated: 10n }), 0n);
  assert.equal(epochPot({ budget: 50n, funded: 0n, alreadyAllocated: 0n }), 0n);
});

test("pro-rata by contribution points, ineligible excluded", () => {
  const r = allocate(
    [
      { wallet: "A", points: 30, eligible: true },
      { wallet: "B", points: 10, eligible: true },
      { wallet: "S", points: 500, eligible: false, reason: "sybil cluster" },
    ],
    { pot: 1_000_000_000n, capBps: 10_000, minPayout: 1_000_000n },
  );
  assert.equal(r.allocations.length, 2);
  assert.equal(r.allocations[0].lamports, 750_000_000n);
  assert.equal(r.allocations[1].lamports, 250_000_000n);
  assert.deepEqual(r.excluded, [{ wallet: "S", reason: "sybil cluster" }]);
  assert.equal(r.unallocated, 0n);
});

test("cap redistributes the excess", () => {
  const r = allocate(
    [
      { wallet: "W", points: 1000, eligible: true },
      { wallet: "a", points: 1, eligible: true },
      { wallet: "b", points: 1, eligible: true },
      { wallet: "c", points: 1, eligible: true },
      { wallet: "d", points: 1, eligible: true },
    ],
    { pot: 1_000_000_000n, capBps: 2_000, minPayout: 1n },
  );
  const w = r.allocations.find((a) => a.wallet === "W")!;
  assert.equal(w.lamports, 200_000_000n);
  assert.equal(sum(r.allocations.map((a) => a.lamports)) + r.unallocated, 1_000_000_000n);
  for (const a of r.allocations) assert.ok(a.lamports <= 200_000_000n);
});

test("dust payouts dropped and re-split", () => {
  const r = allocate(
    [
      { wallet: "A", points: 1000, eligible: true },
      { wallet: "B", points: 1, eligible: true },
    ],
    { pot: 100_000_000n, capBps: 10_000, minPayout: 1_000_000n },
  );
  assert.equal(r.allocations.length, 1);
  assert.equal(r.allocations[0].lamports, 100_000_000n);
  assert.ok(r.excluded.some((e) => e.wallet === "B" && e.reason === "below minimum payout"));
});

test("no claimants → nothing allocated", () => {
  const r = allocate([], { pot: 5n, capBps: 2000, minPayout: 1n });
  assert.equal(r.allocations.length, 0);
  assert.equal(r.unallocated, 5n);
});

test("duplicate wallets are counted once", () => {
  const r = allocate(
    [
      { wallet: "A", points: 5, eligible: true },
      { wallet: "A", points: 5, eligible: true },
      { wallet: "B", points: 5, eligible: true },
    ],
    { pot: 10n, capBps: 10_000, minPayout: 1n },
  );
  assert.equal(r.allocations.length, 2);
  assert.equal(sum(r.allocations.map((a) => a.lamports)), 10n);
});
