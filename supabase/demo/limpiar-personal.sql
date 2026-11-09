-- =====================================================================
-- Deja tu base de datos PERSONAL como antes de las pruebas de entrenador:
-- borra los clientes de ejemplo, el grupo de ejemplo y tu cuenta de entrenador.
-- Tus entrenos, dieta, peso, grupos de amigos y los de tus amigos NO se tocan.
-- =====================================================================
delete from training_groups where name like '%(demo)';
delete from auth.users where email like 'demo.%@gymlog.test';
delete from coaches where user_id = (select id from auth.users where email = 'TU_EMAIL');
select 'Base personal limpia' as resultado;
