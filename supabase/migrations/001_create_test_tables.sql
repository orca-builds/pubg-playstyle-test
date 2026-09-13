-- Supabase SQL Editor: run once as the project database administrator.
-- No browser policies: all application writes will go through a trusted server.
begin;

create table public.test_attempts (
  id uuid primary key, -- Same UUID as the application's attempt_id; no DB fallback.
  -- Server-generated token's SHA-256 lowercase hex digest; never store the raw token.
  write_token_hash text not null check (write_token_hash ~ '^[0-9a-f]{64}$'),
  anonymous_id uuid not null,
  session_id uuid not null,
  test_version text not null check (btrim(test_version) <> ''),
  question_order_key text not null check (btrim(question_order_key) <> ''),
  initial_source text not null,
  initial_medium text not null,
  initial_campaign text not null,
  initial_referrer text not null,
  landing_page text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  is_completed boolean not null default false,
  is_retry boolean not null default false,
  duration_seconds numeric(14,3) check (duration_seconds >= 0 and duration_seconds <> 'NaN'::numeric),
  last_question_index integer not null default 0 check (last_question_index >= 0),
  main_type text check (btrim(main_type) <> ''),
  combat_score integer check (combat_score >= 0),
  position_score integer check (position_score >= 0),
  frontline_score integer check (frontline_score >= 0),
  support_score integer check (support_score >= 0),
  pressure_score integer check (pressure_score >= 0),
  design_score integer check (design_score >= 0),
  risk_score integer check (risk_score >= 0),
  safe_score integer check (safe_score >= 0),
  main_body_score integer check (main_body_score >= 0),
  flank_score integer check (flank_score >= 0),
  hotdrop_score integer check (hotdrop_score >= 0),
  tail_score integer check (tail_score >= 0),
  full_loot_score integer check (full_loot_score >= 0),
  fast_loot_score integer check (fast_loot_score >= 0),
  center_score integer check (center_score >= 0),
  edge_score integer check (edge_score >= 0),
  standard_gear_score integer check (standard_gear_score >= 0),
  special_gear_score integer check (special_gear_score >= 0),
  top_sub_tag_1 text,
  top_sub_tag_2 text,
  answer_change_count integer not null default 0 check (answer_change_count >= 0),
  back_count integer not null default 0 check (back_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint test_attempts_completion_check check (
    (not is_completed and completed_at is null and duration_seconds is null)
    or (is_completed and completed_at is not null and completed_at >= started_at
      and duration_seconds is not null and main_type is not null
      and num_nonnulls(combat_score, position_score, frontline_score, support_score,
        pressure_score, design_score, risk_score, safe_score, main_body_score,
        flank_score, hotdrop_score, tail_score, full_loot_score, fast_loot_score,
        center_score, edge_score, standard_gear_score, special_gear_score) = 18)
  )
);

create table public.answers (
  attempt_id uuid not null references public.test_attempts(id) on delete cascade,
  question_id text not null check (btrim(question_id) <> ''),
  answer_id text not null check (btrim(answer_id) <> ''),
  answered_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create index test_attempts_anonymous_id_idx on public.test_attempts (anonymous_id);
create index test_attempts_test_version_idx on public.test_attempts (test_version);
create index test_attempts_created_at_idx on public.test_attempts (created_at);
create index test_attempts_initial_source_idx on public.test_attempts (initial_source);
-- Completion analysis by time; avoid a low-selectivity boolean-only index.
create index test_attempts_completed_created_at_idx on public.test_attempts (created_at)
  where is_completed = true;
-- answers PK already supports attempt_id lookups and the upsert conflict target.

create function public.set_test_table_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger test_attempts_updated_at
before update on public.test_attempts
for each row execute function public.set_test_table_updated_at();
create trigger answers_updated_at
before update on public.answers
for each row execute function public.set_test_table_updated_at();

alter table public.test_attempts enable row level security;
alter table public.answers enable row level security;
revoke all on table public.test_attempts, public.answers from public, anon, authenticated;
revoke all on table public.test_attempts, public.answers from service_role;
grant select, insert, update on table public.test_attempts, public.answers to service_role;
revoke all on function public.set_test_table_updated_at() from public, anon, authenticated;
-- service_role bypasses RLS; ownership must be checked by the future server API.
-- No DELETE grant and no permissive policies are needed for this MVP.
commit;
