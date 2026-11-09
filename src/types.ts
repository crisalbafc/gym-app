export type Profile = {
  id: string
  display_name: string
  share_records: boolean
  kcal_goal: number
  protein_goal: number
  carbs_goal: number
  fat_goal: number
  rest_seconds: number
  notify_rest?: boolean
  remind_weight_at?: string | null
  remind_weight_every?: number
  remind_weight_dow?: number | null
  remind_train_days?: number
  tz?: string
}
export type Exercise = { id: string; user_id: string | null; name: string; muscle: string }
export type Workout = {
  id: string; name: string | null; started_at: string; ended_at: string | null
  photo_path?: string | null; photo_shared?: boolean
}
export type WorkoutSet = {
  id: string; workout_id: string; exercise_id: string; weight: number; reps: number; created_at: string
}
export type PlanItem = { exercise_id: string; sets: number | null; reps: string }
export type Template = { id: string; name: string; exercise_ids: string[]; plan?: PlanItem[]; assigned_by?: string | null }
export type Food = {
  id: string; user_id?: string | null; name: string; kcal: number; protein: number; carbs: number; fat: number; last_grams: number
}
export type Meal = 'desayuno' | 'comida' | 'merienda' | 'cena' | 'snacks'
export type FoodEntry = {
  id: string; day: string; meal: Meal; name: string; grams: number
  kcal: number; protein: number; carbs: number; fat: number
}
export type BodyWeight = { id: string; day: string; weight: number }
export type Measurement = {
  id: string; day: string; waist: number | null; chest: number | null; arm: number | null; leg: number | null
}
export type Tab = 'hoy' | 'entreno' | 'dieta' | 'cuerpo' | 'progreso' | 'grupo' | 'ajustes' | 'privacidad' | 'admin' | 'clases'
