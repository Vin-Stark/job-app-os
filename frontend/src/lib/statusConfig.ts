export type ApplicationStatus =
  | 'applied'
  | 'phone_screen'
  | 'technical_round'
  | 'behavioral_round'
  | 'hr_round'
  | 'offer'
  | 'rejected'
  | 'withdrawn'

export interface StatusMeta {
  label: string
  dot: string        // Tailwind bg class
  text: string       // Tailwind text class
  bg: string         // Tailwind bg class (pill)
  border: string     // Tailwind border class
  stage: number      // 1–8 ordering
  active: boolean    // still in pipeline
}

export const STATUS_CONFIG: Record<ApplicationStatus, StatusMeta> = {
  applied:           { label: 'Applied',           dot: 'bg-blue-500',    text: 'text-blue-400',    bg: 'bg-blue-950/60',    border: 'border-blue-800/60',    stage: 1, active: true },
  phone_screen:      { label: 'Phone Screen',      dot: 'bg-violet-400',  text: 'text-violet-400',  bg: 'bg-violet-950/60',  border: 'border-violet-800/60',  stage: 2, active: true },
  technical_round:   { label: 'Technical',         dot: 'bg-amber-400',   text: 'text-amber-400',   bg: 'bg-amber-950/60',   border: 'border-amber-800/60',   stage: 3, active: true },
  behavioral_round:  { label: 'Behavioral',        dot: 'bg-orange-400',  text: 'text-orange-400',  bg: 'bg-orange-950/60',  border: 'border-orange-800/60',  stage: 4, active: true },
  hr_round:          { label: 'HR Round',          dot: 'bg-yellow-400',  text: 'text-yellow-400',  bg: 'bg-yellow-950/60',  border: 'border-yellow-800/60',  stage: 5, active: true },
  offer:             { label: 'Offer',             dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-950/60', border: 'border-emerald-800/60', stage: 6, active: true },
  rejected:          { label: 'Rejected',          dot: 'bg-rose-500',    text: 'text-rose-400',    bg: 'bg-rose-950/60',    border: 'border-rose-800/60',    stage: 7, active: false },
  withdrawn:         { label: 'Withdrawn',         dot: 'bg-slate-500',   text: 'text-slate-400',   bg: 'bg-slate-800/60',   border: 'border-slate-700/60',   stage: 8, active: false },
}

export const ACTIVE_STATUSES = (Object.keys(STATUS_CONFIG) as ApplicationStatus[])
  .filter(s => STATUS_CONFIG[s].active)

export const ALL_STATUSES = Object.keys(STATUS_CONFIG) as ApplicationStatus[]
