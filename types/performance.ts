export type PerformanceActivityType =
  | "CYCLING"
  | "STRENGTH"
  | "PILATES"
  | "RUNNING"
  | "TENNIS"
  | "OTHER";

export type PerformanceActivitySource = "MANUAL" | "STRAVA";

export type PerformanceActivity = {
  id: string;
  date: string;
  type: PerformanceActivityType;
  title: string;

  distanceKm?: number | null;
  durationMinutes?: number | null;
  elapsedMinutes?: number | null;

  elevationMeters?: number | null;
  elevationLossMeters?: number | null;

  averageSpeedKmh?: number | null;
  maxSpeedKmh?: number | null;

  heartRateAverage?: number | null;
  heartRateMax?: number | null;

  powerAverage?: number | null;
  powerWeighted?: number | null;
  powerMax?: number | null;

  calories?: number | null;
  relativeEffort?: number | null;

  gearName?: string | null;
  description?: string | null;

  notes?: string;
  source: PerformanceActivitySource;
  externalId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PerformanceGoalPeriod = "MONTHLY" | "YEARLY";

export type PerformanceGoalMetric =
  | "DISTANCE_KM"
  | "DURATION_MINUTES"
  | "ELEVATION_METERS"
  | "ACTIVITIES";

export type PerformanceGoal = {
  id: string;
  year: number;
  month?: number | null;
  period: PerformanceGoalPeriod;
  activityType?: PerformanceActivityType | null;
  metric: PerformanceGoalMetric;
  target: number;
  createdAt: string;
  updatedAt: string;
};

export type PerformanceAssessment = {
  id: string;
  date: string;
  weightKg?: number | null;
  bodyFatPercent?: number | null;
  muscleMassKg?: number | null;
  waistCm?: number | null;
  abdomenCm?: number | null;
  chestCm?: number | null;
  armCm?: number | null;
  thighCm?: number | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type PerformanceRecordMetric =
  | "LONGEST_DISTANCE"
  | "LONGEST_DURATION"
  | "HIGHEST_ELEVATION";

export type PerformanceRecord = {
  id: string;
  activityType: PerformanceActivityType;
  metric: PerformanceRecordMetric;
  value: number;
  unit: string;
  date: string;
  activityId?: string | null;
  notes?: string;
};

export type PerformanceData = {
  version: 1;
  activities: PerformanceActivity[];
  goals: PerformanceGoal[];
  assessments: PerformanceAssessment[];
  records: PerformanceRecord[];
  metadata?: {
    source?: string;
    importedAt?: string;
    notes?: string[];
  };
};