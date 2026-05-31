"use client";

import { useState, useRef } from "react";
import { titleCaseSkill } from "@/lib/resumeHtml";

const MAX_KEYWORDS = 12;

interface ResumeData {
  name: string;
  contact: Record<string, string>;
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
  skills: { categories: Array<{ name: string; items: string[] }> };
  certifications?: string[];
  keywordSection?: {
    matched?: string[];
    missingKeywords?: string[];
  };
  relevantSkills?: string[];
}

type Step = "upload" | "rewrite" | "result";

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [resumeText, setResumeText] = useState("");
  const [uploadedFilename, setUploadedFilename] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [isFetchingJd, setIsFetchingJd] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [rewrittenResume, setRewrittenResume] = useState<ResumeData | null>(null);
  const [emailAddress, setEmailAddress] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleKeyword(kw: string) {
    setSelectedKeywords((prev) => {
      if (prev.includes(kw)) return prev.filter((k) => k !== kw);
      if (prev.length >= MAX_KEYWORDS) return prev; // hard cap — block further selection
      return [...prev, kw];
    });
  }

  // Mirror the PDF layout: ≤3 columns, ≤4 items each, spread evenly.
  function distributePreviewColumns(items: string[]): string[][] {
    const n = items.length;
    if (n === 0) return [];
    const cols = Math.min(3, Math.max(1, Math.ceil(n / 4)));
    const perCol = Math.ceil(n / cols);
    const out: string[][] = [];
    for (let i = 0; i < cols; i++) out.push(items.slice(i * perCol, (i + 1) * perCol));
    return out.filter((c) => c.length > 0);
  }

  function addRelevantSkills() {
    if (!rewrittenResume || selectedKeywords.length === 0) return;
    // De-dupe case-insensitively, capitalize first letter
    const seen = new Set<string>();
    const skills: string[] = [];
    for (const kw of selectedKeywords) {
      const c = titleCaseSkill(kw);
      const key = c.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        skills.push(c);
      }
    }
    setRewrittenResume({ ...rewrittenResume, relevantSkills: skills });
  }

  async function handleFileUpload(file: File) {
    setIsLoading(true);
    setError("");
    const formData = new FormData();
    formData.append("resume", file);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Upload failed");
      setIsLoading(false);
      return;
    }

    setResumeText(data.text);
    setUploadedFilename(file.name);
    setIsLoading(false);
    setStep("rewrite");
  }

  async function handleFetchJd() {
    if (!jobUrl.trim()) {
      setError("Please paste a job posting URL first.");
      return;
    }
    setIsFetchingJd(true);
    setError("");

    const res = await fetch("/api/fetch-jd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: jobUrl.trim() }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to fetch job description");
      setIsFetchingJd(false);
      return;
    }

    setJobDescription(data.jobDescription);
    setIsFetchingJd(false);
  }

  async function handleRewrite() {
    if (!jobDescription.trim()) {
      setError("Please paste a job description or fetch one from a link.");
      return;
    }
    if (!resumeText) {
      setError("Please upload a resume first.");
      return;
    }

    setIsLoading(true);
    setError("");

    const res = await fetch("/api/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription, resumeText }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Rewrite failed");
      setIsLoading(false);
      return;
    }

    setRewrittenResume(data.resume);
    setSelectedKeywords([]);
    setIsLoading(false);
    setStep("result");
  }

  async function handleDownload() {
    if (!rewrittenResume) return;
    setIsLoading(true);
    setError("");

    const res = await fetch("/api/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: rewrittenResume }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "PDF generation failed");
      setIsLoading(false);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resume_optimized.pdf";
    a.click();
    URL.revokeObjectURL(url);
    setIsLoading(false);
  }

  async function handleEmail() {
    if (!emailAddress.trim() || !rewrittenResume) return;
    setIsEmailSending(true);
    setEmailError("");
    setEmailSent(false);

    const res = await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: rewrittenResume, recipientEmail: emailAddress }),
    });
    const data = await res.json();

    if (!res.ok) {
      setEmailError(data.error || "Email failed — check SMTP settings in .env.local");
    } else {
      setEmailSent(true);
    }
    setIsEmailSending(false);
  }

  const steps: Step[] = ["upload", "rewrite", "result"];
  const stepLabels = { upload: "Resume", rewrite: "Job Description", result: "Result" };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Resume Optimizer</h1>
          <p className="mt-2 text-gray-500 text-sm">
            Upload your resume, paste a job description, and get an ATS-optimized PDF.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold
                  ${step === s ? "bg-blue-600 text-white" : i < steps.indexOf(step) ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"}`}
              >
                {i < steps.indexOf(step) ? "✓" : i + 1}
              </div>
              <span className={`text-sm ${step === s ? "font-semibold text-gray-900" : "text-gray-400"}`}>
                {stepLabels[s]}
              </span>
              {i < 2 && <div className="w-8 h-px bg-gray-300" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {step === "upload" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Upload Your Resume</h2>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <div className="text-4xl mb-3">📄</div>
              <p className="text-gray-600 font-medium">Click to upload a PDF resume</p>
              <p className="text-gray-400 text-sm mt-1">PDF files only</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>

            {isLoading && (
              <div className="mt-4 text-center text-gray-500 text-sm animate-pulse">Processing PDF…</div>
            )}
          </div>
        )}

        {step === "rewrite" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Add the Job Description</h2>
            <p className="text-sm text-gray-400 mb-4">
              Paste a job posting link and we&apos;ll pull it in — or paste the description yourself.
            </p>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Job posting link
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://boards.greenhouse.io/…/jobs/123456"
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={handleFetchJd}
                  disabled={isFetchingJd || !jobUrl.trim()}
                  className="px-4 py-2.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {isFetchingJd ? "Fetching…" : "Fetch from link"}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                We extract the description, responsibilities/duties, qualifications, education, and experience.
              </p>
            </div>

            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">or paste manually</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <textarea
              className="w-full h-56 p-3 border border-gray-300 rounded-lg text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Paste job description here…"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setStep("upload")}
                className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleRewrite}
                disabled={isLoading || !jobDescription.trim()}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "Optimizing with Claude…" : "Optimize Resume"}
              </button>
            </div>
          </div>
        )}

        {step === "result" && rewrittenResume && (
          <div className="space-y-5">
            {((rewrittenResume.keywordSection?.matched?.length ?? 0) > 0 ||
              (rewrittenResume.keywordSection?.missingKeywords?.length ?? 0) > 0) && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="text-sm font-semibold text-gray-800">Build a “Relevant Skills” section</h3>
                  {(() => {
                    const n = selectedKeywords.length;
                    const tone =
                      n >= MAX_KEYWORDS
                        ? "bg-red-100 text-red-700 border-red-300"
                        : n >= 8
                        ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                        : "bg-green-100 text-green-700 border-green-300";
                    return (
                      <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${tone}`}>
                        {n} / {MAX_KEYWORDS} selected
                      </span>
                    );
                  })()}
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Tap keywords to select them, then add them as a dedicated section on your resume.
                  {selectedKeywords.length >= MAX_KEYWORDS && (
                    <span className="text-red-600 font-medium"> Limit reached — deselect one to choose another.</span>
                  )}
                </p>

                {rewrittenResume.keywordSection?.matched && rewrittenResume.keywordSection.matched.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-green-700 mb-2">
                      ✅ Matched ATS Keywords ({rewrittenResume.keywordSection.matched.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {rewrittenResume.keywordSection.matched.map((kw) => {
                        const sel = selectedKeywords.includes(kw);
                        const capped = !sel && selectedKeywords.length >= MAX_KEYWORDS;
                        return (
                          <button
                            key={kw}
                            type="button"
                            onClick={() => toggleKeyword(kw)}
                            disabled={capped}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              sel
                                ? "bg-green-600 text-white border-green-600"
                                : capped
                                ? "bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed"
                                : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                            }`}
                          >
                            {sel ? "✓ " : ""}{kw}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {rewrittenResume.keywordSection?.missingKeywords && rewrittenResume.keywordSection.missingKeywords.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-amber-700 mb-1">
                      ⚠️ Missing Keywords ({rewrittenResume.keywordSection.missingKeywords.length})
                    </div>
                    <p className="text-[11px] text-amber-600/90 mb-2">
                      Not in your resume — only add ones you can genuinely back up.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {rewrittenResume.keywordSection.missingKeywords.map((kw) => {
                        const sel = selectedKeywords.includes(kw);
                        const capped = !sel && selectedKeywords.length >= MAX_KEYWORDS;
                        return (
                          <button
                            key={kw}
                            type="button"
                            onClick={() => toggleKeyword(kw)}
                            disabled={capped}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              sel
                                ? "bg-amber-500 text-white border-amber-500"
                                : capped
                                ? "bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed"
                                : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                            }`}
                          >
                            {sel ? "✓ " : ""}{kw}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={addRelevantSkills}
                    disabled={selectedKeywords.length === 0}
                    className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    + Add to Relevant Skills
                  </button>
                  {selectedKeywords.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedKeywords([])}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Clear selection
                    </button>
                  )}
                  {rewrittenResume.relevantSkills && rewrittenResume.relevantSkills.length > 0 && (
                    <span className="text-xs text-green-600">
                      ✓ {rewrittenResume.relevantSkills.length} added to resume
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-lg font-semibold text-gray-800 mb-5">Optimized Resume Preview</h2>
              <div className="space-y-5 text-sm text-gray-800">
                <div className="text-center border-b border-gray-200 pb-4">
                  <div className="text-xl font-bold tracking-wide uppercase">{rewrittenResume.name}</div>
                  <div className="text-gray-500 text-xs mt-1">
                    {[
                      rewrittenResume.contact.email,
                      rewrittenResume.contact.phone,
                      rewrittenResume.contact.location,
                      rewrittenResume.contact.linkedin,
                    ].filter(Boolean).join(" · ")}
                  </div>
                </div>

                {rewrittenResume.summary && (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-2">Summary</div>
                    <p className="leading-relaxed">{rewrittenResume.summary}</p>
                  </div>
                )}

                {rewrittenResume.relevantSkills && rewrittenResume.relevantSkills.length > 0 && (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-2">Relevant Skills</div>
                    <div className="flex gap-6">
                      {distributePreviewColumns(rewrittenResume.relevantSkills).map((col, ci) => (
                        <ul key={ci} className="list-disc list-inside flex-1 space-y-0.5 text-gray-700">
                          {col.map((item, ii) => (
                            <li key={ii}>{item}</li>
                          ))}
                        </ul>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-3">Experience</div>
                  <div className="space-y-4">
                    {rewrittenResume.experience.map((job, i) => (
                      <div key={i}>
                        <div className="flex justify-between items-baseline">
                          <span className="font-semibold">{job.title}</span>
                          <span className="text-gray-400 text-xs">{job.startDate} – {job.endDate}</span>
                        </div>
                        <div className="text-gray-500 italic text-xs mb-1">{job.company}{job.location ? ` · ${job.location}` : ""}</div>
                        <ul className="list-disc list-inside space-y-0.5">
                          {job.bullets.map((b, j) => <li key={j} className="text-gray-700">{b}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-3">Education</div>
                  {rewrittenResume.education.map((edu, i) => (
                    <div key={i}>
                      <div className="flex justify-between items-baseline">
                        <span className="font-semibold">{edu.degree}</span>
                        <span className="text-gray-400 text-xs">{edu.graduationDate}</span>
                      </div>
                      <div className="text-gray-500 italic text-xs">{edu.school}{edu.location ? ` · ${edu.location}` : ""}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-2">Skills</div>
                  {rewrittenResume.skills.categories.map((cat, i) => (
                    <div key={i} className="mb-1">
                      <span className="font-semibold">{cat.name}: </span>
                      <span className="text-gray-600">{cat.items.join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
              <button
                onClick={handleDownload}
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isLoading ? "Generating PDF…" : "⬇ Download PDF"}
              </button>

              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Email address to send PDF"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={handleEmail}
                  disabled={isEmailSending || !emailAddress.trim()}
                  className="px-4 py-2.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50 transition-colors"
                >
                  {isEmailSending ? "Sending…" : "✉ Email"}
                </button>
              </div>

              {emailSent && <p className="text-green-600 text-sm text-center">✅ Email sent!</p>}
              {emailError && <p className="text-red-500 text-sm text-center">{emailError}</p>}

              <button
                onClick={() => { setStep("rewrite"); setRewrittenResume(null); setJobDescription(""); setError(""); setEmailSent(false); setSelectedKeywords([]); }}
                className="w-full text-sm text-gray-400 hover:text-gray-600 py-1 transition-colors"
              >
                ← Try a different job description
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
