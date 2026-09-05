const FPL_ORIGIN = "https://fantasy.premierleague.com";

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!path.startsWith("/api/") || path.includes("..")) {
    return Response.json({ error: "Invalid FPL API path" }, { status: 400 });
  }

  try {
    const response = await fetch(`${FPL_ORIGIN}${path}`, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "FPL-Settlement-Room/1.0" },
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" },
    });
  } catch {
    return Response.json({ error: "FPL API is temporarily unavailable" }, { status: 502 });
  }
}
