export async function POST(req: Request) {
  try {
    const body = await req.json();
    const API_URL = process.env.APPS_SCRIPT_URL!;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const text = await res.text();
    const data = JSON.parse(text);
    return Response.json(data);

  } catch(err: any) {
    if (err.name === "AbortError") {
      return Response.json({ status: "error", message: "Request timed out. Please try again." });
    }
    return Response.json({ status: "error", message: "Ledger API failed" });
  }
}