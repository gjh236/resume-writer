import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { buildResumeHtml } from "@/lib/resumeHtml";

export async function POST(req: NextRequest) {
  let browser;
  try {
    const { resume } = await req.json();

    if (!resume) {
      return NextResponse.json({ error: "Resume data required" }, { status: 400 });
    }

    const html = buildResumeHtml(resume);

    // Vercel-compatible Puppeteer launch options
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-resources",
      ],
    });
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "load" });

    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });

    await browser.close();

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="resume_optimized.pdf"`,
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    if (browser) await browser.close().catch(() => {});
    return NextResponse.json(
      { error: "Failed to generate PDF", details: String(err) },
      { status: 500 }
    );
  }
}
