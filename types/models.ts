export type StudentStatus = "ACTIVE" | "ARCHIVED";
export type TennisCategory = "RED" | "ORANGE" | "GREEN" | null;

export type WorkoutSlot = "A" | "B" | "C" | "D";
export type WorkoutProtocol = "CONVENTIONAL" | "BISET" | "TRISET" | "B7" | "CIRCUIT" | "MIXED";

export type Exercise = {
  id: string;
  block?: string;
  name: string;
  sets: string;
  reps: string;
  load: string;
  notes?: string;
};

export type Workout = {
  id: string;
  name: string;
  week: number;
  active: boolean;
  slot?: WorkoutSlot;
  protocol?: WorkoutProtocol;
  sequenceSize?: number;
  notes?: string;
  archivedAt?: string;
  exercises: Exercise[];
};

export type SessionSource = "PLANNED" | "FREE" | "ATTENDANCE" | "ABSENCE" | "IMPORTED";

export type Session = {
  id: string;
  date: string;
  workoutName: string;
  notes: string;
  completedExercises: Exercise[];
  source?: SessionSource;
  startedAt?: string;
  finishedAt?: string;
  calendarEvent?: Pick<CalendarEvent,"id"|"summary"|"description"|"start"|"end"|"allDay"|"location">;
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
  tennisCategory?: TennisCategory;
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
  location?: string;
  matchedStudentId?: string | null;
  matchedStudentIds?: string[];
  recurrence?: string[];
};
