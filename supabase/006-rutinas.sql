-- =====================================================================
-- GymLog: rutinas con series y repeticiones objetivo
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

-- plan = lista de { "exercise_id": "...", "sets": 4, "reps": "8-10" }
alter table public.templates add column if not exists plan jsonb not null default '[]'::jsonb;
