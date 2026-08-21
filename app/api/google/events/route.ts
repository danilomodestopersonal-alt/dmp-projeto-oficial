import { NextRequest, NextResponse } from "next/server";
import { getGoogleAccessToken, googleConfigured, setGoogleCookies } from "@/lib/google-calendar";

async function tokenFor(request: NextRequest) {
  if (!googleConfigured()) return { error: NextResponse.json({error:"not_configured"},{status:503}) };
  const {accessToken,refreshed} = await getGoogleAccessToken(request);
  if (!accessToken) return { error: NextResponse.json({error:"not_connected"},{status:401}) };
  return {accessToken,refreshed};
}

const headers=(token:string)=>({
  authorization:`Bearer ${token}`,
  "content-type":"application/json"
});

function eventPayload(body:any) {
  const payload:any = {
    summary:String(body.summary || "Compromisso DMP"),
    description:String(body.description || ""),
    location:String(body.location || ""),
    start:{dateTime:body.start,timeZone:"America/Sao_Paulo"},
    end:{dateTime:body.end,timeZone:"America/Sao_Paulo"}
  };
  if(Array.isArray(body.recurrence)&&body.recurrence.length)payload.recurrence=body.recurrence;
  return payload;
}

async function readEvent(token:string,id:string){
  const r=await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,
    {headers:{authorization:`Bearer ${token}`},cache:"no-store"}
  );
  if(!r.ok)return null;
  return r.json();
}

function googleUntilBefore(value:string){
  const time=new Date(value).getTime();
  if(!Number.isFinite(time))return null;
  return new Date(time-1000)
    .toISOString()
    .replace(/[-:]/g,"")
    .replace(/\.\d{3}Z$/,"Z");
}

function trimRecurrence(recurrence:string[],until:string){
  const rule=recurrence.find(item=>item.startsWith("RRULE:"));
  if(!rule)return null;

  // COUNT exige recalculo do numero de ocorrencias.
  // Por seguranca nao alteramos esse formato automaticamente.
  if(/(?:^|;)COUNT=\d+/.test(rule))return null;

  const trimmed=rule
    .replace(/;UNTIL=[^;]+/g,"")
    .concat(`;UNTIL=${until}`);

  return recurrence.map(item=>item.startsWith("RRULE:")?trimmed:item);
}

function newSeriesPayload(parent:any,body:any){
  const payload:any={
    summary:String(body.summary || parent.summary || "Compromisso DMP"),
    description:String(parent.description || ""),
    location:String(parent.location || ""),
    start:{
      dateTime:body.start,
      timeZone:parent.start?.timeZone || "America/Sao_Paulo"
    },
    end:{
      dateTime:body.end,
      timeZone:parent.end?.timeZone || "America/Sao_Paulo"
    },
    recurrence:Array.isArray(parent.recurrence)?parent.recurrence:[]
  };

  const optional=[
    "colorId","visibility","transparency",
    "guestsCanInviteOthers","guestsCanModify","guestsCanSeeOtherGuests"
  ];

  for(const key of optional){
    if(parent[key]!==undefined)payload[key]=parent[key];
  }

  if(Array.isArray(parent.attendees))payload.attendees=parent.attendees;
  if(parent.reminders)payload.reminders=parent.reminders;

  return payload;
}

export async function POST(request:NextRequest){
  const auth=await tokenFor(request);
  if(auth.error)return auth.error;

  try{
    const body=await request.json();

    const google=await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method:"POST",
        headers:headers(auth.accessToken),
        body:JSON.stringify(eventPayload(body)),
        cache:"no-store"
      }
    );

    if(!google.ok)return NextResponse.json({error:"google_error",status:google.status},{status:502});

    const event=await google.json();
    const response=NextResponse.json({event});
    if(auth.refreshed)setGoogleCookies(response,auth.refreshed);
    return response;
  }catch(error){
    return NextResponse.json({
      error:"create_failed",
      message:error instanceof Error?error.message:"Erro"
    },{status:500});
  }
}

