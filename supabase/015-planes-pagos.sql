-- =====================================================================
-- Plataforma: PLANES, BONOS, CRÉDITOS Y PAGOS (módulo traído de FitBox)
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Requisito: 014-clases-reservas.sql. Se puede ejecutar más de una vez.
-- =====================================================================

alter table public.coaches add column if not exists require_plan boolean not null default false;

create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.my_center() references public.coaches(user_id) on delete cascade,
  name text not null,
  price numeric(8,2) not null default 0,
  type text not null default 'ilimitado' check (type in ('ilimitado', 'creditos')),
  credits int check (credits is null or credits > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(user_id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.membership_plans(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  status text not null default 'activa' check (status in ('activa', 'expirada', 'cancelada')),
  credits_left int,
  created_at timestamptz not null default now()
);
create index if not exists memberships_client on public.memberships (coach_id, client_id, status);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(user_id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  membership_id uuid references public.memberships(id) on delete set null,
  amount numeric(8,2) not null check (amount >= 0),
  paid_on date not null default current_date,
  method text not null default 'efectivo' check (method in ('efectivo', 'tarjeta', 'domiciliacion', 'bizum', 'otro')),
  notes text,
  created_at timestamptz not null default now()
);

-- Qué membresía pagó cada reserva (para devolver el crédito a la correcta)
alter table public.bookings add column if not exists membership_id uuid references public.memberships(id) on delete set null;

alter table public.membership_plans enable row level security;
alter table public.memberships enable row level security;
alter table public.payments enable row level security;

drop policy if exists "coach plans" on public.membership_plans;
create policy "coach plans" on public.membership_plans for all using (coach_id = public.my_center()) with check (coach_id = public.my_center());
drop policy if exists "members see plans" on public.membership_plans;
create policy "members see plans" on public.membership_plans for select using (public.is_member_of(coach_id));

drop policy if exists "coach memberships" on public.memberships;
create policy "coach memberships" on public.memberships for select using (coach_id = public.my_center());
drop policy if exists "own memberships" on public.memberships;
create policy "own memberships" on public.memberships for select using (client_id = auth.uid());

drop policy if exists "coach payments" on public.payments;
create policy "coach payments" on public.payments for all using (coach_id = public.my_center())
  with check (coach_id = public.my_center() and public.coach_sees(client_id, 'any'));
drop policy if exists "own payments" on public.payments;
create policy "own payments" on public.payments for select using (client_id = auth.uid());

-- ---------- Membresía activa y créditos (igual que FitBox) ----------

create or replace function public.active_membership(p_coach uuid, p_client uuid)
returns public.memberships language sql security definer stable set search_path = public as $$
  select * from memberships
  where coach_id = p_coach and client_id = p_client and status = 'activa'
    and start_date <= current_date and end_date >= current_date
  order by end_date desc limit 1
$$;

-- Comprueba si puede reservar y, si confirma, gasta el crédito. Devuelve la membresía usada (o null).
create or replace function public.take_credit(p_coach uuid, p_client uuid, p_consume boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.memberships; p public.membership_plans; req boolean;
begin
  select require_plan into req from coaches where user_id = p_coach;
  m := public.active_membership(p_coach, p_client);
  if m.id is null then
    if req then raise exception 'Necesitas un plan activo en este centro para reservar'; end if;
    return null;
  end if;
  select * into p from membership_plans where id = m.plan_id;
  if p.type = 'creditos' then
    if coalesce(m.credits_left, 0) <= 0 then raise exception 'No te quedan créditos este mes'; end if;
    if p_consume then update memberships set credits_left = credits_left - 1 where id = m.id; end if;
  end if;
  return m.id;
end $$;

create or replace function public.refund_credit(p_membership uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_membership is null then return; end if;
  update memberships m set credits_left = least(coalesce(m.credits_left, 0) + 1, p.credits)
  from membership_plans p
  where m.id = p_membership and p.id = m.plan_id and p.type = 'creditos' and m.status = 'activa';
end $$;

-- ---------- Reservas con créditos (sustituye a las de 014) ----------

create or replace function public.renumber_waitlist(p_session uuid)
returns void language sql security definer set search_path = public as $$
  update bookings x set position = r.rn
  from (select id, row_number() over (order by position, created_at) rn from bookings where session_id = p_session and status = 'espera') r
  where x.id = r.id
$$;

-- Pasa al primero de la lista de espera que pueda (plan/créditos) y le avisa
create or replace function public.promote_waitlist(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b record; s record; mid uuid;
begin
  select * into s from class_sessions where id = p_session;
  if (select count(*) from bookings where session_id = p_session and status = 'confirmada') >= s.capacity then return; end if;
  for b in select * from bookings where session_id = p_session and status = 'espera' order by position, created_at loop
    begin
      mid := public.take_credit(s.coach_id, b.user_id, true);
    exception when others then
      continue; -- sin plan o sin créditos: se queda en la lista
    end;
    update bookings set status = 'confirmada', position = null, membership_id = mid where id = b.id;
    perform public.renumber_waitlist(p_session);
    insert into scheduled_pushes (user_id, send_at, title, body, tag)
    values (b.user_id, now(), '🎉 ¡Tienes plaza!',
            s.name || ' · ' || to_char(s.starts_at at time zone 'Europe/Madrid', 'DD/MM HH24:MI') || '. Has pasado de la lista de espera.', 'class');
    return;
  end loop;
end $$;

create or replace function public.book_class(p_session uuid)
returns text language plpgsql security definer set search_path = public as $$
declare s record; link record; n int; pos int; mid uuid;
begin
  if auth.uid() is null then raise exception 'No has iniciado sesión'; end if;
  select * into s from class_sessions where id = p_session for update;
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
    mid := public.take_credit(s.coach_id, auth.uid(), true);
    insert into bookings (session_id, user_id, status, membership_id) values (p_session, auth.uid(), 'confirmada', mid);
    return 'confirmada';
  end if;
  perform public.take_credit(s.coach_id, auth.uid(), false); -- comprueba, pero no gasta hasta tener plaza
  select coalesce(max(position), 0) + 1 into pos from bookings where session_id = p_session and status = 'espera';
  insert into bookings (session_id, user_id, status, position) values (p_session, auth.uid(), 'espera', pos);
  return 'espera';
end $$;

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
  if b.status = 'confirmada' then
    perform public.refund_credit(b.membership_id);
    perform public.promote_waitlist(p_session);
  else
    perform public.renumber_waitlist(p_session);
  end if;
end $$;

-- El centro apunta a mano: no gasta créditos (como en FitBox)
-- (coach_add_attendee de 014 se mantiene igual)

create or replace function public.coach_cancel_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b record;
begin
  select bk.* into b from bookings bk join class_sessions s on s.id = bk.session_id
  where bk.id = p_booking and s.coach_id = public.my_center();
  if b.id is null then raise exception 'No es tu clase'; end if;
  update bookings set status = 'cancelada', position = null, checked_in_at = null where id = p_booking;
  if b.status = 'confirmada' then
    perform public.refund_credit(b.membership_id);
    perform public.promote_waitlist(b.session_id);
  else
    perform public.renumber_waitlist(b.session_id);
  end if;
end $$;

create or replace function public.coach_cancel_session(p_session uuid)
returns int language plpgsql security definer set search_path = public as $$
declare s record; n int; b record;
begin
  select * into s from class_sessions where id = p_session and coach_id = public.my_center();
  if s.id is null then raise exception 'No es tu clase'; end if;
  update class_sessions set status = 'cancelada' where id = p_session;
  insert into scheduled_pushes (user_id, send_at, title, body, tag)
  select bk.user_id, now(), '❌ Clase cancelada',
         s.name || ' · ' || to_char(s.starts_at at time zone 'Europe/Madrid', 'DD/MM HH24:MI') || ' se ha cancelado.', 'class'
  from bookings bk where bk.session_id = p_session and bk.status <> 'cancelada';
  for b in select * from bookings where session_id = p_session and status = 'confirmada' loop
    perform public.refund_credit(b.membership_id);
  end loop;
  update bookings set status = 'cancelada', position = null where session_id = p_session and status <> 'cancelada';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Funciones del CENTRO ----------

create or replace function public.assign_plan(p_client uuid, p_plan uuid, p_start date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.membership_plans; new_id uuid;
begin
  select * into p from membership_plans where id = p_plan and coach_id = public.my_center();
  if p.id is null then raise exception 'Plan no encontrado'; end if;
  if not public.coach_sees(p_client, 'any') then raise exception 'No es tu socio'; end if;
  update memberships set status = 'expirada', end_date = least(end_date, current_date)
  where coach_id = public.my_center() and client_id = p_client and status = 'activa';
  insert into memberships (coach_id, client_id, plan_id, start_date, end_date, credits_left)
  values (public.my_center(), p_client, p_plan, p_start, (p_start + interval '1 month')::date - 1,
          case when p.type = 'creditos' then p.credits end)
  returning memberships.id into new_id;
  return new_id;
end $$;

create or replace function public.renew_membership(p_membership uuid, p_amount numeric default null, p_method text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m public.memberships; p public.membership_plans;
begin
  select * into m from memberships where id = p_membership and coach_id = public.my_center();
  if m.id is null then raise exception 'Membresía no encontrada'; end if;
  select * into p from membership_plans where id = m.plan_id;
  update memberships set status = 'activa',
    end_date = (greatest(end_date, current_date) + interval '1 month')::date,
    credits_left = case when p.type = 'creditos' then p.credits end
  where id = m.id;
  if p_amount is not null then
    insert into payments (coach_id, client_id, membership_id, amount, method)
    values (public.my_center(), m.client_id, m.id, p_amount, coalesce(p_method, 'efectivo'));
  end if;
end $$;

create or replace function public.cancel_membership(p_membership uuid)
returns void language sql security definer set search_path = public as $$
  update memberships set status = 'cancelada' where id = p_membership and coach_id = public.my_center()
$$;

create or replace function public.update_require_plan(p_on boolean)
returns void language sql security definer set search_path = public as $$
  update coaches set require_plan = p_on where user_id = public.my_center()
$$;

-- Resumen de planes de todos los socios
create or replace function public.coach_memberships()
returns table (client_id uuid, membership_id uuid, plan_name text, plan_type text, price numeric,
               start_date date, end_date date, status text, credits_left int, credits int,
               last_payment date, paid_this_month numeric)
language sql security definer stable set search_path = public as $$
  select c.client_id, m.id, p.name, p.type, p.price, m.start_date, m.end_date,
         case when m.id is null then 'sin_plan'
              when m.status = 'cancelada' then 'cancelada'
              when m.end_date < current_date then 'expirada'
              when m.end_date - current_date <= 7 then 'expira_pronto'
              else 'activa' end,
         m.credits_left, p.credits,
         (select max(paid_on) from payments x where x.coach_id = c.coach_id and x.client_id = c.client_id),
         (select coalesce(sum(amount), 0) from payments x where x.coach_id = c.coach_id and x.client_id = c.client_id
            and date_trunc('month', x.paid_on) = date_trunc('month', current_date))
  from coach_clients c
  left join lateral (
    select * from memberships mm where mm.coach_id = c.coach_id and mm.client_id = c.client_id
    order by (mm.status = 'activa') desc, mm.end_date desc limit 1
  ) m on true
  left join membership_plans p on p.id = m.plan_id
  where c.coach_id = public.my_center()
$$;

-- ---------- Para el SOCIO ----------

create or replace function public.my_memberships()
returns table (center text, plan_name text, plan_type text, end_date date, status text, credits_left int, credits int)
language sql security definer stable set search_path = public as $$
  select coalesce(k.center_name, k.name), p.name, p.type, m.end_date,
         case when m.end_date < current_date then 'expirada'
              when m.end_date - current_date <= 7 then 'expira_pronto' else 'activa' end,
         m.credits_left, p.credits
  from memberships m join membership_plans p on p.id = m.plan_id join coaches k on k.user_id = m.coach_id
  where m.client_id = auth.uid() and m.status = 'activa'
  order by m.end_date
$$;

grant select, insert, update, delete on public.membership_plans, public.payments to authenticated;
grant select on public.memberships to authenticated;
revoke execute on function public.active_membership(uuid, uuid), public.take_credit(uuid, uuid, boolean),
  public.refund_credit(uuid), public.renumber_waitlist(uuid), public.promote_waitlist(uuid) from public, anon, authenticated;
revoke execute on function public.assign_plan(uuid, uuid, date), public.renew_membership(uuid, numeric, text),
  public.cancel_membership(uuid), public.update_require_plan(boolean), public.coach_memberships(), public.my_memberships()
  from public, anon;
grant execute on function public.assign_plan(uuid, uuid, date), public.renew_membership(uuid, numeric, text),
  public.cancel_membership(uuid), public.update_require_plan(boolean), public.coach_memberships(), public.my_memberships()
  to authenticated;
