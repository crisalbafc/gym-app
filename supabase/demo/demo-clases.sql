-- =====================================================================
-- DATOS DE EJEMPLO: clases y reservas
-- Requisitos: 014-clases-reservas.sql y demo-entrenador.sql
-- =====================================================================

do $$
declare
  coach uuid; t record; d date; s uuid; i int;
  laura uuid; javier uuid; marta uuid; pablo uuid;
begin
  select id into coach from auth.users where email = 'TU_EMAIL';
  if coach is null then raise exception 'No encuentro tu cuenta'; end if;
  select id into laura from auth.users where email = 'demo.laura@gymlog.test';
  select id into javier from auth.users where email = 'demo.javier@gymlog.test';
  select id into marta from auth.users where email = 'demo.marta@gymlog.test';
  select id into pablo from auth.users where email = 'demo.pablo@gymlog.test';

  -- Activa el módulo de clases en tu centro
  update coaches set modules = (select array_agg(distinct m) from unnest(modules || array['clases']) m)
  where user_id = coach;

  delete from class_templates where coach_id = coach and name like '%(demo)';
  delete from class_sessions where coach_id = coach and name like '%(demo)';

  insert into class_templates (coach_id, name, color, duration_min, capacity, weekdays, start_time) values
    (coach, 'Pilates suelo (demo)',   '#f472b6', 55, 8,  array[1, 3, 5], '09:00'),
    (coach, 'Cross Training (demo)',  '#38bdf8', 60, 3,  array[2, 4],    '19:00'),
    (coach, 'Yoga flow (demo)',       '#a78bfa', 75, 12, array[6],       '10:00');

  -- Clases desde la semana pasada hasta dentro de 3 semanas
  for t in select * from class_templates where coach_id = coach and name like '%(demo)' loop
    for d in select generate_series(current_date - 7, current_date + 20, interval '1 day')::date loop
      if extract(dow from d)::int = any(t.weekdays) then
        insert into class_sessions (coach_id, template_id, name, color, starts_at, duration_min, capacity)
        values (coach, t.id, t.name, t.color, (d + t.start_time) at time zone 'Europe/Madrid', t.duration_min, t.capacity)
        on conflict (template_id, starts_at) do nothing;
      end if;
    end loop;
  end loop;

  -- Reservas: Laura y Marta van a Pilates; Cross Training se llena (3 plazas) y Pablo queda en espera
  for s in select id from class_sessions where coach_id = coach and name = 'Pilates suelo (demo)' loop
    insert into bookings (session_id, user_id, status) values (s, laura, 'confirmada'), (s, marta, 'confirmada');
  end loop;
  for s in select id from class_sessions where coach_id = coach and name = 'Cross Training (demo)' loop
    insert into bookings (session_id, user_id, status) values (s, laura, 'confirmada'), (s, javier, 'confirmada'), (s, marta, 'confirmada');
    insert into bookings (session_id, user_id, status, position) values (s, pablo, 'espera', 1);
  end loop;
  for s in select id from class_sessions where coach_id = coach and name = 'Yoga flow (demo)' loop
    insert into bookings (session_id, user_id, status) values (s, marta, 'confirmada');
  end loop;

  -- Asistencia en las clases ya pasadas (Javier faltó)
  update bookings b set checked_in_at = s.starts_at + interval '5 minutes'
  from class_sessions s
  where b.session_id = s.id and s.coach_id = coach and s.starts_at < now() and b.status = 'confirmada' and b.user_id <> javier;
end $$;

select 'Listo: clases de ejemplo creadas' as resultado;
