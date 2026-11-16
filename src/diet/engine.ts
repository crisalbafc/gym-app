// Motor del planificador de dieta (copiado de la app "Mi dieta" / menu-compra-app,
// misma lógica: raciones, generador de semana, pasos de preparación y lista de la compra).

/** [nombre, categoría, gramos por envase, tipo de envase, gramos por unidad] */
export type Ing = [string, 'carn' | 'lac' | 'fru' | 'des', number, string, number]
/** [id, gramos 2000, gramos 1600, etiqueta, texto 2000, texto 1600] */
export type RecIng = [string, number, number, string, string, string]
export type Recipe = { i: string; n: string; m: Meal; x?: number; k: number[]; k2: number[]; g: RecIng[] }
export type Meal = 'D' | 'C' | 'M' | 'N'
export type Ration = 1600 | 2000 | 2400
export type Slot = { i: string; z: Ration }
export type Plan = Record<string, Partial<Record<Meal, Slot>>>
export type Data = { db: Record<string, Ing>; rec: Recipe[] }

export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
export const DL = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
export const ML: Record<Meal, string> = { D: 'Desayuno', C: 'Comida', M: 'Merienda', N: 'Cena' }
export const MEAL_TO_DIARY: Record<Meal, 'desayuno' | 'comida' | 'merienda' | 'cena'> = { D: 'desayuno', C: 'comida', M: 'merienda', N: 'cena' }
export const CATS: Record<Ing[1], string> = { carn: 'Carnicería y pescadería', lac: 'Lácteos y refrigerados', fru: 'Frutería', des: 'Despensa' }

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const kz = (r: Recipe, z: number) => (z == 1600 ? r.k2 : z == 2400 ? r.k.map((x) => x * 1.2) : r.k)
const sc = (t: string, f: number) => t.replace(/([\d.]+) (g|ud)/, (_m, n, u) => (u == 'g' ? Math.round(n * f) + ' g' : Math.max(1, Math.round(n * f)) + ' ud'))
export const gz = (a: RecIng, z: number) => (z == 1600 ? a[2] : z == 2400 ? a[1] * 1.2 : a[1])
export const qty = (a: RecIng, z: number) => (z == 1600 ? a[5] : z == 2400 ? sc(a[4], 1.2) : a[4])

export function dayTot(plan: Plan, d: number, RM: Record<string, Recipe>) {
  const t = [0, 0, 0, 0], p = plan[d] || {}
  for (const m in p) { const s = p[m as Meal]!; if (!RM[s.i]) continue; const k = kz(RM[s.i], s.z); for (let j = 0; j < 4; j++) t[j] += k[j] }
  return t
}

const SD = (s: string) => new Set(s.split(' '))
const RO: Record<string, Set<string>> = { prot: SD('pollo pavo ternera cerdo picada polloprep'), fish: SD('salmon merluza lenguado lubina calamar'), can: SD('atun caballa'), cold: SD('jamon lonch'), egg: SD('huevo clara'), grain: SD('arroz quinoa cuscus pasta tallar gnocchi'), pot: SD('patata boniato pure revpat'), leg: SD('garb lent'), bread: SD('pan pita brioche tortrigo tortmaiz tortarroz pizza'), dairy: SD('yogur griego yprot coco qbatido qfresco cottage ricotta qlight mozz parmesano hummus leche'), veg: SD('tomate cherry lechuga ensal calabacin zanahoria cebolla pimiento setas calabaza puerro esparr judias pepino espinacas verd guis maiz limon'), fru: SD('platano manzana pera mandarina kiwi uvas pina mango fresas frambuesas arand rojos fruta'), cer: SD('avena granola muesli cornflakes'), top: SD('cacahuete almendra miel cacao nueces almendras sesamo'), sauce: SD('soja tomtri') }

