import { isAuthorized } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getGoogleAccessToken, googleConfigured, setGoogleCookies } from "@/lib/google-calendar";
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";

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


const GOOGLE_CALENDAR_EVENTS =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_TIME_ZONE = "America/Sao_Paulo";
const DEFAULT_EVENT_MINUTES = 60;
const GOOGLE_SYNC_LOCK = "dmp_todoist_google_sync_v1";

type GoogleSyncSummary = {
  changed: boolean;
  created: number;
  updated: number;
  removedSchedule: number;
  connected: boolean;
  warning?: string;
  refreshed?: any;
};

type GoogleEventPayload = {
  summary: string;
  description: string;
  colorId: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  extendedProperties: {
    private: {
      dmpSource: string;
      dmpTodoistTaskId: string;
    };
  };
};

type GoogleLinkClient = PoolClient;

function eventDurationMinutes(task: TodoistTask) {
  const amount = Number(task.duration?.amount || 0);
  const unit = String(task.duration?.unit || "").toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) return DEFAULT_EVENT_MINUTES;

  if (unit === "day") {
    return Math.min(Math.round(amount * 24 * 60), 7 * 24 * 60);
  }

  if (unit === "minute") {
    return Math.min(Math.max(5, Math.round(amount)), 7 * 24 * 60);
  }

  return DEFAULT_EVENT_MINUTES;
}

function addWallClockMinutes(
  dueDate: string,
  dueTime: string,
  minutes: number
) {
  const [year, month, day] = dueDate.split("-").map(Number);
  const [hour, minute] = dueTime.split(":").map(Number);

  const stamp = new Date(
    Date.UTC(
      year,
      Math.max(0, month - 1),
      day,
      hour,
      minute + minutes,
      0
    )
  );

  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    `${stamp.getUTCFullYear()}-${pad(stamp.getUTCMonth() + 1)}-` +
    `${pad(stamp.getUTCDate())}T${pad(stamp.getUTCHours())}:` +
    `${pad(stamp.getUTCMinutes())}:00`
  );
}

function googlePayload(task: TodoistTask): GoogleEventPayload | null {
  const due = todoistDueFields(task);

  if (!due.dueDate || !due.dueTime) return null;

  const start = `${due.dueDate}T${due.dueTime}:00`;
  const end = addWallClockMinutes(
    due.dueDate,
    due.dueTime,
    eventDurationMinutes(task)
  );

  return {
    summary: String(task.content || "Compromisso"),
    description: String(task.description || ""),
    colorId: "3",
    start: {
      dateTime: start,
      timeZone: GOOGLE_TIME_ZONE,
    },
    end: {
      dateTime: end,
      timeZone: GOOGLE_TIME_ZONE,
    },
    extendedProperties: {
      private: {
        dmpSource: "todoist",
        dmpTodoistTaskId: String(task.id),
      },
    },
  };
}

function googleFingerprint(payload: GoogleEventPayload) {
  return JSON.stringify({
    summary: payload.summary,
    description: payload.description,
    colorId: payload.colorId,
    start: payload.start.dateTime,
    end: payload.end.dateTime,
  });
}

function googleHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
}

