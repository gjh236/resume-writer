import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "A job posting URL is required" }, { status: 400 });
    }

    // This feature requires Puppeteer which is not available on serverless.
    // Return helpful error message directing users to use the app locally
    return NextResponse.json(
      {
        error: "Job posting URL fetch is not available on this hosted version",
        message: "Please paste the job description manually, or run the app locally to use URL fetching",
      },
      { status: 501 }
    );
  } catch (err) {
    console.error("JD fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch job description" }, { status: 500 });
  }
}
