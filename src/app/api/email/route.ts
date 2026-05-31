import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import puppeteer from "puppeteer";
import { buildResumeHtml, type ResumeData } from "@/lib/resumeHtml";

async function generatePdfBuffer(resume: ResumeData): Promise<Buffer> {
  const html = buildResumeHtml(resume);

  const launchOptions: any = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  };

  if (process.env.VERCEL) {
    launchOptions.executablePath = "/usr/bin/chromium";
  }

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function POST(req: NextRequest) {
  try {
    const { resume, recipientEmail, smtpConfig } = await req.json();

    if (!resume || !recipientEmail) {
      return NextResponse.json({ error: "Resume and recipient email required" }, { status: 400 });
    }

    const pdfBuffer = await generatePdfBuffer(resume);

    // Use provided SMTP config or fall back to env vars
    const transportConfig = smtpConfig || {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    };

    if (!transportConfig.auth?.user || !transportConfig.auth?.pass) {
      return NextResponse.json(
        { error: "Email isn't configured. Set SMTP_USER and SMTP_PASS in .env.local." },
        { status: 500 }
      );
    }

    const transporter = nodemailer.createTransport(transportConfig);

    await transporter.sendMail({
      from: transportConfig.auth.user,
      to: recipientEmail,
      subject: `ATS-Optimized Resume - ${resume.name}`,
      text: `Please find attached the ATS-optimized resume for ${resume.name}.`,
      attachments: [
        {
          filename: "resume_optimized.pdf",
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Email error:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
