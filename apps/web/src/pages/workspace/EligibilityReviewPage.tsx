import { useEffect, useMemo, useState } from 'react';
import type {
  BeneficiaryLifecycleEventType,
  BeneficiaryRegistrySummary,
  EligibilityCase,
  EligibilityScreeningResponse,
  EligibilitySummary
} from '@pds/shared-types';
import {
  checkEligibilityGate,
  loadEligibilityCases,
  loadEligibilitySummary,
  loadBeneficiaryRegistrySummary,
  performEligibilityAction,
  runEligibilityScreening,
  submitBeneficiaryLifecycleEvent
} from '@/api.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';
import { getDataSourceMode } from '@/data-source.js';
import { eligibilityBeneficiaries } from '@pds/fixtures';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';

const offlineSummary: EligibilitySummary = {
  simulationOnly: true,
  policyId: 'MH-PANEL-DEMO-2026-V1',
  service: { status: 'NOT_CONFIGURED', warning: 'Offline fixture mode is read-only.' },
  statusCounts: {}, openCases: 0, decisions: 0, appeals: 0, reversals: 0, quarantined: 0,
  planningImpact: {
    simulationOnly: true, baselineHouseholdMembers: 0, currentEligibleHouseholdMembers: 0,
    baselineMonthlyRiceKg: 0, currentMonthlyRiceKg: 0, allocationDeltaKg: 0,
    indicativeSubsidyRateInrPerKg: 30, indicativeMonthlySubsidyDeltaInr: 0
  },
  beneficiaries: eligibilityBeneficiaries
};
const offlineRegistry: BeneficiaryRegistrySummary = {
  activeRecords: 0, activeHouseholdMembers: 0, lifecycleEvents: 0, pendingProofs: 0,
  byEventType: {}, projections: []
};

