type TodoistTask = {
  id: string;
  project_id: string;
  content: string;
  description?: string;
  checked?: boolean;
  priority?: number;
  added_at?: string;
  updated_at?: string;
  duration?: {
    amount?: number;
    unit?: string;
  } | null;
  due?: {
    date?: string;
    string?: string;
    timezone?: string | null;
    is_recurring?: boolean;
  } | null;
};

type TodoistPage<T> = {
  results?: T[];
  next_cursor?: string | null;
};


function todoistDueFields(task: TodoistTask) {
  const raw = task.due?.date || "";

  if (!raw) {
    return {
      dueDate: "",
      dueTime: "",
      dueString: task.due?.string || "",
    };
  }

  if (!raw.includes("T")) {
    return {
      dueDate: raw.slice(0, 10),
      dueTime: "",
      dueString: task.due?.string || "",
    };
  }

  // Datas "flutuantes" do Todoist já vêm no horário local do usuário.
  if (!raw.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(raw)) {
    return {
      dueDate: raw.slice(0, 10),
      dueTime: raw.slice(11, 16),
      dueString: task.due?.string || "",
    };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return {
      dueDate: raw.slice(0, 10),
      dueTime: raw.slice(11, 16),
      dueString: task.due?.string || "",
    };
  }

  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(parsed);

  const read = (type: string) =>
    parts.find(part => part.type === type)?.value || "";

  return {
    dueDate: `${read("year")}-${read("month")}-${read("day")}`,
    dueTime: `${read("hour")}:${read("minute")}`,
    dueString: task.due?.string || "",
  };
}
function mapTask(task: TodoistTask) {
  const now = new Date().toISOString();
  const due = todoistDueFields(task);

  return {
    id: String(task.id),
    title: String(task.content || ""),
    text: String(task.description || ""),
    done: Boolean(task.checked),
    createdAt: task.added_at || now,
    updatedAt: task.updated_at || task.added_at || now,
    dueDate: due.dueDate,
    dueTime: due.dueTime,
    dueString: due.dueString,
    priority:
      Number.isFinite(Number(task.priority)) &&
      Number(task.priority) >= 1 &&
      Number(task.priority) <= 4
        ? Number(task.priority)
        : 4,
  };
}
async function pages<T>(path:string,params:Record<string,string>={}){const token=process.env.TODOIST_API_TOKEN?.trim();if(!token)return null;const items:T[]=[];let cursor="";for(let page=0;page<20;page++){const p=new URLSearchParams({...params,limit:"200"});if(cursor)p.set("cursor",cursor);const r=await fetch("https://api.todoist.com/api/v1"+path+"?"+p,{headers:{Authorization:"Bearer "+token},cache:"no-store",signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error("Compromissos indisponíveis");const data=await r.json();if(Array.isArray(data))return [...items,...data];if(!Array.isArray(data.results))throw new Error("Compromissos inválidos");items.push(...data.results);cursor=data.next_cursor||"";if(!cursor)return items;}throw new Error("Compromissos incompletos");}
export async function widgetNotes(date:string){if(!process.env.TODOIST_API_TOKEN)return {items:[],status:"not_configured"};try{const projects=await pages<{id:string;inbox_project?:boolean;is_archived?:boolean}>("/projects"),inbox=projects?.find(p=>p.inbox_project&&!p.is_archived);if(!inbox)return {items:[],status:"unavailable"};const tasks=await pages<TodoistTask>("/tasks",{project_id:inbox.id});return {items:(tasks||[]).map(mapTask).filter(t=>!t.done&&t.dueDate===date).sort((a,b)=>(a.dueTime||"23:59").localeCompare(b.dueTime||"23:59")),status:"ok"};}catch{return {items:[],status:"unavailable"};}}
