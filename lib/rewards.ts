/**
 * Conviction Rewards — allocation math (pure; tests in tests/rewards.test.ts).
 *
 * Money rules:
 *   - The pot can never exceed verified, unspent funding (on-chain deposits into the
 *     project's reward wallet, recorded by signature). No deposits → no rewards.
 *   - Weights come from the epoch's approved contribution points only. Holding size,
 *     holding time and trading never affect a payout, so nobody has to keep or grow
 *     speculative exposure to be paid.
 *   - Ineligible wallets (Sybil-flagged, banned, too new) are excluded before splitting.
 *   - A per-wallet cap stops one wallet taking the whole pot; the excess is re-split.
 *   - Integer lamports, largest-remainder rounding: allocations sum exactly to the pot
 *     (minus any amount dropped below the minimum payout, which stays in the wallet).
 */

export interface Claimant {
  wallet: string;
  /** Contribution points earned in this epoch (contributionPoints of the epoch's approved items). */
  points: number;
  eligible: boolean;
  /** Why the wallet was excluded, when eligible is false. */
  reason?: string;
}

export interface AllocationOptions {
  /** Lamports to distribute this epoch. */
  pot: bigint;
  /** Max share per wallet in basis points (e.g. 2000 = 20%). 10000 = no cap. */
  capBps: number;
  /** Allocations under this many lamports are dropped (and the pot re-split). */
  minPayout: bigint;
}

export interface Allocation {
  wallet: string;
  points: number;
  lamports: bigint;
  shareBps: number;
}

export interface AllocationResult {
  allocations: Allocation[];
  excluded: { wallet: string; reason: string }[];
  /** Lamports not allocated (no claimants, all capped, or below minimum). Stays in the reward wallet. */
  unallocated: bigint;
}

/** Split `pot` by weights with exact integer lamports (largest remainder). */
export function splitByWeight(pot: bigint, weights: number[]): bigint[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (pot <= 0n || total <= 0) return weights.map(() => 0n);
  const w = weights.map((x) => BigInt(Math.round((x / total) * 1e6)));
  const wTotal = w.reduce((a, b) => a + b, 0n) || 1n;
  const base = w.map((x) => (pot * x) / wTotal);
  let rest = pot - base.reduce((a, b) => a + b, 0n);
  const order = w
    .map((x, i) => ({ i, rem: (pot * x) % wTotal }))
    .sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : a.i - b.i));
  for (let k = 0; rest > 0n && order.length; k = (k + 1) % order.length, rest--) base[order[k].i] += 1n;
  return base;
}

export function allocate(claimants: Claimant[], o: AllocationOptions): AllocationResult {
  const excluded = claimants.filter((c) => !c.eligible).map((c) => ({ wallet: c.wallet, reason: c.reason ?? "ineligible" }));
  let pool = claimants.filter((c) => c.eligible && c.points > 0);
  const seen = new Set<string>();
  pool = pool.filter((c) => (seen.has(c.wallet) ? false : (seen.add(c.wallet), true)));

  const cap = o.capBps >= 10_000 ? o.pot : (o.pot * BigInt(Math.max(0, o.capBps))) / 10_000n;
  for (let round = 0; round < 50; round++) {
    // Water-fill: capped wallets take the cap, everyone else splits what's left by points.
    const capped = new Set<string>();
    let lamports = new Map<string, bigint>();
    for (let iter = 0; iter < pool.length + 1; iter++) {
      const free = pool.filter((c) => !capped.has(c.wallet));
      const remaining = o.pot - cap * BigInt(capped.size);
      const parts = splitByWeight(remaining > 0n ? remaining : 0n, free.map((c) => c.points));
      lamports = new Map(pool.filter((c) => capped.has(c.wallet)).map((c) => [c.wallet, cap]));
      let newlyCapped = false;
      free.forEach((c, i) => {
        if (parts[i] > cap) {
          capped.add(c.wallet);
          newlyCapped = true;
        } else lamports.set(c.wallet, parts[i]);
      });
      if (!newlyCapped) break;
    }
    const small = pool.filter((c) => (lamports.get(c.wallet) ?? 0n) < o.minPayout);
    if (small.length && small.length < pool.length) {
      for (const s of small) excluded.push({ wallet: s.wallet, reason: "below minimum payout" });
      pool = pool.filter((c) => !small.includes(c));
      continue;
    }
    if (small.length === pool.length) {
      for (const s of small) excluded.push({ wallet: s.wallet, reason: "below minimum payout" });
      return { allocations: [], excluded, unallocated: o.pot };
    }
    const allocations = pool
      .map((c) => {
        const l = lamports.get(c.wallet) ?? 0n;
        return { wallet: c.wallet, points: c.points, lamports: l, shareBps: o.pot > 0n ? Number((l * 10_000n) / o.pot) : 0 };
      })
      .sort((a, b) => (b.lamports > a.lamports ? 1 : b.lamports < a.lamports ? -1 : a.wallet.localeCompare(b.wallet)));
    const spent = allocations.reduce((s, a) => s + a.lamports, 0n);
    return { allocations, excluded, unallocated: o.pot - spent };
  }
  return { allocations: [], excluded, unallocated: o.pot };
}

/** Pot for an epoch: the configured budget, never more than verified funding minus everything already allocated. */
export function epochPot(o: { budget: bigint; funded: bigint; alreadyAllocated: bigint }): bigint {
  const available = o.funded - o.alreadyAllocated;
  if (available <= 0n) return 0n;
  return o.budget < available ? o.budget : available;
}

/** Stable hash input for an allocation set, published with the epoch so anyone can recompute it. */
export function allocationManifest(epochId: string, pot: bigint, allocations: Allocation[]): string {
  return JSON.stringify({
    epoch: epochId,
    pot: pot.toString(),
    allocations: allocations.map((a) => [a.wallet, a.lamports.toString()]),
  });
}

/** Memo every payout transaction must carry, binding it to one published epoch. */
export const memoFor = (epochId: string) => `convictionpad:${epochId}`;
