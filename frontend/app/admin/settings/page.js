"use client";

/**
 * Engine settings — the singleton GovernanceSetting row.
 *
 * This page is the sharpest demonstration of the thesis: changing the scoring
 * STRATEGY here changes how every subsequent quotation is scored and routed,
 * with no code change and no restart, because the engine reads this row fresh
 * on every evaluation.
 */

import React, { useState, useEffect } from "react";
import apiClient from "../../../lib/apiClient.js";
import { Button, Card } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners } from "../../../components/admin/AdminUI.jsx";

const STRATEGIES = [
  {
    value: "VALUE_WEIGHTED",
    label: "Value weighted (recommended)",
    formula: "Σ(overage × lineValue) ÷ Σ lineValue",
    note: "Big lines move the score more than small ones. Comparable to a single line's overage.",
  },
  {
    value: "SUM_OF_POINTS",
    label: "Sum of points",
    formula: "Σ overage",
    note: "Simplest to explain, but blind to line size: 8 points over on ₹200 scores the same as on ₹2,00,000.",
  },
  {
    value: "ABSOLUTE_MARGIN",
    label: "Absolute margin given away",
    formula: "Σ(overage% × lineValue)",
    note: "Reads as real money, but thresholds become order-size dependent.",
  },
];

const FALLBACKS = [
  {
    value: "DENY",
    label: "Deny — treat as 0%",
    note: "Fail-safe. Any discount on an unconfigured pair is overage and routes. A half-configured system routes everything.",
  },
  {
    value: "TIER_ONLY",
    label: "Fall back to the tier ceiling",
    note: "Degrades gracefully, but a brand-new category silently inherits generous limits.",
  },
  {
    value: "PERMISSIVE",
    label: "Permissive — no ceiling",
    note: "Unsafe. Deleting a rule silently removes all governance for that pair.",
  },
];

export default function EngineSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    try {
      const data = await apiClient.get("/governance/settings");
      const s = data.settings || data.setting || data;
      setSettings(s);
      setForm({
        scoreStrategy: s.scoreStrategy,
        unconfiguredCeilingPolicy: s.unconfiguredCeilingPolicy,
        stalledAfterDays: Number(s.stalledAfterDays),
        anomalyDeviationPoints: Number(s.anomalyDeviationPoints),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiClient.put("/governance/settings", form);
      setNotice("Saved. The next quotation scored will use these settings — no restart needed.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-[#6C757D]">Loading…</p>;

  const activeStrategy = STRATEGIES.find((s) => s.value === form.scoreStrategy);
  const activeFallback = FALLBACKS.find((f) => f.value === form.unconfiguredCeilingPolicy);

  return (
    <>
      <AdminHeader
        title="Engine Settings"
        description="How the deal engine combines overages into one number, and what it does when nothing is configured. Read fresh on every evaluation."
      >
        <Button variant="primary" size="sm" onClick={save} disabled={busy}>
          Save Settings
        </Button>
      </AdminHeader>

      <Banners error={error} notice={notice} />

      <div className="space-y-5">
        <Card title="Scoring Strategy" subtitle="How line overages combine across an order">
          <Field
            label="Strategy"
            value={form.scoreStrategy}
            onChange={(v) => setForm((f) => ({ ...f, scoreStrategy: v }))}
            options={STRATEGIES.map((s) => ({ value: s.value, label: s.label }))}
            className="max-w-md"
          />
          {activeStrategy && (
            <div className="mt-3 bg-[#F8F9FA] border border-[#E9ECEF] rounded-[6px] p-3">
              <code className="text-xs text-[#714B67] font-mono">{activeStrategy.formula}</code>
              <p className="text-xs text-[#6C757D] mt-1.5">{activeStrategy.note}</p>
            </div>
          )}
          <p className="text-[11px] text-[#6C757D] mt-3">
            The blended score is only half of the routing decision — the worst single line is the
            other half, and either can trigger a rung on its own. That pairing is what catches both
            one badly-over line and many small ones.
          </p>
        </Card>

        <Card
          title="Unconfigured Ceiling Policy"
          subtitle="What happens when no rule matches a (tier, category) pair"
        >
          <Field
            label="Fallback"
            value={form.unconfiguredCeilingPolicy}
            onChange={(v) => setForm((f) => ({ ...f, unconfiguredCeilingPolicy: v }))}
            options={FALLBACKS.map((f) => ({ value: f.value, label: f.label }))}
            className="max-w-md"
          />
          {activeFallback && (
            <p className="text-xs text-[#6C757D] mt-3 bg-[#F8F9FA] border border-[#E9ECEF] rounded-[6px] p-3">
              {activeFallback.note}
            </p>
          )}
          <p className="text-[11px] text-[#6C757D] mt-3">
            Resolution order: rule for (tier, category) → (any tier, category) → (tier, any
            category) → the tier&apos;s own ceiling → this fallback. The strictest match always wins.
          </p>
        </Card>

        <Card title="Deal Health" subtitle="Thresholds for the monitoring signals">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <Field
              label="Stalled after (days)"
              type="number"
              min={1}
              value={form.stalledAfterDays}
              onChange={(v) => setForm((f) => ({ ...f, stalledAfterDays: v }))}
              hint="Days of inactivity before a quotation is flagged as stalled."
            />
            <Field
              label="Discount anomaly deviation (points)"
              type="number"
              min={0}
              step="0.5"
              value={form.anomalyDeviationPoints}
              onChange={(v) => setForm((f) => ({ ...f, anomalyDeviationPoints: v }))}
              hint="How far above a rep's own average a discount must sit to be flagged."
            />
          </div>
        </Card>

        {settings?.updatedAt && (
          <p className="text-[11px] text-[#6C757D]">
            Last changed {new Date(settings.updatedAt).toLocaleString()}
          </p>
        )}
      </div>
    </>
  );
}
