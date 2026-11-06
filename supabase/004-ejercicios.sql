-- =====================================================================
-- GymLog: más ejercicios comunes y ejercicios compartidos con el grupo
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

-- 1) Si alguien borra su cuenta, sus ejercicios pasan a ser comunes
--    (así no se pierden las series que sus amigos hicieron con ellos)
alter table public.exercises drop constraint if exists exercises_user_id_fkey;
alter table public.exercises add constraint exercises_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- 2) Lista común ampliada
insert into public.exercises (name, muscle)
select v.name, v.muscle from (values
  -- Pecho
  ('Press banca', 'Pecho'), ('Press banca con mancuernas', 'Pecho'), ('Press inclinado con barra', 'Pecho'),
  ('Press inclinado con mancuernas', 'Pecho'), ('Press declinado', 'Pecho'), ('Press de pecho en máquina', 'Pecho'),
  ('Aperturas con mancuernas', 'Pecho'), ('Aperturas en máquina (contractor)', 'Pecho'), ('Cruce de poleas', 'Pecho'),
  ('Fondos en paralelas', 'Pecho'), ('Flexiones', 'Pecho'), ('Pullover con mancuerna', 'Pecho'),
  -- Espalda
  ('Dominadas', 'Espalda'), ('Dominadas supinas', 'Espalda'), ('Dominadas lastradas', 'Espalda'),
  ('Jalón al pecho', 'Espalda'), ('Jalón agarre estrecho', 'Espalda'), ('Remo con barra', 'Espalda'),
  ('Remo con mancuerna', 'Espalda'), ('Remo en polea baja', 'Espalda'), ('Remo en máquina', 'Espalda'),
  ('Remo en T', 'Espalda'), ('Peso muerto', 'Espalda'), ('Pullover en polea', 'Espalda'),
  ('Hiperextensiones', 'Espalda'), ('Encogimientos de trapecio', 'Espalda'),
  -- Piernas
  ('Sentadilla', 'Piernas'), ('Sentadilla frontal', 'Piernas'), ('Sentadilla búlgara', 'Piernas'),
  ('Sentadilla goblet', 'Piernas'), ('Sentadilla hack', 'Piernas'), ('Sentadilla en multipower', 'Piernas'),
  ('Prensa', 'Piernas'), ('Zancadas', 'Piernas'), ('Step-up', 'Piernas'), ('Extensión de cuádriceps', 'Piernas'),
  ('Curl femoral', 'Piernas'), ('Curl femoral tumbado', 'Piernas'), ('Curl femoral sentado', 'Piernas'),
  ('Peso muerto rumano', 'Piernas'), ('Gemelos de pie', 'Piernas'), ('Gemelos sentado', 'Piernas'),
  ('Gemelos en prensa', 'Piernas'), ('Aductores en máquina', 'Piernas'),
  -- Glúteos
  ('Hip thrust', 'Glúteos'), ('Puente de glúteo', 'Glúteos'), ('Patada de glúteo en polea', 'Glúteos'),
  ('Abductores en máquina', 'Glúteos'), ('Peso muerto sumo', 'Glúteos'),
  -- Hombros
  ('Press militar', 'Hombros'), ('Press con mancuernas sentado', 'Hombros'), ('Press Arnold', 'Hombros'),
  ('Press de hombro en máquina', 'Hombros'), ('Elevaciones laterales', 'Hombros'),
  ('Elevaciones laterales en polea', 'Hombros'), ('Elevaciones frontales', 'Hombros'), ('Pájaros', 'Hombros'),
  ('Pájaros en máquina', 'Hombros'), ('Face pull', 'Hombros'), ('Remo al mentón', 'Hombros'),
  -- Bíceps
  ('Curl con barra', 'Bíceps'), ('Curl con barra Z', 'Bíceps'), ('Curl con mancuernas', 'Bíceps'),
  ('Curl martillo', 'Bíceps'), ('Curl concentrado', 'Bíceps'), ('Curl en banco Scott', 'Bíceps'),
  ('Curl en polea', 'Bíceps'), ('Curl inclinado con mancuernas', 'Bíceps'),
  -- Tríceps
  ('Press francés', 'Tríceps'), ('Extensión de tríceps en polea', 'Tríceps'), ('Extensión de tríceps con cuerda', 'Tríceps'),
  ('Extensión de tríceps por encima de la cabeza', 'Tríceps'), ('Press cerrado', 'Tríceps'),
  ('Fondos en banco', 'Tríceps'), ('Patada de tríceps', 'Tríceps'),
  -- Core
  ('Plancha (seg = reps)', 'Core'), ('Crunch en polea', 'Core'), ('Crunch abdominal', 'Core'),
  ('Elevación de piernas colgado', 'Core'), ('Rueda abdominal', 'Core'), ('Russian twist', 'Core'),
  ('Pallof press', 'Core'),
  -- Otro
  ('Paseo del granjero', 'Otro'), ('Curl de muñeca', 'Otro'), ('Remo en ergómetro (seg = reps)', 'Otro')
) as v(name, muscle)
where not exists (select 1 from public.exercises e where e.user_id is null and lower(e.name) = lower(v.name));

-- 3) Si alguien ya había creado uno igual que uno común, se junta con el común
--    (sus series y rutinas pasan al ejercicio común; no se pierde nada)
with dup as (
  select c.id as custom_id, g.id as common_id
  from public.exercises c
  join public.exercises g on g.user_id is null and lower(g.name) = lower(c.name)
  where c.user_id is not null
)
update public.workout_sets s set exercise_id = d.common_id from dup d where s.exercise_id = d.custom_id;

with dup as (
  select c.id as custom_id, g.id as common_id
  from public.exercises c
  join public.exercises g on g.user_id is null and lower(g.name) = lower(c.name)
  where c.user_id is not null
)
update public.templates t set exercise_ids = array_replace(t.exercise_ids, d.custom_id, d.common_id)
from dup d where d.custom_id = any(t.exercise_ids);

delete from public.exercises c
where c.user_id is not null
  and exists (select 1 from public.exercises g where g.user_id is null and lower(g.name) = lower(c.name));

-- 4) Ver ejercicios: los comunes, los míos, los de la gente de mis grupos
--    y cualquiera que ya haya usado (aunque luego deje el grupo)
create or replace function public.can_see_exercise(p_id uuid, p_owner uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select p_owner is null
    or p_owner = auth.uid()
    or exists (
      select 1 from group_members a
      join group_members b on b.group_id = a.group_id
      where a.user_id = auth.uid() and b.user_id = p_owner)
    or exists (select 1 from workout_sets s where s.exercise_id = p_id and s.user_id = auth.uid())
$$;
grant execute on function public.can_see_exercise(uuid, uuid) to authenticated;

drop policy if exists "see common and own exercises" on public.exercises;
drop policy if exists "see exercises" on public.exercises;
create policy "see exercises" on public.exercises for select
  using (public.can_see_exercise(id, user_id));
-- (crear/editar/borrar sigue siendo solo de los tuyos: política "manage own exercises")
