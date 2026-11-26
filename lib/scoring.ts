/**
 * Proof of Conviction — scoring engine (pure, deterministic, versioned).
 *
 * Every number shown on the site is produced here from verifiable inputs:
 *   - holding duration: read from the wallet's token account history on-chain
 *   - contributions: submissions approved by the token's reviewers (public log)
 *   - governance: wallet-signed votes on token proposals (signatures stored)
 *   - participation / consistency: derived from the two above, per epoch
 *
 * Design rules (enforced by construction, covered in tests/scoring.test.ts):
 *   1. Balance size never adds points. Holding counts time above a dust floor,
 *      so nobody scores higher by buying more.
 *   2. Trading volume is not an input at all.
 *   3. Within an epoch each extra contribution counts half the previous one,
 *      so volume spam has near-zero marginal value.
 *   4. Rejections for spam / undisclosed paid promotion are strikes that cut
 *      the contribution component.
 *   5. Reward weights (lib/rewards.ts) use contribution points only — holding
 *      builds reputation but is never required for rewards.
 */

export const SCORING_VERSION = "poc-1";

export const COMPONENTS = ["holding", "participation", "contributions", "governance", "consistency"] as const;
export type Component = (typeof COMPONENTS)[number];

export const CONTRIBUTION_TYPES = ["artwork", "meme", "research", "education", "tooling", "translation", "community"] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

export interface ScoringConfig {
  /** Max points per component; the sum is the max score (default 1000). */
  weights: Record<Component, number>;
  /** Multiplier per contribution type, applied to the reviewer's 1–5 quality grade. */
  typeWeights: Record<ContributionType, number>;
  /** Days of continuous holding that earn the full holding component. */
  holdingFullDays: number;
  /** Contribution points at which the component reaches ~63% (1 − 1/e). */
  contributionScale: number;
  /** Governance points at which the component reaches ~63%. */
  governanceScale: number;
  /** Active epochs that earn the full participation component. */
  participationFullEpochs: number;
  /** Window (epochs) used for consistency. */
  consistencyWindow: number;
  /** Each strike removes this fraction of the contribution component. */
  strikePenalty: number;
}

export const DEFAULT_CONFIG: ScoringConfig = {
  weights: { holding: 250, participation: 150, contributions: 350, governance: 150, consistency: 100 },
  typeWeights: { artwork: 3, meme: 1.5, research: 4, education: 3.5, tooling: 4, translation: 2, community: 2 },
  holdingFullDays: 365,
  contributionScale: 40,
  governanceScale: 10,
  participationFullEpochs: 12,
  consistencyWindow: 8,
  strikePenalty: 0.25,
};

export interface ApprovedContribution {
  type: ContributionType;
  /** Reviewer grade, integer 1–5. */
  quality: number;
  epoch: number;
}

export interface MemberInputs {
  /** Continuous verified holding in days; null = not currently holding (or unverified). */
  holdingDays: number | null;
  /** True when the history scan hit its cap, so holdingDays is a lower bound. */
  holdingPartial?: boolean;
  approved: ApprovedContribution[];
  /** Rejections for spam, duplicates or undisclosed paid promotion. */
  strikes: number;
  /** Epoch numbers of the wallet's signed votes. */
  voteEpochs: number[];
  /** Proposals the wallet authored that reached the meaningful-turnout threshold. */
  meaningfulProposals: number;
  /** The token's current epoch (0-based). */
  currentEpoch: number;
}

export interface ComponentResult {
  component: Component;
  points: number;
  max: number;
  /** Human-readable formula with the actual inputs substituted. */
  explain: string;
  inputs: Record<string, number | string | boolean | null>;
}

