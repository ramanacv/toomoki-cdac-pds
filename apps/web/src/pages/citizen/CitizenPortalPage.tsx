import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '@/components/Panel';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/constants.js';
import {
  citizenLogout,
  clearCitizenSession,
  fetchCitizenAuthHistory,
  fetchCitizenDistributions,
  fetchCitizenProfile,
  getCitizenSession,
  requestCitizenOtp,
  surrenderCitizenCard,
  verifyCitizenOtp,
  type CitizenAuthEvent,
  type CitizenDistribution,
  type CitizenOtpChallenge,
  type CitizenProfile
} from '@/citizen-api.js';

type Step = 'aadhaar' | 'otp' | 'dashboard';

export function CitizenPortalPage() {
  const [step, setStep] = useState<Step>('aadhaar');
  const [aadhaarInput, setAadhaarInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [challenge, setChallenge] = useState<CitizenOtpChallenge | null>(null);
  const [profile, setProfile] = useState<CitizenProfile | null>(null);
  const [distributions, setDistributions] = useState<CitizenDistribution[]>([]);
  const [authHistory, setAuthHistory] = useState<CitizenAuthEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [surrenderConfirm, setSurrenderConfirm] = useState('');

  const loadDashboard = useCallback(async () => {
    const [me, myDistributions, myAuthHistory] = await Promise.all([
      fetchCitizenProfile(),
      fetchCitizenDistributions(),
      fetchCitizenAuthHistory()
    ]);
    setProfile(me);
    setDistributions(myDistributions);
    setAuthHistory(myAuthHistory);
    setStep('dashboard');
  }, []);

  useEffect(() => {
    if (!getCitizenSession()) return;
    loadDashboard().catch(() => {
      clearCitizenSession();
      setStep('aadhaar');
    });
  }, [loadDashboard]);

  const submitAadhaar = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await requestCitizenOtp(aadhaarInput.replace(/\s+/g, ''));
      setChallenge(result);
      setOtpInput('');
      setStep('otp');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'OTP request failed');
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async () => {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      await verifyCitizenOtp(challenge.challengeId, otpInput.trim());
      await loadDashboard();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'OTP verification failed');
    } finally {
      setBusy(false);
    }
  };

  const surrenderCard = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await surrenderCitizenCard();
      setProfile(result.profile);
      setSurrenderConfirm('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Card surrender failed');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await citizenLogout();
    setProfile(null);
    setDistributions([]);
    setAuthHistory([]);
    setChallenge(null);
    setAadhaarInput('');
    setOtpInput('');
    setError(null);
    setStep('aadhaar');
  };

  return (
    <main id="main" className="mx-auto min-h-screen w-full max-w-[880px] px-4 py-10">
      <section className="mb-6 px-1 py-2">
        <p className="eyebrow"><span className="brand-name">ViksitPDS</span> · beneficiary self-service</p>
        <h1 className="text-3xl font-semibold tracking-tight">My ration card &amp; entitlement</h1>
        <p className="mt-2 max-w-3xl leading-relaxed text-muted-foreground">
          Simulates the citizen login journey of the J&amp;K and Maharashtra RCMS portals: Aadhaar number plus an OTP
          sent to the head-of-family mobile. In a state deployment this journey belongs to SMART-PDS/RCMS; ViksitPDS
          only adds the trust view of issue history and proof status.
        </p>
        <p className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Simulation only. Accepts <strong>synthetic demo Aadhaar numbers</strong> (starting 9999) with a displayed
          demo OTP. Never enter a real Aadhaar number. ViksitPDS is not a UIDAI authentication provider.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          <Link className="underline" to="/role-login">
            ← Back to operational demo modules
          </Link>
        </p>
      </section>

      {error ? (
        <p role="alert" className="mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-950">
          {error}
        </p>
      ) : null}

      {step === 'aadhaar' ? (
        <Panel eyebrow="Step 1" title="Sign in with demo Aadhaar" pill="RCMS public-login simulation" className="p-6">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitAadhaar();
            }}
          >
            <label className="grid gap-2 text-sm font-medium" htmlFor="citizen-aadhaar">
              Demo Aadhaar number (head of family)
              <input
                id="citizen-aadhaar"
                className="rounded-xl border border-border bg-card px-3 py-2 font-mono text-base"
                inputMode="numeric"
                autoComplete="off"
                placeholder="9999 8888 0001"
                value={aadhaarInput}
                onChange={(event) => setAadhaarInput(event.target.value)}
              />
            </label>
            <p className="text-sm text-muted-foreground">
              Demo households: <code className="rounded bg-muted px-1">999988880001</code> (Asha Patil, FPS-101),{' '}
              <code className="rounded bg-muted px-1">999988880002</code> (Ravi Shinde, FPS-101). All records are
              fictional fixtures.
            </p>
            <div>
              <Button type="submit" disabled={busy || aadhaarInput.trim().length === 0}>
                {busy ? 'Requesting OTP…' : 'Get OTP'}
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {step === 'otp' && challenge ? (
        <Panel eyebrow="Step 2" title="Verify OTP" pill="Simulated SMS" className="p-6">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitOtp();
            }}
          >
            <p className="text-sm text-muted-foreground">
              OTP sent to registered mobile <strong>{challenge.maskedMobile}</strong>. This is a simulation: use demo
              OTP <code className="rounded bg-muted px-1">{challenge.demoOtpHint}</code>.
            </p>
            <label className="grid gap-2 text-sm font-medium" htmlFor="citizen-otp">
              One-time password
              <input
                id="citizen-otp"
                className="w-40 rounded-xl border border-border bg-card px-3 py-2 font-mono text-base"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpInput}
                onChange={(event) => setOtpInput(event.target.value)}
              />
            </label>
            <div className="flex gap-3">
              <Button type="submit" disabled={busy || otpInput.trim().length === 0}>
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setStep('aadhaar')}>
                Back
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {step === 'dashboard' && profile ? (
        <div className="grid gap-6">
          {profile.removal ? (
            <p role="status" className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-950">
              {profile.removal.reasonCode === 'VOLUNTARY_SURRENDER'
                ? 'This demo ration card has been surrendered and removed from the active beneficiary list.'
                : 'This demo ration card has been removed from the active beneficiary list by the department.'}{' '}
              No further ration can be issued against it. Recorded on {formatDateTime(profile.removal.removedAt)}.
            </p>
          ) : null}
          <Panel
            eyebrow="My ration card"
            title={profile.fictionalName}
            pill={profile.maskedCardRef}
            className="p-6"
          >
            <div className="grid gap-1 text-sm">
              <p>
                Aadhaar <code className="rounded bg-muted px-1">{profile.maskedAadhaar}</code> · Mobile{' '}
                <code className="rounded bg-muted px-1">{profile.maskedMobile}</code>
              </p>
              <p>
                Fair Price Shop <strong>{profile.fpsId}</strong> · Block {profile.blockName} · Tehsil{' '}
                {profile.tehsilName}
              </p>
              <p>Household members: {profile.householdSize}</p>
            </div>
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 pr-3 font-medium">Relation</th>
                  <th className="py-2 pr-3 font-medium">Age</th>
                  <th className="py-2 font-medium">Aadhaar (masked)</th>
                </tr>
              </thead>
              <tbody>
                {profile.familyMembers.map((member) => (
                  <tr key={`${member.fictionalName}-${member.relation}`} className="border-b border-border/60">
                    <td className="py-2 pr-3">{member.fictionalName}</td>
                    <td className="py-2 pr-3">{member.relation}</td>
                    <td className="py-2 pr-3">{member.ageYears}</td>
                    <td className="py-2 font-mono text-xs">{member.maskedAadhaar ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel
            eyebrow="My entitlement"
            title="Monthly rice entitlement"
            pill={profile.eligibility.status}
            className="p-6"
          >
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <p>
                Monthly entitlement
                <br />
                <strong className="text-lg">{profile.eligibility.monthlyRiceEntitlementKg} kg</strong>
              </p>
              <p>
                Already lifted
                <br />
                <strong className="text-lg">{profile.eligibility.alreadyLiftedKg} kg</strong>
              </p>
              <p>
                Available balance
                <br />
                <strong className="text-lg">{profile.eligibility.availableBalanceKg} kg</strong>
              </p>
            </div>
          </Panel>

          <Panel
            eyebrow="My ration history"
            title="Distributions recorded for my card"
            pill="With Fabric proof status"
            className="p-6"
          >
            {distributions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No distributions recorded yet for this card in the current demo cycle. Once the FPS issues ration
                against this card, it appears here with its ledger proof status.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Shop</th>
                    <th className="py-2 pr-3 font-medium">Commodity</th>
                    <th className="py-2 pr-3 font-medium">Qty</th>
                    <th className="py-2 pr-3 font-medium">Auth</th>
                    <th className="py-2 font-medium">Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions.map((item) => (
                    <tr key={item.distributionId} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3">{formatDateTime(item.timestamp)}</td>
                      <td className="py-2 pr-3">{item.fpsId}</td>
                      <td className="py-2 pr-3">{item.commodity}</td>
                      <td className="py-2 pr-3">{item.deliveredKg} kg</td>
                      <td className="py-2 pr-3 text-xs">
                        {item.authMode} · {item.authResult}
                      </td>
                      <td className="py-2 text-xs">
                        {item.proofStatus ?? 'n/a'}
                        {item.fabricTxId ? (
                          <span className="block break-all font-mono text-[10px] text-muted-foreground">
                            {item.fabricTxId}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel eyebrow="My authentications" title="ePoS authentication events" pill="Simulated AePDS" className="p-6">
            {authHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No authentication events recorded for this card yet.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {authHistory.map((item) => (
                  <li key={item.authTxnId} className="rounded-xl border border-border/60 px-3 py-2">
                    <span className="font-medium">{item.authMode}</span> · {item.authResult} ·{' '}
                    {formatDateTime(item.timestamp)}
                    {item.fpsId ? <span className="text-muted-foreground"> · {item.fpsId}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {!profile.removal ? (
            <Panel
              eyebrow="Card surrender"
              title="Surrender my ration card"
              pill="Voluntary removal"
              className="p-6"
            >
              <p className="text-sm text-muted-foreground">
                If your household no longer needs this ration card (for example after migration or income change), you
                can voluntarily surrender it. The card is cancelled, removed from the active beneficiary list, and no
                further ration can be issued against it. This simulates the RCMS surrender journey and cannot be
                undone in the demo.
              </p>
              <form
                className="mt-4 flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void surrenderCard();
                }}
              >
                <label className="grid gap-2 text-sm font-medium" htmlFor="citizen-surrender-confirm">
                  Type SURRENDER to confirm
                  <input
                    id="citizen-surrender-confirm"
                    className="w-44 rounded-xl border border-border bg-card px-3 py-2 font-mono text-base"
                    autoComplete="off"
                    value={surrenderConfirm}
                    onChange={(event) => setSurrenderConfirm(event.target.value)}
                  />
                </label>
                <Button type="submit" variant="destructive" disabled={busy || surrenderConfirm.trim() !== 'SURRENDER'}>
                  {busy ? 'Surrendering…' : 'Surrender card'}
                </Button>
              </form>
            </Panel>
          ) : null}

          <div>
            <Button type="button" variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
