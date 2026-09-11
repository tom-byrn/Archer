import { NextResponse } from "next/server";
import { suggestBrand } from "@/lib/server/contextdev";

export async function POST(request: Request) {
  let query: unknown;
  try {
    ({ query } = (await request.json()) as { query?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof query !== "string" || query.trim() === "") {
    return NextResponse.json({ error: "Pass { query: string }." }, { status: 400 });
  }
  try {
    const suggestion = await suggestBrand(query);
    return NextResponse.json({ suggestion });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Brand lookup failed.";
    const status = message.includes("CONTEXT_DEV_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
