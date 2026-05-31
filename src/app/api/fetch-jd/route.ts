import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import puppeteer from "puppeteer";
import chromium from "@sparticuz/chromium";

const EXTRACT_PROMPT = `You are given the raw visible text of a job posting web page. Extract ONLY the job-posting content and return it as clean, plain text organized under these headings (omit a heading entirely if the page has no content for it):

Job Title
Company
Job Description
Responsibilities / Duties
Qualifications
Education
Experience

Rules:
- Use ONLY information present in the provided page text. Do not invent or infer anything.
- Strip navigation, cookie banners, "apply now" buttons, benefits-only boilerplate, legal/EEO disclaimers, and unrelated site chrome.
- Preserve bullet points as lines beginning with "- ".
- Return plain text only (no markdown headers like ###, no JSON, no commentary). Put each section heading on its own line followed by its content.`;

async function fetchPageText(url: string): Promise<string> {
  const browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    // Give client-rendered ATS pages (Workday, etc.) a moment to populate
    await new Promise((r) => setTimeout(r, 1500));
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    return text;
  } finally {
    await browser.close();
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "A job posting URL is required" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "That doesn't look like a valid URL" }, { status: 400 });
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "URL must start with http:// or https://" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server is missing ANTHROPIC_API_KEY. Set it in .env.local and restart." },
        { status: 500 }
      );
    }

    let pageText: string;
    try {
      pageText = await fetchPageText(url);
    } catch (e) {
      console.error("Page fetch error:", e);
      return NextResponse.json(
        { error: "Couldn't load that page. It may block automated access — paste the text instead." },
        { status: 502 }
      );
    }

    if (!pageText || pageText.trim().length < 100) {
      return NextResponse.json(
        { error: "No readable job text found on that page. Paste the description manually." },
        { status: 422 }
      );
    }

    // Cap the text we send to the model
    const trimmed = pageText.slice(0, 20000);

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: EXTRACT_PROMPT,
      messages: [
        {
          role: "user",
          content: `Source URL: ${url}\n\nPAGE TEXT:\n<page>\n${trimmed}\n</page>`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    return NextResponse.json({ success: true, jobDescription: content.text.trim() });
  } catch (err) {
    console.error("fetch-jd error:", err);
    return NextResponse.json({ error: "Failed to fetch job description" }, { status: 500 });
  }
}
