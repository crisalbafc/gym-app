-- =====================================================================
-- GymLog Coach: BORRAR los clientes de ejemplo y todos sus datos
-- (entrenos, dieta, peso, notas, mensajes y rutinas). Tu cuenta no se toca.
-- =====================================================================
delete from auth.users where email like 'demo.%@gymlog.test';
select 'Clientes de ejemplo borrados' as resultado;
