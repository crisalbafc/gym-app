-- =====================================================================
-- GymLog: plan semanal de dieta (recetas, raciones y lista de la compra)
-- Pega este archivo en Supabase > SQL Editor > New query > Run (base PERSONAL).
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

create table if not exists public.diet_plans (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,   -- { plan, chk, z, src }
  updated_at timestamptz not null default now()
);
alter table public.diet_plans enable row level security;
drop policy if exists "own rows" on public.diet_plans;
create policy "own rows" on public.diet_plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.diet_plans to authenticated;
