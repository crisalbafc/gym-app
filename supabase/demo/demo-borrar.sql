-- =====================================================================
-- GymLog Coach: BORRAR los clientes de ejemplo y todos sus datos
-- (entrenos, dieta, peso, notas, mensajes y rutinas). Tu cuenta no se toca.
-- =====================================================================
delete from training_groups where name like '%(demo)';
delete from class_templates where name like '%(demo)';
delete from memberships where plan_id in (select id from membership_plans where name like '%(demo)');
delete from membership_plans where name like '%(demo)';
delete from posts where title like '%(demo)';
delete from class_sessions where name like '%(demo)';
delete from auth.users where email like 'demo.%@gymlog.test';
select 'Clientes de ejemplo borrados' as resultado;
