-- =====================================================================
-- GymLog: alimentos comunes para todos (valores aproximados por 100 g)
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

-- user_id vacío = alimento común para todos
alter table public.foods alter column user_id drop not null;

drop policy if exists "own rows" on public.foods;
drop policy if exists "see common and own foods" on public.foods;
create policy "see common and own foods" on public.foods for select
  using (user_id is null or user_id = auth.uid());
drop policy if exists "manage own foods" on public.foods;
create policy "manage own foods" on public.foods for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- last_grams = cantidad típica de una ración
insert into public.foods (user_id, name, kcal, protein, carbs, fat, last_grams)
select null, v.name, v.kcal, v.p, v.c, v.f, v.g from (values
  -- Carnes, pescados y huevos
  ('Pechuga de pollo (cruda)', 110, 23, 0, 1.5, 150),
  ('Pechuga de pollo a la plancha', 165, 31, 0, 3.6, 150),
  ('Muslo de pollo sin piel', 120, 20, 0, 4.5, 150),
  ('Pavo en lonchas (fiambre)', 100, 18, 3, 1.5, 50),
  ('Ternera magra', 135, 21, 0, 5.5, 150),
  ('Carne picada mixta', 250, 17, 0, 20, 125),
  ('Lomo de cerdo', 150, 21, 0, 7, 150),
  ('Jamón serrano', 240, 31, 0, 13, 40),
  ('Jamón cocido', 105, 19, 1.5, 3, 50),
  ('Salmón', 200, 20, 0, 13, 150),
  ('Merluza', 75, 16, 0, 1, 175),
  ('Atún en lata al natural', 110, 25, 0, 1, 60),
  ('Atún en lata en aceite (escurrido)', 190, 26, 0, 9.5, 60),
  ('Gambas / langostinos', 85, 19, 0, 1, 100),
  ('Huevo (1 ud ≈ 60 g)', 143, 12.6, 0.7, 9.5, 60),
  ('Claras de huevo', 52, 11, 0.7, 0.2, 150),
  ('Tofu', 145, 15, 2, 9, 100),
  ('Proteína whey (1 cacito ≈ 30 g)', 380, 78, 7, 5, 30),
  -- Lácteos
  ('Leche entera', 63, 3.1, 4.7, 3.6, 250),
  ('Leche semidesnatada', 46, 3.2, 4.8, 1.6, 250),
  ('Leche desnatada', 34, 3.4, 4.9, 0.1, 250),
  ('Bebida de avena', 45, 0.5, 7, 1.5, 250),
  ('Yogur natural', 61, 3.5, 4.7, 3.2, 125),
  ('Yogur griego natural', 130, 3.5, 4.5, 10, 125),
  ('Yogur alto en proteínas', 58, 10, 3.5, 0.2, 200),
  ('Queso fresco batido 0%', 46, 8, 3.5, 0.1, 250),
  ('Queso fresco tipo Burgos', 175, 12, 3, 13, 60),
  ('Queso curado', 400, 26, 0.5, 33, 30),
  ('Mozzarella', 250, 18, 2, 19, 60),
  -- Cereales, pan y tubérculos
  ('Arroz blanco (crudo)', 355, 7, 79, 0.6, 80),
  ('Arroz blanco (cocido)', 130, 2.7, 28, 0.3, 200),
  ('Arroz integral (crudo)', 350, 7.5, 74, 2.5, 80),
  ('Pasta (cruda)', 355, 12.5, 71, 1.5, 80),
  ('Pasta (cocida)', 158, 5.8, 31, 0.9, 200),
  ('Pan de barra', 265, 9, 51, 3.2, 60),
  ('Pan integral', 250, 10, 43, 3.5, 60),
  ('Pan de molde integral (1 rebanada ≈ 30 g)', 245, 11, 41, 4, 30),
  ('Copos de avena', 375, 13.5, 59, 7, 50),
  ('Cereales de desayuno (tipo corn flakes)', 380, 7, 84, 0.9, 40),
  ('Tortitas de arroz (1 ud ≈ 8 g)', 385, 8, 81, 3, 8),
  ('Patata', 77, 2, 17, 0.1, 200),
  ('Boniato', 86, 1.6, 20, 0.1, 200),
  ('Quinoa (cruda)', 368, 14, 64, 6, 70),
  -- Legumbres
  ('Garbanzos cocidos', 140, 7.5, 20, 2.5, 200),
  ('Lentejas cocidas', 116, 9, 20, 0.4, 200),
  ('Alubias cocidas', 110, 7.5, 16, 0.5, 200),
  -- Fruta
  ('Plátano (1 ud ≈ 120 g)', 90, 1.1, 21, 0.3, 120),
  ('Manzana (1 ud ≈ 180 g)', 52, 0.3, 12, 0.2, 180),
  ('Naranja (1 ud ≈ 200 g)', 47, 0.9, 10, 0.1, 200),
  ('Pera (1 ud ≈ 180 g)', 57, 0.4, 13, 0.1, 180),
  ('Kiwi (1 ud ≈ 75 g)', 61, 1.1, 12, 0.5, 75),
  ('Fresas', 32, 0.7, 6, 0.3, 150),
  ('Uvas', 69, 0.7, 17, 0.2, 150),
  ('Sandía', 30, 0.6, 7, 0.2, 300),
  ('Arándanos', 57, 0.7, 12, 0.3, 100),
  -- Verdura
  ('Brócoli', 34, 2.8, 4, 0.4, 200),
  ('Lechuga', 15, 1.4, 1.5, 0.2, 100),
  ('Tomate', 18, 0.9, 3.5, 0.2, 150),
  ('Espinacas', 23, 2.9, 1.5, 0.4, 150),
  ('Zanahoria', 41, 0.9, 8, 0.2, 100),
  ('Pimiento', 26, 1, 4.5, 0.3, 150),
  ('Calabacín', 17, 1.2, 2.5, 0.3, 200),
  ('Cebolla', 40, 1.1, 8, 0.1, 100),
  ('Judías verdes', 31, 1.8, 4.5, 0.2, 200),
  -- Grasas y frutos secos
  ('Aceite de oliva (1 cucharada ≈ 10 g)', 900, 0, 0, 100, 10),
  ('Aguacate', 160, 2, 2, 15, 100),
  ('Almendras', 580, 21, 9, 50, 30),
  ('Nueces', 650, 15, 7, 65, 30),
  ('Cacahuetes', 570, 26, 9, 49, 30),
  ('Crema de cacahuete', 600, 25, 12, 50, 20),
  ('Mantequilla', 740, 0.7, 0.6, 82, 10),
  ('Chocolate negro 85%', 580, 11, 20, 46, 20),
  -- Otros
  ('Miel', 305, 0.3, 82, 0, 20),
  ('Azúcar', 400, 0, 100, 0, 10),
  ('Mermelada', 250, 0.4, 60, 0.1, 20),
  ('Hummus', 170, 7, 14, 10, 50),
  ('Tortilla de patatas', 190, 6.5, 12, 13, 150),
  ('Pizza', 270, 11, 33, 10, 300),
  ('Hamburguesa con pan (comida rápida)', 250, 13, 28, 10, 220),
  ('Patatas fritas de bolsa', 540, 6.5, 50, 35, 40),
  ('Croissant', 410, 8, 45, 21, 60),
  ('Galletas tipo María', 435, 7, 75, 11, 30),
  ('Barrita de proteínas', 350, 30, 35, 10, 60),
  ('Cerveza (1 lata ≈ 330 ml)', 43, 0.5, 3.6, 0, 330),
  ('Refresco de cola (1 lata ≈ 330 ml)', 42, 0, 10.6, 0, 330),
  ('Refresco zero', 0.3, 0, 0, 0, 330)
) as v(name, kcal, p, c, f, g)
where not exists (select 1 from public.foods x where x.user_id is null and lower(x.name) = lower(v.name));
