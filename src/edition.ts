// Edición de la app (se elige al publicar):
//  - 'personal': GymLog para ti y tus amigos, sin funciones de entrenador
//  - 'pro': versión para gimnasios, con conexión a GymLog Coach
export const EDITION = (import.meta.env.VITE_EDITION as string) === 'pro' ? 'pro' : 'personal'
export const IS_PRO = EDITION === 'pro'
