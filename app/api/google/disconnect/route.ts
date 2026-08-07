import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ok:true});
  for (const name of ["dmp_google_access","dmp_google_refresh","dmp_google_state"]) response.cookies.delete(name);
  return response;
}
