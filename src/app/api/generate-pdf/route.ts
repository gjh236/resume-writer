import { NextRequest, NextResponse } from "next/server";
import { buildResumeHtml } from "@/lib/resumeHtml";

export async function POST(req: NextRequest) {
  try {
    const { resume } = await req.json();

    if (!resume) {
      return NextResponse.json({ error: "Resume data required" }, { status: 400 });
    }

    const html = buildResumeHtml(resume);

    // Return HTML with print-friendly headers
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="resume_optimized.html"`,
      },
    });
  } catch (err) {
    console.error("Resume generation error:", err);
    return NextResponse.json({ error: "Failed to generate resume" }, { status: 500 });
  }
}
