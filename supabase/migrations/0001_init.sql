-- Comments table
-- Serves as the queue, the activity feed source, and the agent's state ledger
create table comments (
  id uuid primary key default gen_random_uuid(),
  edit_id text not null,
  text text not null,
  status text not null default 'queued',
  ip_hash text not null,
  reasoning text,
  patch jsonb,
  pr_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at current automatically
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger comments_updated_at
  before update on comments
  for each row execute function update_updated_at();

-- Enable Realtime so the activity feed receives live updates
alter publication supabase_realtime add table comments;

-- Rate limits table
-- Tracks per-IP submission counts within a rolling window
create table rate_limits (
  ip_hash text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);
