import { NextRequest, NextResponse } from "next/server";
import { getGoogleAccessToken, googleConfigured, setGoogleCookies } from "@/lib/google-calendar";

async function tokenFor(request: NextRequest) {
  if (!googleConfigured()) return { error: NextResponse.json({error:"not_configured"},{status:503}) };
  const {accessToken,refreshed} = await getGoogleAccessToken(request);
  if (!accessToken) return { error: NextResponse.json({error:"not_connected"},{status:401}) };
  return {accessToken,refreshed};
}

function eventPayload(body:any) {
  const payload:any = {
    summary: String(body.summary || "Compromisso DMP"),
    description: String(body.description || ""),
    location: String(body.location || ""),
    start: { dateTime: body.start, timeZone: "America/Sao_Paulo" },
    end: { dateTime: body.end, timeZone: "America/Sao_Paulo" }
  };
  if (Array.isArray(body.recurrence) && body.recurrence.length) payload.recurrence = body.recurrence;
  return payload;
}

export async function POST(request: NextRequest) {
  const auth = await tokenFor(request); if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const google = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method:"POST", headers:{authorization:`Bearer ${auth.accessToken}`,"content-type":"application/json"},
      body:JSON.stringify(eventPayload(body)), cache:"no-store"
    });
    if (!google.ok) return NextResponse.json({error:"google_error",status:google.status},{status:502});
    const event = await google.json();
    const response = NextResponse.json({event}); if (auth.refreshed) setGoogleCookies(response, auth.refreshed); return response;
  } catch (error) { return NextResponse.json({error:"create_failed",message:error instanceof Error?error.message:"Erro"},{status:500}); }
}

export async function PATCH(request: NextRequest) {
  const auth = await tokenFor(request); if (auth.error) return auth.error;
  try {
    const body = await request.json(); const id = String(body.id || "");
    if (!id) return NextResponse.json({error:"missing_id"},{status:400});
    const google = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, {
      method:"PATCH", headers:{authorization:`Bearer ${auth.accessToken}`,"content-type":"application/json"},
      body:JSON.stringify(eventPayload(body)), cache:"no-store"
    });
    if (!google.ok) return NextResponse.json({error:"google_error",status:google.status},{status:502});
    const event = await google.json();
    const response = NextResponse.json({event}); if (auth.refreshed) setGoogleCookies(response, auth.refreshed); return response;
  } catch (error) { return NextResponse.json({error:"update_failed",message:error instanceof Error?error.message:"Erro"},{status:500}); }
}

export async function DELETE(request: NextRequest) {
  const auth = await tokenFor(request); if (auth.error) return auth.error;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({error:"missing_id"},{status:400});
  const google = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, {
    method:"DELETE", headers:{authorization:`Bearer ${auth.accessToken}`}, cache:"no-store"
  });
  if (!google.ok && google.status !== 204) return NextResponse.json({error:"google_error",status:google.status},{status:502});
  const response = NextResponse.json({ok:true}); if (auth.refreshed) setGoogleCookies(response, auth.refreshed); return response;
}