/** Pasos de preparación generados a partir de los ingredientes (igual que en la app original). */
export function steps(r: Recipe, z: number): { list: [string, string][]; tm: number } {
  const n = r.n.toLowerCase(), S: [string, string][] = [], add = (e: string, t: string) => { S.push([e, t]) }
  const L = (...k: string[]) => r.g.filter((a) => k.some((x) => RO[x].has(a[0])))
  const low = (a: RecIng) => a[3].toLowerCase(), T = (a: RecIng) => { const q = qty(a, z); return q.endsWith('ud') ? q.replace(' ud', '') + ' ' + low(a) : q + ' de ' + low(a) }
  const J = (l: RecIng[]) => l.map(T).join(', ').replace(/, ([^,]*)$/, ' y $1')
  const prot = L('prot'), fish = L('fish'), can = L('can'), cold = L('cold'), egg = L('egg'), grain = L('grain'), pot = L('pot'), leg = L('leg'), bread = L('bread'), dairy = L('dairy'), veg = L('veg'), fru = L('fru'), cer = L('cer'), top = L('top'), sauce = L('sauce')
  const oil = r.g.filter((a) => a[0] == 'aceite'), cr = r.g.filter((a) => a[0] == 'crema'), vg = veg.filter((a) => a[0] != 'crema')
  const o = oil.length ? T(oil[0]) : 'un chorrito de aceite'
  const yo = dairy.filter((a) => ['yogur', 'griego', 'yprot', 'coco'].includes(a[0])), qs = dairy.filter((a) => !yo.includes(a))
  const nofood = ![prot, fish, can, egg, cold, bread, grain, pot, leg].some((l) => l.length)
  let tm = 0
  if (/smoothie|batido/.test(n)) { tm = 3; add('🥤', 'Pon en la batidora: ' + J(r.g) + '.'); add('🧊', 'Si lo quieres más frío, añade unos cubitos de hielo.'); add('⚡', 'Tritura 30-40 segundos hasta que quede sin grumos.'); add('👅', 'Prueba y, si está muy espeso, añade un chorrito de agua.'); add('🥛', 'Sírvelo en un vaso y tómalo al momento.') }
  else if (/porridge|remojada/.test(n)) { tm = 8; add('⚖️', 'Pesa ' + J(cer) + ' y ponlo en un cazo (o en un bol si lo dejas remojado).'); add('🥛', 'Añade ' + (J(dairy) || 'agua o leche') + ' y mezcla.'); add('🔥', 'Cocina 4-5 minutos a fuego medio removiendo hasta que espese, o déjalo en la nevera toda la noche.'); add('🍌', 'Trocea ' + (J(fru) || 'la fruta que más te guste') + '.'); add('🥣', 'Sírvelo en un bol con la fruta' + (top.length ? ' y ' + J(top) : '') + ' por encima.'); add('😋', 'Mezcla y disfruta, mejor templado.') }
  else if (nofood) { tm = 3; add('⚖️', 'Pesa todos los ingredientes.'); add('🥣', 'Pon en un bol ' + (yo.length ? J(yo) : J(r.g.slice(0, 1))) + '.'); if (fru.length) add('🍓', 'Lava y trocea ' + J(fru) + '.'); if (cer.length) add('🥄', 'Añade ' + J(cer) + ' y remueve.'); if (top.length) add('🌰', 'Termina con ' + J(top) + ' por encima.'); add('😋', 'Mezcla y listo: se come al momento.') }
  else if (/^tortitas/.test(n)) { tm = 12; add('⚖️', 'Pesa todos los ingredientes.'); add('🥣', 'Tritura en la batidora ' + J(cer.concat(egg, fru.slice(0, 1))) + ' hasta obtener una masa espesa.'); add('🍳', 'Calienta una sartén antiadherente a fuego medio con unas gotas de aceite.'); add('🥞', 'Echa cucharadas de masa y cocina 2 minutos por lado, hasta que salgan burbujas y se doren.'); add('🍓', 'Sírvelas con ' + (J(yo.concat(qs, fru.slice(1), top)) || 'tu topping favorito') + '.'); add('😋', 'Disfrútalas templadas.') }
  else if (/pizza/.test(n)) { tm = 20; add('⚖️', 'Pesa todos los ingredientes.'); add('🔥', 'Precalienta el horno a 220 °C (o la freidora de aire a 200 °C).'); add('🍅', 'Extiende ' + (sauce.length ? J(sauce) : 'una capa fina de tomate triturado') + ' sobre ' + J(bread) + '.'); if (vg.length) add('🔪', 'Corta en láminas finas ' + J(vg) + '.'); add('🍕', 'Reparte por encima ' + J(prot.concat(can, cold, fish, egg, dairy, vg)) + '.'); add('⏲️', 'Hornea 8-10 minutos hasta que el queso se dore y los bordes estén crujientes.'); add('✂️', 'Déjala reposar 2 minutos, córtala en porciones y sirve.'); if (yo.length) add('🥛', 'De postre: ' + J(yo) + '.') }
  else if (/burrito|wrap|quesadilla/.test(n)) { tm = 15; add('⚖️', 'Pesa todos los ingredientes.'); if (grain.length) add('🍚', 'Cuece ' + J(grain) + ' en agua con sal 12-15 minutos y escúrrelo.'); if (prot.length || vg.length) add('🍳', 'Corta en tiras finas ' + J(prot.concat(vg)) + ' y saltea 5-6 minutos con ' + o + '.'); add('🫓', 'Calienta ' + J(bread) + ' 20 segundos por cada lado en una sartén seca.'); add('🧀', 'Reparte el relleno (' + J(cold.concat(can, egg, dairy.filter((a) => !yo.includes(a)), leg, grain)) + (prot.length || vg.length ? ' y lo salteado' : '') + ') sobre la tortilla.'); add('🌯', /quesadilla/.test(n) ? 'Dobla la tortilla por la mitad y dórala 2 minutos por lado hasta que el queso se funda.' : 'Enrolla bien apretado y séllalo 1 minuto por cada lado en la sartén.'); add('✂️', 'Córtalo por la mitad y sirve.'); if (yo.length) add('🥛', 'De postre: ' + J(yo) + '.') }
  else if (/nuggets/.test(n)) { tm = 25; add('⚖️', 'Pesa todos los ingredientes.'); add('🔪', 'Corta ' + J(prot) + ' en trozos del tamaño de un bocado (si es carne picada, forma nuggets con las manos).'); add('🥣', 'Machaca ' + J(L('cer')) + ' en un plato.'); add('🥚', 'Pasa cada trozo por ' + J(egg) + ' batido y luego por los corn flakes.'); add('🌬️', 'Colócalos en la freidora de aire con unas gotas de aceite: 190 °C, 10-12 minutos, dándoles la vuelta a la mitad.'); if (pot.length || vg.length) add('🥔', 'Prepara el acompañamiento: ' + J(pot.concat(vg)) + ' (patata en bastones en la freidora a 200 °C, 20 minutos).'); add('🍽️', 'Sirve con tu salsa favorita y disfruta.') }
  else if (bread.length && !/hamburguesa/.test(n)) { tm = 8; add('⚖️', 'Pesa todos los ingredientes.'); add('🍞', 'Tuesta ' + J(bread) + '.'); if (egg.length) add('🍳', /poche/.test(n) ? 'Cuece el huevo escalfado: agua con un chorrito de vinagre, 3 minutos, y retíralo con una espumadera.' : /revuelto/.test(n) ? 'Haz los huevos revueltos a fuego bajo, removiendo 1-2 minutos.' : 'Prepara ' + J(egg) + ' (revuelto, a la plancha o en tortilla) en una sartén antiadherente.'); add('🥄', 'Unta o pon la base: ' + (J(qs.concat(top, yo)) || 'lo que lleve de untar') + '.'); if (prot.length || cold.length || can.length || fish.length) add('🥩', 'Añade el relleno: ' + J(cold.concat(prot, can, fish)) + (prot.length ? ' (si es pechuga fresca, hazla 3 minutos a la plancha antes)' : '') + '.'); if (vg.length || fru.length) add('🍅', 'Añade ' + J(vg.concat(fru)) + '.'); add('🍽️', /sándwich|sandwich/.test(n) ? 'Cierra el sándwich y córtalo en diagonal.' : 'Sírvelo enseguida.') }
  else {
    add('⚖️', 'Pesa todos los ingredientes antes de empezar.')
    if (vg.length) add('🔪', 'Lava y trocea ' + J(vg) + '.')
    grain.forEach((a) => add('🍚', a[0] == 'cuscus' ? 'Hidrata ' + T(a) + ' con agua hirviendo, tapa 5 minutos y suelta con un tenedor.' : a[0] == 'gnocchi' ? 'Cuece ' + T(a) + ' en agua con sal 2-3 minutos, hasta que floten, y escúrrelos.' : ['pasta', 'tallar'].includes(a[0]) ? 'Cuece ' + T(a) + ' en agua con sal el tiempo del paquete (9-11 minutos) y escúrrela.' : 'Cuece ' + T(a) + ' en agua con sal 12-15 minutos y escúrrelo.'))
    pot.forEach((a) => add('🥔', a[0] == 'pure' ? 'Calienta ' + T(a) + ' en un cazo con un chorrito de leche, removiendo.' : a[0] == 'revpat' ? 'Saltea ' + T(a) + ' en una sartén 8-10 minutos hasta que dore.' : 'Corta ' + T(a) + ' en gajos y hornéalos (o usa la freidora de aire) a 200 °C unos 20-25 minutos con un chorrito de aceite.'))
    if (leg.length) add('🫘', 'Calienta ' + J(leg) + ' bien escurridas en un cazo con un poco de agua, 5 minutos.')
    if (cr.length) add('🥣', 'Calienta ' + T(cr[0]) + ' en un cazo o microondas 3 minutos.')
    if (prot.length) {
      const pr = prot.filter((a) => a[0] != 'polloprep'), pc = prot.filter((a) => a[0] == 'polloprep')
      if (pr.length) add('🍳', /albóndigas/.test(n) ? 'Forma bolitas con ' + J(pr) + ' y dóralas 6-8 minutos en una sartén con ' + o + '.' : /hamburguesa/.test(n) ? 'Forma hamburguesas con ' + J(pr) + ', sazona y hazlas a la plancha 4 minutos por lado.' : 'Sazona ' + J(pr) + ' con sal, pimienta y ajo, córtalo en tiras o dados y dóralo 5-6 minutos en una sartén con ' + o + ' a fuego medio-alto.')
      if (pc.length) add('🍗', 'Calienta ' + J(pc) + ' 2 minutos en la sartén.')
    }
    fish.forEach((a) => add('🐟', a[0] == 'calamar' ? 'Marca ' + T(a) + ' en una plancha muy caliente 2-3 minutos con un hilo de aceite.' : 'Cocina ' + T(a) + ' a la plancha 3-4 minutos por lado (o al horno 12 minutos a 200 °C) con limón y una pizca de sal.'))
    if (egg.length) add('🥚', /poche/.test(n) ? 'Haz los huevos escalfados: agua con un chorrito de vinagre, 3 minutos, y sácalos con espumadera.' : /cocid/.test(n) || (can.length && !vg.length && !/tortilla|revuelto/.test(n)) ? 'Cuece ' + J(egg) + ' 10 minutos en agua hirviendo, enfría y pela.' : /revuelto/.test(n) ? 'Bate ' + J(egg) + ' y añádelos a la sartén: remueve a fuego bajo 1-2 minutos hasta que cuajen.' : 'Bate ' + J(egg) + ' con una pizca de sal y cuájalos en una sartén antiadherente 2 minutos por lado.')
    if (vg.length) add('🥘', sauce.some((a) => a[0] == 'tomtri') ? 'Sofríe la verdura 5 minutos y añade ' + J(sauce.filter((a) => a[0] == 'tomtri')) + '; cocina 8-10 minutos a fuego suave.' : /ensalada|poké|poke|bowl/.test(n) ? 'Aliña la verdura cruda con aceite, limón y sal.' : 'Saltea o ásalas 6-8 minutos hasta que estén tiernas.')
    if (sauce.some((a) => a[0] == 'soja')) add('🥢', 'Añade ' + J(sauce.filter((a) => a[0] == 'soja')) + ' al final y mezcla 1 minuto.')
    if (can.length) add('🐟', 'Escurre ' + J(can) + ' y añádelo al final, para que no se seque.')
    if (cold.length) add('🥓', 'Corta ' + J(cold) + ' en tiras.')
    if (qs.length) add('🧀', 'Añade ' + J(qs) + ' por encima.')
    if (fru.length) add('🍓', 'Lava y trocea ' + J(fru) + ' para acompañar.')
    add('🍽️', /poké|poke|bowl|ensalada/.test(n) ? 'Monta el bol: base, proteína, verduras y toppings. Aliña con aceite, limón y sal.' : 'Mezcla o emplata todo, rectifica de sal y sirve caliente.')
    if (yo.length) add('🥛', 'De postre o como salsa: ' + J(yo) + '.')
    tm = 5 + 3 * S.length
  }
  if (S.length < 5) add('😋', '¡Listo! Mejor recién hecho.')
  return { list: S.slice(0, 10), tm: tm || Math.max(5, S.length * 3) }
}

