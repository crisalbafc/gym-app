-- =====================================================================
-- GymLog Coach: tipo de centro + módulos, grupos, rutinas de grupo,
-- sesiones, asistencia y modo sesión en directo
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Requisito: 012-entrenador.sql. Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------- El centro (de momento, un centro por entrenador) ----------
alter table public.coaches add column if not exists center_name text;
alter table public.coaches add column if not exists center_type text not null default 'maquinas'
  check (center_type in ('maquinas', 'reducidas', 'box', 'yoga', 'baile', 'otro'));
alter table public.coaches add column if not exists modules text[] not null default array['seguimiento'];

create or replace function public.update_center(p_name text, p_type text, p_modules text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  update coaches set center_name = nullif(trim(p_name), ''), center_type = p_type, modules = p_modules
  where user_id = auth.uid();
  if not found then raise exception 'No eres entrenador'; end if;
end $$;

-- ---------- Grupos ----------
create table if not exists public.training_groups (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(user_id) on delete cascade,
  name text not null,
  schedule text,
  capacity int not null default 8 check (capacity between 1 and 50),
  created_at timestamptz not null default now()
);

create table if not exists public.training_group_members (
  group_id uuid not null references public.training_groups(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, client_id)
);

-- Rutinas del grupo (se copian a cada miembro como rutina asignada)
create table if not exists public.group_routines (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.training_groups(id) on delete cascade,
  name text not null,
  plan jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.templates add column if not exists group_routine_id uuid references public.group_routines(id) on delete cascade;

-- Sesiones y asistencia
create table if not exists public.group_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.training_groups(id) on delete cascade,
  coach_id uuid not null default auth.uid() references public.coaches(user_id) on delete cascade,
  routine_id uuid references public.group_routines(id) on delete set null,
  starts_at timestamptz not null default now(),
  status text not null default 'en_curso' check (status in ('en_curso', 'terminada')),
  created_at timestamptz not null default now()
);
create table if not exists public.session_attendance (
  session_id uuid not null references public.group_sessions(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  present boolean not null default true,
  workout_id uuid references public.workouts(id) on delete set null,
  primary key (session_id, client_id)
);

-- Entrenos que el entrenador apunta por el cliente en una sesión de grupo
alter table public.workouts add column if not exists session_id uuid references public.group_sessions(id) on delete set null;

alter table public.training_groups enable row level security;
alter table public.training_group_members enable row level security;
alter table public.group_routines enable row level security;
alter table public.group_sessions enable row level security;
alter table public.session_attendance enable row level security;

create or replace function public.owns_group(p_group uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from training_groups g where g.id = p_group and g.coach_id = auth.uid())
$$;
create or replace function public.owns_session(p_session uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from group_sessions s where s.id = p_session and s.coach_id = auth.uid())
$$;

drop policy if exists "coach groups" on public.training_groups;
create policy "coach groups" on public.training_groups for all
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
drop policy if exists "member sees own groups" on public.training_groups;
create policy "member sees own groups" on public.training_groups for select
  using (exists (select 1 from training_group_members m where m.group_id = training_groups.id and m.client_id = auth.uid()));

drop policy if exists "coach members" on public.training_group_members;
create policy "coach members" on public.training_group_members for all
  using (public.owns_group(group_id))
  with check (public.owns_group(group_id) and public.coach_sees(client_id, 'any'));
drop policy if exists "member sees self" on public.training_group_members;
create policy "member sees self" on public.training_group_members for select using (client_id = auth.uid());

drop policy if exists "coach routines" on public.group_routines;
create policy "coach routines" on public.group_routines for all
  using (public.owns_group(group_id)) with check (public.owns_group(group_id));

drop policy if exists "coach sessions" on public.group_sessions;
create policy "coach sessions" on public.group_sessions for all
  using (coach_id = auth.uid()) with check (coach_id = auth.uid() and public.owns_group(group_id));

drop policy if exists "coach attendance" on public.session_attendance;
create policy "coach attendance" on public.session_attendance for all
  using (public.owns_session(session_id))
  with check (public.owns_session(session_id) and public.coach_sees(client_id, 'any'));
drop policy if exists "member sees own attendance" on public.session_attendance;
create policy "member sees own attendance" on public.session_attendance for select using (client_id = auth.uid());

-- El entrenador puede crear/editar los entrenos de SUS sesiones (si el cliente comparte entrenos)
drop policy if exists "coach session workouts" on public.workouts;
create policy "coach session workouts" on public.workouts for all
  using (session_id is not null and public.owns_session(session_id) and public.coach_sees(user_id, 'workouts'))
  with check (session_id is not null and public.owns_session(session_id) and public.coach_sees(user_id, 'workouts'));

create or replace function public.coach_owns_workout(p_workout uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from workouts w join group_sessions s on s.id = w.session_id
                 where w.id = p_workout and s.coach_id = auth.uid())
$$;
drop policy if exists "coach session sets" on public.workout_sets;
create policy "coach session sets" on public.workout_sets for all
  using (public.coach_owns_workout(workout_id) and public.coach_sees(user_id, 'workouts'))
  with check (public.coach_owns_workout(workout_id) and public.coach_sees(user_id, 'workouts'));

-- ---------- Rutina de grupo -> copia en cada miembro ----------
create or replace function public.sync_group_routine(p_routine uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int;
begin
  select gr.*, g.coach_id into r from group_routines gr join training_groups g on g.id = gr.group_id where gr.id = p_routine;
  if r.id is null or r.coach_id <> auth.uid() then raise exception 'No es tu grupo'; end if;
  delete from templates where group_routine_id = p_routine;
  insert into templates (user_id, name, exercise_ids, plan, assigned_by, group_routine_id)
  select m.client_id, r.name,
         coalesce((select array_agg((e->>'exercise_id')::uuid) from jsonb_array_elements(r.plan) e), '{}'),
         r.plan, auth.uid(), p_routine
  from training_group_members m where m.group_id = r.group_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Al cambiar los miembros de un grupo, se re-sincronizan sus rutinas
create or replace function public.sync_group_routines(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if not public.owns_group(p_group) then raise exception 'No es tu grupo'; end if;
  for r in select id from group_routines where group_id = p_group loop
    perform public.sync_group_routine(r);
  end loop;
end $$;

-- ---------- Resumen de grupos ----------
create or replace function public.groups_overview()
returns table (id uuid, name text, schedule text, capacity int, members int, sessions_4w int, attendance_4w numeric, last_session timestamptz)
language sql security definer stable set search_path = public as $$
  select g.id, g.name, g.schedule, g.capacity,
    (select count(*)::int from training_group_members m where m.group_id = g.id),
    (select count(*)::int from group_sessions s where s.group_id = g.id and s.starts_at > now() - interval '28 days'),
    (select round(100.0 * avg(case when a.present then 1 else 0 end)) from session_attendance a
       join group_sessions s on s.id = a.session_id where s.group_id = g.id and s.starts_at > now() - interval '28 days'),
    (select max(s.starts_at) from group_sessions s where s.group_id = g.id)
  from training_groups g where g.coach_id = auth.uid()
  order by g.name
$$;

-- Al quitar a un cliente (se desconecta), sale de los grupos de ese entrenador
create or replace function public.on_coach_client_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from training_group_members m using training_groups g
  where m.group_id = g.id and g.coach_id = old.coach_id and m.client_id = old.client_id;
  delete from templates where user_id = old.client_id and assigned_by = old.coach_id;
  return old;
end $$;
drop trigger if exists coach_client_removed on public.coach_clients;
create trigger coach_client_removed after delete on public.coach_clients
  for each row execute function public.on_coach_client_removed();

grant select, insert, update, delete on public.training_groups, public.training_group_members,
  public.group_routines, public.group_sessions, public.session_attendance to authenticated;
revoke execute on function public.update_center(text, text, text[]), public.owns_group(uuid), public.owns_session(uuid),
  public.coach_owns_workout(uuid), public.sync_group_routine(uuid), public.sync_group_routines(uuid), public.groups_overview()
  from public, anon;
grant execute on function public.update_center(text, text, text[]), public.owns_group(uuid), public.owns_session(uuid),
  public.coach_owns_workout(uuid), public.sync_group_routine(uuid), public.sync_group_routines(uuid), public.groups_overview()
  to authenticated;
