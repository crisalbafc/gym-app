-- =====================================================================
-- Plataforma: WODs, MARCAS (PRs) y FEED del centro (módulos traídos de FitBox)
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Requisito: 014-clases-reservas.sql. Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------- WODs ----------
create table if not exists public.wods (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.my_center() references public.coaches(user_id) on delete cascade,
  day date not null,
  title text not null,
  blocks jsonb not null default '[]'::jsonb,   -- [{ "type": "calentamiento|fuerza|metcon|accesorio", "content": "..." }]
  published boolean not null default true,
  created_at timestamptz not null default now(),
  unique (coach_id, day)
);
alter table public.wods enable row level security;
drop policy if exists "coach wods" on public.wods;
create policy "coach wods" on public.wods for all using (coach_id = public.my_center()) with check (coach_id = public.my_center());
drop policy if exists "members see wods" on public.wods;
create policy "members see wods" on public.wods for select using (published and public.is_member_of(coach_id));

-- ---------- Marcas (PRs) ----------
create table if not exists public.pr_movements (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.my_center() references public.coaches(user_id) on delete cascade,
  name text not null,
  category text not null default 'fuerza' check (category in ('fuerza', 'olimpico', 'benchmark_wod', 'gimnastico', 'cardio')),
  unit text not null default 'kg' check (unit in ('kg', 'tiempo', 'reps', 'metros')),
  created_at timestamptz not null default now(),
  unique (coach_id, name)
);
create table if not exists public.pr_results (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.pr_movements(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  value numeric not null check (value > 0),     -- kg, segundos, reps o metros
  rx boolean not null default true,
  done_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists pr_results_mov on public.pr_results (movement_id, user_id);
alter table public.pr_movements enable row level security;
alter table public.pr_results enable row level security;

create or replace function public.movement_coach(p_movement uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select coach_id from pr_movements where id = p_movement
$$;

drop policy if exists "coach movements" on public.pr_movements;
create policy "coach movements" on public.pr_movements for all using (coach_id = public.my_center()) with check (coach_id = public.my_center());
drop policy if exists "members see movements" on public.pr_movements;
create policy "members see movements" on public.pr_movements for select using (public.is_member_of(coach_id));

drop policy if exists "own results" on public.pr_results;
create policy "own results" on public.pr_results for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member_of(public.movement_coach(movement_id)));
drop policy if exists "coach sees results" on public.pr_results;
create policy "coach sees results" on public.pr_results for select using (public.movement_coach(movement_id) = public.my_center());

-- Ranking del centro: mejor marca de cada socio (en tiempo, la más baja)
create or replace function public.center_leaderboard(p_movement uuid)
returns table (user_id uuid, display_name text, value numeric, rx boolean, done_on date, is_me boolean)
language sql security definer stable set search_path = public as $$
  with mv as (select * from pr_movements where id = p_movement),
  allowed as (
    select (select coach_id from mv) = public.my_center() or public.is_member_of((select coach_id from mv)) as ok
  )
  select distinct on (r.user_id) r.user_id, p.display_name, r.value, r.rx, r.done_on, r.user_id = auth.uid()
  from pr_results r join profiles p on p.id = r.user_id, mv, allowed
  where allowed.ok and r.movement_id = p_movement
    and (p.share_records or r.user_id = auth.uid() or mv.coach_id = public.my_center())
  order by r.user_id, r.rx desc,
           case when mv.unit = 'tiempo' then r.value else -r.value end, r.done_on
$$;

-- ---------- Feed ----------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.my_center() references public.coaches(user_id) on delete cascade,
  type text not null default 'aviso' check (type in ('aviso', 'consejo', 'receta', 'wod')),
  title text not null,
  content text not null default '',
  image_path text,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;

create or replace function public.post_coach(p_post uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select coach_id from posts where id = p_post
$$;

drop policy if exists "coach posts" on public.posts;
create policy "coach posts" on public.posts for all using (coach_id = public.my_center()) with check (coach_id = public.my_center());
drop policy if exists "members see posts" on public.posts;
create policy "members see posts" on public.posts for select using (public.is_member_of(coach_id));

drop policy if exists "see likes" on public.post_likes;
create policy "see likes" on public.post_likes for select
  using (public.post_coach(post_id) = public.my_center() or public.is_member_of(public.post_coach(post_id)));
drop policy if exists "own likes" on public.post_likes;
create policy "own likes" on public.post_likes for insert with check (user_id = auth.uid() and public.is_member_of(public.post_coach(post_id)));
drop policy if exists "remove own likes" on public.post_likes;
create policy "remove own likes" on public.post_likes for delete using (user_id = auth.uid());

-- Imágenes del feed: carpeta privada; las ven los socios del centro
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('center-posts', 'center-posts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.can_see_center_file(p_name text)
returns boolean language sql security definer stable set search_path = public as $$
  select (storage.foldername(p_name))[1] = public.my_center()::text
      or exists (select 1 from coach_clients c
                 where c.client_id = auth.uid() and c.coach_id::text = (storage.foldername(p_name))[1])
$$;
drop policy if exists "center posts: ver" on storage.objects;
create policy "center posts: ver" on storage.objects for select to authenticated
  using (bucket_id = 'center-posts' and public.can_see_center_file(name));
drop policy if exists "center posts: subir" on storage.objects;
create policy "center posts: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'center-posts' and (storage.foldername(name))[1] = public.my_center()::text);
drop policy if exists "center posts: borrar" on storage.objects;
create policy "center posts: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'center-posts' and (storage.foldername(name))[1] = public.my_center()::text);

-- Avisar a los socios cuando el centro publica algo (opcional desde la app)
create or replace function public.notify_members(p_title text, p_body text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.my_center() is null then raise exception 'No eres de ningún centro'; end if;
  insert into scheduled_pushes (user_id, send_at, title, body, tag)
  select c.client_id, now(), left(p_title, 80), left(coalesce(p_body, ''), 180), 'feed'
  from coach_clients c where c.coach_id = public.my_center() and c.status = 'activo';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Para el socio: sus centros y módulos ----------
create or replace function public.my_centers()
returns table (coach_id uuid, center text, center_type text, modules text[])
language sql security definer stable set search_path = public as $$
  select k.user_id, coalesce(k.center_name, k.name), k.center_type, k.modules
  from coach_clients c join coaches k on k.user_id = c.coach_id
  where c.client_id = auth.uid()
$$;

-- Movimientos típicos de FitBox para empezar
create or replace function public.seed_pr_movements()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into pr_movements (coach_id, name, category, unit)
  select public.my_center(), v.name, v.cat, v.unit from (values
    ('Back Squat', 'fuerza', 'kg'), ('Front Squat', 'fuerza', 'kg'), ('Deadlift', 'fuerza', 'kg'),
    ('Bench Press', 'fuerza', 'kg'), ('Strict Press', 'fuerza', 'kg'), ('Push Press', 'fuerza', 'kg'),
    ('Clean & Jerk', 'olimpico', 'kg'), ('Snatch', 'olimpico', 'kg'), ('Power Clean', 'olimpico', 'kg'),
    ('Fran', 'benchmark_wod', 'tiempo'), ('Grace', 'benchmark_wod', 'tiempo'), ('Helen', 'benchmark_wod', 'tiempo'),
    ('Murph', 'benchmark_wod', 'tiempo'), ('Max Pull-ups', 'gimnastico', 'reps'), ('Max Push-ups', 'gimnastico', 'reps'),
    ('Remo 2000 m', 'cardio', 'tiempo'), ('Carrera 5 km', 'cardio', 'tiempo')
  ) as v(name, cat, unit)
  on conflict (coach_id, name) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

grant select, insert, update, delete on public.wods, public.pr_movements, public.pr_results, public.posts, public.post_likes to authenticated;
revoke execute on function public.movement_coach(uuid), public.post_coach(uuid), public.center_leaderboard(uuid),
  public.can_see_center_file(text), public.notify_members(text, text), public.my_centers(), public.seed_pr_movements()
  from public, anon;
grant execute on function public.movement_coach(uuid), public.post_coach(uuid), public.center_leaderboard(uuid),
  public.can_see_center_file(text), public.notify_members(text, text), public.my_centers(), public.seed_pr_movements()
  to authenticated;
