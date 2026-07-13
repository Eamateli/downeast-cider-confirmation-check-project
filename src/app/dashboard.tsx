"use client";

import { useEffect, useRef, useState } from "react";
import { SAMPLES } from "@/lib/samples";
import type { Finding, IngestResult, ReconcileReport } from "@/lib/schema";
import type { PoRow, ScheduleRow } from "@/lib/data";

const CARD_STYLES: Record<Finding["severity"], string> = {
  ok: "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
  warn: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  risk: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
};

const ROW_STYLES: Record<Finding["severity"], string> = {
  ok: "bg-green-100 dark:bg-green-900/40",
  warn: "bg-amber-100 dark:bg-amber-900/40",
  risk: "bg-red-100 dark:bg-red-900/40",
};

const BOX_STYLES: Record<Finding["severity"], string> = {
  ok: "border-green-500",
  warn: "border-amber-500",
  risk: "border-red-500",
};

const DOTS: Record<Finding["severity"], string> = { ok: "🟢", warn: "🟡", risk: "🔴" };

const BADGES: Record<Finding["severity"], string> = {
  ok: "OK",
  warn: "Warning",
  risk: "At risk",
};

function worstSeverity(findings: Finding[]): Finding["severity"] {
  if (findings.some((f) => f.severity === "risk")) return "risk";
  if (findings.some((f) => f.severity === "warn")) return "warn";
  return "ok";
}

type InboxEmail = {
  id: string;
  from: string;
  subject: string;
  date: string;
  bodyText: string;
  attachments: { attachmentId: string; filename: string }[];
  shortLabel: string;
  isConfirmation: boolean;
};

type InboxState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "disconnected" }
  | { status: "connected"; emails: InboxEmail[] }
  | { status: "error"; message: string };

type SessionDoc = {
  id: string;
  name: string;
  url: string | null; // object URL for uploads; null for Gmail attachments
  poCount: number;
  runCount: number;
};

type SessionPo = PoRow & { source: string };
type SessionRun = ScheduleRow & { source: string };

// Keep only ingested rows complete enough to reconcile against.
function usablePos(result: IngestResult, source: string): SessionPo[] {
  return result.pos
    .filter((p) => p.po_number && p.qty && p.unit && p.unit_price_usd && p.due_date)
    .map((p) => ({
      po_number: p.po_number!,
      supplier: p.supplier ?? "",
      sku: p.sku ?? "",
      description: p.description ?? "",
      qty: p.qty!,
      unit: p.unit!,
      unit_price_usd: p.unit_price_usd!,
      due_date: p.due_date!,
      run_id: p.run_id ?? "",
      source,
    }));
}

function usableRuns(result: IngestResult, source: string): SessionRun[] {
  return result.runs
    .filter((r) => r.run_id && r.start_date)
    .map((r) => ({
      run_id: r.run_id!,
      line: r.line ?? "",
      product: r.product ?? "",
      start_date: r.start_date!,
      sku_needed: r.sku_needed ?? "",
      source,
    }));
}

