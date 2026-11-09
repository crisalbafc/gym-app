-- =====================================================================
-- Plataforma: VARIOS ENTRENADORES POR CENTRO (equipo)
-- Requisito: haber ejecutado de nuevo 012 a 016 (ya usan my_center()).
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

-- Las tablas que ya existían siguen con el valor por defecto antiguo: lo actualizamos
do $$
declare t text;
begin
  foreach t in array array['coach_notes', 'training_groups', 'group_sessions', 'class_templates', 'class_sessions',
                           'membership_plans', 'wods', 'pr_movements', 'posts'] loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('alter table public.%I alter column coach_id set default public.my_center()', t);
    end if;
  end loop;
end $$;

-- Las rutinas asignadas pasan a ser "del centro" (las puede editar cualquier entrenador del equipo)
update public.templates t set assigned_by = s.center_id
from public.center_staff s where t.assigned_by = s.user_id;

-- Código para invitar a entrenadores (distinto del código de socios)
alter table public.coaches add column if not exists staff_code text unique;

alter table public.center_staff enable row level security;
drop policy if exists "team sees team" on public.center_staff;
create policy "team sees team" on public.center_staff for select using (center_id = public.my_center());

-- Datos de mi centro y mi papel en él (para GymLog Coach)
create or replace function public.my_center_info()
returns table (user_id uuid, name text, coach_code text, center_name text, center_type text, modules text[],
               cancel_hours int, require_plan boolean, my_role text, my_name text)
language sql security definer stable set search_path = public as $$
  select k.user_id, k.name, k.coach_code, k.center_name, k.center_type, k.modules, k.cancel_hours, k.require_plan,
         case when k.user_id = auth.uid() then 'dueño'
              else coalesce((select s.role from center_staff s where s.center_id = k.user_id and s.user_id = auth.uid()), 'entrenador') end,
         (select p.display_name from profiles p where p.id = auth.uid())
  from coaches k where k.user_id = public.my_center()
$$;

-- Código de equipo (lo crea si no existe). Solo administradores.
create or replace function public.get_staff_code(p_new boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not public.is_center_admin() then raise exception 'Solo el administrador del centro'; end if;
  select staff_code into code from coaches where user_id = public.my_center();
  if code is null or p_new then
    loop
      code := 'T' || upper(substr(md5(random()::text), 1, 6));
      exit when not exists (select 1 from coaches where staff_code = code);
    end loop;
    update coaches set staff_code = code where user_id = public.my_center();
  end if;
  return code;
end $$;

-- Unirse a un centro como entrenador con el código de equipo
create or replace function public.join_center_staff(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare k public.coaches;
begin
  if auth.uid() is null then raise exception 'No has iniciado sesión'; end if;
  select * into k from coaches where staff_code = upper(trim(p_code));
  if k.user_id is null then raise exception 'Código de equipo no válido'; end if;
  if exists (select 1 from coaches where user_id = auth.uid()) then
    raise exception 'Tu cuenta ya es la de otro centro. Usa una cuenta distinta para unirte como entrenador.';
  end if;
  delete from center_staff where user_id = auth.uid();   -- de momento, un centro por entrenador
  insert into center_staff (center_id, user_id, role) values (k.user_id, auth.uid(), 'entrenador');
  return coalesce(k.center_name, k.name);
end $$;

-- El equipo del centro (dueño + entrenadores)
create or replace function public.center_team()
returns table (user_id uuid, display_name text, email text, role text, since timestamptz)
language sql security definer stable set search_path = public as $$
  select k.user_id, coalesce(p.display_name, k.name), u.email::text, 'dueño', k.created_at
  from coaches k join auth.users u on u.id = k.user_id left join profiles p on p.id = k.user_id
  where k.user_id = public.my_center()
  union all
  select s.user_id, p.display_name, u.email::text, s.role, s.created_at
  from center_staff s join auth.users u on u.id = s.user_id left join profiles p on p.id = s.user_id
  where s.center_id = public.my_center()
  order by 5
$$;

create or replace function public.set_staff_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_center_admin() then raise exception 'Solo el administrador del centro'; end if;
  update center_staff set role = p_role where center_id = public.my_center() and user_id = p_user;
end $$;

create or replace function public.remove_staff(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_center_admin() and p_user <> auth.uid() then raise exception 'Solo el administrador del centro'; end if;
  delete from center_staff where center_id = public.my_center() and user_id = p_user;
end $$;

grant select on public.center_staff to authenticated;
revoke execute on function public.my_center_info(), public.get_staff_code(boolean), public.join_center_staff(text),
  public.center_team(), public.set_staff_role(uuid, text), public.remove_staff(uuid) from public, anon;
grant execute on function public.my_center_info(), public.get_staff_code(boolean), public.join_center_staff(text),
  public.center_team(), public.set_staff_role(uuid, text), public.remove_staff(uuid) to authenticated;
