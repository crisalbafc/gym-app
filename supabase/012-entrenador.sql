-- =====================================================================
-- GymLog Coach: entrenadores, clientes, permisos, notas y mensajes
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

-- ---------- Tablas ----------

create table if not exists public.coaches (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  coach_code text not null unique,
  created_at timestamptz not null default now()
);

-- Relación entrenador-cliente. El CLIENTE decide qué comparte (share_*).
-- El ENTRENADOR gestiona estado y próxima revisión.
create table if not exists public.coach_clients (
  coach_id uuid not null references public.coaches(user_id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  share_workouts boolean not null default true,
  share_diet boolean not null default true,
  share_body boolean not null default true,
  share_photos boolean not null default false,
  status text not null default 'activo' check (status in ('activo', 'pausa')),
  next_review date,
  created_at timestamptz not null default now(),
  primary key (coach_id, client_id)
);

-- Notas privadas del entrenador sobre cada cliente (el cliente NO las ve)
create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(user_id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- Mensajes del entrenador al cliente (le llegan como notificación y en la app)
create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(user_id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists coach_messages_client on public.coach_messages (client_id, created_at desc);

-- Rutinas asignadas por el entrenador
alter table public.templates add column if not exists assigned_by uuid references auth.users(id) on delete set null;

alter table public.coaches enable row level security;
alter table public.coach_clients enable row level security;
alter table public.coach_notes enable row level security;
alter table public.coach_messages enable row level security;

-- ---------- ¿Qué puede ver el entrenador de este cliente? ----------

create or replace function public.coach_sees(p_client uuid, p_what text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from coach_clients c
    where c.coach_id = auth.uid() and c.client_id = p_client
      and case p_what
            when 'workouts' then c.share_workouts
            when 'diet' then c.share_diet
            when 'body' then c.share_body
            when 'photos' then c.share_photos
            else true
          end)
$$;

-- ---------- Políticas de seguridad ----------

drop policy if exists "coach own" on public.coaches;
create policy "coach own" on public.coaches for select
  using (user_id = auth.uid()
         or exists (select 1 from coach_clients c where c.coach_id = coaches.user_id and c.client_id = auth.uid()));

drop policy if exists "both sides see link" on public.coach_clients;
create policy "both sides see link" on public.coach_clients for select
  using (coach_id = auth.uid() or client_id = auth.uid());
drop policy if exists "both sides can unlink" on public.coach_clients;
create policy "both sides can unlink" on public.coach_clients for delete
  using (coach_id = auth.uid() or client_id = auth.uid());

drop policy if exists "coach notes" on public.coach_notes;
create policy "coach notes" on public.coach_notes for all
  using (coach_id = auth.uid()) with check (coach_id = auth.uid() and public.coach_sees(client_id, 'any'));

drop policy if exists "see own messages" on public.coach_messages;
create policy "see own messages" on public.coach_messages for select
  using (coach_id = auth.uid() or client_id = auth.uid());

-- Lectura de datos del cliente por su entrenador, según lo que comparta
drop policy if exists "coach reads" on public.workouts;
create policy "coach reads" on public.workouts for select using (public.coach_sees(user_id, 'workouts'));
drop policy if exists "coach reads" on public.workout_sets;
create policy "coach reads" on public.workout_sets for select using (public.coach_sees(user_id, 'workouts'));
drop policy if exists "coach reads" on public.food_entries;
create policy "coach reads" on public.food_entries for select using (public.coach_sees(user_id, 'diet'));
drop policy if exists "coach reads" on public.body_weights;
create policy "coach reads" on public.body_weights for select using (public.coach_sees(user_id, 'body'));
drop policy if exists "coach reads" on public.measurements;
create policy "coach reads" on public.measurements for select using (public.coach_sees(user_id, 'body'));
drop policy if exists "coach reads" on public.profiles;
create policy "coach reads" on public.profiles for select using (public.coach_sees(id, 'any'));

-- Rutinas: el entrenador gestiona las que él asigna a sus clientes
drop policy if exists "coach assigns" on public.templates;
create policy "coach assigns" on public.templates for all
  using (assigned_by = auth.uid() and public.coach_sees(user_id, 'any'))
  with check (assigned_by = auth.uid() and public.coach_sees(user_id, 'any'));

-- Ejercicios: el entrenador ve los ejercicios propios de sus clientes
create or replace function public.can_see_exercise(p_id uuid, p_owner uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select p_owner is null
    or p_owner = auth.uid()
    or exists (
      select 1 from group_members a
      join group_members b on b.group_id = a.group_id
      where a.user_id = auth.uid() and b.user_id = p_owner)
    or exists (select 1 from workout_sets s where s.exercise_id = p_id and s.user_id = auth.uid())
    or exists (select 1 from coach_clients c where c.coach_id = auth.uid() and c.client_id = p_owner)
    or exists (select 1 from workout_sets s join coach_clients c on c.client_id = s.user_id
               where s.exercise_id = p_id and c.coach_id = auth.uid() and c.share_workouts)
$$;

-- Fotos: el entrenador las ve si el cliente comparte fotos con él
create or replace function public.can_see_photo(p_path text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from workouts w
    join group_members b on b.user_id = w.user_id
    join group_members a on a.group_id = b.group_id and a.user_id = auth.uid()
    where w.photo_path = p_path and w.photo_shared
  ) or exists (
    select 1 from workouts w
    where w.photo_path = p_path and public.coach_sees(w.user_id, 'photos')
  )
$$;

-- ---------- Funciones para el ENTRENADOR ----------

create or replace function public.become_coach(p_name text)
returns public.coaches language plpgsql security definer set search_path = public as $$
declare c public.coaches; code text;
begin
  if auth.uid() is null then raise exception 'No has iniciado sesión'; end if;
  select * into c from coaches where user_id = auth.uid();
  if c.user_id is not null then
    update coaches set name = coalesce(nullif(trim(p_name), ''), name) where user_id = auth.uid() returning * into c;
    return c;
  end if;
  loop
    code := 'E' || upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from coaches where coach_code = code);
  end loop;
  insert into coaches (user_id, name, coach_code) values (auth.uid(), trim(p_name), code) returning * into c;
  return c;
end $$;

-- Resumen de todos mis clientes (una fila por cliente)
create or replace function public.coach_overview()
returns table (
  client_id uuid, display_name text, email text, status text, next_review date, joined_at timestamptz,
  share_workouts boolean, share_diet boolean, share_body boolean, share_photos boolean,
  last_workout_at timestamptz, workouts_7d int, workouts_30d int,
  last_weight numeric, last_weight_day date, weight_change_30d numeric,
  last_food_day date, diet_days_7d int, avg_kcal_7d numeric, avg_protein_7d numeric,
  kcal_goal int, protein_goal int
) language sql security definer stable set search_path = public as $$
  select
    c.client_id, p.display_name, u.email::text, c.status, c.next_review, c.created_at,
    c.share_workouts, c.share_diet, c.share_body, c.share_photos,
    case when c.share_workouts then (select max(w.started_at) from workouts w where w.user_id = c.client_id and w.ended_at is not null) end,
    case when c.share_workouts then (select count(*)::int from workouts w where w.user_id = c.client_id and w.ended_at is not null and w.started_at > now() - interval '7 days') end,
    case when c.share_workouts then (select count(*)::int from workouts w where w.user_id = c.client_id and w.ended_at is not null and w.started_at > now() - interval '30 days') end,
    case when c.share_body then (select b.weight from body_weights b where b.user_id = c.client_id order by b.day desc limit 1) end,
    case when c.share_body then (select max(b.day) from body_weights b where b.user_id = c.client_id) end,
    case when c.share_body then (
      (select b.weight from body_weights b where b.user_id = c.client_id order by b.day desc limit 1)
      - (select b.weight from body_weights b where b.user_id = c.client_id and b.day <= current_date - 30 order by b.day desc limit 1)) end,
    case when c.share_diet then (select max(f.day) from food_entries f where f.user_id = c.client_id) end,
    case when c.share_diet then (select count(distinct f.day)::int from food_entries f where f.user_id = c.client_id and f.day > current_date - 7) end,
    case when c.share_diet then (select round(avg(d.k)) from (select sum(f.kcal) k from food_entries f where f.user_id = c.client_id and f.day > current_date - 7 group by f.day) d) end,
    case when c.share_diet then (select round(avg(d.pr)) from (select sum(f.protein) pr from food_entries f where f.user_id = c.client_id and f.day > current_date - 7 group by f.day) d) end,
    p.kcal_goal, p.protein_goal
  from coach_clients c
  join profiles p on p.id = c.client_id
  join auth.users u on u.id = c.client_id
  where c.coach_id = auth.uid()
  order by p.display_name
$$;

create or replace function public.coach_update_client(p_client uuid, p_status text, p_next_review date)
returns void language plpgsql security definer set search_path = public as $$
begin
  update coach_clients set status = p_status, next_review = p_next_review
  where coach_id = auth.uid() and client_id = p_client;
  if not found then raise exception 'No es tu cliente'; end if;
end $$;

create or replace function public.coach_set_goals(p_client uuid, p_kcal int, p_protein int, p_carbs int, p_fat int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.coach_sees(p_client, 'any') then raise exception 'No es tu cliente'; end if;
  update profiles set kcal_goal = p_kcal, protein_goal = p_protein, carbs_goal = p_carbs, fat_goal = p_fat
  where id = p_client;
end $$;

create or replace function public.coach_send_message(p_client uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare coach_name text;
begin
  if not public.coach_sees(p_client, 'any') then raise exception 'No es tu cliente'; end if;
  if length(trim(p_body)) = 0 then raise exception 'El mensaje está vacío'; end if;
  select name into coach_name from coaches where user_id = auth.uid();
  insert into coach_messages (coach_id, client_id, body) values (auth.uid(), p_client, trim(p_body));
  insert into scheduled_pushes (user_id, send_at, title, body, tag)
  values (p_client, now(), '💬 ' || coalesce(coach_name, 'Tu entrenador'), left(trim(p_body), 180), 'coach');
end $$;

-- ---------- Funciones para el CLIENTE ----------

create or replace function public.join_coach(p_code text, p_workouts boolean, p_diet boolean, p_body boolean, p_photos boolean)
returns text language plpgsql security definer set search_path = public as $$
declare c public.coaches;
begin
  if auth.uid() is null then raise exception 'No has iniciado sesión'; end if;
  select * into c from coaches where coach_code = upper(trim(p_code));
  if c.user_id is null then raise exception 'Código de entrenador no válido'; end if;
  if c.user_id = auth.uid() then raise exception 'No puedes ser tu propio cliente'; end if;
  insert into coach_clients (coach_id, client_id, share_workouts, share_diet, share_body, share_photos)
  values (c.user_id, auth.uid(), p_workouts, p_diet, p_body, p_photos)
  on conflict (coach_id, client_id) do update
    set share_workouts = excluded.share_workouts, share_diet = excluded.share_diet,
        share_body = excluded.share_body, share_photos = excluded.share_photos;
  return c.name;
end $$;

create or replace function public.my_coaches()
returns table (coach_id uuid, name text, share_workouts boolean, share_diet boolean, share_body boolean, share_photos boolean, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select c.coach_id, k.name, c.share_workouts, c.share_diet, c.share_body, c.share_photos, c.created_at
  from coach_clients c join coaches k on k.user_id = c.coach_id
  where c.client_id = auth.uid()
  order by c.created_at
$$;

create or replace function public.update_coach_sharing(p_coach uuid, p_workouts boolean, p_diet boolean, p_body boolean, p_photos boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update coach_clients set share_workouts = p_workouts, share_diet = p_diet, share_body = p_body, share_photos = p_photos
  where coach_id = p_coach and client_id = auth.uid();
end $$;

create or replace function public.mark_coach_messages_read()
returns void language sql security definer set search_path = public as $$
  update coach_messages set read_at = now() where client_id = auth.uid() and read_at is null
$$;

-- ---------- Permisos ----------

grant select, insert, update, delete on public.coaches, public.coach_clients, public.coach_notes, public.coach_messages to authenticated;
revoke execute on function
  public.coach_sees(uuid, text), public.become_coach(text), public.coach_overview(),
  public.coach_update_client(uuid, text, date), public.coach_set_goals(uuid, int, int, int, int),
  public.coach_send_message(uuid, text), public.join_coach(text, boolean, boolean, boolean, boolean),
  public.my_coaches(), public.update_coach_sharing(uuid, boolean, boolean, boolean, boolean),
  public.mark_coach_messages_read()
from public, anon;
grant execute on function
  public.coach_sees(uuid, text), public.become_coach(text), public.coach_overview(),
  public.coach_update_client(uuid, text, date), public.coach_set_goals(uuid, int, int, int, int),
  public.coach_send_message(uuid, text), public.join_coach(text, boolean, boolean, boolean, boolean),
  public.my_coaches(), public.update_coach_sharing(uuid, boolean, boolean, boolean, boolean),
  public.mark_coach_messages_read()
to authenticated;
