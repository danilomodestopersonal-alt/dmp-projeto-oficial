import { NextRequest, NextResponse } from "next/server";
import { getGoogleAccessToken, googleConfigured, setGoogleCookies } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  if (!googleConfigured()) return NextResponse.json({error:"not_configured"},{status:503});
  try {
    const {accessToken,refreshed} = await getGoogleAccessToken(request);
    if (!accessToken) return NextResponse.json({error:"not_connected"},{status:401});

    const date = request.nextUrl.searchParams.get("date") || new Intl.DateTimeFormat("en-CA", {
      timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit"
    }).format(new Date());
    const requestedDays = Number(request.nextUrl.searchParams.get("days") || "1");
    // A agenda anual precisa consultar um intervalo maior que as duas semanas
    // usadas na tela Hoje. O limite de 370 cobre um ano completo com folga.
    const days = Math.min(370, Math.max(1, Number.isFinite(requestedDays) ? Math.floor(requestedDays) : 1));

    const start = new Date(`${date}T00:00:00-03:00`);
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000 - 1);
    const params = new URLSearchParams({
      timeMin:start.toISOString(),
      timeMax:end.toISOString(),
      singleEvents:"true",
      orderBy:"startTime",
      maxResults:"250",
      timeZone:"America/Sao_Paulo"
    });

    const google = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
      headers:{authorization:`Bearer ${accessToken}`}, cache:"no-store"
    });
    if (!google.ok) return NextResponse.json({error:"google_error",status:google.status},{status:502});
    const data = await google.json();
    const events = (data.items || []).map((event:any) => ({
      id:event.id,
      summary:event.summary || "Sem título",
      description:event.description || "",
      start:event.start?.dateTime || event.start?.date || "",
      end:event.end?.dateTime || event.end?.date || "",
      allDay:Boolean(event.start?.date),
      htmlLink:event.htmlLink || "",
      location:event.location || "",
      recurrence:event.recurrence || []
    }));
    const response = NextResponse.json({events,range:{date,days}});
    if (refreshed) setGoogleCookies(response, refreshed);
    return response;
  } catch (error) {
    return NextResponse.json({error:"calendar_failed",message:error instanceof Error?error.message:"Erro desconhecido"},{status:500});
  }
}
