-- =====================================================================
-- Plataforma: CLASES Y RESERVAS (módulo traído de FitBox)
-- Tipos de clase con horario semanal, sesiones, reservas con lista de
-- espera, plazo de cancelación, asistencia y avisos.
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Requisitos: 012 y 013. Se puede ejecutar más de una vez.
-- =====================================================================

alter table public.coaches add column if not exists cancel_hours int not null default 2;

-- Tipos de clase con su horario semanal (como las plantillas de FitBox)
create table if not exists public.class_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(user_id) on delete cascade,
  name text not null,
  color text not null default '#a3e635',
  duration_min int not null default 60 check (duration_min between 10 and 300),
  capacity int not null default 10 check (capacity between 1 and 200),
  weekdays int[] not null default '{}',      -- 0 = domingo … 6 = sábado
  start_time time,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(user_id) on delete cascade,
  template_id uuid references public.class_templates(id) on delete set null,
  name text not null,
  color text not null default '#a3e635',
  starts_at timestamptz not null,
  duration_min int not null default 60,
  capacity int not null default 10,
  status text not null default 'programada' check (status in ('programada', 'cancelada')),
  created_at timestamptz not null default now(),
  unique (template_id, starts_at)
);
create index if not exists class_sessions_coach_time on public.class_sessions (coach_id, starts_at);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('confirmada', 'espera', 'cancelada')),
  position int,
  checked_in_at timestamptz,
  created_at timestamptz not null default now()
);
-- Una sola reserva activa por persona y clase
create unique index if not exists bookings_one_active on public.bookings (session_id, user_id) where status <> 'cancelada';

alter table public.class_templates enable row level security;
alter table public.class_sessions enable row level security;
alter table public.bookings enable row level security;

-- ¿Soy socio de este centro?
create or replace function public.is_member_of(p_coach uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from coach_clients c where c.coach_id = p_coach and c.client_id = auth.uid())
$$;

drop policy if exists "coach templates" on public.class_templates;
create policy "coach templates" on public.class_templates for all
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
drop policy if exists "members see templates" on public.class_templates;
create policy "members see templates" on public.class_templates for select using (public.is_member_of(coach_id));

drop policy if exists "coach sessions" on public.class_sessions;
create policy "coach sessions" on public.class_sessions for all
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
drop policy if exists "members see sessions" on public.class_sessions;
create policy "members see sessions" on public.class_sessions for select using (public.is_member_of(coach_id));

create or replace function public.owns_class_session(p_session uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from class_sessions s where s.id = p_session and s.coach_id = auth.uid())
$$;
-- Reservas: cada socio ve las suyas; el centro ve las de sus clases.
-- Crear/cancelar siempre pasa por las funciones de abajo (aplican las reglas).
drop policy if exists "own bookings" on public.bookings;
create policy "own bookings" on public.bookings for select using (user_id = auth.uid());
drop policy if exists "coach bookings" on public.bookings;
create policy "coach bookings" on public.bookings for select using (public.owns_class_session(session_id));

-- ---------- Reglas (las mismas que FitBox) ----------

