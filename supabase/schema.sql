-- =====================================================================
-- GymLog: base de datos
-- Pega TODO este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tablas ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Atleta',
  share_records boolean not null default true,
  kcal_goal int not null default 2500,
  protein_goal int not null default 150,
  carbs_goal int not null default 280,
  fat_goal int not null default 80,
  rest_seconds int not null default 90,
  created_at timestamptz not null default now()
);

-- user_id vacío = ejercicio común para todos
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  muscle text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  weight numeric(6,2) not null check (weight >= 0),
  reps int not null check (reps > 0),
  created_at timestamptz not null default now()
);
create index if not exists workout_sets_user_ex on public.workout_sets (user_id, exercise_id, created_at);
create index if not exists workout_sets_workout on public.workout_sets (workout_id);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  exercise_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Alimentos guardados (valores por 100 g)
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kcal numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  last_grams numeric not null default 100,
  created_at timestamptz not null default now()
);

-- Lo que comes cada día (valores totales ya calculados)
create table if not exists public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  meal text not null check (meal in ('desayuno','comida','merienda','cena','snacks')),
  name text not null,
  grams numeric not null default 0,
  kcal numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists food_entries_user_day on public.food_entries (user_id, day);

create table if not exists public.body_weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  weight numeric(5,2) not null check (weight > 0),
  unique (user_id, day)
);

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  waist numeric(5,1),
  chest numeric(5,1),
  arm numeric(5,1),
  leg numeric(5,1),
  unique (user_id, day)
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------- Perfil automático al registrarse ----------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Seguridad: cada uno solo ve lo suyo ----------

alter table public.profiles      enable row level security;
alter table public.exercises     enable row level security;
alter table public.workouts      enable row level security;
alter table public.workout_sets  enable row level security;
alter table public.templates     enable row level security;
alter table public.foods         enable row level security;
alter table public.food_entries  enable row level security;
alter table public.body_weights  enable row level security;
alter table public.measurements  enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;

create or replace function public.is_member(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid())
$$;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "see common and own exercises" on public.exercises;
create policy "see common and own exercises" on public.exercises for select
  using (user_id is null or user_id = auth.uid());
