-- ConvictionPad schema (Postgres / Supabase). Idempotent: safe to re-run.

create table if not exists tokens (
  mint            text primary key,
  name            text not null,
  symbol          text not null,
  image           text,
  description     text,
  venue           text not null,              -- pumpfun | meteora-dbc | raydium-launchlab | other
  -- creator verified on-chain (pump curve creator / DBC pool creator / launch signer). null = unclaimed listing
  creator         text,
  creator_proof   text,                       -- how the creator was verified
  launch_sig      text,                       -- launch transaction signature, when launched through ConvictionPad
  pool            text,                       -- DBC pool / bonding curve address
  token_program   text not null,
  decimals        int not null,
  links           jsonb not null default '{}',
  scoring         jsonb not null default '{}', -- partial ScoringConfig override
  epoch_days      int not null default 14,
  program_start   timestamptz not null default now(),
  min_hold_raw    text not null default '1',   -- dust floor for "holding" (raw units); never scales points
  reward_wallet   text,                        -- project wallet that holds and pays the reward budget
  reward_commitment_bps int not null default 0, -- disclosed % of creator revenue pledged to contributions
  reward_cap_bps  int not null default 2000,
  min_wallet_age_days int not null default 14,
  reviewers       text[] not null default '{}',
  listed_by       text not null,
  created_at      timestamptz not null default now()
);

create table if not exists contributions (
  id              text primary key,
  mint            text not null references tokens(mint) on delete cascade,
  wallet          text not null,
  type            text not null,
  title           text not null,
  url             text not null,
  url_hash        text not null,
  body            text not null default '',
  paid            boolean not null default false,  -- compensated promotion (must be disclosed)
  paid_by         text,
  status          text not null default 'pending', -- pending | approved | rejected
  quality         int,
  reject_reason   text,                            -- spam | duplicate | undisclosed-paid | low-effort | off-topic | other
  strike          boolean not null default false,
  reviewer        text,
  review_note     text,
  epoch           int not null,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz
);
create unique index if not exists contributions_unique_url on contributions(mint, url_hash);
create index if not exists contributions_wallet on contributions(wallet);
create index if not exists contributions_mint_status on contributions(mint, status);

create table if not exists proposals (
  id              text primary key,
  mint            text not null references tokens(mint) on delete cascade,
  author          text not null,
  title           text not null,
  body            text not null default '',
  options         jsonb not null,
  ends_at         timestamptz not null,
  epoch           int not null,
  created_at      timestamptz not null default now()
);

create table if not exists votes (
  proposal_id     text not null references proposals(id) on delete cascade,
  wallet          text not null,
  choice          int not null,
  message         text not null,       -- the exact signed message
  signature       text not null,       -- base58 ed25519 signature, verifiable by anyone
  epoch           int not null,
  created_at      timestamptz not null default now(),
  primary key (proposal_id, wallet)
);

-- Verified chain facts, cached
create table if not exists holdings (
  mint            text not null,
  wallet          text not null,
  balance_raw     text not null,
  since           timestamptz,         -- start of the current continuous holding period
  partial         boolean not null default false,
  checked_at      timestamptz not null default now(),
  primary key (mint, wallet)
);

create table if not exists wallet_age (
  wallet          text primary key,
  first_seen      timestamptz,
  partial         boolean not null default false,
  checked_at      timestamptz not null default now()
);

create table if not exists sybil_flags (
  mint            text not null,
  wallet          text not null,
  reason          text not null,
  flagged_by      text not null,
  created_at      timestamptz not null default now(),
  primary key (mint, wallet)
);

create table if not exists memberships (
  mint            text not null references tokens(mint) on delete cascade,
  wallet          text not null,
  joined_at       timestamptz not null default now(),
  primary key (mint, wallet)
);

-- Rewards: every lamport traced to an on-chain signature
create table if not exists reward_fundings (
  signature       text primary key,
  mint            text not null references tokens(mint) on delete cascade,
  wallet          text not null,       -- reward wallet credited
  lamports        bigint not null,
  source          text not null,       -- creator-fee-claim | transfer
  block_time      timestamptz,
  recorded_by     text not null,
  created_at      timestamptz not null default now()
);

create table if not exists reward_epochs (
  id              text primary key,
  mint            text not null references tokens(mint) on delete cascade,
  epoch           int not null,
  pot_lamports    bigint not null,
  manifest        text not null,       -- canonical JSON of allocations
  manifest_sha256 text not null,
  closed_by       text not null,
  created_at      timestamptz not null default now(),
  unique (mint, epoch)
);

create table if not exists reward_allocations (
  epoch_id        text not null references reward_epochs(id) on delete cascade,
  wallet          text not null,
  points          double precision not null,
  lamports        bigint not null,
  status          text not null default 'pending', -- pending | paid
  signature       text,
  paid_at         timestamptz,
  primary key (epoch_id, wallet)
);
create unique index if not exists reward_allocations_sig on reward_allocations(signature, wallet);

create table if not exists auth_nonces (
  nonce           text primary key,
  used_at         timestamptz not null default now()
);

create table if not exists audit_log (
  id              bigserial primary key,
  mint            text,
  actor           text not null,
  action          text not null,
  detail          jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index if not exists audit_log_mint on audit_log(mint, created_at desc);
