import { isAuthorized } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const TODOIST_API = "https://api.todoist.com/api/v1";

type TodoistProject = {
  id: string;
  name: string;
  inbox_project?: boolean;
  is_archived?: boolean;
};

type TodoistTask = {
  id: string;
  project_id: string;
  content: string;
  description?: string;
  checked?: boolean;
  priority?: number;
  added_at?: string;
  updated_at?: string;
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

class TodoistError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

let cachedInboxProjectId = "";

function todoistToken() {
  const token = process.env.TODOIST_API_TOKEN?.trim();

  if (!token) {
    throw new TodoistError(
      "Todoist ainda não está configurado no servidor.",
      503
    );
  }

  return token;
}

async function todoistRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${TODOIST_API}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${todoistToken()}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    console.error(
      "Erro Todoist:",
      response.status,
      typeof data === "string" ? data.slice(0, 300) : data
    );

    if (response.status === 401 || response.status === 403) {
      throw new TodoistError(
        "Não foi possível autenticar no Todoist. Confira o token no Render.",
        502
      );
    }

    throw new TodoistError(
      `O Todoist não respondeu como esperado (${response.status}).`,
      502
    );
  }

  return data as T;
}

async function allPages<T>(
  path: string,
  params: Record<string, string> = {}
) {
  const items: T[] = [];
  let cursor = "";

  do {
    const search = new URLSearchParams({
      ...params,
      limit: "200",
    });

    if (cursor) search.set("cursor", cursor);

    const page = await todoistRequest<TodoistPage<T> | T[]>(
      `${path}?${search.toString()}`
    );

    if (Array.isArray(page)) {
      items.push(...page);
      cursor = "";
    } else {
      items.push(...(Array.isArray(page.results) ? page.results : []));
      cursor = page.next_cursor || "";
    }
  } while (cursor);

  return items;
}

async function inboxProjectId() {
  if (cachedInboxProjectId) return cachedInboxProjectId;

  const projects = await allPages<TodoistProject>("/projects");
  const inbox = projects.find(
    project => project.inbox_project === true && project.is_archived !== true
  );

  if (!inbox) {
    throw new TodoistError(
      "Não foi possível localizar a Caixa de Entrada do Todoist.",
      502
    );
  }

  cachedInboxProjectId = String(inbox.id);
  return cachedInboxProjectId;
}

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

function bodyRecord(body: unknown) {
  return body && typeof body === "object"
    ? (body as Record<string, unknown>)
    : {};
}

function taskText(body: unknown) {
  const record = bodyRecord(body);
  const title = String(record.title || "").trim();
  const text = String(record.text || "").trim();

  if (title) {
    return {
      content: title,
      description: text,
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  return {
    content: lines[0] || "",
    description: lines.slice(1).join("\n"),
  };
}

function taskSchedule(body: unknown, includeClear = false) {
  const record = bodyRecord(body);
  const dueDate = String(record.dueDate || "").trim();
  const dueTime = String(record.dueTime || "").trim();
  const priorityRaw = Number(record.priority);
  const priority =
    Number.isInteger(priorityRaw) && priorityRaw >= 1 && priorityRaw <= 4
      ? priorityRaw
      : 4;

  const payload: Record<string, unknown> = { priority };

  if (dueDate) {
    if (dueTime) {
      payload.due_datetime = `${dueDate}T${dueTime}:00`;
    } else {
      payload.due_date = dueDate;
    }
  } else if (includeClear) {
    // Forma oficial/suportada pelo Todoist para remover o vencimento.
    payload.due_string = "no date";
  }

  return payload;
}

async function assertTaskInInbox(taskId: string, projectId: string) {
  const task = await todoistRequest<TodoistTask>(
    `/tasks/${encodeURIComponent(taskId)}`
  );

  if (String(task.project_id) !== String(projectId)) {
    throw new TodoistError(
      "Essa tarefa não pertence à Caixa de Entrada do Todoist.",
      403
    );
  }

  return task;
}

function errorResponse(error: unknown) {
  console.error("Erro na integração Todoist:", error);

  if (error instanceof TodoistError) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: error.status }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Falha na integração com o Todoist.",
    },
    { status: 500 }
  );
}

