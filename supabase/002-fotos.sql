-- =====================================================================
-- GymLog: fotos de los entrenos (privadas o compartidas con tu grupo)
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

alter table public.workouts add column if not exists photo_path text;
alter table public.workouts add column if not exists photo_shared boolean not null default true;

-- Carpeta privada para las fotos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workout-photos', 'workout-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ¿Puedo ver esta foto? (es de alguien de mi grupo y la ha compartido)
create or replace function public.can_see_photo(p_path text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from workouts w
    join group_members b on b.user_id = w.user_id
    join group_members a on a.group_id = b.group_id and a.user_id = auth.uid()
    where w.photo_path = p_path and w.photo_shared
  )
$$;

drop policy if exists "workout photos: ver las mias" on storage.objects;
drop policy if exists "workout photos: ver" on storage.objects;
create policy "workout photos: ver" on storage.objects for select to authenticated
  using (bucket_id = 'workout-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.can_see_photo(name)));

drop policy if exists "workout photos: subir las mias" on storage.objects;
create policy "workout photos: subir las mias" on storage.objects for insert to authenticated
  with check (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "workout photos: cambiar las mias" on storage.objects;
create policy "workout photos: cambiar las mias" on storage.objects for update to authenticated
  using (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "workout photos: borrar las mias" on storage.objects;
create policy "workout photos: borrar las mias" on storage.objects for delete to authenticated
  using (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Fotos recientes de mi grupo (y mías)
create or replace function public.group_photo_feed()
returns table (workout_id uuid, display_name text, workout_name text, started_at timestamptz,
               photo_path text, sets int, volume numeric, is_me boolean)
language sql security definer stable set search_path = public as $$
  with mates as (
    select auth.uid() as uid
    union
    select gm2.user_id from group_members gm1
    join group_members gm2 on gm1.group_id = gm2.group_id
    where gm1.user_id = auth.uid()
  )
  select w.id, p.display_name, w.name, w.started_at, w.photo_path,
    (select count(*)::int from workout_sets s where s.workout_id = w.id),
    (select coalesce(sum(s.weight * s.reps), 0) from workout_sets s where s.workout_id = w.id),
    w.user_id = auth.uid()
  from workouts w
  join mates m on m.uid = w.user_id
  join profiles p on p.id = w.user_id
  where w.photo_path is not null and (w.photo_shared or w.user_id = auth.uid())
  order by w.started_at desc
  limit 30
$$;

grant execute on function public.can_see_photo(text), public.group_photo_feed() to authenticated;