-- Pasa al primero de la lista de espera y le avisa
create or replace function public.promote_waitlist(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b record; s record;
begin
  select * into s from class_sessions where id = p_session;
  select * into b from bookings where session_id = p_session and status = 'espera' order by position, created_at limit 1;
  if b.id is null then return; end if;
  if (select count(*) from bookings where session_id = p_session and status = 'confirmada') >= s.capacity then return; end if;
  update bookings set status = 'confirmada', position = null where id = b.id;
  update bookings x set position = r.rn
  from (select id, row_number() over (order by position, created_at) rn from bookings where session_id = p_session and status = 'espera') r
  where x.id = r.id;
  insert into scheduled_pushes (user_id, send_at, title, body, tag)
  values (b.user_id, now(), '🎉 ¡Tienes plaza!',
          s.name || ' · ' || to_char(s.starts_at at time zone 'Europe/Madrid', 'DD/MM HH24:MI') || '. Has pasado de la lista de espera.', 'class');
end $$;

-- El socio reserva (confirmada si hay plaza; si no, lista de espera)
create or replace function public.book_class(p_session uuid)
returns text language plpgsql security definer set search_path = public as $$
declare s record; link record; n int; pos int;
begin
  if auth.uid() is null then raise exception 'No has iniciado sesión'; end if;
  select * into s from class_sessions where id = p_session for update;   -- evita dobles reservas a la vez
  if s.id is null then raise exception 'La clase no existe'; end if;
  if s.status = 'cancelada' then raise exception 'La clase está cancelada'; end if;
  if s.starts_at < now() then raise exception 'La clase ya ha empezado'; end if;
  select * into link from coach_clients where coach_id = s.coach_id and client_id = auth.uid();
  if link.client_id is null then raise exception 'No eres socio de este centro'; end if;
  if link.status = 'pausa' then raise exception 'Tu cuenta está en pausa en este centro'; end if;
  if exists (select 1 from bookings where session_id = p_session and user_id = auth.uid() and status <> 'cancelada') then
    raise exception 'Ya tienes una reserva en esta clase';
  end if;
  select count(*) into n from bookings where session_id = p_session and status = 'confirmada';
  if n < s.capacity then
    insert into bookings (session_id, user_id, status) values (p_session, auth.uid(), 'confirmada');
    return 'confirmada';
  end if;
  select coalesce(max(position), 0) + 1 into pos from bookings where session_id = p_session and status = 'espera';
  insert into bookings (session_id, user_id, status, position) values (p_session, auth.uid(), 'espera', pos);
  return 'espera';
end $$;

-- El socio cancela (respeta el plazo de cancelación si estaba confirmada)
create or replace function public.cancel_class(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b record; s record; hours int;
begin
  select * into s from class_sessions where id = p_session for update;
  select * into b from bookings where session_id = p_session and user_id = auth.uid() and status <> 'cancelada';
  if b.id is null then raise exception 'No tienes reserva en esta clase'; end if;
  select cancel_hours into hours from coaches where user_id = s.coach_id;
  if b.status = 'confirmada' and s.starts_at - now() < make_interval(hours => hours) then
    raise exception 'No se puede cancelar con menos de % h de antelación', hours;
  end if;
  update bookings set status = 'cancelada', position = null, checked_in_at = null where id = b.id;
  if b.status = 'confirmada' then perform public.promote_waitlist(p_session);
  else
    update bookings x set position = r.rn
    from (select id, row_number() over (order by position, created_at) rn from bookings where session_id = p_session and status = 'espera') r
    where x.id = r.id;
  end if;
end $$;

-- Horario para el socio: clases de sus centros con ocupación y su estado
create or replace function public.member_schedule(p_from timestamptz, p_to timestamptz)
returns table (id uuid, name text, color text, starts_at timestamptz, duration_min int, capacity int, status text,
               center text, confirmed int, waiting int, my_status text, my_position int, cancel_hours int)
language sql security definer stable set search_path = public as $$
  select s.id, s.name, s.color, s.starts_at, s.duration_min, s.capacity, s.status,
         coalesce(k.center_name, k.name),
         (select count(*)::int from bookings b where b.session_id = s.id and b.status = 'confirmada'),
         (select count(*)::int from bookings b where b.session_id = s.id and b.status = 'espera'),
         (select b.status from bookings b where b.session_id = s.id and b.user_id = auth.uid() and b.status <> 'cancelada'),
         (select b.position from bookings b where b.session_id = s.id and b.user_id = auth.uid() and b.status = 'espera'),
         k.cancel_hours
  from class_sessions s
  join coaches k on k.user_id = s.coach_id
  where public.is_member_of(s.coach_id) and s.starts_at >= p_from and s.starts_at < p_to
  order by s.starts_at
$$;

-- ---------- Funciones del CENTRO ----------

-- Crea las sesiones de las próximas semanas a partir del horario de cada tipo de clase
create or replace function public.generate_class_sessions(p_weeks int default 4)
returns int language plpgsql security definer set search_path = public as $$
declare t record; d date; n int := 0; tz text; k int;
begin
  select p.tz into tz from profiles p where p.id = auth.uid();
  tz := coalesce(tz, 'Europe/Madrid');
  for t in select * from class_templates where coach_id = auth.uid() and active and start_time is not null and cardinality(weekdays) > 0 loop
    for d in select generate_series(current_date, current_date + p_weeks * 7 - 1, interval '1 day')::date loop
      if extract(dow from d)::int = any(t.weekdays) then
        insert into class_sessions (coach_id, template_id, name, color, starts_at, duration_min, capacity)
        values (auth.uid(), t.id, t.name, t.color, (d + t.start_time) at time zone tz, t.duration_min, t.capacity)
        on conflict (template_id, starts_at) do nothing;
        get diagnostics k = row_count;
        n := n + k;
      end if;
    end loop;
  end loop;
  return n;
end $$;

-- Apuntar a alguien a mano (si está llena, va a lista de espera)
create or replace function public.coach_add_attendee(p_session uuid, p_client uuid)
returns text language plpgsql security definer set search_path = public as $$
declare s record; n int; pos int;
begin
  select * into s from class_sessions where id = p_session and coach_id = auth.uid() for update;
  if s.id is null then raise exception 'No es tu clase'; end if;
  if not public.coach_sees(p_client, 'any') then raise exception 'No es tu socio'; end if;
  if exists (select 1 from bookings where session_id = p_session and user_id = p_client and status <> 'cancelada') then
    raise exception 'Ya está apuntado';
  end if;
  select count(*) into n from bookings where session_id = p_session and status = 'confirmada';
  if n < s.capacity then
    insert into bookings (session_id, user_id, status) values (p_session, p_client, 'confirmada');
    return 'confirmada';
  end if;
  select coalesce(max(position), 0) + 1 into pos from bookings where session_id = p_session and status = 'espera';
  insert into bookings (session_id, user_id, status, position) values (p_session, p_client, 'espera', pos);
  return 'espera';
end $$;

-- Quitar una reserva (el staff no tiene plazo de cancelación)
create or replace function public.coach_cancel_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b record;
begin
  select bk.* into b from bookings bk join class_sessions s on s.id = bk.session_id
  where bk.id = p_booking and s.coach_id = auth.uid();
  if b.id is null then raise exception 'No es tu clase'; end if;
  update bookings set status = 'cancelada', position = null, checked_in_at = null where id = p_booking;
  if b.status = 'confirmada' then perform public.promote_waitlist(b.session_id);
  else
    update bookings x set position = r.rn
    from (select id, row_number() over (order by position, created_at) rn from bookings where session_id = b.session_id and status = 'espera') r
    where x.id = r.id;
  end if;
end $$;

-- Marcar / desmarcar asistencia
create or replace function public.coach_checkin(p_booking uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update bookings bk set checked_in_at = case when p_on then now() else null end
  from class_sessions s
  where bk.id = p_booking and s.id = bk.session_id and s.coach_id = auth.uid() and bk.status = 'confirmada';
  if not found then raise exception 'Solo se puede marcar asistencia en reservas confirmadas de tus clases'; end if;
end $$;

-- Cancelar una clase entera y avisar a todos los apuntados
create or replace function public.coach_cancel_session(p_session uuid)
returns int language plpgsql security definer set search_path = public as $$
declare s record; n int;
begin
  select * into s from class_sessions where id = p_session and coach_id = auth.uid();
  if s.id is null then raise exception 'No es tu clase'; end if;
  update class_sessions set status = 'cancelada' where id = p_session;
  insert into scheduled_pushes (user_id, send_at, title, body, tag)
  select b.user_id, now(), '❌ Clase cancelada',
         s.name || ' · ' || to_char(s.starts_at at time zone 'Europe/Madrid', 'DD/MM HH24:MI') || ' se ha cancelado.', 'class'
  from bookings b where b.session_id = p_session and b.status <> 'cancelada';
  update bookings set status = 'cancelada', position = null where session_id = p_session and status <> 'cancelada';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.update_cancel_hours(p_hours int)
returns void language sql security definer set search_path = public as $$
  update coaches set cancel_hours = greatest(0, least(p_hours, 72)) where user_id = auth.uid()
$$;

grant select, insert, update, delete on public.class_templates, public.class_sessions to authenticated;
grant select on public.bookings to authenticated;
revoke execute on function public.is_member_of(uuid), public.owns_class_session(uuid), public.promote_waitlist(uuid),
  public.book_class(uuid), public.cancel_class(uuid), public.member_schedule(timestamptz, timestamptz),
  public.generate_class_sessions(int), public.coach_add_attendee(uuid, uuid), public.coach_cancel_booking(uuid),
  public.coach_checkin(uuid, boolean), public.coach_cancel_session(uuid), public.update_cancel_hours(int)
  from public, anon;
grant execute on function public.is_member_of(uuid), public.owns_class_session(uuid),
  public.book_class(uuid), public.cancel_class(uuid), public.member_schedule(timestamptz, timestamptz),
  public.generate_class_sessions(int), public.coach_add_attendee(uuid, uuid), public.coach_cancel_booking(uuid),
  public.coach_checkin(uuid, boolean), public.coach_cancel_session(uuid), public.update_cancel_hours(int)
  to authenticated;
