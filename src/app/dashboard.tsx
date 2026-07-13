"use client";

import { useRef, useState } from "react";
import { SAMPLES } from "@/lib/samples";
import type { Finding, ReconcileReport } from "@/lib/schema";
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

function ThemeToggle() {
  // The knob position follows the .dark class on <html> via dark: variants,
  // so no React state is needed and server and client always agree.
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", dark ? "dark" : "light");
  }
  return (
    <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      Day
      <button
        onClick={toggle}
        aria-label="Toggle night mode"
        className="relative h-6 w-11 rounded-full bg-slate-300 transition-colors dark:bg-indigo-600"
      >
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform dark:translate-x-5" />
      </button>
      Night
    </label>
  );
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
  const [emailText, setEmailText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checksRun, setChecksRun] = useState(0);
  const [flagsRaised, setFlagsRaised] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const matchedPoNumber = report?.matchedPo?.po_number ?? null;
  const matchedRunId = matchedPoNumber
    ? pos.find((po) => po.po_number === matchedPoNumber)?.run_id ?? null
    : null;
  const severity = report ? worstSeverity(report.findings) : null;

  function reset() {
    setReport(null);
    setError(null);
  }

  async function checkConfirmation() {
    setLoading(true);
    reset();
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        res = await fetch("/api/reconcile", { method: "POST", body: form });
      } else {
        res = await fetch("/api/reconcile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ emailText }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setReport(data);
        setChecksRun((n) => n + 1);
        setFlagsRaised((n) => n + data.findings.filter((f: Finding) => f.severity !== "ok").length);
      }
    } catch {
      setError("Could not reach the server. Is the app running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Confirmation Check</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Paste or upload a supplier order confirmation. See what changed and
            which production run it affects.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open POs" value={String(pos.length)} />
        <StatCard label="Scheduled runs" value={String(schedule.length)} />
        <StatCard label="Checks this session" value={String(checksRun)} />
        <StatCard label="Flags raised" value={String(flagsRaised)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Check a confirmation</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {SAMPLES.map((sample) => (
              <button
                key={sample.label}
                onClick={() => {
                  setEmailText(sample.text);
                  setFile(null);
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
            disabled={file !== null}
            className="mt-3 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm text-slate-800 focus:border-slate-500 focus:outline-none disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={checkConfirmation}
              disabled={loading || (emailText.trim().length === 0 && !file)}
              className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Checking..." : "Check confirmation"}
            </button>

            <input
              ref={fileInput}
              type="file"
              accept=".txt,.csv,.pdf,.xlsx,.xls,.eml"
              className="hidden"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                reset();
              }}
            />
            <button
              onClick={() => fileInput.current?.click()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Upload attachment
            </button>
            {file && (
              <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                {file.name}
                <button
                  onClick={() => {
                    setFile(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  className="font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Remove file"
                >
                  x
                </button>
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
            Accepts pasted text or a .txt, .csv, .pdf, .xlsx or .eml attachment.
          </p>
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
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Open purchase orders</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="pb-2 pr-2">PO</th>
                <th className="pb-2 pr-2">Item</th>
                <th className="pb-2 pr-2">Qty</th>
                <th className="pb-2">Due</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                <tr
                  key={po.po_number}
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
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Production schedule</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="pb-2 pr-2">Run</th>
                <th className="pb-2 pr-2">Line</th>
                <th className="pb-2 pr-2">Product</th>
                <th className="pb-2">Starts</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((run) => (
                <tr
                  key={run.run_id}
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
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
