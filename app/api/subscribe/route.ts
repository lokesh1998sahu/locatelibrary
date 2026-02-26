import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email, company } = await req.json();

    const ip =
  req.headers.get("x-forwarded-for")?.split(",")[0] ||
  "unknown";
  
    const params = new URLSearchParams();
    params.append("email", email);
    params.append("company", company || "");
    params.append("ip", ip);

    const res = await fetch(
      "https://script.google.com/macros/s/AKfycbyzBwnuxxlwKeJEB0jtENVfd8U_xZVu3OlbwhlPjTDDYKk8Afhont3aagNl_TVWW-ZN/exec",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    const text = await res.text();

    return NextResponse.json({ message: text.trim() });

  } catch (error: any) {
    return NextResponse.json(
      { message: "Server error" },
      { status: 500 }
    );
  }
}