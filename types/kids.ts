export type KidsCategory = "RED" | "ORANGE" | "GREEN" | "YELLOW";
export type KidsAttendanceStatus = "PRESENT" | "ABSENT";
export type KidsLessonStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "HOLIDAY";
export type KidsReplacementStatus = "NONE" | "PENDING" | "SCHEDULED" | "COMPLETED";

export type KidsBillingMode = "ONE_TIME" | "RECURRING" | "INSTALLMENTS";
export type KidsStudent = {
  id:string; name:string; active:boolean; startDate?:string; birthDate?:string;
  fatherName?:string; fatherPhone?:string; motherName?:string; motherPhone?:string;
  primaryContact?:"FATHER"|"MOTHER"; financialResponsible?:string; notes?:string;
  monthlyAmount?:number; dueDay?:number; billingMode?:KidsBillingMode; installmentCount?:number;
};

export type KidsClass = {
  id:string;
  name:string;
  weekday:number;
  startTime:string;
  endTime:string;
  category:KidsCategory;
  teacher:string;
  students:KidsStudent[];
  active:boolean;
  updatedAt:string;
};

export type KidsLessonImage = { name:string; dataUrl:string; mimeType?:string };

export type KidsLesson = {
  id:string;
  classId:string;
  date:string;
  status:KidsLessonStatus;
  attendance:Record<string,KidsAttendanceStatus>;
  objective:string;
  theme?:string;
  pedagogicalFocus?:string;
  stations?:string[];
  teacherTip?:string;
  plannedPlan:string;
  actualPlan:string;
  notes:string;
  image?:KidsLessonImage;
  replacementEligible:boolean;
  replacementStatus:KidsReplacementStatus;
  replacementDate?:string;
  kind?:"REGULAR"|"REPLACEMENT";
  replacementName?:string;
  replacementCategory?:KidsCategory;
  replacementStartTime?:string;
  replacementEndTime?:string;
  replacementCapacity?:number;
  replacementStudentIds?:string[];
  updatedAt:string;
};

export type KidsReplacement = {
  id:string; studentId:string; classId:string; sourceLessonId:string; sourceDate:string;
  reason:string; status:"PENDING"|"SCHEDULED"|"COMPLETED"; scheduledDate?:string; completedDate?:string;
  destinationLessonId?:string;
  attendance?:KidsAttendanceStatus;
};

export type KidsData = {
  version:1;
  semesterStart:string;
  semesterEnd:string;
  classes:KidsClass[];
  lessons:KidsLesson[];
  replacements?:KidsReplacement[];
  updatedAt:string;
};
