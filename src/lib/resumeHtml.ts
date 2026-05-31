export interface ResumeData {
  name: string;
  contact: {
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    website?: string;
  };
  summary: string;
  experience: Array<{
    title: string;
    company: string;
    location: string;
    startDate: string;
    endDate: string;
    bullets: string[];
  }>;
  education: Array<{
    degree: string;
    school: string;
    location: string;
    graduationDate: string;
    gpa?: string;
    honors?: string;
  }>;
  skills: {
    categories: Array<{ name: string; items: string[] }>;
  };
  certifications?: string[];
  keywordSection?: {
    matched?: string[];
    missingKeywords?: string[];
  };
  // User-curated keywords (selected from matched/missing) shown as a bulleted column layout
  relevantSkills?: string[];
}

// Lowercase connector words that should NOT be capitalized mid-phrase (unless they're the first word).
const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of",
  "on", "or", "the", "to", "via", "vs", "with",
]);

/**
 * Title-case a keyword: capitalize the first letter of each word, EXCEPT small connector
 * words (and, of, the, …) which stay lowercase — but the very first word is always capitalized.
 * Words that are already all-uppercase (acronyms like SAP, PMP, EPC, P6) are left untouched.
 */
export function titleCaseSkill(s: string): string {
  const trimmed = String(s ?? "").trim();
  if (!trimmed) return trimmed;
  const words = trimmed.split(/\s+/);
  return words
    .map((word, i) => {
      // Preserve acronyms / mixed-case tokens that already contain an uppercase letter
      if (/[A-Z]/.test(word)) return word;
      const lower = word.toLowerCase();
      if (i !== 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Distribute items into at most `maxCols` columns with at most `maxPerCol` items each,
 * spread as evenly as possible (fills column-by-column with a balanced per-column count).
 */
export function distributeColumns<T>(items: T[], maxCols = 3, maxPerCol = 4): T[][] {
  const n = items.length;
  if (n === 0) return [];
  const cols = Math.min(maxCols, Math.max(1, Math.ceil(n / maxPerCol)));
  const perCol = Math.ceil(n / cols);
  const result: T[][] = [];
  for (let i = 0; i < cols; i++) {
    result.push(items.slice(i * perCol, (i + 1) * perCol));
  }
  return result.filter((c) => c.length > 0);
}

// Escape user/model content so it can't break the HTML structure (and stays clean for ATS text extraction)
function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Builds an ATS-friendly, single-column resume as an HTML string.
 * Design choices made specifically for parsers like Greenhouse / Lever / Workday:
 * - Single column, no tables, no images, no text-as-graphics (all selectable text)
 * - Standard sans-serif font (Arial/Helvetica)
 * - Conventional section headings ("Professional Summary", "Professional Experience", etc.)
 * - Plain separators (",", "|", "-") instead of decorative glyphs
 * - A document <title> so the PDF carries proper metadata
 */
export function buildResumeHtml(resume: ResumeData): string {
  const contactParts = [
    resume.contact.email,
    resume.contact.phone,
    resume.contact.location,
    resume.contact.linkedin,
    resume.contact.website,
  ]
    .filter(Boolean)
    .map((p) => esc(p as string));

  const experienceHtml = resume.experience
    .map(
      (job) => `
      <div class="entry">
        <div class="entry-header">
          <div class="entry-title">${esc(job.title)}</div>
          <div class="entry-dates">${esc(job.startDate)} - ${esc(job.endDate)}</div>
        </div>
        <div class="entry-sub">${esc(job.company)}${job.location ? `, ${esc(job.location)}` : ""}</div>
        <ul>
          ${job.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}
        </ul>
      </div>`
    )
    .join("");

  const educationHtml = resume.education
    .map(
      (edu) => `
      <div class="entry">
        <div class="entry-header">
          <div class="entry-title">${esc(edu.degree)}</div>
          <div class="entry-dates">${esc(edu.graduationDate)}</div>
        </div>
        <div class="entry-sub">${esc(edu.school)}${edu.location ? `, ${esc(edu.location)}` : ""}${edu.gpa ? ` | GPA: ${esc(edu.gpa)}` : ""}${edu.honors ? ` | ${esc(edu.honors)}` : ""}</div>
      </div>`
    )
    .join("");

  const skillsHtml = resume.skills.categories
    .map(
      (cat) =>
        `<div class="skill-row"><span class="skill-cat">${esc(cat.name)}:</span> ${cat.items.map(esc).join(", ")}</div>`
    )
    .join("");

  const certsHtml =
    resume.certifications && resume.certifications.length > 0
      ? `<div class="section">
          <div class="section-title">Certifications</div>
          <ul>${resume.certifications.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
        </div>`
      : "";

  const matched = resume.keywordSection?.matched ?? [];
  const keywordsHtml =
    matched.length > 0
      ? `<div class="section">
          <div class="section-title">Key Skills &amp; Keywords</div>
          <div class="skill-row">${matched.map(esc).join(" | ")}</div>
        </div>`
      : "";

  const relevant = (resume.relevantSkills ?? []).map(titleCaseSkill).filter(Boolean);
  const relevantSkillsHtml =
    relevant.length > 0
      ? `<div class="section">
          <div class="section-title">Relevant Skills</div>
          <div class="skill-columns">
            ${distributeColumns(relevant, 3, 4)
              .map(
                (col) =>
                  `<ul class="skill-col">${col.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
              )
              .join("")}
          </div>
        </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(resume.name)} - Resume</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, "Helvetica Neue", sans-serif;
    font-size: 10.5pt;
    color: #1a1a1a;
    line-height: 1.45;
    padding: 0.6in 0.65in;
  }
  .header {
    text-align: center;
    margin-bottom: 14px;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 10px;
  }
  .header h1 {
    font-size: 22pt;
    font-weight: bold;
    margin-bottom: 5px;
  }
  .contact-line { font-size: 9.5pt; color: #444; }
  .section { margin-bottom: 14px; }
  .section-title {
    font-size: 11pt;
    font-weight: bold;
    text-transform: uppercase;
    border-bottom: 1px solid #888;
    margin-bottom: 7px;
    padding-bottom: 2px;
  }
  .summary { font-size: 10.5pt; line-height: 1.5; }
  .entry { margin-bottom: 10px; }
  .entry-header { display: flex; justify-content: space-between; align-items: baseline; }
  .entry-title { font-weight: bold; font-size: 10.5pt; }
  .entry-dates { font-size: 9.5pt; color: #444; white-space: nowrap; margin-left: 8px; }
  .entry-sub { font-size: 10pt; color: #333; margin-bottom: 4px; }
  ul { padding-left: 16px; }
  ul li { margin-bottom: 2px; font-size: 10.5pt; }
  .skill-row { font-size: 10.5pt; margin-bottom: 3px; }
  .skill-cat { font-weight: bold; }
  .skill-columns { display: flex; gap: 24px; }
  .skill-col { list-style: disc; padding-left: 18px; margin: 0; flex: 1; }
  .skill-col li { font-size: 10.5pt; margin-bottom: 2px; }
</style>
</head>
<body>
  <div class="header">
    <h1>${esc(resume.name)}</h1>
    <div class="contact-line">${contactParts.join(" | ")}</div>
  </div>

  ${
    resume.summary
      ? `<div class="section">
    <div class="section-title">Professional Summary</div>
    <div class="summary">${esc(resume.summary)}</div>
  </div>`
      : ""
  }

  ${relevantSkillsHtml}

  <div class="section">
    <div class="section-title">Professional Experience</div>
    ${experienceHtml}
  </div>

  <div class="section">
    <div class="section-title">Education</div>
    ${educationHtml}
  </div>

  <div class="section">
    <div class="section-title">Skills</div>
    ${skillsHtml}
  </div>

  ${keywordsHtml}

  ${certsHtml}
</body>
</html>`;
}