function Slider({ on, onToggle, left, right, ariaLabel }: {
  on: boolean;
  onToggle: () => void;
  left: string;
  right: string;
  ariaLabel: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      {left}
      <button
        onClick={onToggle}
        aria-label={ariaLabel}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          on ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-700"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : ""
          }`}
        />
      </button>
      {right}
    </label>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggle() {
    const nowDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", nowDark ? "dark" : "light");
    setDark(nowDark);
  }
  return <Slider on={dark} onToggle={toggle} left="Day" right="Night" ariaLabel="Toggle night mode" />;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function Dashboard({ pos, schedule }: { pos: PoRow[]; schedule: ScheduleRow[] }) {
  const [testMode, setTestMode] = useState(true);
  const [emailText, setEmailText] = useState("");
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checksRun, setChecksRun] = useState(0);
  const [flagsRaised, setFlagsRaised] = useState(0);

  const [inbox, setInbox] = useState<InboxState>({ status: "loading" });
  const [selectedEmailId, setSelectedEmailId] = useState("");
  const [emailBoxText, setEmailBoxText] = useState("");
  const [emailResults, setEmailResults] = useState<Record<string, Finding["severity"]>>({});
  const [autoSend, setAutoSend] = useState(false);
  const [sentIds, setSentIds] = useState<string[]>([]);

  const [sessionPos, setSessionPos] = useState<SessionPo[]>([]);
  const [sessionRuns, setSessionRuns] = useState<SessionRun[]>([]);
  const [docs, setDocs] = useState<SessionDoc[]>([]);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);
  const processedAttachments = useRef<Set<string>>(new Set());
  const uploadInput = useRef<HTMLInputElement>(null);

  // Test mode shows only the built-in demo data; real mode shows only what
  // came from your emails and uploads. No mixing.
  const visiblePos: (PoRow & { source?: string })[] = testMode ? pos : sessionPos;
  const visibleRuns: (ScheduleRow & { source?: string })[] = testMode ? schedule : sessionRuns;

  const matchedPoNumber = report?.matchedPo?.po_number ?? null;
  const matchedRunId = matchedPoNumber
    ? visiblePos.find((po) => po.po_number === matchedPoNumber)?.run_id ?? null
    : null;
  const severity = report ? worstSeverity(report.findings) : null;

  const emails = inbox.status === "connected" ? inbox.emails : [];
  const checkedCount = emails.filter((e) => emailResults[e.id]).length;
  const selectedEmail = emails.find((e) => e.id === selectedEmailId) ?? null;

  function reset() {
    setReport(null);
    setError(null);
  }

  function recordReport(data: ReconcileReport) {
    setReport(data);
    setChecksRun((n) => n + 1);
    setFlagsRaised((n) => n + data.findings.filter((f) => f.severity !== "ok").length);
  }

  async function runCheck(text: string): Promise<ReconcileReport | null> {
    setLoading(true);
    reset();
    try {
      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          emailText: text,
          includeBuiltin: testMode,
          extraPos: testMode ? [] : sessionPos,
          extraRuns: testMode ? [] : sessionRuns,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return null;
      }
      recordReport(data);
      return data;
    } catch {
      setError("Could not reach the server. Is the app running?");
      return null;
    } finally {
      setLoading(false);
    }
  }

  // ---- Gmail -----------------------------------------------------------------

  async function loadInbox() {
    setInbox({ status: "loading" });
    try {
      const res = await fetch("/api/gmail/list");
      const data = await res.json();
      if (res.status === 400) setInbox({ status: "unconfigured" });
      else if (res.status === 401) setInbox({ status: "disconnected" });
      else if (!res.ok) setInbox({ status: "error", message: data.error ?? "Gmail request failed." });
      else setInbox({ status: "connected", emails: data.emails });
    } catch {
      setInbox({ status: "error", message: "Could not reach the server." });
    }
  }

  useEffect(() => {
    loadInbox();
  }, []);

  // Email attachments are read automatically: each one goes through the AI
  // once and its PO or schedule rows land in the session tables.
  useEffect(() => {
    if (inbox.status !== "connected") return;
    let cancelled = false;
    (async () => {
      for (const email of inbox.emails) {
        for (const att of email.attachments) {
          const source = `gmail-${att.attachmentId.slice(0, 24)}`;
          if (processedAttachments.current.has(source)) continue;
          processedAttachments.current.add(source);
          if (cancelled) return;
          setIngestStatus(`Reading ${att.filename}...`);
          try {
            const res = await fetch("/api/ingest", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                messageId: email.id,
                attachmentId: att.attachmentId,
                filename: att.filename,
              }),
            });
            if (res.ok) {
              const result: IngestResult = await res.json();
              const hasRows =
                usablePos(result, "probe").length > 0 || usableRuns(result, "probe").length > 0;
              if (!cancelled && hasRows) addDoc(source, att.filename, null, result);
            }
          } catch {
            // skip this attachment, keep going
          }
        }
      }
      if (!cancelled) setIngestStatus(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox]);

  function addDoc(source: string, name: string, url: string | null, result: IngestResult) {
    const newPos = usablePos(result, source);
    const newRuns = usableRuns(result, source);
    setSessionPos((rows) => [...rows.filter((r) => r.source !== source), ...newPos]);
    setSessionRuns((rows) => [...rows.filter((r) => r.source !== source), ...newRuns]);
    setDocs((list) => [
      ...list.filter((d) => d.id !== source),
      { id: source, name, url, poCount: newPos.length, runCount: newRuns.length },
    ]);
  }

  function removeDoc(id: string) {
    const doc = docs.find((d) => d.id === id);
    if (doc?.url) URL.revokeObjectURL(doc.url);
    setDocs((list) => list.filter((d) => d.id !== id));
    setSessionPos((rows) => rows.filter((r) => r.source !== id));
    setSessionRuns((rows) => rows.filter((r) => r.source !== id));
  }

  async function uploadDocument(file: File) {
    if (testMode) return; // uploads belong to real mode only
    setIngestStatus(`Reading ${file.name}...`);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not read that document.");
      } else if (usablePos(data, "probe").length === 0 && usableRuns(data, "probe").length === 0) {
        setError(
          `No purchase orders or production runs found in ${file.name}. It was not added.`
        );
      } else {
        addDoc(`upload-${Date.now()}`, file.name, URL.createObjectURL(file), data);
      }
    } catch {
      setError("Could not reach the server. Is the app running?");
    } finally {
      setIngestStatus(null);
      if (uploadInput.current) uploadInput.current.value = "";
    }
  }

  async function sendReply(messageId: string) {
    const res = await fetch("/api/gmail/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    if (res.ok) setSentIds((ids) => [...ids, messageId]);
    else {
      const data = await res.json();
      setError(data.error ?? "Could not send the reply.");
    }
  }

  function selectEmail(id: string) {
    setSelectedEmailId(id);
    const email = emails.find((e) => e.id === id);
    setEmailBoxText(email?.bodyText ?? "");
    reset();
  }

  async function checkSelectedEmail() {
    if (!selectedEmail || !emailBoxText.trim()) return;
    const data = await runCheck(emailBoxText);
    if (!data) return;
    const result = worstSeverity(data.findings);
    setEmailResults((map) => ({ ...map, [selectedEmail.id]: result }));
    if (result === "ok" && autoSend && !sentIds.includes(selectedEmail.id)) {
      await sendReply(selectedEmail.id);
    }
  }

  const emailBoxSeverity = selectedEmailId ? emailResults[selectedEmailId] : undefined;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Confirmation Check</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Paste or upload a supplier order confirmation. See what changed and
            which production run it affects.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Slider
            on={testMode}
            onToggle={() => setTestMode((v) => !v)}
            left=""
            right="Test"
            ariaLabel="Toggle test data"
          />
          <ThemeToggle />
          {!testMode && (inbox.status === "connected" ? (
            <span className="flex items-center gap-2 rounded-lg border border-green-400 px-3 py-1.5 text-sm font-medium text-green-700 dark:border-green-700 dark:text-green-400">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              Google connected
            </span>
          ) : inbox.status === "unconfigured" || inbox.status === "loading" ? (
            <button
              disabled
              title="Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first (docs/GOOGLE-SETUP.md)"
              className="cursor-not-allowed rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white opacity-40"
            >
              Connect to Google
            </button>
          ) : (
            <a
              href="/api/google/auth"
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Connect to Google
            </a>
          ))}
          {!testMode && (
            <>
              <input
                ref={uploadInput}
                type="file"
                accept=".txt,.csv,.pdf,.xlsx,.xls"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadDocument(file);
                }}
              />
              <button
                onClick={() => uploadInput.current?.click()}
                className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Upload document
              </button>
            </>
          )}
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open POs" value={String(visiblePos.length)} />
        <StatCard label="Scheduled runs" value={String(visibleRuns.length)} />
        <StatCard label="Checks this session" value={String(checksRun)} />
        <StatCard label="Flags raised" value={String(flagsRaised)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {testMode && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">Check a confirmation</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {SAMPLES.map((sample) => (
                <button
                  key={sample.label}
                  onClick={() => {
                    setEmailText(sample.text);
                    reset();
                  }}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {sample.label}
                </button>
              ))}
            </div>

            <textarea
              value={emailText}
              onChange={(event) => setEmailText(event.target.value)}
              placeholder="Paste the supplier email here..."
              rows={9}
              className="mt-3 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm text-slate-800 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />

            <button
              onClick={() => runCheck(emailText)}
              disabled={loading || emailText.trim().length === 0}
              className="mt-3 rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Checking..." : "Check confirmation"}
            </button>
          </section>
        )}

        <section
          className={`rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 ${
            testMode ? "" : "lg:col-span-2"
          }`}
        >
          <h2 className="font-semibold">Result</h2>

          {!report && !error && !loading && (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Run a check to see the exception report here. Green means the
              confirmation matches the PO, amber needs a look, red means a
              production run is at risk.
            </p>
          )}
          {loading && (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Reading the confirmation and comparing it against open POs...
            </p>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              <p className="font-semibold">Could not check this confirmation</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          )}

          {report && (
            <div className="mt-3 space-y-3">
              {report.matchedPo && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Matched <span className="font-semibold">{report.matchedPo.po_number}</span>
                  {", "}
                  {report.matchedPo.description}
                  {": "}
                  {Number(report.matchedPo.qty).toLocaleString("en-US")} {report.matchedPo.unit}{" "}
                  due {report.matchedPo.due_date}
                </p>
              )}
              {report.findings.map((finding, index) => (
                <div
                  key={index}
                  className={`rounded-lg border p-4 ${CARD_STYLES[finding.severity]}`}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    {BADGES[finding.severity]}
                  </span>
                  <p className="mt-1 font-semibold">{finding.message}</p>
                  {finding.detail && <p className="mt-1 text-sm">{finding.detail}</p>}
                </div>
              ))}
              <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
                What the AI read, and how sure it is: {report.extraction.notes}{" "}
                (confidence: {report.extraction.confidence})
              </p>
            </div>
          )}
        </section>
      </div>

      {!testMode && (
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            Supplier inbox (Gmail)
            {inbox.status === "connected" && (
              <span className="flex items-center gap-1 text-xs font-normal text-green-600 dark:text-green-400">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Connected
              </span>
            )}
          </h2>
          {inbox.status === "connected" && (
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={autoSend}
                  onChange={(event) => setAutoSend(event.target.checked)}
                  className="h-4 w-4"
                />
                Auto-send reply when everything is green
              </label>
              <button
                onClick={loadInbox}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Refresh
              </button>
            </div>
          )}
        </div>

        {inbox.status === "loading" && (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Checking Google connection...</p>
        )}
        {inbox.status === "unconfigured" && (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Google connection is not configured. Add GOOGLE_CLIENT_ID and
            GOOGLE_CLIENT_SECRET to .env.local (setup steps in docs/GOOGLE-SETUP.md),
            then restart the app.
          </p>
        )}
        {inbox.status === "disconnected" && (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Not connected. Use the Connect to Google button at the top right. It
            reads emails under your &quot;suppliers&quot; label and can send a short
            confirmation reply; nothing is sent without the auto-send toggle or
            the button.
          </p>
        )}
        {inbox.status === "error" && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{inbox.message}</p>
        )}

        {inbox.status === "connected" && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Emails under &quot;suppliers&quot;: <span className="font-semibold">{emails.length} total</span>
              {", "}
              <span className="font-semibold">{checkedCount} checked</span>
              {", "}
              <span className="font-semibold">{emails.length - checkedCount} unchecked</span>
              {ingestStatus && <span className="ml-2 italic">{ingestStatus}</span>}
            </p>

            {emails.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No emails under the &quot;suppliers&quot; label yet. Label a supplier
                email in Gmail and hit Refresh.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedEmailId}
                  onChange={(event) => selectEmail(event.target.value)}
                  className="min-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  <option value="">Select an email...</option>
                  {emails.map((email) => (
                    <option key={email.id} value={email.id}>
                      {emailResults[email.id] ? `${DOTS[emailResults[email.id]]} ` : ""}
                      {email.shortLabel || email.subject || "(no subject)"}
                      {email.isConfirmation ? "" : " (not a confirmation)"}
                      {email.attachments.length > 0 ? ` [${email.attachments.length} att.]` : ""}
                    </option>
                  ))}
                </select>
                <button
                  onClick={checkSelectedEmail}
                  disabled={loading || !selectedEmail || emailBoxText.trim().length === 0}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? "Checking..." : "Check email"}
                </button>
                {selectedEmail && sentIds.includes(selectedEmail.id) && (
                  <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 dark:bg-green-900/50 dark:text-green-300">
                    Reply sent
                  </span>
                )}
                {selectedEmail &&
                  !sentIds.includes(selectedEmail.id) &&
                  emailResults[selectedEmail.id] === "ok" && (
                    <button
                      onClick={() => sendReply(selectedEmail.id)}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
                    >
                      Send reply
                    </button>
                  )}
              </div>
            )}

            {selectedEmail && (
              <div>
                <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                  {selectedEmail.from} {selectedEmail.date && `on ${selectedEmail.date}`}
                </p>
                <textarea
                  value={emailBoxText}
                  onChange={(event) => setEmailBoxText(event.target.value)}
                  rows={8}
                  className={`w-full rounded-lg border-2 bg-white p-3 font-mono text-sm text-slate-800 focus:outline-none dark:bg-slate-950 dark:text-slate-200 ${
                    emailBoxSeverity
                      ? BOX_STYLES[emailBoxSeverity]
                      : "border-slate-300 dark:border-slate-700"
                  }`}
                />
              </div>
            )}

          </div>
        )}

        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold">Documents</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Upload PO lists and production schedules (.csv, .xlsx, .pdf) with
              the top-right button. Email attachments are read automatically.
              Everything lives in this browser tab and is gone on refresh.
            </span>
          </div>
          {ingestStatus && inbox.status !== "connected" && (
            <p className="mt-2 text-sm italic text-slate-500 dark:text-slate-400">{ingestStatus}</p>
          )}
          {docs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No documents yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {docs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
                >
                  <span>
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {doc.name}
                      </a>
                    ) : (
                      <span className="font-medium">{doc.name}</span>
                    )}
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                      {doc.poCount} PO row{doc.poCount === 1 ? "" : "s"}, {doc.runCount} run
                      {doc.runCount === 1 ? "" : "s"}
                      {doc.id.startsWith("gmail-") && " (from email)"}
                    </span>
                  </span>
                  <button
                    onClick={() => removeDoc(doc.id)}
                    className="text-xs text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      )}

      {(testMode || visiblePos.length > 0 || visibleRuns.length > 0) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">Open purchase orders</h2>
            <div className="mt-3 max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="pb-2 pr-2">PO</th>
                    <th className="pb-2 pr-2">Item</th>
                    <th className="pb-2 pr-2">Qty</th>
                    <th className="pb-2">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePos.map((po) => (
                    <tr
                      key={`${po.po_number}-${po.source ?? "builtin"}`}
                      className={`border-t border-slate-100 dark:border-slate-800 ${
                        po.po_number === matchedPoNumber && severity ? ROW_STYLES[severity] : ""
                      }`}
                    >
                      <td className="py-2 pr-2 font-medium">{po.po_number}</td>
                      <td className="py-2 pr-2">{po.description}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {po.qty.toLocaleString("en-US")} {po.unit}
                      </td>
                      <td className="py-2 whitespace-nowrap">{po.due_date}</td>
                    </tr>
                  ))}
                  {visiblePos.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-3 text-sm text-slate-500 dark:text-slate-400">
                        No purchase orders yet. Upload a PO document or connect Gmail.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">Production schedule</h2>
            <div className="mt-3 max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="pb-2 pr-2">Run</th>
                    <th className="pb-2 pr-2">Line</th>
                    <th className="pb-2 pr-2">Product</th>
                    <th className="pb-2">Starts</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRuns.map((run) => (
                    <tr
                      key={`${run.run_id}-${run.source ?? "builtin"}`}
                      className={`border-t border-slate-100 dark:border-slate-800 ${
                        run.run_id === matchedRunId && severity ? ROW_STYLES[severity] : ""
                      }`}
                    >
                      <td className="py-2 pr-2 font-medium">{run.run_id}</td>
                      <td className="py-2 pr-2">{run.line}</td>
                      <td className="py-2 pr-2">{run.product}</td>
                      <td className="py-2 whitespace-nowrap">{run.start_date}</td>
                    </tr>
                  ))}
                  {visibleRuns.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-3 text-sm text-slate-500 dark:text-slate-400">
                        No production runs yet. Upload a schedule document.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
