-- =====================================================================
-- GymLog: estadísticas para el administrador y "borrar mi cuenta"
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- IMPORTANTE: en la última línea cambia TU_EMAIL por el email con el que
-- te registraste en la app (así solo tú ves las estadísticas).
-- =====================================================================

-- Si alguien borra su cuenta, sus grupos siguen existiendo para los demás
alter table public.groups alter column created_by drop not null;
alter table public.groups drop constraint if exists groups_created_by_fkey;
alter table public.groups add constraint groups_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- Administradores (nadie puede leer ni cambiar esta tabla desde la app)
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid())
$$;

create or replace function public.admin_stats()
returns json language plpgsql security definer stable set search_path = public as $$
declare r json;
begin
  if not public.is_admin() then raise exception 'Solo para el administrador'; end if;
  select json_build_object(
    'users',      (select count(*) from auth.users),
    'new_7',      (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'new_30',     (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_7',   (select count(distinct u) from (
                    select user_id u from workouts where started_at > now() - interval '7 days'
                    union select user_id from food_entries where created_at > now() - interval '7 days'
                    union select user_id from body_weights where day > current_date - 7) a),
    'active_30',  (select count(distinct u) from (
                    select user_id u from workouts where started_at > now() - interval '30 days'
                    union select user_id from food_entries where created_at > now() - interval '30 days'
                    union select user_id from body_weights where day > current_date - 30) a),
    'workouts',   (select count(*) from workouts where ended_at is not null),
    'sets',       (select count(*) from workout_sets),
    'food',       (select count(*) from food_entries),
    'photos',     (select count(*) from workouts where photo_path is not null),
    'groups',     (select count(*) from groups),
    'db_bytes',   pg_database_size(current_database()),
    'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    'signups',    (select coalesce(json_agg(json_build_object('day', d, 'n', n) order by d), '[]'::json) from (
                    select created_at::date d, count(*) n from auth.users
                    where created_at > now() - interval '30 days' group by 1) s)
  ) into r;
  return r;
end $$;

-- Borra la cuenta del usuario y todos sus datos (las fotos las borra la app antes)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No has iniciado sesión'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.is_admin(), public.admin_stats(), public.delete_my_account() from anon, public;
grant execute on function public.is_admin(), public.admin_stats(), public.delete_my_account() to authenticated;

-- Tú eres el administrador:
insert into public.app_admins (user_id)
select id from auth.users where email = lower(trim('TU_EMAIL'))
on conflict do nothing;
