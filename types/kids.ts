export type KidsCategory = "RED" | "ORANGE" | "GREEN" | "YELLOW" | "PURPLE";
export type KidsAttendanceStatus = "PRESENT" | "ABSENT";
export type KidsLessonStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "HOLIDAY";
export type KidsReplacementStatus = "NONE" | "PENDING" | "SCHEDULED" | "COMPLETED";

export type KidsStudent = { id:string; name:string; active:boolean; startDate?:string };

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

export type KidsLessonImage = { name:string; dataUrl:string };

export type KidsLesson = {
  id:string;
  classId:string;
  date:string;
  status:KidsLessonStatus;
  attendance:Record<string,KidsAttendanceStatus>;
  objective:string;
  plannedPlan:string;
  actualPlan:string;
  notes:string;
  image?:KidsLessonImage;
  replacementEligible:boolean;
  replacementStatus:KidsReplacementStatus;
  replacementDate?:string;
  updatedAt:string;
};

export type KidsData = {
  version:1;
  semesterStart:string;
  semesterEnd:string;
  classes:KidsClass[];
  lessons:KidsLesson[];
  updatedAt:string;
};