export interface ScoreResult {
  version: string;
  total: number;
  max: number;
  components: ComponentResult[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function validateConfig(c: ScoringConfig): string[] {
  const errors: string[] = [];
  for (const k of COMPONENTS) {
    const w = c.weights[k];
    if (!Number.isFinite(w) || w < 0 || w > 1000) errors.push(`weights.${k} must be 0–1000`);
  }
  const total = COMPONENTS.reduce((s, k) => s + c.weights[k], 0);
  if (total !== 1000) errors.push(`weights must total 1000 (got ${total})`);
  for (const t of CONTRIBUTION_TYPES) {
    const w = c.typeWeights[t];
    if (!Number.isFinite(w) || w < 0 || w > 10) errors.push(`typeWeights.${t} must be 0–10`);
  }
  if (!(c.holdingFullDays >= 7 && c.holdingFullDays <= 3650)) errors.push("holdingFullDays must be 7–3650");
  if (!(c.contributionScale > 0)) errors.push("contributionScale must be > 0");
  if (!(c.governanceScale > 0)) errors.push("governanceScale must be > 0");
  if (!(c.participationFullEpochs >= 1)) errors.push("participationFullEpochs must be ≥ 1");
  if (!(c.consistencyWindow >= 2 && c.consistencyWindow <= 52)) errors.push("consistencyWindow must be 2–52");
  if (!(c.strikePenalty >= 0 && c.strikePenalty <= 1)) errors.push("strikePenalty must be 0–1");
  return errors;
}

export function mergeConfig(partial: unknown): ScoringConfig {
  const p = (partial && typeof partial === "object" ? partial : {}) as Partial<ScoringConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...p,
    weights: { ...DEFAULT_CONFIG.weights, ...(p.weights ?? {}) },
    typeWeights: { ...DEFAULT_CONFIG.typeWeights, ...(p.typeWeights ?? {}) },
  };
}

/** Raw points of one contribution: type weight × reviewer quality (1–5). */
export function contributionValue(c: ApprovedContribution, cfg: ScoringConfig): number {
  const q = Math.max(1, Math.min(5, Math.round(c.quality)));
  return (cfg.typeWeights[c.type] ?? 0) * q;
}

/**
 * Diminishing returns per epoch: sort the epoch's items by value, the k-th counts × 0.5^(k-1).
 * Ten low-effort memes in one week are worth less than two good pieces.
 */
export function contributionPoints(items: ApprovedContribution[], cfg: ScoringConfig): number {
  const byEpoch = new Map<number, number[]>();
  for (const c of items) {
    const list = byEpoch.get(c.epoch) ?? [];
    list.push(contributionValue(c, cfg));
    byEpoch.set(c.epoch, list);
  }
  let total = 0;
  for (const values of byEpoch.values()) {
    values.sort((a, b) => b - a);
    values.forEach((v, k) => (total += v * 0.5 ** k));
  }
  return total;
}

export function scoreMember(m: MemberInputs, cfg: ScoringConfig = DEFAULT_CONFIG): ScoreResult {
  const W = cfg.weights;
  const comps: ComponentResult[] = [];

  // 1. Holding — time only, log-scaled, capped. Amount never matters (above the dust floor).
  const days = m.holdingDays === null ? 0 : Math.max(0, m.holdingDays);
  const hFrac = days === 0 ? 0 : clamp01(Math.log1p(days) / Math.log1p(cfg.holdingFullDays));
  comps.push({
    component: "holding",
    points: round1(W.holding * hFrac),
    max: W.holding,
    explain:
      m.holdingDays === null
        ? "Not currently holding (or not yet verified) → 0. Holding adds reputation only; rewards never require it."
        : `${W.holding} × ln(1+${round1(days)}d) / ln(1+${cfg.holdingFullDays}d)${m.holdingPartial ? " (history cap hit: days is a lower bound)" : ""}`,
    inputs: { holdingDays: m.holdingDays === null ? null : round1(days), fullDays: cfg.holdingFullDays, lowerBound: !!m.holdingPartial },
  });

  // 2. Participation — distinct epochs with any verified activity.
  const active = new Set<number>([...m.approved.map((c) => c.epoch), ...m.voteEpochs]);
  const pFrac = clamp01(Math.log1p(active.size) / Math.log1p(cfg.participationFullEpochs));
  comps.push({
    component: "participation",
    points: round1(W.participation * pFrac),
    max: W.participation,
    explain: `${W.participation} × ln(1+${active.size} active epochs) / ln(1+${cfg.participationFullEpochs})`,
    inputs: { activeEpochs: active.size, fullEpochs: cfg.participationFullEpochs },
  });

  // 3. Contributions — reviewer-graded, diminishing per epoch, strikes penalize.
  const raw = contributionPoints(m.approved, cfg);
  const strikeMult = Math.max(0, 1 - cfg.strikePenalty * m.strikes);
  const cFrac = (1 - Math.exp(-raw / cfg.contributionScale)) * strikeMult;
  comps.push({
    component: "contributions",
    points: round1(W.contributions * cFrac),
    max: W.contributions,
    explain: `${W.contributions} × (1 − e^(−${round1(raw)}/${cfg.contributionScale})) × (1 − ${cfg.strikePenalty}×${m.strikes} strikes)`,
    inputs: { approved: m.approved.length, rawPoints: round1(raw), strikes: m.strikes },
  });

  // 4. Governance — signed votes (1 each) + proposals that reached meaningful turnout (3 each).
  const g = m.voteEpochs.length + 3 * m.meaningfulProposals;
  const gFrac = 1 - Math.exp(-g / cfg.governanceScale);
  comps.push({
    component: "governance",
    points: round1(W.governance * gFrac),
    max: W.governance,
    explain: `${W.governance} × (1 − e^(−(${m.voteEpochs.length} votes + 3×${m.meaningfulProposals} proposals)/${cfg.governanceScale}))`,
    inputs: { votes: m.voteEpochs.length, meaningfulProposals: m.meaningfulProposals },
  });

  // 5. Consistency — share of recent epochs (since first contribution) with an approved contribution.
  const contribEpochs = new Set(m.approved.map((c) => c.epoch));
  let consFrac = 0;
  let windowSize = 0;
  let hits = 0;
  if (contribEpochs.size > 0) {
    const first = Math.min(...contribEpochs);
    const start = Math.max(first, m.currentEpoch - cfg.consistencyWindow + 1);
    windowSize = m.currentEpoch - start + 1;
    for (let e = start; e <= m.currentEpoch; e++) if (contribEpochs.has(e)) hits++;
    // A brand-new member can't look "perfectly consistent" after one epoch: ramp in over 3 epochs.
    consFrac = (hits / windowSize) * Math.min(1, windowSize / 3);
  }
  comps.push({
    component: "consistency",
    points: round1(W.consistency * consFrac),
    max: W.consistency,
    explain:
      windowSize === 0
        ? "No approved contributions yet → 0"
        : `${W.consistency} × ${hits}/${windowSize} epochs with approved work × min(1, ${windowSize}/3)`,
    inputs: { epochsWithWork: hits, window: windowSize },
  });

  const total = Math.round(comps.reduce((s, c) => s + c.points, 0));
  return { version: SCORING_VERSION, total, max: COMPONENTS.reduce((s, k) => s + W[k], 0), components: comps };
}

/**
 * Portable conviction: your strongest community counts in full, every other one adds 25%.
 * Reputation travels between launches without letting a single wallet farm many tiny communities.
 */
export function globalScore(communityScores: number[]): { total: number; explain: string } {
  const s = [...communityScores].filter((x) => x > 0).sort((a, b) => b - a);
  if (!s.length) return { total: 0, explain: "No community activity yet" };
  const rest = s.slice(1).reduce((a, b) => a + b, 0);
  const total = Math.min(1000, Math.round(s[0] + 0.25 * rest));
  return { total, explain: `min(1000, best ${s[0]} + 25% × others ${Math.round(rest)})` };
}

export interface Achievement {
  id: string;
  label: string;
  detail: string;
}

export function achievements(a: {
  maxHoldingDays: number;
  approvedByType: Partial<Record<ContributionType, number>>;
  approvedTotal: number;
  votes: number;
  longestStreak: number;
  communitiesOver100: number;
}): Achievement[] {
  const out: Achievement[] = [];
  if (a.approvedTotal >= 1) out.push({ id: "first-contribution", label: "First contribution", detail: "A reviewer approved your first piece of work" });
  if ((a.approvedByType.research ?? 0) + (a.approvedByType.education ?? 0) >= 3) out.push({ id: "scholar", label: "Scholar", detail: "3+ approved research or education pieces" });
  if ((a.approvedByType.artwork ?? 0) >= 3) out.push({ id: "artist", label: "Artist", detail: "3+ approved original artworks" });
  if ((a.approvedByType.tooling ?? 0) >= 1) out.push({ id: "builder", label: "Builder", detail: "Shipped approved tooling for a community" });
  if (a.votes >= 10) out.push({ id: "voice", label: "Voice", detail: "10+ signed governance votes" });
  if (a.longestStreak >= 4) out.push({ id: "consistent", label: "Consistent", detail: "Approved work in 4 consecutive epochs" });
  if (a.maxHoldingDays >= 90) out.push({ id: "steady-90", label: "Steady hand", detail: "Verified 90+ days of continuous holding" });
  if (a.maxHoldingDays >= 365) out.push({ id: "steady-365", label: "One year", detail: "Verified 365+ days of continuous holding" });
  if (a.communitiesOver100 >= 3) out.push({ id: "multi", label: "Multi-community", detail: "Conviction ≥ 100 in 3+ communities" });
  return out;
}

export function longestStreak(epochs: number[]): number {
  const s = [...new Set(epochs)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < s.length; i++) {
    run = i > 0 && s[i] === s[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** Epoch index for a timestamp, given the token's program start and epoch length. */
export function epochOf(at: number, startMs: number, epochDays: number): number {
  return Math.max(0, Math.floor((at - startMs) / (epochDays * 86_400_000)));
}
