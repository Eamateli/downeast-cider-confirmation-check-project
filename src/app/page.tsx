"use client";

import { useState } from "react";
import { SAMPLES } from "@/lib/samples";
import type { Finding, ReconcileReport } from "@/lib/schema";

const CARD_STYLES: Record<Finding["severity"], string> = {
  ok: "border-green-300 bg-green-50 text-green-900",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  risk: "border-red-300 bg-red-50 text-red-900",
};

const BADGES: Record<Finding["severity"], string> = {
  ok: "OK",
  warn: "Warning",
  risk: "At risk",
};

export default function Home() {
  const [emailText, setEmailText] = useState("");
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function checkConfirmation() {
    setLoading(true);
    setReport(null);
    setError(null);
    try {
      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setReport(data);
      }
    } catch {
      setError("Could not reach the server. Is the app running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Confirmation Check</h1>
      <p className="mt-1 text-slate-600">
        Paste a supplier order confirmation. See what changed and which
        production run it affects.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {SAMPLES.map((sample) => (
          <button
            key={sample.label}
            onClick={() => {
              setEmailText(sample.text);
              setReport(null);
              setError(null);
            }}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
          >
            {sample.label}
          </button>
        ))}
      </div>

      <textarea
        value={emailText}
        onChange={(event) => setEmailText(event.target.value)}
        placeholder="Paste the supplier email here..."
        rows={10}
        className="mt-4 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
      />

      <button
        onClick={checkConfirmation}
        disabled={loading || emailText.trim().length === 0}
        className="mt-3 rounded-lg bg-slate-900 px-5 py-2 font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? "Checking..." : "Check confirmation"}
      </button>

      {error && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
          <p className="font-semibold">Could not check this confirmation</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      {report && (
        <section className="mt-6 space-y-3">
          {report.matchedPo && (
            <p className="text-sm text-slate-600">
              Matched <span className="font-semibold">{report.matchedPo.po_number}</span>
              {", "}
              {report.matchedPo.description}
              {": "}
              {Number(report.matchedPo.qty).toLocaleString("en-US")} {report.matchedPo.unit} due{" "}
              {report.matchedPo.due_date}
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

          <p className="pt-2 text-xs text-slate-500">
            What the AI read, and how sure it is: {report.extraction.notes}{" "}
            (confidence: {report.extraction.confidence})
          </p>
        </section>
      )}
    </main>
  );
}
