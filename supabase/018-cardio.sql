-- =====================================================================
-- GymLog: sesiones de CARDIO (correr, ciclismo; preparado para elíptica, escaleras…)
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Vale para la base personal y la de negocio. Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.cardio_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null default current_date,
  sport text not null check (sport in ('correr', 'ciclismo', 'eliptica', 'escaleras', 'remo', 'otro')),
  surface text check (surface in ('exterior', 'cinta', 'indoor')),           -- correr: exterior/cinta · ciclismo: exterior/indoor
  kind text check (kind in ('trote_suave', 'calidad', 'tirada_larga')),      -- solo correr
  quality_type text check (quality_type in ('series', 'progresiones', 'fartlek', 'cuestas', 'otro')),
  details text,                    -- ej. "6x1000 a 4:10, rec 2'"
  duration_s int check (duration_s is null or duration_s > 0),
  distance_km numeric(6,2) check (distance_km is null or distance_km >= 0),
  avg_pace_s int,                  -- segundos por km (correr)
  hr_max int check (hr_max is null or hr_max between 60 and 240),
  elevation_m int,                 -- desnivel positivo (exterior)
  incline_pct numeric(4,1),        -- inclinación (cinta)
  power_w int,                     -- potencia media (ciclismo)
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists cardio_user_day on public.cardio_sessions (user_id, day desc);

alter table public.cardio_sessions enable row level security;
drop policy if exists "own rows" on public.cardio_sessions;
create policy "own rows" on public.cardio_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Si existe el módulo de entrenador, el entrenador lo ve igual que los entrenos
do $$
begin
  if exists (select 1 from pg_proc where proname = 'coach_sees') then
    execute 'drop policy if exists "coach reads" on public.cardio_sessions';
    execute 'create policy "coach reads" on public.cardio_sessions for select using (public.coach_sees(user_id, ''workouts''))';
  end if;
end $$;

grant select, insert, update, delete on public.cardio_sessions to authenticated;