/** Genera los días indicados: aleatorio, cerca del objetivo, evitando repetir; cenas sin pasta y con ≤55 g de hidratos. */
export function generate(plan: Plan, days: number[], R: Recipe[], tg: number[], src: '' | 'x' | 'm'): Plan {
  const next: Plan = JSON.parse(JSON.stringify(plan))
  const used: Record<string, number> = {}, pool: Record<Meal, [Recipe, Ration][]> = { D: [], C: [], M: [], N: [] }
  for (const d in next) if (!days.includes(+d)) for (const m in next[d]) { const i = next[d][m as Meal]!.i; used[i] = (used[i] || 0) + 1 }
  const NB = 'pasta tallar cuscus gnocchi brioche'.split(' ')
  R.forEach((r) => {
    if (src && (src == 'x') != !!r.x) return
    if (r.m == 'N' && r.g.some((a) => NB.includes(a[0]))) return
    ;([2000, 1600, 2400] as Ration[]).forEach((z) => { if (z != 2000 && !r.x) return; if (r.m == 'N' && kz(r, z)[2] > 55) return; pool[r.m].push([r, z]) })
  })
  days.forEach((d) => {
    let best: Partial<Record<Meal, Slot>> | null = null, bs = 1e9
    for (let n = 0; n < 5000; n++) {
      const pick: Partial<Record<Meal, Slot>> = {}, t = [0, 0, 0, 0]; let pen = 0
      for (const m of Object.keys(ML) as Meal[]) {
        const c = pool[m]; if (!c.length) continue
        const x = c[(Math.random() * c.length) | 0], r = x[0], z = x[1], k = kz(r, z)
        pick[m] = { i: r.i, z }; for (let j = 0; j < 4; j++) t[j] += k[j]; pen += 0.25 * (used[r.i] || 0)
      }
      const g = tg
      const e = Math.abs(t[0] - g[0]) / g[0] + (t[1] < g[1] ? 2 : 0.5) * Math.abs(t[1] - g[1]) / g[1] + 0.4 * (Math.abs(t[2] - g[2]) / g[2] + Math.abs(t[3] - g[3]) / g[3]) + pen
      if (e < bs) { bs = e; best = pick }
    }
    next[d] = best || {}
    for (const m in next[d]) { const i = next[d][m as Meal]!.i; used[i] = (used[i] || 0) + 1 }
  })
  return next
}

