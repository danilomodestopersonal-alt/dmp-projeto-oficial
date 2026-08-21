import { NextRequest, NextResponse } from "next/server";

async function spotifyFetch(request: NextRequest, url: string, init?: RequestInit) {
  let accessToken: string | null = request.cookies.get("spotify_access_token")?.value ?? null;
  const refreshToken: string | null = request.cookies.get("spotify_refresh_token")?.value ?? null;

  const callSpotify = (token: string) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

  if (accessToken) {
    const response = await callSpotify(accessToken!);
    if (response.status !== 401) {
      return { response, accessToken, refreshToken, refreshed: false };
    }
  }

  if (!refreshToken) {
    return { response: null, accessToken: null, refreshToken: null, refreshed: false };
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { response: null, accessToken: null, refreshToken, refreshed: false };
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const refreshResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  const refreshData = await refreshResponse.json();

  if (!refreshResponse.ok || !refreshData.access_token) {
    return { response: null, accessToken: null, refreshToken, refreshed: false };
  }

  accessToken = refreshData.access_token;
  const response = await callSpotify(accessToken!);

  return {
    response,
    accessToken,
    refreshToken: refreshData.refresh_token || refreshToken,
    refreshed: true,
  };
}

function applyTokens(
  response: NextResponse,
  accessToken: string | null,
  refreshToken: string | null,
  refreshed: boolean
) {
  if (!refreshed || !accessToken) return response;

  response.cookies.set("spotify_access_token", accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 3600,
    path: "/",
  });

  if (refreshToken) {
    response.cookies.set("spotify_refresh_token", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 180,
      path: "/",
    });
  }

  return response;
}

export async function GET(request: NextRequest) {
  const result = await spotifyFetch(
    request,
    "https://api.spotify.com/v1/me/player"
  );

  if (!result.response) {
    return NextResponse.json({ connected: false }, { status: 401 });
  }

  if (result.response.status === 204) {
    const response = NextResponse.json({
      connected: true,
      active: false,
    });
    return applyTokens(
      response,
      result.accessToken,
      result.refreshToken,
      result.refreshed
    );
  }

  if (!result.response.ok) {
    return NextResponse.json(
      { connected: true, error: "spotify_error" },
      { status: result.response.status }
    );
  }

  const data = await result.response.json();
  const item = data.item;

  const response = NextResponse.json({
    connected: true,
    active: true,
    isPlaying: Boolean(data.is_playing),
    progressMs: data.progress_ms ?? 0,
    durationMs: item?.duration_ms ?? 0,
    track: item
      ? {
          name: item.name ?? "",
          artist: Array.isArray(item.artists)
            ? item.artists.map((artist: { name?: string }) => artist.name || "").filter(Boolean).join(", ")
            : "",
          image: item.album?.images?.[0]?.url ?? "",
        }
      : null,
  });

  return applyTokens(
    response,
    result.accessToken,
    result.refreshToken,
    result.refreshed
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = body?.action;

  const actions: Record<string, { url: string; method: string }> = {
    play: {
      url: "https://api.spotify.com/v1/me/player/play",
      method: "PUT",
    },
    pause: {
      url: "https://api.spotify.com/v1/me/player/pause",
      method: "PUT",
    },
    next: {
      url: "https://api.spotify.com/v1/me/player/next",
      method: "POST",
    },
    previous: {
      url: "https://api.spotify.com/v1/me/player/previous",
      method: "POST",
    },
  };

  const selected = actions[action];

  if (!selected) {
    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  }

  const result = await spotifyFetch(request, selected.url, {
    method: selected.method,
  });

  if (!result.response) {
    return NextResponse.json({ connected: false }, { status: 401 });
  }

  if (!result.response.ok && result.response.status !== 204) {
    return NextResponse.json(
      { error: "spotify_error" },
      { status: result.response.status }
    );
  }

  const response = NextResponse.json({ ok: true });

  return applyTokens(
    response,
    result.accessToken,
    result.refreshToken,
    result.refreshed
  );
}