import { NextRequest, NextResponse } from "next/server";
import { getGoogleAccessToken, googleConfigured, setGoogleCookies } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  if (!googleConfigured()) return NextResponse.json({error:"not_configured"},{status:503});
  try {
    const {accessToken,refreshed} = await getGoogleAccessToken(request);
    if (!accessToken) return NextResponse.json({error:"not_connected"},{status:401});
    const date = request.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0,10);
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59.999`);
    const params = new URLSearchParams({
      timeMin:start.toISOString(),
      timeMax:end.toISOString(),
      singleEvents:"true",
      orderBy:"startTime",
      maxResults:"100",
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
      htmlLink:event.htmlLink || ""
    }));
    const response = NextResponse.json({events});
    if (refreshed) setGoogleCookies(response, refreshed);
    return response;
  } catch (error) {
    return NextResponse.json({error:"calendar_failed",message:error instanceof Error?error.message:"Erro desconhecido"},{status:500});
  }
}
