-- =====================================================================
-- GymLog Coach: DATOS DE EJEMPLO
-- Convierte tu cuenta en entrenador (código EDEMO01) y crea 4 clientes
-- de ejemplo con ~2 meses de entrenos, dieta y peso.
-- Los clientes de ejemplo NO pueden iniciar sesión (no tienen contraseña).
-- Requisito: haber ejecutado antes 012-entrenador.sql.
-- Para borrarlos: demo-borrar.sql
-- =====================================================================

do $$
declare
  coach uuid;
  c record;
  uid uuid;
  wid uuid;
  d int;
  prog numeric;
  bench numeric;
  started timestamptz;
  kind int := 0;
  ex record;
  s int;
  wt numeric;
  goal int;
  f numeric;
  e_bench uuid; e_squat uuid; e_dead uuid; e_row uuid; e_ohp uuid; e_pull uuid;
begin
  select id into coach from auth.users where email = 'TU_EMAIL';
  if coach is null then raise exception 'No encuentro tu cuenta de GymLog con ese email'; end if;

  -- Tu cuenta pasa a ser de entrenador (si ya lo era, se mantiene tu código)
  insert into coaches (user_id, name, coach_code) values (coach, 'Cristóbal', 'EDEMO01')
  on conflict (user_id) do nothing;

  -- Empezamos limpio: borra clientes de ejemplo anteriores
  delete from auth.users where email like 'demo.%@gymlog.test';

  select id into e_bench from exercises where user_id is null and name = 'Press banca';
  select id into e_squat from exercises where user_id is null and name = 'Sentadilla';
  select id into e_dead  from exercises where user_id is null and name = 'Peso muerto';
  select id into e_row   from exercises where user_id is null and name = 'Remo con barra';
  select id into e_ohp   from exercises where user_id is null and name = 'Press militar';
  select id into e_pull  from exercises where user_id is null and name = 'Dominadas';

  for c in select * from (values
    -- email, nombre, estado, días desde último entreno, entrenos/semana, comparte(entrenos, dieta, peso, fotos),
    -- peso inicial, cambio de peso en 60 días, press banca inicial, días sin apuntar dieta (null = no apunta), kcal objetivo, revisión (días desde hoy)
    ('demo.laura@gymlog.test',  'Laura Gómez',   'activo', 0, 4, true, true,  true, false, 68.0, -3.0, 40.0, 0,    1900, 3),
    ('demo.javier@gymlog.test', 'Javier Ruiz',   'activo', 9, 3, true, true,  true, false, 84.0,  1.5, 80.0, 5,    2600, null),
    ('demo.marta@gymlog.test',  'Marta Sánchez', 'activo', 1, 3, true, true,  true, false, 61.0, -0.5, 35.0, 0,    2000, 0),
    ('demo.pablo@gymlog.test',  'Pablo Díaz',    'pausa',  2, 2, true, false, true, false, 92.0, -4.5, 90.0, null, 2800, -2)
  ) as t(email, name, status, last_gap, per_week, s_work, s_diet, s_body, s_photos, w0, wdelta, bench0, diet_gap, kcal, review)
  loop
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', c.email, '', now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', c.name),
            now() - interval '70 days', now(), '', '', '', '');
    -- (el perfil se crea solo con el trigger de registro)
    update profiles set kcal_goal = c.kcal, protein_goal = round(c.w0 * 2), carbs_goal = round(c.kcal * 0.45 / 4),
                        fat_goal = round(c.kcal * 0.25 / 9), display_name = c.name
    where id = uid;

    insert into coach_clients (coach_id, client_id, share_workouts, share_diet, share_body, share_photos, status, next_review, created_at)
    values (coach, uid, c.s_work, c.s_diet, c.s_body, c.s_photos, c.status,
            case when c.review is null then null else current_date + c.review end, now() - interval '60 days');

    -- Entrenos (alterna día A empuje/tirón y día B pierna)
    for d in reverse 60..c.last_gap loop
      if (c.per_week = 4 and d % 7 in (0, 2, 4, 5)) or (c.per_week = 3 and d % 7 in (0, 2, 4))
         or (c.per_week = 2 and d % 7 in (1, 4)) or d = c.last_gap then
        prog := (60 - d) / 60.0;
        bench := round(c.bench0 * (1 + 0.12 * prog) / 2.5) * 2.5;
        started := date_trunc('day', now() - d * interval '1 day') + interval '18 hours';
        kind := 1 - kind;
        insert into workouts (user_id, name, started_at, ended_at)
        values (uid, case when kind = 1 then 'Día A · Torso' else 'Día B · Pierna' end, started,
                started + (60 + floor(random() * 30)) * interval '1 minute')
        returning id into wid;
        for ex in select * from (values
            (case when kind = 1 then e_bench else e_squat end, case when kind = 1 then 1.0 else 1.3 end, 0),
            (case when kind = 1 then e_row else e_dead end,    case when kind = 1 then 0.8 else 1.6 end, 1),
            (case when kind = 1 then e_ohp else e_pull end,    case when kind = 1 then 0.6 else 0.0 end, 2)
          ) as x(eid, factor, pos)
        loop
          for s in 1..4 loop
            insert into workout_sets (user_id, workout_id, exercise_id, weight, reps, created_at)
            values (uid, wid, ex.eid, round(bench * ex.factor / 2.5) * 2.5,
                    case when ex.factor = 0 then 10 - s else (array[8, 8, 7, 6])[s] end,
                    started + (ex.pos * 15 + s * 3) * interval '1 minute');
          end loop;
        end loop;
      end if;
    end loop;

    -- Peso corporal cada 3 días
    for d in reverse 60..0 loop
      if d % 3 = 0 then
        insert into body_weights (user_id, day, weight)
        values (uid, current_date - d, round((c.w0 + c.wdelta * (60 - d) / 60.0 + (random() * 0.6 - 0.3))::numeric, 1));
      end if;
    end loop;

    -- Medidas cada 2 semanas
    for d in reverse 56..0 loop
      if d % 14 = 0 then
        insert into measurements (user_id, day, waist, chest, arm, leg)
        values (uid, current_date - d, round((c.w0 * 1.1 + c.wdelta * (60 - d) / 60.0)::numeric, 1),
                round((c.w0 * 1.35)::numeric, 1), round((c.w0 * 0.42)::numeric, 1), round((c.w0 * 0.75)::numeric, 1));
      end if;
    end loop;

    -- Dieta de los últimos 30 días
    if c.diet_gap is not null then
      goal := c.kcal;
      for d in reverse 30..c.diet_gap loop
        f := 0.88 + random() * 0.24;
        insert into food_entries (user_id, day, meal, name, grams, kcal, protein, carbs, fat) values
          (uid, current_date - d, 'desayuno', 'Copos de avena con leche', 300, round(goal * 0.25 * f), round(goal * 0.25 * f * 0.2 / 4), round(goal * 0.25 * f * 0.6 / 4), round(goal * 0.25 * f * 0.2 / 9)),
          (uid, current_date - d, 'comida', 'Arroz con pechuga de pollo', 350, round(goal * 0.35 * f), round(goal * 0.35 * f * 0.35 / 4), round(goal * 0.35 * f * 0.45 / 4), round(goal * 0.35 * f * 0.2 / 9)),
          (uid, current_date - d, 'merienda', 'Yogur alto en proteínas', 200, round(goal * 0.1 * f), round(goal * 0.1 * f * 0.6 / 4), round(goal * 0.1 * f * 0.35 / 4), round(goal * 0.1 * f * 0.05 / 9)),
          (uid, current_date - d, 'cena', 'Salmón con patata', 350, round(goal * 0.3 * f), round(goal * 0.3 * f * 0.3 / 4), round(goal * 0.3 * f * 0.35 / 4), round(goal * 0.3 * f * 0.35 / 9));
      end loop;
    end if;
  end loop;

  -- Notas, mensajes y una rutina asignada
  insert into coach_notes (coach_id, client_id, body)
  select coach, u.id, n.body from auth.users u
  join (values
    ('demo.laura@gymlog.test', 'Objetivo: bajar 4 kg antes del verano manteniendo la fuerza.'),
    ('demo.laura@gymlog.test', 'Molestia leve en el hombro derecho: vigilar el press militar.'),
    ('demo.javier@gymlog.test', 'Ha cambiado de turno en el trabajo y le cuesta cuadrar horarios. Proponer entrenos de 45 min.'),
    ('demo.pablo@gymlog.test', 'En pausa por viaje de trabajo. Retomar a la vuelta.')
  ) as n(email, body) on n.email = u.email;

  insert into coach_messages (coach_id, client_id, body, created_at, read_at)
  select coach, id, '¡Gran semana, Laura! El lunes sube 2,5 kg en press banca 💪', now() - interval '2 days', now() - interval '1 day'
  from auth.users where email = 'demo.laura@gymlog.test';

  insert into templates (user_id, name, exercise_ids, plan, assigned_by)
  select id, 'Día A · Torso', array[e_bench, e_row, e_ohp],
         jsonb_build_array(
           jsonb_build_object('exercise_id', e_bench, 'sets', 4, 'reps', '6-8'),
           jsonb_build_object('exercise_id', e_row, 'sets', 4, 'reps', '8-10'),
           jsonb_build_object('exercise_id', e_ohp, 'sets', 3, 'reps', '8-10')),
         coach
  from auth.users where email = 'demo.laura@gymlog.test';
end $$;

select 'Listo: entra en GymLog Coach con tu cuenta de GymLog' as resultado;
