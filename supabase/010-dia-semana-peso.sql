-- =====================================================================
-- GymLog: recordatorio de peso en un día concreto de la semana
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

-- 0 = domingo, 1 = lunes … 6 = sábado (solo para "cada semana" o más)
alter table public.profiles add column if not exists remind_weight_every int not null default 1;
alter table public.profiles add column if not exists remind_weight_dow int;

create or replace function public.queue_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare p record; local_now timestamp; days int; last_weigh date; due boolean;
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

    -- Pesarse: a la hora elegida (hasta 3 h después), como mucho una vez al día,
    -- cuando han pasado "remind_weight_every" días desde tu último peso
    if p.remind_weight_at is not null
       and local_now::time >= p.remind_weight_at
       and local_now::time < p.remind_weight_at + interval '3 hours'
       and (p.last_weight_reminder is null or p.last_weight_reminder < local_now::date) then
      update profiles set last_weight_reminder = local_now::date where id = p.id;
      select max(b.day) into last_weigh from body_weights b where b.user_id = p.id;
      -- Semanal o más: solo el día de la semana elegido, con margen de 3 días
      -- (así "cada 2 semanas el lunes" avisa un lunes sí y otro no)
      if p.remind_weight_every >= 7 and p.remind_weight_dow is not null then
        due := extract(dow from local_now)::int = p.remind_weight_dow
               and (last_weigh is null or local_now::date - last_weigh >= p.remind_weight_every - 3);
      else
        due := last_weigh is null or local_now::date - last_weigh >= greatest(p.remind_weight_every, 1);
      end if;
      if due then
        insert into scheduled_pushes (user_id, send_at, title, body, tag)
        values (p.id, now(), '⚖️ Hora de pesarte',
          case when last_weigh is null or p.remind_weight_every <= 1 then 'Apunta tu peso de hoy en GymLog.'
               else 'Hace ' || (local_now::date - last_weigh) || ' días que no te pesas. Apúntalo en GymLog.' end,
          'weight');
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

revoke execute on function public.queue_reminders() from public, anon, authenticated;
