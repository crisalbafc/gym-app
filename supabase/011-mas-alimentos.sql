-- =====================================================================
-- GymLog: más alimentos comunes (comida rápida, dulces, snacks, bebidas…)
-- Valores aproximados por 100 g; la última cifra es la ración típica en g.
-- Pega este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

insert into public.foods (user_id, name, kcal, protein, carbs, fat, last_grams)
select null, v.name, v.kcal, v.p, v.c, v.f, v.g from (values
  -- Panes y bases
  ('Tortilla de trigo para fajitas/wraps (1 ud ≈ 40 g)', 310, 8.5, 50, 7.5, 40),
  ('Tortilla de maíz para tacos (1 ud ≈ 25 g)', 220, 5.7, 45, 2.9, 25),
  ('Pan de pita (1 ud ≈ 60 g)', 275, 9, 55, 1.2, 60),
  ('Pan de hamburguesa (1 ud ≈ 60 g)', 280, 9, 50, 4.5, 60),
  -- Comida rápida y platos
  ('Kebab en pan de pita (1 ud ≈ 400 g)', 215, 11, 20, 10, 400),
  ('Durum / kebab enrollado (1 ud ≈ 450 g)', 210, 11, 20, 9.5, 450),
  ('Patatas fritas de freidora', 312, 3.4, 41, 15, 150),
  ('Nuggets de pollo (6 uds ≈ 120 g)', 280, 15, 17, 17, 120),
  ('Hamburguesa con queso (tipo cheeseburger)', 265, 14, 26, 12, 120),
  ('Perrito caliente', 270, 10, 24, 15, 150),
  ('Burrito', 200, 9, 25, 7, 300),
  ('Nachos con queso', 340, 8, 36, 19, 150),
  ('Bocadillo de jamón serrano', 250, 14, 35, 6, 200),
  ('Sándwich mixto', 260, 13, 28, 11, 150),
  ('Lasaña', 160, 9, 14, 8, 300),
  ('Croquetas (1 ud ≈ 30 g)', 230, 7, 20, 13, 90),
  ('Empanadilla (1 ud ≈ 50 g)', 290, 8, 30, 15, 50),
  ('Calamares a la romana', 240, 13, 18, 13, 150),
  ('Patatas bravas', 180, 2, 20, 10, 200),
  ('Sushi (8 piezas ≈ 200 g)', 150, 6, 28, 2, 200),
  ('Fideos instantáneos (paquete seco ≈ 85 g)', 450, 9, 60, 19, 85),
  -- Embutidos
  ('Chorizo', 450, 24, 2, 38, 30),
  ('Fuet / salchichón', 480, 25, 2, 42, 30),
  ('Bacon / beicon', 420, 14, 1, 40, 30),
  ('Salchichas tipo Frankfurt (1 ud ≈ 50 g)', 280, 12, 2, 25, 50),
  -- Dulces y bollería
  ('Chuches / gominolas', 340, 6, 78, 0.2, 50),
  ('Galletas tipo Filipinos', 500, 6, 63, 25, 30),
  ('Galletas de chocolate con crema (tipo Oreo, 3 uds ≈ 33 g)', 480, 5, 69, 20, 33),
  ('Galletas rellenas de chocolate (tipo Príncipe)', 475, 6, 68, 20, 30),
  ('Donut glaseado (1 ud ≈ 50 g)', 420, 5, 50, 22, 50),
  ('Bollo relleno de chocolate (1 ud ≈ 60 g)', 400, 7, 50, 19, 60),
  ('Napolitana de chocolate (1 ud ≈ 80 g)', 420, 7, 46, 23, 80),
  ('Magdalena (1 ud ≈ 30 g)', 440, 6, 52, 23, 30),
  ('Palmera de chocolate (1 ud ≈ 100 g)', 520, 6, 55, 31, 100),
  ('Churros (5 uds ≈ 100 g)', 370, 5, 40, 21, 100),
  ('Chocolate con leche', 540, 7, 57, 31, 20),
  ('Barrita de chocolate (tipo Snickers/Kit Kat)', 500, 6, 60, 26, 45),
  ('Crema de cacao (tipo Nutella)', 540, 6, 57, 31, 20),
  ('Helado (1 bola ≈ 60 g)', 210, 3.5, 25, 11, 60),
  ('Tarta de queso', 320, 6, 25, 22, 120),
  ('Tortitas americanas (pancakes)', 230, 6, 30, 9, 120),
  ('Cereales de chocolate azucarados', 390, 8, 78, 4, 40),
  -- Snacks
  ('Palomitas de microondas', 480, 8, 55, 25, 50),
  ('Nachos de bolsa (tipo Doritos)', 500, 7, 60, 25, 40),
  ('Gusanitos / snacks de maíz', 520, 6, 58, 29, 30),
  ('Cóctel de frutos secos fritos', 600, 20, 15, 52, 30),
  ('Pipas de girasol peladas', 590, 21, 17, 50, 30),
  ('Aceitunas', 145, 1, 1, 15, 40),
  -- Salsas
  ('Ketchup (1 cucharada ≈ 15 g)', 110, 1.2, 25, 0.1, 15),
  ('Mayonesa (1 cucharada ≈ 15 g)', 680, 1, 1, 75, 15),
  ('Salsa barbacoa (1 cucharada ≈ 15 g)', 160, 1, 38, 0.5, 15),
  ('Alioli (1 cucharada ≈ 15 g)', 700, 1, 2, 77, 15),
  -- Bebidas
  ('Zumo de naranja envasado', 45, 0.6, 10, 0.1, 200),
  ('Bebida energética (1 lata ≈ 250 ml)', 45, 0, 11, 0, 250),
  ('Batido de chocolate', 75, 3.3, 11, 1.8, 250),
  ('Café con leche semidesnatada (sin azúcar)', 38, 2.5, 3.8, 1.3, 200),
  ('Vino tinto (1 copa ≈ 150 ml)', 85, 0.1, 2.6, 0, 150),
  ('Copa / cubata con refresco', 80, 0, 8, 0, 250)
) as v(name, kcal, p, c, f, g)
where not exists (select 1 from public.foods x where x.user_id is null and lower(x.name) = lower(v.name));