drop policy if exists "manage own exercises" on public.exercises;
create policy "manage own exercises" on public.exercises for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['workouts','workout_sets','templates','foods','food_entries','body_weights','measurements'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

drop policy if exists "members see group" on public.groups;
create policy "members see group" on public.groups for select using (public.is_member(id));

drop policy if exists "members see members" on public.group_members;
create policy "members see members" on public.group_members for select using (public.is_member(group_id));
drop policy if exists "leave group" on public.group_members;
create policy "leave group" on public.group_members for delete using (user_id = auth.uid());

-- ---------- Funciones del grupo de amigos ----------

create or replace function public.create_group(p_name text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups; code text;
begin
  if auth.uid() is null then raise exception 'No has iniciado sesión'; end if;
  loop
    code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from groups where invite_code = code);
  end loop;
  insert into groups (name, invite_code, created_by) values (trim(p_name), code, auth.uid()) returning * into g;
  insert into group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end $$;

create or replace function public.join_group(p_code text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'No has iniciado sesión'; end if;
  select * into g from groups where invite_code = upper(trim(p_code));
  if g.id is null then raise exception 'Código no válido'; end if;
  insert into group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return g;
end $$;

create or replace function public.group_people(gid uuid)
returns table (user_id uuid, display_name text, joined_at timestamptz)
language sql security definer stable set search_path = public as $$
  select m.user_id, p.display_name, m.joined_at
  from group_members m join profiles p on p.id = m.user_id
  where m.group_id = gid and public.is_member(gid)
  order by m.joined_at
$$;

-- Mejor marca de cada persona (yo + mis amigos) en un ejercicio
create or replace function public.exercise_leaderboard(p_exercise uuid)
returns table (user_id uuid, display_name text, weight numeric, reps int, done_at timestamptz, is_me boolean)
language sql security definer stable set search_path = public as $$
  with mates as (
    select auth.uid() as uid
    union
    select gm2.user_id from group_members gm1
    join group_members gm2 on gm1.group_id = gm2.group_id
    where gm1.user_id = auth.uid()
  )
  select distinct on (s.user_id)
    s.user_id, p.display_name, s.weight, s.reps, s.created_at, s.user_id = auth.uid()
  from workout_sets s
  join mates m on m.uid = s.user_id
  join profiles p on p.id = s.user_id
  where s.exercise_id = p_exercise and (p.share_records or s.user_id = auth.uid())
  order by s.user_id, s.weight desc, s.reps desc, s.created_at
$$;

-- Récords batidos por mis amigos en los últimos 7 días
create or replace function public.group_recent_prs()
returns table (display_name text, exercise_name text, weight numeric, reps int, done_at timestamptz)
language sql security definer stable set search_path = public as $$
  with mates as (
    select distinct gm2.user_id as uid from group_members gm1
    join group_members gm2 on gm1.group_id = gm2.group_id
    where gm1.user_id = auth.uid() and gm2.user_id <> auth.uid()
  ),
  ranked as (
    select s.*, max(s.weight) over (
      partition by s.user_id, s.exercise_id order by s.created_at
      rows between unbounded preceding and 1 preceding) as prev_max
    from workout_sets s join mates m on m.uid = s.user_id
  ),
  prs as (
    select distinct on (r.user_id, r.exercise_id) r.*
    from ranked r
    where r.prev_max is not null and r.weight > r.prev_max and r.created_at > now() - interval '7 days'
    order by r.user_id, r.exercise_id, r.weight desc
  )
  select p.display_name, e.name, x.weight, x.reps, x.created_at
  from prs x join profiles p on p.id = x.user_id join exercises e on e.id = x.exercise_id
  where p.share_records
  order by x.created_at desc
  limit 10
$$;

-- ---------- Permisos para la app ----------

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.create_group(text), public.join_group(text) from anon;

-- ---------- Ejercicios comunes ----------

insert into public.exercises (name, muscle)
select v.name, v.muscle from (values
  ('Press banca', 'Pecho'), ('Press inclinado con mancuernas', 'Pecho'), ('Aperturas con mancuernas', 'Pecho'),
  ('Fondos en paralelas', 'Pecho'), ('Cruce de poleas', 'Pecho'),
  ('Dominadas', 'Espalda'), ('Remo con barra', 'Espalda'), ('Remo con mancuerna', 'Espalda'),
  ('Jalón al pecho', 'Espalda'), ('Remo en polea baja', 'Espalda'), ('Peso muerto', 'Espalda'),
  ('Sentadilla', 'Piernas'), ('Prensa', 'Piernas'), ('Zancadas', 'Piernas'), ('Extensión de cuádriceps', 'Piernas'),
  ('Curl femoral', 'Piernas'), ('Peso muerto rumano', 'Piernas'), ('Gemelos de pie', 'Piernas'),
  ('Hip thrust', 'Glúteos'), ('Patada de glúteo en polea', 'Glúteos'),
  ('Press militar', 'Hombros'), ('Press con mancuernas sentado', 'Hombros'), ('Elevaciones laterales', 'Hombros'),
  ('Pájaros', 'Hombros'), ('Face pull', 'Hombros'),
  ('Curl con barra', 'Bíceps'), ('Curl con mancuernas', 'Bíceps'), ('Curl martillo', 'Bíceps'),
  ('Press francés', 'Tríceps'), ('Extensión de tríceps en polea', 'Tríceps'), ('Press cerrado', 'Tríceps'),
  ('Plancha (seg = reps)', 'Core'), ('Crunch en polea', 'Core'), ('Elevación de piernas colgado', 'Core')
) as v(name, muscle)
where not exists (select 1 from public.exercises e where e.user_id is null and e.name = v.name);