export async function PATCH(request:NextRequest){
  const auth=await tokenFor(request);
  if(auth.error)return auth.error;

  try{
    const body=await request.json();
    const id=String(body.id||"");
    const scope=String(body.scope||"single");
    const recurringEventId=String(body.recurringEventId||"");

    if(!id)return NextResponse.json({error:"missing_id"},{status:400});

    // Evento comum ou apenas esta ocorrencia.
    if(scope==="single" || !recurringEventId){
      const google=await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,
        {
          method:"PATCH",
          headers:headers(auth.accessToken),
          body:JSON.stringify(eventPayload(body)),
          cache:"no-store"
        }
      );

      if(!google.ok)return NextResponse.json({error:"google_error",status:google.status},{status:502});

      const event=await google.json();
      const response=NextResponse.json({event});
      if(auth.refreshed)setGoogleCookies(response,auth.refreshed);
      return response;
    }

    const parent=await readEvent(auth.accessToken,recurringEventId);
    if(!parent)return NextResponse.json({error:"recurring_parent_not_found"},{status:404});

    // Toda a serie: muda apenas os dados editados, mantendo horario e recorrencia.
    if(scope==="series"){
      const google=await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(recurringEventId)}`,
        {
          method:"PATCH",
          headers:headers(auth.accessToken),
          body:JSON.stringify({
            summary:String(body.summary||parent.summary||"Compromisso DMP")
          }),
          cache:"no-store"
        }
      );

      if(!google.ok)return NextResponse.json({error:"google_error",status:google.status},{status:502});

      const event=await google.json();
      const response=NextResponse.json({event});
      if(auth.refreshed)setGoogleCookies(response,auth.refreshed);
      return response;
    }

    // Esta e as proximas: divide a serie em duas.
    if(scope==="following"){
      const target=String(body.originalStartTime||body.start||"");
      const until=googleUntilBefore(target);

      if(!until)return NextResponse.json({error:"invalid_original_start"},{status:400});

      const originalRecurrence=Array.isArray(parent.recurrence)?parent.recurrence:[];
      const trimmedRecurrence=trimRecurrence(originalRecurrence,until);

      if(!trimmedRecurrence){
        return NextResponse.json({
          error:"unsupported_recurrence",
          message:"Esta serie usa um formato de recorrencia que exige edicao manual."
        },{status:400});
      }

      const trim=await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(recurringEventId)}`,
        {
          method:"PATCH",
          headers:headers(auth.accessToken),
          body:JSON.stringify({recurrence:trimmedRecurrence}),
          cache:"no-store"
        }
      );

      if(!trim.ok)return NextResponse.json({error:"trim_failed",status:trim.status},{status:502});

      const create=await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method:"POST",
          headers:headers(auth.accessToken),
          body:JSON.stringify(newSeriesPayload(parent,body)),
          cache:"no-store"
        }
      );

      if(!create.ok){
        // tenta restaurar a serie original caso a nova nao seja criada
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(recurringEventId)}`,
          {
            method:"PATCH",
            headers:headers(auth.accessToken),
            body:JSON.stringify({recurrence:originalRecurrence}),
            cache:"no-store"
          }
        );

        return NextResponse.json({error:"new_series_failed",status:create.status},{status:502});
      }

      const event=await create.json();
      const response=NextResponse.json({event,split:true});
      if(auth.refreshed)setGoogleCookies(response,auth.refreshed);
      return response;
    }

    return NextResponse.json({error:"invalid_scope"},{status:400});

  }catch(error){
    return NextResponse.json({
      error:"update_failed",
      message:error instanceof Error?error.message:"Erro"
    },{status:500});
  }
}

export async function DELETE(request:NextRequest){
  const auth=await tokenFor(request);
  if(auth.error)return auth.error;

  const id=request.nextUrl.searchParams.get("id");
  if(!id)return NextResponse.json({error:"missing_id"},{status:400});

  const google=await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,
    {
      method:"DELETE",
      headers:{authorization:`Bearer ${auth.accessToken}`},
      cache:"no-store"
    }
  );

  if(!google.ok && google.status!==204){
    return NextResponse.json({error:"google_error",status:google.status},{status:502});
  }

  const response=NextResponse.json({ok:true});
  if(auth.refreshed)setGoogleCookies(response,auth.refreshed);
  return response;
}
