import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are an expert resume writer and ATS optimization specialist.

CRITICAL GROUNDING RULES — these override everything else:
- The ONLY source of facts is the resume text provided in the user message. Use NOTHING else.
- NEVER invent, infer, or embellish: no new employers, job titles, dates, degrees, certifications, skills, tools, or responsibilities that are not explicitly present in the provided resume text.
- NEVER fabricate metrics or numbers (percentages, dollar amounts, team sizes, timeframes). Only include a number if that exact number appears in the original resume.
- You may REWORD and REORDER what is already in the resume, and you may weave in terminology from the job description ONLY where it truthfully describes experience already stated in the resume.
- If the resume does not contain something the job wants, DO NOT add it to the experience or skills. Instead surface it in "missingKeywords" (see schema).
- Do not pull in any information from outside this single resume. There is no other context, memory, or prior conversation to draw from.

Your job:
1. Rewrite bullets and summary using clear, ATS-friendly language, reusing keywords/phrases from the job description where they truthfully match existing experience.
2. Reorder experience bullets to lead with the most role-relevant (but truthful) points.
3. Keep formatting clean and ATS-safe (no tables, columns, or special characters).
4. Produce a dedicated keyword section: scan the job description for important ATS keywords/skills, then split them into two lists — ones genuinely supported by the resume, and ones the resume does NOT support.

Return ONLY valid JSON (no markdown fences, no extra text) with this exact schema:
{
  "name": "Full Name (from resume)",
  "contact": {
    "email": "from resume",
    "phone": "from resume",
    "location": "from resume",
    "linkedin": "from resume or empty string",
    "website": "from resume or empty string"
  },
  "summary": "2-3 sentence professional summary, grounded strictly in resume facts, tailored to the role",
  "experience": [
    {
      "title": "exact title from resume",
      "company": "exact company from resume",
      "location": "from resume",
      "startDate": "from resume",
      "endDate": "from resume or Present",
      "bullets": ["reworded bullet grounded in the original resume"]
    }
  ],
  "education": [
    {
      "degree": "from resume",
      "school": "from resume",
      "location": "from resume",
      "graduationDate": "from resume",
      "gpa": "from resume or empty string",
      "honors": "from resume or empty string"
    }
  ],
  "skills": {
    "categories": [
      { "name": "Category Name", "items": ["only skills present in the resume"] }
    ]
  },
  "certifications": ["only certifications present in the resume"],
  "keywordSection": {
    "matched": ["JD keywords that ARE supported by the resume and now appear in it"],
    "missingKeywords": ["important JD keywords/skills the ATS will look for that are NOT supported by this resume — surfaced here, never fabricated into experience"]
  }
}

Only return valid JSON, no markdown fences or extra text.`;

export async function POST(req: NextRequest) {
  try {
    const { jobDescription, resumeText: providedText } = await req.json();

    if (!jobDescription?.trim()) {
      return NextResponse.json({ error: "Job description is required" }, { status: 400 });
    }

    if (!providedText?.trim()) {
      return NextResponse.json({ error: "Resume text is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server is missing ANTHROPIC_API_KEY. Set it in .env.local and restart." },
        { status: 500 }
      );
    }
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `RESUME (the ONLY source of facts — do not use anything outside this block):\n<resume>\n${providedText}\n</resume>\n\nJOB DESCRIPTION (use for keywords/targeting only — never as a source of the candidate's experience):\n<job_description>\n${jobDescription}\n</job_description>\n\nRewrite the resume per the rules. Ground every bullet, skill, date, and number strictly in the <resume> block. Put JD keywords the resume cannot support into keywordSection.missingKeywords — do not add them to experience or skills.`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    const rewritten = JSON.parse(content.text);

    return NextResponse.json({ success: true, resume: rewritten });
  } catch (err) {
    console.error("Rewrite error:", err);
    return NextResponse.json({ error: "Failed to rewrite resume" }, { status: 500 });
  }
}
