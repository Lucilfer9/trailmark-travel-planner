create table if not exists public.trip_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  title text not null default 'My trip',
  destination text not null default '',
  departure_date date,
  return_date date,
  travelers text not null default '2',
  stops jsonb not null default '[]'::jsonb,
  checklist_groups jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_plans_valid_dates check (
    return_date is null or departure_date is null or return_date >= departure_date
  ),
  constraint trip_plans_stops_array check (jsonb_typeof(stops) = 'array'),
  constraint trip_plans_checklist_groups_array check (
    jsonb_typeof(checklist_groups) = 'array'
  )
);

alter table public.trip_plans enable row level security;

revoke all on table public.trip_plans from anon;
grant select, insert, update, delete on table public.trip_plans to authenticated;

create policy "Users can view their own trip plan"
on public.trip_plans for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own trip plan"
on public.trip_plans for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own trip plan"
on public.trip_plans for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own trip plan"
on public.trip_plans for delete to authenticated
using ((select auth.uid()) = user_id);
