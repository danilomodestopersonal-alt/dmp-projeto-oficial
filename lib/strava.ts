import { pool } from "@/lib/db";
import type { PerformanceActivity, PerformanceActivityType, PerformanceData } from "@/types/performance";

const CONNECTION_ID = "strava_connection_v1";
const PERFORMANCE_ID = "performance_v1";

export type StravaConnection = {
  version: 1;
  athleteId: number;
  athleteName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  connectedAt: string;
  lastSyncAt?: string | null;
  lastSync?: { fetched: number; added: number; updated: number } | null;
};

type StravaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete?: { id: number; firstname?: string; lastname?: string; username?: string };
};

type StravaSummaryActivity = {
  id: number;
  name: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  sport_type?: string;
  type?: string;
  start_date?: string;
  start_date_local?: string;
  average_speed?: number;
  max_speed?: number;
};

export function stravaConfigured() {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

export function stravaRedirectUri(requestUrl: string) {
  return process.env.STRAVA_REDIRECT_URI || new URL("/api/strava/callback", requestUrl).toString();
}

export async function getConnection(): Promise<StravaConnection | null> {
  const result = await pool.query("SELECT payload FROM dmp_data WHERE id = $1", [CONNECTION_ID]);
  return (result.rows[0]?.payload as StravaConnection | undefined) ?? null;
}

export async function saveConnection(connection: StravaConnection) {
  await pool.query(
    `INSERT INTO dmp_data (id, payload, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [CONNECTION_ID, JSON.stringify(connection)]
  );
}

export async function deleteConnection() {
  await pool.query("DELETE FROM dmp_data WHERE id = $1", [CONNECTION_ID]);
}

function basicAuth() {
  return Buffer.from(`${process.env.STRAVA_CLIENT_ID}:${process.env.STRAVA_CLIENT_SECRET}`).toString("base64");
}

export async function exchangeAuthorizationCode(code: string, requestUrl: string) {
  if (!stravaConfigured()) throw new Error("Strava não configurado no servidor.");
  const body = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    client_secret: process.env.STRAVA_CLIENT_SECRET!,
    code,
    grant_type: "authorization_code",
  });
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Strava recusou a autorização (${response.status}).`);
  const token = await response.json() as StravaTokenResponse;
  if (!token.access_token || !token.refresh_token || !token.athlete?.id) throw new Error("Resposta de autorização do Strava incompleta.");
  const name = [token.athlete.firstname, token.athlete.lastname].filter(Boolean).join(" ") || token.athlete.username || `Atleta ${token.athlete.id}`;
  const connection: StravaConnection = {
    version: 1,
    athleteId: token.athlete.id,
    athleteName: name,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at,
    scopes: token.scope ? token.scope.split(",").map(item => item.trim()).filter(Boolean) : [],
    connectedAt: new Date().toISOString(),
    lastSyncAt: null,
    lastSync: null,
  };
  await saveConnection(connection);
  return connection;
}

export async function getValidAccessToken(connection: StravaConnection) {
  if (connection.expiresAt > Math.floor(Date.now() / 1000) + 300) return { accessToken: connection.accessToken, connection };
  const body = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    client_secret: process.env.STRAVA_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: connection.refreshToken,
  });
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Não foi possível renovar o acesso ao Strava (${response.status}).`);
  const token = await response.json() as StravaTokenResponse;
  const next: StravaConnection = {
    ...connection,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || connection.refreshToken,
    expiresAt: token.expires_at,
    scopes: token.scope ? token.scope.split(",").map(item => item.trim()).filter(Boolean) : connection.scopes,
  };
  await saveConnection(next);
  return { accessToken: next.accessToken, connection: next };
}

function activityType(sportType: string): PerformanceActivityType {
  const value = sportType.toLowerCase();
  if (value.includes("ride") || value.includes("cycling") || value.includes("handcycle")) return "CYCLING";
  if (value.includes("run")) return "RUNNING";
  if (value.includes("tennis")) return "TENNIS";
  if (value.includes("pilates")) return "PILATES";
  if (value.includes("weight") || value.includes("workout") || value.includes("crossfit")) return "STRENGTH";
  return "OTHER";
}

function round(value: number, decimals = 1) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function convertActivity(item: StravaSummaryActivity): PerformanceActivity {
  const sport = item.sport_type || item.type || "Workout";
  const localDate = (item.start_date_local || item.start_date || new Date().toISOString()).slice(0, 10);
  const avgKmh = item.average_speed ? round(item.average_speed * 3.6, 1) : null;
  const maxKmh = item.max_speed ? round(item.max_speed * 3.6, 1) : null;
  const details = [`Strava • ${sport}`];
  if (avgKmh) details.push(`média ${avgKmh} km/h`);
  if (maxKmh) details.push(`máx. ${maxKmh} km/h`);
  const timestamp = new Date().toISOString();
  return {
    id: `strava-${item.id}`,
    date: localDate,
    type: activityType(sport),
    title: item.name || sport,
    distanceKm: item.distance ? round(item.distance / 1000, 3) : 0,
    durationMinutes: item.moving_time ? Math.max(1, Math.round(item.moving_time / 60)) : null,
    elevationMeters: item.total_elevation_gain ? round(item.total_elevation_gain, 1) : 0,
    calories: null,
    notes: details.join(" • "),
    source: "STRAVA",
    externalId: String(item.id),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function similarLegacy(existing: PerformanceActivity, incoming: PerformanceActivity) {
  if (existing.date !== incoming.date) return false;
  const sameTitle = existing.title.trim().toLowerCase() === incoming.title.trim().toLowerCase();
  const distA = existing.distanceKm ?? 0;
  const distB = incoming.distanceKm ?? 0;
  const closeDistance = Math.abs(distA - distB) <= 0.15;
  const timeA = existing.durationMinutes ?? 0;
  const timeB = incoming.durationMinutes ?? 0;
  const closeTime = !timeA || !timeB || Math.abs(timeA - timeB) <= 4;
  return sameTitle && closeDistance && closeTime;
}

async function fetchActivities(accessToken: string, after: number) {
  const all: StravaSummaryActivity[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.searchParams.set("after", String(after));
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "200");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!response.ok) throw new Error(`Strava não retornou as atividades (${response.status}).`);
    const chunk = await response.json() as StravaSummaryActivity[];
    all.push(...chunk);
    if (chunk.length < 200) break;
  }
  return all;
}

export async function syncStrava() {
  const currentConnection = await getConnection();
  if (!currentConnection) throw new Error("Strava ainda não está conectado.");
  const { accessToken, connection } = await getValidAccessToken(currentConnection);
  const perfResult = await pool.query("SELECT payload FROM dmp_data WHERE id = $1", [PERFORMANCE_ID]);
  const performance = (perfResult.rows[0]?.payload as PerformanceData | undefined) ?? { version: 1, activities: [], goals: [], assessments: [], records: [] };
  const dates = performance.activities.map(a => a.date).filter(Boolean).sort();
  const latestDate = dates[dates.length - 1];
  const baseline = latestDate ? new Date(`${latestDate}T00:00:00Z`).getTime() : Date.now() - 90 * 24 * 60 * 60 * 1000;
  const after = Math.floor((baseline - 7 * 24 * 60 * 60 * 1000) / 1000);
  const raw = await fetchActivities(accessToken, after);
  const incoming = raw.map(convertActivity);
  const activities = [...performance.activities];
  let added = 0;
  let updated = 0;

  for (const activity of incoming) {
    let index = activities.findIndex(item => item.externalId === activity.externalId);
    if (index < 0) index = activities.findIndex(item => item.externalId?.startsWith("legacy-") && similarLegacy(item, activity));
    if (index >= 0) {
      const old = activities[index];
      activities[index] = {
        ...old,
        ...activity,
        id: old.id,
        calories: old.calories ?? activity.calories,
        createdAt: old.createdAt,
        notes: old.notes?.includes("Importado da planilha histórica") ? `${old.notes} • ID Strava vinculado` : activity.notes,
        updatedAt: new Date().toISOString(),
      };
      updated += 1;
    } else {
      activities.push(activity);
      added += 1;
    }
  }

  activities.sort((a, b) => b.date.localeCompare(a.date));
  const nextPerformance: PerformanceData = {
    ...performance,
    activities,
    metadata: {
      ...(performance.metadata || {}),
      source: "STRAVA",
      notes: [...new Set([...(performance.metadata?.notes || []), "Sincronização oficial Strava habilitada no DMP v4.7.1."])],
    },
  };
  await pool.query(
    `INSERT INTO dmp_data (id, payload, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [PERFORMANCE_ID, JSON.stringify(nextPerformance)]
  );

  const syncedConnection: StravaConnection = {
    ...connection,
    lastSyncAt: new Date().toISOString(),
    lastSync: { fetched: raw.length, added, updated },
  };
  await saveConnection(syncedConnection);
  return { fetched: raw.length, added, updated, total: activities.length, lastSyncAt: syncedConnection.lastSyncAt };
}

export async function revokeStrava(connection: StravaConnection) {
  if (stravaConfigured()) {
    const token = connection.refreshToken || connection.accessToken;
    try {
      await fetch("https://www.strava.com/oauth/revoke", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth()}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token, token_type_hint: connection.refreshToken ? "refresh_token" : "access_token" }),
        cache: "no-store",
      });
    } catch (error) {
      console.error("Falha ao revogar token no Strava; removendo vínculo local mesmo assim.", error);
    }
  }
  await deleteConnection();
}
