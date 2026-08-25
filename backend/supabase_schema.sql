-- EarthRelay case inbox. Run once in Supabase: SQL Editor → New query → Run.

create table if not exists earthrelay_cases (
  id text primary key,
  display_id text,
  title text,
  incident_type text,
  status text,
  priority text,
  lat double precision,
  lng double precision,
  address text,
  payload jsonb not null,
  original_jpg bytea,
  annotated_jpg bytea,
  created_at timestamptz,
  updated_at timestamptz
);

alter table earthrelay_cases enable row level security;

drop policy if exists earthrelay_cases_select on earthrelay_cases;
drop policy if exists earthrelay_cases_write on earthrelay_cases;

create policy earthrelay_cases_select on earthrelay_cases
  for select using (true);

create policy earthrelay_cases_write on earthrelay_cases
  for all using (true) with check (true);
