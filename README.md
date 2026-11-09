# GymLog

App web para el móvil: registro de entrenos, dieta, peso corporal, gráficas de progreso y grupo de amigos con récords compartidos.

- Abrir: https://crisalbafc.github.io/gym-app/
- Base de datos: Supabase (ejecutar `supabase/schema.sql` , luego `supabase/002-fotos.sql` , `supabase/003-admin-privacidad.sql` (cambiando TU_EMAIL) , `supabase/004-ejercicios.sql` , `supabase/005-por-grupo.sql` , `supabase/006-rutinas.sql` , `supabase/007-alimentos.sql` , `supabase/008-notificaciones.sql` (con tu CRON_SECRET) , `supabase/009-frecuencia-peso.sql` , `supabase/010-dia-semana-peso.sql` , `supabase/011-mas-alimentos.sql` , `supabase/012-entrenador.sql` , `supabase/013-centros-grupos.sql` , `supabase/014-clases-reservas.sql` y `supabase/015-planes-pagos.sql` (GymLog Coach). Notificaciones: crear la Edge Function `send-push` con `supabase/functions/send-push/index.ts`).
- Probar en local: `npm install` y `npm run dev`.
- Publicar cambios: `npm run deploy`.

La clave de `.env` es la clave pública (publishable) de Supabase: está pensada para ir dentro de la app. Los datos están protegidos con Row Level Security.
