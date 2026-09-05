"use client";

/**
 * Approval ladder — PDF §4-A3 bullet 3.
 * "Configure approval chain: which discount range needs Sales Manager only,
 *  and which range needs Sales Manager followed by Finance."
 *
 * Each rung carries TWO triggers and fires when either is crossed:
 *     blendedScore >= minBlendedScore   OR   worstLineOverage >= minWorstLineOverage
 *
 * Keep the two apart. Setting them equal makes the blended dimension inert —
 * anything reaching blended ≥ N has almost certainly tripped worst-line ≥ N
 * already — which silently switches off the many-small-violations case that
 * §10 exists to describe.
 */

import React, { useState, useEffect } from "react";
import apiClient from "../../../lib/apiClient.js";
import { Button, Card, Table, Badge } from "../../../components/ui/index.js";
import { Field, AdminHeader, Banners, EmptyRow } from "../../../components/admin/AdminUI.jsx";

export default function ApprovalLadderPage() {
  const [policies, setPolicies] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [newStep, setNewStep] = useState({
    roleId: "",
    stepOrder: "",
    minBlendedScore: "",
    minWorstLineOverage: "",
  });
  const [newPolicyName, setNewPolicyName] = useState("");

  const load = async () => {
    try {
      setError("");
      const [p, r] = await Promise.all([
        apiClient.get("/approvals/policies"),
        apiClient.get("/auth/roles").catch(() => ({ roles: [] })),
      ]);
      // This endpoint returns a bare array rather than a named envelope,
      // unlike most of the API — accept either shape.
      setPolicies(Array.isArray(p) ? p : p.policies || []);
      setRoles(r.roles || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const run = async (fn, msg) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(msg);
      await load();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const active = policies.find((p) => p.isActive) || policies[0];

  const addStep = async (e) => {
    e.preventDefault();
    if (!active) return;
    const ok = await run(
      () =>
        apiClient.post(`/approvals/policies/${active.id}/steps`, {
          roleId: newStep.roleId,
          stepOrder: Number(newStep.stepOrder),
          // Blank means "this dimension never fires the rung" — sent as null,
          // not 0, which would fire on every quotation.
          minBlendedScore:
            newStep.minBlendedScore === "" ? null : Number(newStep.minBlendedScore),
          minWorstLineOverage:
            newStep.minWorstLineOverage === "" ? null : Number(newStep.minWorstLineOverage),
        }),
      "Rung added — effective on the next quotation confirmed"
    );
    if (ok) setNewStep({ roleId: "", stepOrder: "", minBlendedScore: "", minWorstLineOverage: "" });
  };

  const updateStep = (stepId, patch, msg) =>
    run(() => apiClient.put(`/approvals/policies/steps/${stepId}`, patch), msg);

  const deleteStep = (stepId) =>
    run(() => apiClient.delete(`/approvals/policies/steps/${stepId}`), "Rung removed");

  const createPolicy = async (e) => {
    e.preventDefault();
    const ok = await run(
      () => apiClient.post("/approvals/policies", { name: newPolicyName }),
      `Policy "${newPolicyName}" created`
    );
    if (ok) setNewPolicyName("");
  };

  if (loading) return <p className="text-sm text-[#6C757D]">Loading…</p>;

  const steps = [...(active?.steps || [])].sort((a, b) => a.stepOrder - b.stepOrder);
  const equalThresholds = steps.filter(
    (s) =>
      s.minBlendedScore !== null &&
      s.minWorstLineOverage !== null &&
      Number(s.minBlendedScore) === Number(s.minWorstLineOverage)
  );

  return (
    <>
      <AdminHeader
        title="Approval Ladder"
        description="An ordered list of rungs of any length. A quotation activates every rung whose trigger it crosses — adding a third approver is a row, not a deploy."
      />
      <Banners error={error} notice={notice} />

      {!active && (
        <Card title="No active policy" className="mb-5">
          <form onSubmit={createPolicy} className="flex items-end gap-3">
            <Field
              label="Policy name" required placeholder="Standard Approval Ladder"
              value={newPolicyName} onChange={setNewPolicyName} className="max-w-sm"
            />
            <Button type="submit" variant="primary" size="sm" disabled={busy}>
              Create Policy
            </Button>
          </form>
        </Card>
      )}

      {active && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-semibold text-[#212529]">{active.name}</span>
            <Badge variant={active.isActive ? "success" : "neutral"} size="sm">
              {active.isActive ? "active" : "inactive"}
            </Badge>
          </div>

          {equalThresholds.length > 0 && (
            <div className="mb-4 bg-[#FFF4E5] border border-[#FD7E14]/30 rounded-[8px] px-4 py-3">
              <div className="text-sm font-semibold text-[#7A4100]">
                {equalThresholds.length} rung{equalThresholds.length > 1 ? "s have" : " has"} both
                thresholds set to the same value
              </div>
              <div className="text-xs text-[#7A4100]/80 mt-1">
                The blended trigger is effectively switched off there: a quotation reaching blended
                ≥ N has almost certainly already tripped worst-line ≥ N. Set the blended threshold
                lower so a spread of small violations still routes.
              </div>
            </div>
          )}

          <Card title="Add a Rung" className="mb-5">
            <form onSubmit={addStep} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <Field
                label="Approver role" required
                options={roles.map((r) => ({ value: r.id, label: r.name || r.code }))}
                value={newStep.roleId}
                onChange={(v) => setNewStep((s) => ({ ...s, roleId: v }))}
              />
              <Field
                label="Order" type="number" required min={1}
                value={newStep.stepOrder}
                onChange={(v) => setNewStep((s) => ({ ...s, stepOrder: v }))}
              />
              <Field
                label="Min blended score" type="number" min={0} step="0.5"
                value={newStep.minBlendedScore}
                onChange={(v) => setNewStep((s) => ({ ...s, minBlendedScore: v }))}
                hint="Blank = never fires on this"
              />
              <Field
                label="Min worst line (pts)" type="number" min={0} step="0.5"
                value={newStep.minWorstLineOverage}
                onChange={(v) => setNewStep((s) => ({ ...s, minWorstLineOverage: v }))}
                hint="Blank = never fires on this"
              />
              <Button type="submit" variant="primary" size="sm" disabled={busy}>
                Add Rung
              </Button>
            </form>
          </Card>

          <Table headers={["Order", "Approver", "Min blended", "Min worst line", ""]}>
            {steps.length === 0 && (
              <EmptyRow colSpan={5}>
                No rungs configured — nothing will ever route for approval.
              </EmptyRow>
            )}

            {steps.map((s) => (
              <tr key={s.id} className="border-t border-[#E9ECEF]">
                <td className="px-4 py-3 text-sm font-semibold">{s.stepOrder}</td>
                <td className="px-4 py-3 text-sm">{s.role?.name || s.role?.code}</td>

                {["minBlendedScore", "minWorstLineOverage"].map((key) => (
                  <td key={key} className="px-4 py-3">
                    <input
                      type="number" min="0" step="0.5"
                      defaultValue={s[key] === null ? "" : Number(s[key])}
                      placeholder="never"
                      disabled={busy}
                      onBlur={(e) => {
                        const raw = e.target.value;
                        const next = raw === "" ? null : Number(raw);
                        const current = s[key] === null ? null : Number(s[key]);
                        if (next !== current) {
                          updateStep(s.id, { [key]: next }, `Rung ${s.stepOrder} updated`);
                        }
                      }}
                      className="w-24 px-2 py-1 text-sm border border-[#DEE2E6] rounded-[4px]"
                    />
                  </td>
                ))}

                <td className="px-4 py-3">
                  <Button variant="danger" size="sm" className="text-xs"
                    disabled={busy} onClick={() => deleteStep(s.id)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </Table>

          <div className="mt-4 bg-[#F8F9FA] border border-[#E9ECEF] rounded-[8px] p-4">
            <div className="text-xs font-semibold text-[#495057] mb-1">How a rung fires</div>
            <code className="text-xs text-[#714B67] font-mono block">
              blendedScore ≥ minBlendedScore &nbsp;OR&nbsp; worstLineOverage ≥ minWorstLineOverage
            </code>
            <p className="text-xs text-[#6C757D] mt-2">
              Two triggers, because the PDF describes two different failures. One line badly over
              its ceiling is caught by the worst-line trigger; several lines each slightly over —
              none alarming alone — are caught only by the blended one.
            </p>
          </div>
        </>
      )}
    </>
  );
}
