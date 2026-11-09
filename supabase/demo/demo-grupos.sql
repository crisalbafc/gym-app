-- =====================================================================
-- GymLog Coach: DATOS DE EJEMPLO de grupos (clases reducidas)
-- Requisitos: 013-centros-grupos.sql y demo-entrenador.sql
-- Para borrarlo todo: demo-borrar.sql
-- =====================================================================

do $$
declare
  coach uuid; g uuid; r uuid; s uuid; d int;
  e_squat uuid; e_bench uuid; e_row uuid;
  plan jsonb;
begin
  select id into coach from auth.users where email = 'TU_EMAIL';
  if coach is null then raise exception 'No encuentro tu cuenta de GymLog con ese email'; end if;

  update coaches set center_name = coalesce(center_name, 'Estudio Fuerza'), center_type = 'reducidas',
                     modules = array['seguimiento', 'grupos', 'sesion']
  where user_id = coach;

  delete from training_groups where coach_id = coach and name like '%(demo)';

  select id into e_squat from exercises where user_id is null and name = 'Sentadilla';
  select id into e_bench from exercises where user_id is null and name = 'Press banca';
  select id into e_row   from exercises where user_id is null and name = 'Remo con barra';
  plan := jsonb_build_array(
    jsonb_build_object('exercise_id', e_squat, 'sets', 4, 'reps', '6-8'),
    jsonb_build_object('exercise_id', e_bench, 'sets', 4, 'reps', '6-8'),
    jsonb_build_object('exercise_id', e_row, 'sets', 3, 'reps', '10'));

  insert into training_groups (coach_id, name, schedule, capacity)
  values (coach, 'Fuerza L-X 19:00 (demo)', 'Lunes y miércoles · 19:00', 6) returning id into g;

  insert into training_group_members (group_id, client_id)
  select g, id from auth.users where email in ('demo.laura@gymlog.test', 'demo.javier@gymlog.test', 'demo.marta@gymlog.test');

  insert into group_routines (group_id, name, plan) values (g, 'Sesión A · Fuerza', plan) returning id into r;

  -- La rutina del grupo le llega a cada miembro
  insert into templates (user_id, name, exercise_ids, plan, assigned_by, group_routine_id)
  select m.client_id, 'Sesión A · Fuerza', array[e_squat, e_bench, e_row], plan, coach, r
  from training_group_members m where m.group_id = g;

  -- Sesiones de las últimas 3 semanas (lunes y miércoles)
  for d in reverse 21..1 loop
    if extract(dow from current_date - d) in (1, 3) then
      insert into group_sessions (group_id, coach_id, routine_id, starts_at, status)
      values (g, coach, r, (current_date - d) + time '19:00', 'terminada') returning id into s;
      insert into session_attendance (session_id, client_id, present)
      select s, u.id,
        case u.email
          when 'demo.laura@gymlog.test' then true
          when 'demo.marta@gymlog.test' then d % 5 <> 0
          else d > 10            -- Javier dejó de venir hace ~10 días
        end
      from auth.users u where u.email in ('demo.laura@gymlog.test', 'demo.javier@gymlog.test', 'demo.marta@gymlog.test');
    end if;
  end loop;
end $$;

select 'Listo: grupo de ejemplo creado' as resultado;