export function EligibilityReviewPage() {
  const { role } = useWorkspaceContext();
  const offline = getDataSourceMode() === 'mock';
  const mutable = role === 'CONTROL_OFFICE' && !offline;
  const [summary, setSummary] = useState<EligibilitySummary>(offlineSummary);
  const [cases, setCases] = useState<EligibilityCase[]>([]);
  const [registry, setRegistry] = useState<BeneficiaryRegistrySummary>(offlineRegistry);
  const [selectedId, setSelectedId] = useState('BEN-DEMO-001');
  const [response, setResponse] = useState<EligibilityScreeningResponse | null>(null);
  const [gate, setGate] = useState<{ allowed: boolean; rcmsStatus: string; availableBalanceKg: number; alreadyLiftedKg: number; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(offline ? 'Offline fixture mode is read-only; external screening actions are disabled.' : null);

  const refresh = async () => {
    if (offline) return;
    try {
      const [nextSummary, nextCases, nextRegistry] = await Promise.all([
        loadEligibilitySummary(), loadEligibilityCases(), loadBeneficiaryRegistrySummary()
      ]);
      setSummary(nextSummary); setCases(nextCases); setRegistry(nextRegistry);
      setWarning(nextSummary.service.warning ?? null);
    } catch (error) {
      setWarning(error instanceof Error ? error.message : 'Eligibility dependency is unavailable; entitlement is preserved.');
    }
  };

  useEffect(() => { void refresh(); }, [offline]);
  const selectedCase = useMemo(
    () => cases.find((item) => item.demoBeneficiaryId === selectedId),
    [cases, selectedId]
  );
  const selectedBeneficiary = useMemo(
    () => summary.beneficiaries.find((item) => item.demoBeneficiaryId === selectedId),
    [summary.beneficiaries, selectedId]
  );

  const runScreening = async () => {
    setBusy(true); setWarning(null);
    try {
      const result = await runEligibilityScreening(selectedId, `WEB-${selectedId}-${Date.now()}`);
      setResponse(result.screening);
      if (result.case) setCases((current) => [...current.filter((item) => item.caseId !== result.case!.caseId), result.case!]);
      await refresh();
    } catch (error) {
      setWarning(`${error instanceof Error ? error.message : 'External service unavailable'} Current entitlement remains unchanged.`);
    } finally { setBusy(false); }
  };

  const act = async (
    action: Parameters<typeof performEligibilityAction>[1],
    outcomeCode: string,
    reasonCode: string,
    decision?: string
  ) => {
    if (!selectedCase) return;
    setBusy(true);
    try {
      const updated = await performEligibilityAction(selectedCase.caseId, action, {
        idempotencyKey: `WEB-${action}-${selectedCase.caseId}-${selectedCase.version}`,
        expectedVersion: selectedCase.version, outcomeCode, reasonCode, ...(decision ? { decision } : {})
      });
      setCases((current) => [...current.filter((item) => item.caseId !== updated.caseId), updated]);
      await refresh();
    } catch (error) { setWarning(error instanceof Error ? error.message : 'Case action failed'); }
    finally { setBusy(false); }
  };

  const checkGate = async () => {
    setBusy(true);
    try { setGate(await checkEligibilityGate(selectedId)); }
    catch (error) { setWarning(error instanceof Error ? error.message : 'Gate check failed'); }
    finally { setBusy(false); }
  };

  const recordLifecycle = async (eventType: BeneficiaryLifecycleEventType) => {
    const beneficiary = summary.beneficiaries.find((item) => item.demoBeneficiaryId === selectedId);
    if (!beneficiary) return;
    const projection = registry.projections.find((item) => item.beneficiaryRefHash === beneficiary.subjectRefHash);
    const now = new Date().toISOString();
    const digestBytes = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${eventType}:${beneficiary.subjectRefHash}:${now}`)
    );
    const evidenceDigest = [...new Uint8Array(digestBytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
    setBusy(true); setWarning(null);
    try {
      await submitBeneficiaryLifecycleEvent({
        eventId: `WEB-LIFECYCLE-${selectedId}-${eventType}-${Date.now()}`,
        beneficiaryRefHash: beneficiary.subjectRefHash,
        rationCardHash: beneficiary.rationCardHash,
        eventType,
        sourceSystem: 'VIKSITPDS_DEMO',
        occurredAt: now,
        effectiveAt: now,
        reasonCode: eventType === 'BENEFICIARY_CREATED' ? 'DEMO_REGISTRY_IMPORT' : 'AUTHORIZED_LIFECYCLE_UPDATE',
        policyId: beneficiary.jurisdictionCode === 'JK' ? 'JK-PANEL-DEMO-2026-V1' : 'MH-PANEL-DEMO-2026-V1',
        evidenceDigest,
        districtCode: beneficiary.districtCode ?? `${beneficiary.jurisdictionCode ?? 'DEMO'}-UNSPECIFIED`,
        householdSizeDelta: eventType === 'BENEFICIARY_CREATED' ? beneficiary.householdSize :
          eventType === 'HOUSEHOLD_BIFURCATED' ? -1 : 0,
        ...(projection ? { priorState: projection.state } : {}),
        schemaVersion: '1.0'
      });
      await refresh();
    } catch (error) {
      setWarning(error instanceof Error ? error.message : 'Beneficiary lifecycle event failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border border-amber-400/40 bg-amber-50 p-4 text-amber-950">
        <p className="font-semibold">External-service simulation using synthetic beneficiaries</p>
        <p className="mt-1 text-sm">Fictional policy {summary.policyId}. Signals open human review; they never cancel a ration card automatically.</p>
      </section>

      {warning && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">{warning}</div>}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['External service', summary.service.status],
          ['Open cases', summary.openCases],
          ['Decisions / appeals', `${summary.decisions} / ${summary.appeals}`],
          ['Reversals / quarantine', `${summary.reversals} / ${summary.quarantined}`]
        ].map(([label, value]) => <Card key={label}><CardHeader><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{value}</CardContent></Card>)}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card><CardHeader><CardTitle>Registry lifecycle</CardTitle></CardHeader><CardContent className="grid gap-2">
          <p className="text-2xl font-semibold">{registry.activeRecords} active records · {registry.lifecycleEvents} events</p>
          <p className="text-sm text-muted-foreground">{registry.activeHouseholdMembers} household members · {registry.pendingProofs} proofs pending</p>
          <div className="flex flex-wrap gap-2">
            {!registry.projections.some((item) => item.beneficiaryRefHash === summary.beneficiaries.find((beneficiary) => beneficiary.demoBeneficiaryId === selectedId)?.subjectRefHash)
              ? <Button disabled={!mutable || busy} onClick={() => void recordLifecycle('BENEFICIARY_CREATED')}>Register lifecycle record</Button>
              : <>
                <Button disabled={!mutable || busy} variant="outline" onClick={() => void recordLifecycle('MIGRATION_RECORDED')}>Record migration</Button>
                <Button disabled={!mutable || busy} variant="outline" onClick={() => void recordLifecycle('HOUSEHOLD_BIFURCATED')}>Record family bifurcation</Button>
              </>}
          </div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Planning impact · simulation</CardTitle></CardHeader><CardContent className="grid gap-2">
          <p className="text-2xl font-semibold">{summary.planningImpact.currentMonthlyRiceKg} kg/month</p>
          <p className="text-sm">Baseline {summary.planningImpact.baselineMonthlyRiceKg} kg · allocation change {summary.planningImpact.allocationDeltaKg} kg</p>
          <p className="text-sm text-muted-foreground">
            Indicative subsidy change ₹{summary.planningImpact.indicativeMonthlySubsidyDeltaInr} at ₹{summary.planningImpact.indicativeSubsidyRateInrPerKg}/kg.
          </p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Synthetic beneficiary screening</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-xs text-amber-900">
            Demo identity fields (name, address, 9999-prefixed Aadhaar, 90000… mobile for OTP) are fictional UI-only
            samples. Fabric proofs and ePoS auth use opaque hashes only — never raw phone or Aadhaar.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">Beneficiary</th>
                  <th>FPS / Tehsil</th>
                  <th>Demo Aadhaar</th>
                  <th>OTP mobile</th>
                  <th>Masked card</th>
                  <th>Status</th>
                  <th>Case</th>
                  <th>Entitlement</th>
                </tr>
              </thead>
              <tbody>{summary.beneficiaries.map((item) => {
                const itemCase = cases.find((candidate) => candidate.demoBeneficiaryId === item.demoBeneficiaryId);
                const mobile = item.demoMobileNumber ?? '';
                const mobileDisplay = mobile.length === 10 ? mobile.replace(/(\d{5})(\d{5})/, '$1 $2') : mobile || '—';
                return (
                <tr key={item.demoBeneficiaryId} className={`cursor-pointer border-b ${selectedId === item.demoBeneficiaryId ? 'bg-primary/5' : ''}`} onClick={() => setSelectedId(item.demoBeneficiaryId)}>
                  <td className="p-2">
                    <span className="font-medium">{item.fictionalName}</span>
                    <br />
                    <span className="text-muted-foreground">{item.demoBeneficiaryId}</span>
                    <br />
                    <span className="text-xs text-muted-foreground">{item.fictionalAddress}</span>
                  </td>
                  <td>
                    {item.fpsId}
                    <br />
                    <span className="text-xs text-muted-foreground">
                      Block {item.blockName} · Tehsil {item.tehsilName}
                    </span>
                  </td>
                  <td>
                    <code>
                      {(item.demoAadhaarNumber ?? '—').replace(/(\d{4})(\d{4})(\d{4})/, '$1-$2-$3')}
                    </code>
                    <br />
                    <span className="text-xs text-muted-foreground">{item.familyMembers?.length ?? 0} family members</span>
                  </td>
                  <td>
                    <code>{mobileDisplay}</code>
                    <br />
                    <span className="text-xs text-muted-foreground">Mock OTP inbox</span>
                  </td>
                  <td>{item.maskedCardRef}</td>
                  <td><Badge variant="outline">{item.eligibilityStatus}</Badge></td>
                  <td>{item.caseId ?? itemCase?.caseId ?? 'None'}</td>
                  <td>{item.monthlyRiceEntitlementKg - item.alreadyLiftedKg} kg remaining</td>
                </tr>
              );})}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void runScreening()} disabled={!mutable || busy}>Run external eligibility check</Button>
            <Button variant="outline" onClick={() => void checkGate()} disabled={offline || busy}>Entitlement gate check</Button>
          </div>
          {!mutable && <p className="text-sm text-muted-foreground">{offline ? 'Actions are disabled in offline fixture mode.' : 'Management and Auditor views are read-only.'}</p>}
        </CardContent>
      </Card>

      {selectedBeneficiary && (
        <Card>
          <CardHeader>
            <CardTitle>Household profile · {selectedBeneficiary.fictionalName}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">{selectedBeneficiary.fictionalAddress}</p>
            <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">FPS shop</dt>
                <dd className="font-medium">{selectedBeneficiary.fpsId}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Block / Tehsil</dt>
                <dd className="font-medium">
                  {selectedBeneficiary.blockName} / {selectedBeneficiary.tehsilName}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Demo Aadhaar (UI only)</dt>
                <dd className="font-medium">
                  <code>
                    {(selectedBeneficiary.demoAadhaarNumber ?? '—').replace(
                      /(\d{4})(\d{4})(\d{4})/,
                      '$1-$2-$3'
                    )}
                  </code>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">OTP mobile (UI only)</dt>
                <dd className="font-medium">
                  <code>
                    {(selectedBeneficiary.demoMobileNumber ?? '—').replace(
                      /(\d{5})(\d{5})/,
                      '$1 $2'
                    )}
                  </code>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Simulated AePDS OTP is narrated as delivered here; OTP values are never stored.
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Aadhaar ref hash</dt>
                <dd className="break-all text-xs">{selectedBeneficiary.aadhaarRefHash}</dd>
              </div>
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2">Family member</th>
                    <th>Relation</th>
                    <th>Age</th>
                    <th>Demo Aadhaar</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedBeneficiary.familyMembers ?? []).map((member) => (
                    <tr key={`${member.fictionalName}-${member.relation}`} className="border-b">
                      <td className="p-2">{member.fictionalName}</td>
                      <td>{member.relation}</td>
                      <td>{member.ageYears}</td>
                      <td>
                        <code>
                          {(member.demoAadhaarNumber ?? '—').replace(/(\d{4})(\d{4})(\d{4})/, '$1-$2-$3')}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {response && <Card><CardHeader><CardTitle>External screening response</CardTitle></CardHeader><CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge>{response.status}</Badge>
          <Badge variant="outline">{response.recommendedReviewAction}</Badge>
          {typeof response.integrityScore === 'number' ? (
            <Badge variant="outline">Integrity score {response.integrityScore}/100 (deterministic mock)</Badge>
          ) : null}
        </div>
        <p className="text-sm">Policy rules: {response.policy.ruleIds.join(', ')} · expires {new Date(response.expiresAt).toLocaleDateString()}</p>
        <p className="text-xs text-muted-foreground">Screening {response.screeningId} · request {response.screeningRequestId}</p>
        <p className="text-xs text-muted-foreground">
          Mock integrity review only — not UIDAI/CRS/AI. Officers must authorize any RCMS decision.
        </p>
        <div className="grid gap-2 md:grid-cols-3">{response.signals.map((item) => <div key={`${item.source}-${item.factCode}`} className="rounded-xl border p-3"><p className="font-medium">{item.source}</p><p className="text-sm">{item.status} · {item.risk}</p><p className="mt-1 text-xs text-muted-foreground">{item.factCode}</p>{item.linkageDigest ? <p className="mt-1 break-all text-xs text-muted-foreground">linkageDigest {item.linkageDigest}</p> : null}<p className="mt-1 text-xs text-muted-foreground">Observed {new Date(item.observedAt).toLocaleDateString()}</p></div>)}</div>
        {response.scoreBreakdown && response.scoreBreakdown.length > 0 ? (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Explainability (signal → rule → score)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2">Signal</th>
                    <th>Rule</th>
                    <th>Contribution</th>
                    <th>Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {response.scoreBreakdown.map((row) => (
                    <tr key={`${row.ruleId}-${row.signalFactCode}-${row.rationaleCode}`} className="border-b">
                      <td className="p-2 font-mono text-xs">{row.signalFactCode}</td>
                      <td className="font-mono text-xs">{row.ruleId}</td>
                      <td>{row.contribution > 0 ? `+${row.contribution}` : row.contribution}</td>
                      <td className="text-xs text-muted-foreground">{row.rationaleCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Recommended action: <strong>{response.recommendedReviewAction}</strong> — human authorization required before entitlement changes.
            </p>
          </div>
        ) : null}
        <p className="break-all text-xs text-muted-foreground">Evidence {response.evidenceDigest} · Attestation {response.responseAttestationHash}</p>
      </CardContent></Card>}

      {selectedCase && <Card><CardHeader><CardTitle>Guided case actions · {selectedCase.state}</CardTitle></CardHeader><CardContent className="grid gap-3">
        <p className="text-sm">Operational RCMS: <strong>{selectedCase.rcmsStatus}</strong> · Fabric proof: <strong>{selectedCase.proofStatus}</strong> · version {selectedCase.version}</p>
        <div className="flex flex-wrap gap-2">
          {['OPEN', 'AWAITING_DATA', 'AWAITING_FIELD_VERIFICATION'].includes(selectedCase.state) && <>
            <Button disabled={!mutable || busy} onClick={() => void act('notice', 'ISSUED', 'GUIDED_NOTICE')}>Issue notice</Button>
            <Button disabled={!mutable || busy} variant="outline" onClick={() => void act('verification', selectedId === 'BEN-DEMO-004' ? 'STALE_SOURCE_CONFIRMED' : selectedId === 'BEN-DEMO-001' ? 'DECEASED_MEMBER_CONFIRMED' : 'EVIDENCE_RECONCILED', 'FIELD_VERIFIED')}>Record verification</Button>
          </>}
          {['NOTICE_ISSUED', 'REVIEW_READY'].includes(selectedCase.state) && <>
            <Button disabled={!mutable || busy} onClick={() => void act('recommendation', 'INELIGIBLE', 'DEMO_POLICY_MATCH')}>Recommend ineligible</Button>
            <Button disabled={!mutable || busy} variant="outline" onClick={() => void act('recommendation', 'ELIGIBLE', 'EVIDENCE_CLEARED')}>Recommend eligible</Button>
          </>}
          {['RECOMMENDED_ELIGIBLE', 'RECOMMENDED_INELIGIBLE', 'REVIEW_READY'].includes(selectedCase.state) && <>
            {selectedId === 'BEN-DEMO-001'
              ? <Button disabled={!mutable || busy} onClick={() => void act('decision', 'MEMBER_REMOVED', 'DEATH_MEMBER_VERIFIED', 'HOUSEHOLD_SIZE_RECALCULATED')}>Authorize member removal</Button>
              : <Button disabled={!mutable || busy} onClick={() => void act('decision', 'AUTHORIZED', 'RCMS_AUTHORIZED', 'CARD_CANCELLED')}>Authorize cancellation</Button>}
            <Button disabled={!mutable || busy} variant="outline" onClick={() => void act('decision', 'NO_CHANGE', 'RCMS_CLEARED', 'NO_CHANGE')}>Keep active</Button>
          </>}
          {selectedCase.state === 'DECIDED' && <Button disabled={!mutable || busy} onClick={() => void act('appeals', 'ACCEPTED', 'CORRECTED_EVIDENCE')}>Accept appeal</Button>}
          {selectedCase.state === 'APPEALED' && <Button disabled={!mutable || busy} onClick={() => void act('reinstate', 'REINSTATED', 'APPEAL_UPHELD')}>Reinstate</Button>}
        </div>
      </CardContent></Card>}

      {gate && <Card><CardHeader><CardTitle>Entitlement gate result</CardTitle></CardHeader><CardContent>
        <p className={gate.allowed ? 'text-emerald-700' : 'text-destructive'}>{gate.allowed ? 'Distribution allowed' : 'Distribution blocked'} · {gate.reason}</p>
        <p className="text-sm">RCMS {gate.rcmsStatus} · {gate.availableBalanceKg} kg available after {gate.alreadyLiftedKg} kg already lifted.</p>
      </CardContent></Card>}
    </div>
  );
}
