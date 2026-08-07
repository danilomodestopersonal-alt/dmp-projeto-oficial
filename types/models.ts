export type StudentStatus = "ACTIVE" | "ARCHIVED";

export type Exercise = {
  id: string;
  block?: string;
  name: string;
  sets: string;
  reps: string;
  load: string;
};

export type Workout = {
  id: string;
  name: string;
  week: number;
  active: boolean;
  exercises: Exercise[];
};

export type SessionSource = "PLANNED" | "FREE" | "ATTENDANCE" | "IMPORTED";

export type Session = {
  id: string;
  date: string;
  workoutName: string;
  notes: string;
  completedExercises: Exercise[];
  source?: SessionSource;
  startedAt?: string;
  finishedAt?: string;
};

export type Measurements = {
  neck?: string;
  shoulders?: string;
  chest?: string;
  waist?: string;
  abdomen?: string;
  hips?: string;
  rightArm?: string;
  leftArm?: string;
  rightForearm?: string;
  leftForearm?: string;
  rightThigh?: string;
  leftThigh?: string;
  rightCalf?: string;
  leftCalf?: string;
};

export type Assessment = {
  id: string;
  date: string;
  weight?: number | null;
  height?: number | null;
  bodyFatPercent?: number | null;
  fatMass?: number | null;
  leanMass?: number | null;
  measurements: Measurements;
  notes: string;
  photos: string[];
};

export type Student = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  birthDate: string;
  startDate: string;
  goal: string;
  profession?: string;
  modality?: string;
  weeklyFrequency?: string;
  notes: string;
  restrictions: string;
  injuries?: string;
  medications?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  status: StudentStatus;
  workouts: Workout[];
  sessions: Session[];
  assessments: Assessment[];
};

export type CalendarEvent = {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  allDay?: boolean;
  htmlLink?: string;
  matchedStudentId?: string | null;
};
