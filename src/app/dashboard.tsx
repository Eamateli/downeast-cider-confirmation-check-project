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
          // Key on message + filename: Gmail's attachmentId changes between
          // fetches, so it would let the same attachment ingest twice.
          const source = `gmail-${email.id}-${att.filename}`;
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
    setEmailText(email?.bodyText ?? "");
    reset();
  }

  // One entry point for the Check button: a selected Gmail email records its
  // result and may auto-send; plain pasted text just runs the check.
  async function checkNow() {
    if (!emailText.trim()) return;
    const data = await runCheck(emailText);
    if (!data) return;
    if (!testMode && selectedEmail) {
      const result = worstSeverity(data.findings);
      setEmailResults((map) => ({ ...map, [selectedEmail.id]: result }));
      if (result === "ok" && autoSend && !sentIds.includes(selectedEmail.id)) {
        await sendReply(selectedEmail.id);
      }
    }
  }

  const emailBoxSeverity =
    !testMode && selectedEmailId ? emailResults[selectedEmailId] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-[96rem] gap-6 px-6 py-8">
      <div className="min-w-0 flex-1">
      <header>
        <h1 className="text-2xl font-bold">Confirmation Check</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Paste or upload a supplier order confirmation. See what changed and
          which production run it affects.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open POs" value={String(visiblePos.length)} />
        <StatCard label="Scheduled runs" value={String(visibleRuns.length)} />
        <StatCard label="Checks this session" value={String(checksRun)} />
        <StatCard label="Flags raised" value={String(flagsRaised)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">Check a confirmation</h2>
            {testMode && (
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
            )}

            {!testMode && inbox.status === "connected" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={selectedEmailId}
                  onChange={(event) => selectEmail(event.target.value)}
                  className="min-w-56 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  <option value="">Select a supplier email...</option>
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
                  onClick={loadInbox}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Refresh
                </button>
              </div>
            )}
            {!testMode && selectedEmail && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {selectedEmail.from} {selectedEmail.date && `on ${selectedEmail.date}`}
              </p>
            )}

            <textarea
              value={emailText}
              onChange={(event) => setEmailText(event.target.value)}
              placeholder="Paste the supplier email here..."
              rows={9}
              className={`mt-3 w-full rounded-lg border bg-white p-3 font-mono text-sm text-slate-800 focus:border-slate-500 focus:outline-none dark:bg-slate-950 dark:text-slate-200 ${
                emailBoxSeverity
                  ? BOX_STYLES[emailBoxSeverity]
                  : "border-slate-300 dark:border-slate-700"
              }`}
            />

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={checkNow}
                disabled={loading || emailText.trim().length === 0}
                className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Checking..." : "Check confirmation"}
              </button>
              {!testMode && selectedEmail && sentIds.includes(selectedEmail.id) && (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 dark:bg-green-900/50 dark:text-green-300">
                  Reply sent
                </span>
              )}
              {!testMode &&
                selectedEmail &&
                !sentIds.includes(selectedEmail.id) &&
                emailResults[selectedEmail.id] === "ok" && (
                  <button
                    onClick={() => sendReply(selectedEmail.id)}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
                  >
                    Send reply
                  </button>
                )}
              {!testMode && inbox.status === "connected" && (
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={autoSend}
                    onChange={(event) => setAutoSend(event.target.checked)}
                    className="h-4 w-4"
                  />
                  Auto-send reply when green
                </label>
              )}
            </div>

            {!testMode && inbox.status === "connected" && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Emails under &quot;suppliers&quot;: {emails.length} total, {checkedCount} checked,{" "}
                {emails.length - checkedCount} unchecked
                {ingestStatus && <span className="ml-1 italic">{ingestStatus}</span>}
              </p>
            )}
            {!testMode &&
              (inbox.status === "disconnected" || inbox.status === "unconfigured") && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Connect Google (top right) to pull supplier emails here, or paste
                  a confirmation above.
                </p>
              )}
            {!testMode && inbox.status === "error" && (
              <p className="mt-3 text-xs text-red-600 dark:text-red-400">{inbox.message}</p>
            )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
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


      <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">Open purchase orders</h2>
            <div className="mt-3 max-h-80 overflow-y-auto [scrollbar-gutter:stable]">
              <table className="w-full text-xs">
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
                      <td className="whitespace-nowrap py-2 pr-2 font-medium">{po.po_number}</td>
                      <td className="whitespace-nowrap py-2 pr-2">{po.description}</td>
                      <td className="whitespace-nowrap py-2 pr-2">
                        {po.qty.toLocaleString("en-US")} {po.unit}
                      </td>
                      <td className="whitespace-nowrap py-2">{po.due_date}</td>
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

          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">Production schedule</h2>
            <div className="mt-3 max-h-80 overflow-y-auto [scrollbar-gutter:stable]">
              <table className="w-full text-xs">
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
                      <td className="whitespace-nowrap py-2 pr-2 font-medium">{run.run_id}</td>
                      <td className="whitespace-nowrap py-2 pr-2">{run.line}</td>
                      <td className="whitespace-nowrap py-2 pr-2">{run.product}</td>
                      <td className="whitespace-nowrap py-2">{run.start_date}</td>
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
      </div>

      <aside className="w-44 shrink-0">
        <div className="sticky top-8 flex flex-col gap-3">
          <div className="mt-8 flex items-center justify-end gap-4">
            <ThemeToggle />
            <Slider
              on={testMode}
              onToggle={() => {
                setTestMode((v) => !v);
                setSelectedEmailId("");
                setEmailText("");
                reset();
              }}
              left=""
              right="Test"
              ariaLabel="Toggle test data"
            />
          </div>

          {testMode || inbox.status === "unconfigured" || inbox.status === "loading" ? (
            <button
              disabled
              title={
                testMode
                  ? "Turn the Test slider off to connect Gmail"
                  : "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first (docs/GOOGLE-SETUP.md)"
              }
              className="cursor-not-allowed rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white opacity-40"
            >
              Connect to Google
            </button>
          ) : inbox.status === "connected" ? (
            <span className="flex items-center justify-center gap-2 rounded-lg border border-green-400 px-3 py-2 text-sm font-medium text-green-700 dark:border-green-700 dark:text-green-400">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              Google connected
            </span>
          ) : (
            <a
              href="/api/google/auth"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-indigo-500"
            >
              Connect to Google
            </a>
          )}

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
            disabled={testMode}
            title={testMode ? "Turn the Test slider off to upload documents" : undefined}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Upload document
          </button>

          {testMode && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Turn the Test slider off to connect Gmail and upload your own
              documents.
            </p>
          )}

          {!testMode && (
            <>
              {ingestStatus && (
                <p className="text-xs italic text-slate-500 dark:text-slate-400">{ingestStatus}</p>
              )}

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Documents
                </h3>
                {docs.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    No documents yet. Uploads and email attachments appear here.
                    All of it lives in this tab and is gone on refresh.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {docs.map((doc) => (
                      <li
                        key={doc.id}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
                      >
                        <div className="flex items-start justify-between gap-2">
                          {doc.url ? (
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noreferrer"
                              className="break-all font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              {doc.name}
                            </a>
                          ) : (
                            <span className="break-all font-medium">{doc.name}</span>
                          )}
                          <button
                            onClick={() => removeDoc(doc.id)}
                            aria-label={`Remove ${doc.name}`}
                            title="Remove"
                            className="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                          >
                            🗑
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {doc.poCount} PO row{doc.poCount === 1 ? "" : "s"}, {doc.runCount} run
                          {doc.runCount === 1 ? "" : "s"}
                          {doc.id.startsWith("gmail-") && ", from email"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </main>
  );
}