async function ensureGoogleLinkTable(client: GoogleLinkClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS dmp_todoist_google_links (
      todoist_task_id TEXT PRIMARY KEY,
      google_event_id TEXT NOT NULL,
      last_fingerprint TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function readGoogleLink(
  client: GoogleLinkClient,
  todoistTaskId: string
) {
  const result = await client.query(
    `
      SELECT google_event_id, last_fingerprint
      FROM dmp_todoist_google_links
      WHERE todoist_task_id = $1
      LIMIT 1
    `,
    [todoistTaskId]
  );

  return result.rows[0] as
    | { google_event_id: string; last_fingerprint: string }
    | undefined;
}

async function saveGoogleLink(
  client: GoogleLinkClient,
  todoistTaskId: string,
  googleEventId: string,
  fingerprint: string
) {
  await client.query(
    `
      INSERT INTO dmp_todoist_google_links
        (todoist_task_id, google_event_id, last_fingerprint, updated_at)
      VALUES
        ($1, $2, $3, NOW())
      ON CONFLICT (todoist_task_id)
      DO UPDATE SET
        google_event_id = EXCLUDED.google_event_id,
        last_fingerprint = EXCLUDED.last_fingerprint,
        updated_at = NOW()
    `,
    [todoistTaskId, googleEventId, fingerprint]
  );
}

async function removeGoogleLink(
  client: GoogleLinkClient,
  todoistTaskId: string
) {
  await client.query(
    "DELETE FROM dmp_todoist_google_links WHERE todoist_task_id = $1",
    [todoistTaskId]
  );
}

async function findTaggedGoogleEvent(
  accessToken: string,
  todoistTaskId: string
) {
  const params = new URLSearchParams({
    privateExtendedProperty: `dmpTodoistTaskId=${todoistTaskId}`,
    showDeleted: "false",
    singleEvents: "true",
    maxResults: "1",
  });

  const response = await fetch(
    `${GOOGLE_CALENDAR_EVENTS}?${params.toString()}`,
    {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Falha ao procurar vínculo no Google Agenda (${response.status}).`
    );
  }

  const data = (await response.json()) as { items?: Array<{ id?: string }> };
  return data.items?.find(item => item.id)?.id || "";
}

async function patchGoogleEvent(
  accessToken: string,
  googleEventId: string,
  payload: GoogleEventPayload
) {
  const response = await fetch(
    `${GOOGLE_CALENDAR_EVENTS}/${encodeURIComponent(googleEventId)}`,
    {
      method: "PATCH",
      headers: googleHeaders(accessToken),
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  if (response.status === 404 || response.status === 410) {
    return false;
  }

  if (!response.ok) {
    throw new Error(
      `Falha ao atualizar compromisso no Google Agenda (${response.status}).`
    );
  }

  return true;
}

async function createGoogleEvent(
  accessToken: string,
  payload: GoogleEventPayload
) {
  const response = await fetch(GOOGLE_CALENDAR_EVENTS, {
    method: "POST",
    headers: googleHeaders(accessToken),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Falha ao criar compromisso no Google Agenda (${response.status}).`
    );
  }

  const event = (await response.json()) as { id?: string };

  if (!event.id) {
    throw new Error("Google Agenda criou um evento sem identificador.");
  }

  return String(event.id);
}

async function deleteGoogleEvent(
  accessToken: string,
  googleEventId: string
) {
  const response = await fetch(
    `${GOOGLE_CALENDAR_EVENTS}/${encodeURIComponent(googleEventId)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );

  if (
    !response.ok &&
    response.status !== 404 &&
    response.status !== 410
  ) {
    throw new Error(
      `Falha ao retirar compromisso sem horário do Google Agenda (${response.status}).`
    );
  }
}

async function syncOneTodoistTask(
  client: GoogleLinkClient,
  accessToken: string,
  task: TodoistTask
) {
  const taskId = String(task.id);
  const payload = googlePayload(task);
  const link = await readGoogleLink(client, taskId);

  if (!payload) {
    if (!link) return "none" as const;

    await deleteGoogleEvent(accessToken, link.google_event_id);
    await removeGoogleLink(client, taskId);
    return "removedSchedule" as const;
  }

  const fingerprint = googleFingerprint(payload);

  if (link && link.last_fingerprint === fingerprint) {
    return "none" as const;
  }

  if (link) {
    const updated = await patchGoogleEvent(
      accessToken,
      link.google_event_id,
      payload
    );

    if (updated) {
      await saveGoogleLink(
        client,
        taskId,
        link.google_event_id,
        fingerprint
      );
      return "updated" as const;
    }
  }

  const tagged = await findTaggedGoogleEvent(accessToken, taskId);

  if (tagged) {
    await patchGoogleEvent(accessToken, tagged, payload);
    await saveGoogleLink(client, taskId, tagged, fingerprint);
    return "updated" as const;
  }

  const eventId = await createGoogleEvent(accessToken, payload);
  await saveGoogleLink(client, taskId, eventId, fingerprint);
  return "created" as const;
}

async function syncTodoistTasksToGoogle(
  request: NextRequest,
  tasks: TodoistTask[]
): Promise<GoogleSyncSummary> {
  const summary: GoogleSyncSummary = {
    changed: false,
    created: 0,
    updated: 0,
    removedSchedule: 0,
    connected: false,
  };

  if (!googleConfigured()) return summary;

  try {
    const { accessToken, refreshed } = await getGoogleAccessToken(request);
    summary.refreshed = refreshed || undefined;

    if (!accessToken) return summary;

    summary.connected = true;

    const client = await pool.connect();
    let lockAcquired = false;

    try {
      await client.query(
        "SELECT pg_advisory_lock(hashtext($1))",
        [GOOGLE_SYNC_LOCK]
      );
      lockAcquired = true;

      await ensureGoogleLinkTable(client);

      for (const task of tasks) {
        const result = await syncOneTodoistTask(
          client,
          accessToken,
          task
        );

        if (result === "created") summary.created += 1;
        if (result === "updated") summary.updated += 1;
        if (result === "removedSchedule") {
          summary.removedSchedule += 1;
        }
      }
    } finally {
      if (lockAcquired) {
        try {
          await client.query(
            "SELECT pg_advisory_unlock(hashtext($1))",
            [GOOGLE_SYNC_LOCK]
          );
        } catch {}
      }
      client.release();
    }

    summary.changed =
      summary.created > 0 ||
      summary.updated > 0 ||
      summary.removedSchedule > 0;

    return summary;
  } catch (error) {
    console.error("Erro ao sincronizar Todoist com Google Agenda:", error);

    return {
      ...summary,
      warning:
        "Todoist foi atualizado, mas o Google Agenda não pôde ser sincronizado agora.",
    };
  }
}

function publicGoogleSync(summary: GoogleSyncSummary) {
  return {
    changed: summary.changed,
    created: summary.created,
    updated: summary.updated,
    removedSchedule: summary.removedSchedule,
    connected: summary.connected,
    warning: summary.warning || "",
  };
}

function responseWithGoogle(
  payload: Record<string, unknown>,
  google: GoogleSyncSummary
) {
  const response = NextResponse.json({
    ...payload,
    google: publicGoogleSync(google),
  });

  if (google.refreshed) {
    setGoogleCookies(response, google.refreshed);
  }

  return response;
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

    const google = await syncTodoistTasksToGoogle(request, tasks);

    return responseWithGoogle(
      {
        ok: true,
        source: "todoist",
        project: {
          id: projectId,
          name: "Entrada",
          inbox: true,
        },
        data: tasks.map(mapTask),
      },
      google
    );
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

    const google = await syncTodoistTasksToGoogle(request, [task]);

    return responseWithGoogle(
      {
        ok: true,
        data: mapTask(task),
      },
      google
    );
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

    const google = await syncTodoistTasksToGoogle(request, [task]);

    return responseWithGoogle(
      {
        ok: true,
        data: mapTask(task),
      },
      google
    );
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
