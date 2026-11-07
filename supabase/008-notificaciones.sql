-- =====================================================================
-- GymLog: notificaciones (fin del descanso y recordatorios)
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- IMPORTANTE: cambia CAMBIA_ESTE_SECRETO por tu CRON_SECRET
-- (está en el archivo secretos-notificaciones.txt).
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Configuración privada (nadie puede leerla desde la app)
create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
insert into public.app_config (key, value) values
  ('push_url', 'https://gzlgzoueqrrfxmviiomw.supabase.co/functions/v1/send-push'),
  ('cron_secret', 'CAMBIA_ESTE_SECRETO')
on conflict (key) do update set value = excluded.value;

-- Móviles que han activado las notificaciones
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own rows" on public.push_subscriptions;
create policy "own rows" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Cola de avisos pendientes
create table if not exists public.scheduled_pushes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  send_at timestamptz not null,
  title text not null,
  body text not null default '',
  tag text,
  sent_at timestamptz
);
create index if not exists scheduled_pushes_due on public.scheduled_pushes (send_at) where sent_at is null;
alter table public.scheduled_pushes enable row level security;
drop policy if exists "own rows" on public.scheduled_pushes;
create policy "own rows" on public.scheduled_pushes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Preferencias de cada usuario
alter table public.profiles add column if not exists notify_rest boolean not null default true;
alter table public.profiles add column if not exists remind_weight_at time;          -- vacío = sin recordatorio
alter table public.profiles add column if not exists remind_train_days int not null default 0; -- 0 = sin recordatorio
alter table public.profiles add column if not exists tz text not null default 'Europe/Madrid';
alter table public.profiles add column if not exists last_weight_reminder date;
alter table public.profiles add column if not exists last_train_reminder date;

grant select, insert, update, delete on public.push_subscriptions, public.scheduled_pushes to authenticated;

-- Guarda este móvil para la cuenta actual (si antes era de otra cuenta, pasa a la tuya)
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No has iniciado sesión'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- Envía los avisos que ya toca mandar (lo ejecuta el reloj cada 5 segundos)
create or replace function public.dispatch_pushes()
returns void language plpgsql security definer set search_path = public as $$
declare msgs jsonb;
begin
  with due as (
    update scheduled_pushes set sent_at = now()
    where sent_at is null and send_at <= now()
    returning *
  )
  select jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
    'title', d.title, 'body', d.body, 'tag', d.tag,
    'ttl', case when d.tag = 'rest' then 60 else 3600 end))
  into msgs
  from due d join push_subscriptions s on s.user_id = d.user_id;

  if msgs is not null then
    perform net.http_post(
      url := (select value from app_config where key = 'push_url'),
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-cron-secret', (select value from app_config where key = 'cron_secret')),
      body := jsonb_build_object('messages', msgs));
  end if;

  delete from scheduled_pushes where sent_at < now() - interval '1 day';
end $$;

-- Prepara los recordatorios (lo ejecuta el reloj cada minuto)
create or replace function public.queue_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare p record; local_now timestamp; days int;
begin
  for p in select pr.* from profiles pr
           where (pr.remind_weight_at is not null or pr.remind_train_days > 0)
             and exists (select 1 from push_subscriptions s where s.user_id = pr.id)
  loop
    begin
      local_now := now() at time zone p.tz;
    exception when others then
      local_now := now() at time zone 'Europe/Madrid';
    end;

    -- Pesarse: a la hora elegida (hasta 3 h después), una vez al día, si aún no te has pesado
    if p.remind_weight_at is not null
       and local_now::time >= p.remind_weight_at
       and local_now::time < p.remind_weight_at + interval '3 hours'
       and (p.last_weight_reminder is null or p.last_weight_reminder < local_now::date) then
      update profiles set last_weight_reminder = local_now::date where id = p.id;
      if not exists (select 1 from body_weights b where b.user_id = p.id and b.day = local_now::date) then
        insert into scheduled_pushes (user_id, send_at, title, body, tag)
        values (p.id, now(), '⚖️ Hora de pesarte', 'Apunta tu peso de hoy en GymLog.', 'weight');
      end if;
    end if;

    -- Entrenar: a las 18:00 si llevas X días sin entrenar
    if p.remind_train_days > 0
       and local_now::time >= time '18:00' and local_now::time < time '21:00'
       and (p.last_train_reminder is null or p.last_train_reminder < local_now::date) then
      update profiles set last_train_reminder = local_now::date where id = p.id;
      select coalesce(extract(day from now() - max(w.started_at))::int, 999) into days
        from workouts w where w.user_id = p.id;
      if days >= p.remind_train_days then
        insert into scheduled_pushes (user_id, send_at, title, body, tag)
        values (p.id, now(),
          '💪 ¿Hoy toca gym?',
          case when days >= 999 then 'Aún no has hecho tu primer entreno. ¡Hoy es el día!'
               else 'Llevas ' || days || ' días sin entrenar. ¡A por ello!' end,
          'train');
      end if;
    end if;
  end loop;
end $$;

revoke execute on function public.dispatch_pushes(), public.queue_reminders() from public, anon, authenticated;

-- Relojes automáticos
select cron.unschedule(jobid) from cron.job where jobname in ('gymlog-push', 'gymlog-reminders');
select cron.schedule('gymlog-push', '5 seconds', 'select public.dispatch_pushes()');
select cron.schedule('gymlog-reminders', '* * * * *', 'select public.queue_reminders()');
