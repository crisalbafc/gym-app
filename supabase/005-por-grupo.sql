-- =====================================================================
-- GymLog: ranking, fotos y récords por grupo (cada grupo por separado)
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

-- Personas con las que comparto: las de un grupo concreto (si p_group no es nulo)
-- o las de todos mis grupos. Siempre me incluye a mí.
create or replace function public.my_mates(p_group uuid default null)
returns table (uid uuid) language sql security definer stable set search_path = public as $$
  select auth.uid()
  union
  select gm2.user_id from group_members gm1
  join group_members gm2 on gm1.group_id = gm2.group_id
  where gm1.user_id = auth.uid() and (p_group is null or gm1.group_id = p_group)
$$;

drop function if exists public.exercise_leaderboard(uuid);
create or replace function public.exercise_leaderboard(p_exercise uuid, p_group uuid default null)
returns table (user_id uuid, display_name text, weight numeric, reps int, done_at timestamptz, is_me boolean)
language sql security definer stable set search_path = public as $$
  select distinct on (s.user_id)
    s.user_id, p.display_name, s.weight, s.reps, s.created_at, s.user_id = auth.uid()
  from workout_sets s
  join public.my_mates(p_group) m on m.uid = s.user_id
  join profiles p on p.id = s.user_id
  where s.exercise_id = p_exercise and (p.share_records or s.user_id = auth.uid())
  order by s.user_id, s.weight desc, s.reps desc, s.created_at
$$;

drop function if exists public.group_recent_prs();
create or replace function public.group_recent_prs(p_group uuid default null)
returns table (display_name text, exercise_name text, weight numeric, reps int, done_at timestamptz)
language sql security definer stable set search_path = public as $$
  with ranked as (
    select s.*, max(s.weight) over (
      partition by s.user_id, s.exercise_id order by s.created_at
      rows between unbounded preceding and 1 preceding) as prev_max
    from workout_sets s
    join public.my_mates(p_group) m on m.uid = s.user_id
    where s.user_id <> auth.uid()
  ),
  prs as (
    select distinct on (r.user_id, r.exercise_id) r.*
    from ranked r
    where r.prev_max is not null and r.weight > r.prev_max and r.created_at > now() - interval '7 days'
    order by r.user_id, r.exercise_id, r.weight desc
  )
  select p.display_name, e.name, x.weight, x.reps, x.created_at
  from prs x join profiles p on p.id = x.user_id join exercises e on e.id = x.exercise_id
  where p.share_records
  order by x.created_at desc
  limit 10
$$;

drop function if exists public.group_photo_feed();
create or replace function public.group_photo_feed(p_group uuid default null)
returns table (workout_id uuid, display_name text, workout_name text, started_at timestamptz,
               photo_path text, sets int, volume numeric, is_me boolean)
language sql security definer stable set search_path = public as $$
  select w.id, p.display_name, w.name, w.started_at, w.photo_path,
    (select count(*)::int from workout_sets s where s.workout_id = w.id),
    (select coalesce(sum(s.weight * s.reps), 0) from workout_sets s where s.workout_id = w.id),
    w.user_id = auth.uid()
  from workouts w
  join public.my_mates(p_group) m on m.uid = w.user_id
  join profiles p on p.id = w.user_id
  where w.photo_path is not null and (w.photo_shared or w.user_id = auth.uid())
  order by w.started_at desc
  limit 30
$$;

grant execute on function public.my_mates(uuid), public.exercise_leaderboard(uuid, uuid),
  public.group_recent_prs(uuid), public.group_photo_feed(uuid) to authenticated;
