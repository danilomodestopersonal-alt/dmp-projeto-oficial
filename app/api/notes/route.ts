import { isAuthorized } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const TODOIST_API = "https://api.todoist.com/api/v1";
const PROJECT_NAME = "DMP | Recados";

type TodoistProject = {
  id: string;
  name: string;
  is_archived?: boolean;
};

type TodoistTask = {
  id: string;
  project_id: string;
  content: string;
  description?: string;
  checked?: boolean;
  added_at?: string;
  updated_at?: string;
  due?: {
    date?: string;
    string?: string;
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

let cachedProjectId = "";

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
      "O Todoist não respondeu como esperado.",
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

async function ensureProject() {
  if (cachedProjectId) return cachedProjectId;

  const projects = await allPages<TodoistProject>("/projects");
  const existing = projects.find(
    project =>
      project.name === PROJECT_NAME &&
      project.is_archived !== true
  );

  if (existing) {
    cachedProjectId = String(existing.id);
    return cachedProjectId;
  }

  const created = await todoistRequest<TodoistProject>("/projects", {
    method: "POST",
    body: JSON.stringify({
      name: PROJECT_NAME,
      view_style: "list",
    }),
  });

  cachedProjectId = String(created.id);
  return cachedProjectId;
}

function mapTask(task: TodoistTask) {
  const now = new Date().toISOString();

  return {
    id: String(task.id),
    title: String(task.content || ""),
    text: String(task.description || ""),
    done: Boolean(task.checked),
    createdAt: task.added_at || now,
    updatedAt: task.updated_at || task.added_at || now,
    dueDate: task.due?.date || "",
    dueString: task.due?.string || "",
  };
}

function taskText(body: unknown) {
  const record =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};

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

async function assertTaskInProject(
  taskId: string,
  projectId: string
) {
  const task = await todoistRequest<TodoistTask>(
    `/tasks/${encodeURIComponent(taskId)}`
  );

  if (String(task.project_id) !== String(projectId)) {
    throw new TodoistError(
      "Esse recado não pertence ao projeto DMP | Recados.",
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
    const projectId = await ensureProject();
    const tasks = await allPages<TodoistTask>("/tasks", {
      project_id: projectId,
    });

    return NextResponse.json({
      ok: true,
      source: "todoist",
      project: {
        id: projectId,
        name: PROJECT_NAME,
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
    const projectId = await ensureProject();
    const { content, description } = taskText(body);

    if (!content) {
      return NextResponse.json(
        {
          ok: false,
          error: "Escreva um título ou conteúdo para o recado.",
        },
        { status: 400 }
      );
    }

    const task = await todoistRequest<TodoistTask>("/tasks", {
      method: "POST",
      body: JSON.stringify({
        content,
        description,
        project_id: projectId,
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
        { ok: false, error: "Recado não informado." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const record =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : {};
    const projectId = await ensureProject();

    await assertTaskInProject(taskId, projectId);

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

    if (
      Object.prototype.hasOwnProperty.call(record, "title") ||
      Object.prototype.hasOwnProperty.call(record, "text")
    ) {
      const { content, description } = taskText(record);

      if (!content) {
        return NextResponse.json(
          {
            ok: false,
            error: "O recado precisa ter um título ou conteúdo.",
          },
          { status: 400 }
        );
      }

      const task = await todoistRequest<TodoistTask>(
        `/tasks/${encodeURIComponent(taskId)}`,
        {
          method: "POST",
          body: JSON.stringify({
            content,
            description,
          }),
        }
      );

      return NextResponse.json({
        ok: true,
        data: mapTask(task),
      });
    }

    return NextResponse.json({
      ok: true,
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
        { ok: false, error: "Recado não informado." },
        { status: 400 }
      );
    }

    const projectId = await ensureProject();
    await assertTaskInProject(taskId, projectId);

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