export type ShopItem = { id: string; label: string; need: string; cat: Ing[1] }
/** Lista de la compra: suma los ingredientes de la semana y redondea a envases. */
export function shopping(plan: Plan, D: Data, RM: Record<string, Recipe>): { items: ShopItem[]; meals: number } {
  const t: Record<string, number> = {}; let n = 0
  for (const d in plan) for (const m in plan[d]) {
    const s = plan[d][m as Meal]!, r = RM[s.i]; if (!r) continue; n++
    r.g.forEach((a) => { if (D.db[a[0]]) t[a[0]] = (t[a[0]] || 0) + gz(a, s.z) })
  }
  const items: ShopItem[] = Object.keys(t).map((i) => {
    const [nm, cat, p, w, u] = D.db[i], g = t[i], q = Math.ceil(g / p - 0.001)
    const need = u ? Math.ceil(g / u - 0.001) + ' ud' : Math.round(g) + ' g'
    const label = w == 'kg' ? `${q} kg de ${nm}` : `${q} ${w}${q > 1 && w != 'pack' ? 's' : ''} de ${nm} (${p} g)`
    return { id: i, label, need, cat }
  }).sort((a, b) => D.db[a.id][0].localeCompare(D.db[b.id][0], 'es'))
  return { items, meals: n }
}
