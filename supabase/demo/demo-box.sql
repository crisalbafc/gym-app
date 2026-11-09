-- =====================================================================
-- DATOS DE EJEMPLO: WODs, marcas (PRs) y novedades
-- Requisitos: 016-wods-marcas-feed.sql y demo-entrenador.sql
-- =====================================================================

do $$
declare
  coach uuid; laura uuid; javier uuid; marta uuid; pablo uuid; m record; p uuid;
begin
  select id into coach from auth.users where email = 'TU_EMAIL';
  if coach is null then raise exception 'No encuentro tu cuenta'; end if;
  select id into laura from auth.users where email = 'demo.laura@gymlog.test';
  select id into javier from auth.users where email = 'demo.javier@gymlog.test';
  select id into marta from auth.users where email = 'demo.marta@gymlog.test';
  select id into pablo from auth.users where email = 'demo.pablo@gymlog.test';

  update coaches set modules = (select array_agg(distinct x) from unnest(modules || array['wods', 'prs', 'feed']) x) where user_id = coach;

  -- WODs: de hace 3 días a mañana
  delete from wods where coach_id = coach and day between current_date - 3 and current_date + 1;
  insert into wods (coach_id, day, title, blocks) values
    (coach, current_date - 3, 'Fuerza de piernas + Chipper', '[{"type":"calentamiento","content":"10 min de remo suave\n2 rondas: 10 air squats, 10 lunges, 30 s plancha"},{"type":"fuerza","content":"Back Squat 5x5 al 75%"},{"type":"metcon","content":"For time (cap 15 min):\n50 wall balls\n40 box jumps\n30 KB swings\n20 burpees"}]'),
    (coach, current_date - 2, 'Olímpicos', '[{"type":"calentamiento","content":"Movilidad de hombros y cadera, 10 min"},{"type":"fuerza","content":"Power Clean: 6x2 subiendo peso"},{"type":"metcon","content":"EMOM 12 min:\nmin 1: 5 power cleans 60/40 kg\nmin 2: 12 cal bici"}]'),
    (coach, current_date - 1, 'Gimnásticos + cardio', '[{"type":"calentamiento","content":"Skipping, saltos a la comba 5 min"},{"type":"metcon","content":"AMRAP 20 min:\n5 pull-ups\n10 push-ups\n15 air squats"},{"type":"accesorio","content":"3x15 hollow rocks"}]'),
    (coach, current_date, 'Fran 🔥', '[{"type":"calentamiento","content":"3 rondas: 200 m carrera, 10 thrusters con barra vacía, 5 pull-ups"},{"type":"fuerza","content":"Thruster: 4x3 trabajando técnica"},{"type":"metcon","content":"FRAN (for time)\n21-15-9\nThrusters 43/30 kg\nPull-ups"},{"type":"accesorio","content":"Estiramientos 10 min"}]'),
    (coach, current_date + 1, 'Deadlift + intervalos', '[{"type":"fuerza","content":"Deadlift 5-3-1+"},{"type":"metcon","content":"5 rondas: 400 m carrera + 15 KB swings (descanso 1 min)"}]');

  -- Marcas: movimientos típicos + resultados de los socios de ejemplo
  insert into pr_movements (coach_id, name, category, unit) values
    (coach, 'Back Squat', 'fuerza', 'kg'), (coach, 'Deadlift', 'fuerza', 'kg'), (coach, 'Bench Press', 'fuerza', 'kg'),
    (coach, 'Clean & Jerk', 'olimpico', 'kg'), (coach, 'Snatch', 'olimpico', 'kg'),
    (coach, 'Fran', 'benchmark_wod', 'tiempo'), (coach, 'Grace', 'benchmark_wod', 'tiempo'),
    (coach, 'Max Pull-ups', 'gimnastico', 'reps'), (coach, 'Remo 2000 m', 'cardio', 'tiempo')
  on conflict (coach_id, name) do nothing;
  delete from pr_results where user_id in (laura, javier, marta, pablo);
  for m in select * from pr_movements where coach_id = coach loop
    insert into pr_results (movement_id, user_id, value, rx, done_on)
    select m.id, u.uid,
      case m.name
        when 'Back Squat' then u.k * 1.3 when 'Deadlift' then u.k * 1.6 when 'Bench Press' then u.k
        when 'Clean & Jerk' then u.k * 0.85 when 'Snatch' then u.k * 0.65
        when 'Fran' then 540 - u.k * 2 when 'Grace' then 420 - u.k * 1.5
        when 'Max Pull-ups' then round(u.k / 4) when 'Remo 2000 m' then 520 - u.k
      end,
      u.rx, current_date - (random() * 40)::int
    from (values (laura, 45.0, true), (javier, 85.0, true), (marta, 37.5, false), (pablo, 95.0, true)) as u(uid, k, rx)
    where m.name in ('Back Squat', 'Deadlift', 'Bench Press', 'Clean & Jerk', 'Snatch', 'Fran', 'Grace', 'Max Pull-ups', 'Remo 2000 m');
  end loop;

  -- Novedades
  delete from posts where coach_id = coach and title like '%(demo)';
  insert into posts (coach_id, type, title, content, pinned, created_at) values
    (coach, 'aviso', 'Horario especial en festivos (demo)', 'El jueves que viene abrimos solo de 9:00 a 13:00. ¡Reservad con tiempo!', true, now() - interval '1 day'),
    (coach, 'consejo', 'Cómo mejorar tu Fran (demo)', 'Divide los thrusters en series pequeñas desde el principio (por ejemplo 11-10) y no sueltes la barra entre series largas. Respira arriba de cada repetición.', false, now() - interval '3 days'),
    (coach, 'receta', 'Bowl post-entreno (demo)', '150 g de arroz, 150 g de pollo, medio aguacate, tomate cherry y un chorrito de aceite de oliva. ~650 kcal y 45 g de proteína.', false, now() - interval '6 days')
  returning id into p;
  insert into post_likes (post_id, user_id)
  select ps.id, u from posts ps, unnest(array[laura, marta, javier]) u
  where ps.coach_id = coach and ps.title like '%(demo)' and random() < 0.75
  on conflict do nothing;
end $$;

select 'Listo: WODs, marcas y novedades de ejemplo creados' as resultado;
