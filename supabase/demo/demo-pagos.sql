-- =====================================================================
-- DATOS DE EJEMPLO: planes, membresías y pagos
-- Requisitos: 015-planes-pagos.sql y demo-entrenador.sql
-- =====================================================================

do $$
declare
  coach uuid; p_ilim uuid; p_b8 uuid; p_b4 uuid; m uuid; k int;
  laura uuid; javier uuid; marta uuid;
begin
  select id into coach from auth.users where email = 'TU_EMAIL';
  if coach is null then raise exception 'No encuentro tu cuenta'; end if;
  select id into laura from auth.users where email = 'demo.laura@gymlog.test';
  select id into javier from auth.users where email = 'demo.javier@gymlog.test';
  select id into marta from auth.users where email = 'demo.marta@gymlog.test';

  update coaches set modules = (select array_agg(distinct x) from unnest(modules || array['pagos']) x) where user_id = coach;

  delete from payments where coach_id = coach and client_id in (laura, javier, marta);
  delete from memberships where coach_id = coach and client_id in (laura, javier, marta);
  delete from membership_plans where coach_id = coach and name like '%(demo)';

  insert into membership_plans (coach_id, name, price, type, credits) values (coach, 'Ilimitado (demo)', 55, 'ilimitado', null) returning id into p_ilim;
  insert into membership_plans (coach_id, name, price, type, credits) values (coach, 'Bono 8 clases (demo)', 40, 'creditos', 8) returning id into p_b8;
  insert into membership_plans (coach_id, name, price, type, credits) values (coach, 'Bono 4 clases (demo)', 25, 'creditos', 4) returning id into p_b4;

  -- Laura: ilimitado al día, paga cada mes con tarjeta
  insert into memberships (coach_id, client_id, plan_id, start_date, end_date, credits_left)
  values (coach, laura, p_ilim, current_date - 10, current_date + 20, null) returning id into m;
  for k in 0..2 loop
    insert into payments (coach_id, client_id, membership_id, amount, paid_on, method, notes)
    values (coach, laura, m, 55, current_date - 10 - k * 30, 'tarjeta', 'Mensualidad');
  end loop;

  -- Marta: bono 8, le quedan 3 clases y caduca en 5 días
  insert into memberships (coach_id, client_id, plan_id, start_date, end_date, credits_left)
  values (coach, marta, p_b8, current_date - 25, current_date + 5, 3) returning id into m;
  insert into payments (coach_id, client_id, membership_id, amount, paid_on, method)
  values (coach, marta, m, 40, current_date - 25, 'bizum'), (coach, marta, m, 40, current_date - 55, 'efectivo');

  -- Javier: bono 4 caducado hace 3 días (no ha renovado)
  insert into memberships (coach_id, client_id, plan_id, start_date, end_date, credits_left)
  values (coach, javier, p_b4, current_date - 33, current_date - 3, 0) returning id into m;
  insert into payments (coach_id, client_id, membership_id, amount, paid_on, method)
  values (coach, javier, m, 25, current_date - 33, 'efectivo');

  -- Pablo: sin plan
end $$;

select 'Listo: planes y pagos de ejemplo creados' as resultado;