async function authorized(request: NextRequest) {
  if (await isAuthorized(request)) return null;

  return NextResponse.json(
    { message: "Sessão inválida. Entre novamente no DMP." },
    { status: 401 }
  );
}

export async function GET(request: NextRequest) {
  const unauthorized = await authorized(request);
  if (unauthorized) return unauthorized;

  try {
    const projectId = await inboxProjectId();
    const tasks = await allPages<TodoistTask>("/tasks", {
      project_id: projectId,
    });

    return NextResponse.json({
      ok: true,
      source: "todoist",
      project: {
        id: projectId,
        name: "Entrada",
        inbox: true,
      },
      data: tasks.map(mapTask),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await authorized(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const { content, description } = taskText(body);

    if (!content) {
      return NextResponse.json(
        {
          ok: false,
          error: "Escreva um título para a tarefa.",
        },
        { status: 400 }
      );
    }

    const task = await todoistRequest<TodoistTask>("/tasks", {
      method: "POST",
      body: JSON.stringify({
        content,
        description,
        ...taskSchedule(body),
        // Sem project_id: o próprio Todoist cria na Caixa de Entrada.
      }),
    });

    return NextResponse.json({
      ok: true,
      data: mapTask(task),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await authorized(request);
  if (unauthorized) return unauthorized;

  try {
    const taskId = request.nextUrl.searchParams.get("id")?.trim() || "";

    if (!taskId) {
      return NextResponse.json(
        { ok: false, error: "Tarefa não informada." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const record = bodyRecord(body);
    const projectId = await inboxProjectId();

    await assertTaskInInbox(taskId, projectId);

    if (record.done === true) {
      await todoistRequest<unknown>(
        `/tasks/${encodeURIComponent(taskId)}/close`,
        { method: "POST" }
      );

      return NextResponse.json({
        ok: true,
        completed: true,
      });
    }

    const updatePayload: Record<string, unknown> = {};

    if (
      Object.prototype.hasOwnProperty.call(record, "title") ||
      Object.prototype.hasOwnProperty.call(record, "text")
    ) {
      const { content, description } = taskText(record);

      if (!content) {
        return NextResponse.json(
          {
            ok: false,
            error: "A tarefa precisa ter um título.",
          },
          { status: 400 }
        );
      }

      updatePayload.content = content;
      updatePayload.description = description;
    }

    if (
      Object.prototype.hasOwnProperty.call(record, "dueDate") ||
      Object.prototype.hasOwnProperty.call(record, "dueTime") ||
      Object.prototype.hasOwnProperty.call(record, "priority")
    ) {
      Object.assign(updatePayload, taskSchedule(record, true));
    }

    if (!Object.keys(updatePayload).length) {
      return NextResponse.json({ ok: true });
    }

    const task = await todoistRequest<TodoistTask>(
      `/tasks/${encodeURIComponent(taskId)}`,
      {
        method: "POST",
        body: JSON.stringify(updatePayload),
      }
    );

    return NextResponse.json({
      ok: true,
      data: mapTask(task),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await authorized(request);
  if (unauthorized) return unauthorized;

  try {
    const taskId = request.nextUrl.searchParams.get("id")?.trim() || "";

    if (!taskId) {
      return NextResponse.json(
        { ok: false, error: "Tarefa não informada." },
        { status: 400 }
      );
    }

    const projectId = await inboxProjectId();
    await assertTaskInInbox(taskId, projectId);

    await todoistRequest<unknown>(
      `/tasks/${encodeURIComponent(taskId)}`,
      { method: "DELETE" }
    );

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
