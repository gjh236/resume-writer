import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { buildResumeHtml, type ResumeData } from "@/lib/resumeHtml";

export async function POST(req: NextRequest) {
  try {
    const { resume, recipientEmail, smtpConfig } = await req.json();

    if (!resume || !recipientEmail) {
      return NextResponse.json({ error: "Resume and recipient email required" }, { status: 400 });
    }

    // Generate HTML version of resume
    const html = buildResumeHtml(resume);

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

    // Send HTML version as email body + attachment
    await transporter.sendMail({
      from: transportConfig.auth.user,
      to: recipientEmail,
      subject: `ATS-Optimized Resume - ${resume.name}`,
      html: html,
      text: `Please find attached the ATS-optimized resume for ${resume.name}.`,
      attachments: [
        {
          filename: "resume_optimized.html",
          content: html,
          contentType: "text/html",
        },
      ],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Email error:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
