'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import WalletConnect, { type WalletConnection } from '../wallet-connect';
import { QUEST_PILOT_TERMS, QUEST_QUIZ, type QuestCampaign, type QuestIdentity, type QuestProgress } from '../../lib/quest-pilot-shared';
import styles from './pilot.module.css';
type Directory = { enabled: boolean; campaigns: QuestCampaign[]; hasMore?: boolean; networks?: { id: string; name: string; chainHex: string }[] };
type Profile = { progress: QuestProgress[]; totalPoints: number; hasMore: boolean };
type Review = { campaignId: string; wallet: string; title: string; network: string; content: string; submittedAt: string; reviewEndsAt: string; reviewable: boolean };
type AdminData = { campaigns: QuestCampaign[]; hasMore: boolean; submissions: Review[]; moreSubmissions: boolean };
async function json<T>(url: string, method = 'GET', body?: Record<string, unknown>, csrf?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', signal, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-Quest-CSRF': csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The quest request could not be completed.');
  return data as T;
}
function sameIdentity(connection: WalletConnection | null, identity: QuestIdentity | null, directory: Directory | null) {
  const network = directory?.networks?.find(item => item.chainHex.toLowerCase() === connection?.chainId.toLowerCase());
  return !!connection && !!identity && connection.account.toLowerCase() === identity.wallet && network?.id === identity.network;
}
function utc(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value) return '';
  return `${value.length === 16 ? `${value}:00` : value}Z`;
}
export default function QuestPilotPanel({ adminMode = false }: { adminMode?: boolean }) {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [identity, setIdentity] = useState<QuestIdentity | null>(null);
  const [connection, setConnection] = useState<WalletConnection | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [administration, setAdministration] = useState<AdminData | null>(null);
  const [selected, setSelected] = useState('');
  const [answers, setAnswers] = useState<number[]>([-1, -1, -1]);
  const [accepted, setAccepted] = useState(false);
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const connectionRef = useRef<WalletConnection | null>(null);
  const identityRef = useRef<QuestIdentity | null>(null);
  const directoryRef = useRef<Directory | null>(null);
  const revision = useRef(0);
  const draftRequestId = useRef('');
  const signInAbort = useRef<AbortController | null>(null);
  const clearPrivate = useCallback(() => { identityRef.current = null; setIdentity(null); setProfile(null); setAdministration(null); setAccepted(false); setAnswers([-1, -1, -1]); setContent(''); }, []);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const version = revision.current;
    const [catalog, session] = await Promise.all([
      json<Directory>('/api/quests', 'GET', undefined, undefined, signal),
      json<{ authenticated: boolean; identity?: QuestIdentity | null }>('/api/quests/session', 'GET', undefined, undefined, signal),
    ]);
    if (version !== revision.current || signal?.aborted) return;
    directoryRef.current = catalog; setDirectory(catalog);
    const signed = session.authenticated ? session.identity ?? null : null;
    if (signed && connectionRef.current && !sameIdentity(connectionRef.current, signed, catalog)) { clearPrivate(); throw new Error('The connected wallet differs from the signed-in wallet. Sign in again.'); }
    identityRef.current = signed; setIdentity(signed);
    if (!signed) { setProfile(null); setAdministration(null); return; }
    const progress = await json<Profile>('/api/quests/profile', 'GET', undefined, undefined, signal);
    const admin = adminMode && signed.admin ? await json<AdminData>('/api/quests/admin', 'GET', undefined, undefined, signal) : null;
    if (version === revision.current && !signal?.aborted) { setProfile(progress); setAdministration(admin); }
  }, [adminMode, clearPrivate]);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Quests could not load.'); });
    return () => { controller.abort(); signInAbort.current?.abort(); };
  }, [refresh]);
  const changed = useCallback((next: WalletConnection | null) => {
    const previous = connectionRef.current, signed = identityRef.current;
    const changedAccount = previous && (!next || previous.account.toLowerCase() !== next.account.toLowerCase() || previous.chainId.toLowerCase() !== next.chainId.toLowerCase());
    const mismatch = signed && next && !sameIdentity(next, signed, directoryRef.current);
    connectionRef.current = next; setConnection(next);
    if (changedAccount || mismatch) {
      revision.current++; signInAbort.current?.abort(); clearPrivate();
      setMessage('Wallet or network changed. Sign in again before submitting.');
      if (signed) void json('/api/quests/session', 'DELETE', undefined, signed.csrf).catch(() => setError('The previous session could not be revoked. It expires within 15 minutes; reconnect and sign out to revoke it sooner.'));
    }
  }, [clearPrivate]);
  const signIn = async () => {
    const wallet = connectionRef.current;
    const network = directoryRef.current?.networks?.find(item => item.chainHex.toLowerCase() === wallet?.chainId.toLowerCase());
    if (!wallet || !network) { setError('Connect a wallet and select Arc or Robinhood Chain in the wallet control.'); return; }
    setBusy(true); setError(''); setMessage('');
    const version = revision.current, controller = new AbortController(); signInAbort.current = controller;
    try {
      const challenge = await json<{ nonce: string; message: string }>('/api/quests/session', 'POST', { action: 'challenge', wallet: wallet.account, network: network.id }, undefined, controller.signal);
      if (version !== revision.current) throw new Error('Wallet changed. Start sign-in again.');
      const signature = await wallet.signMessage(challenge.message);
      if (version !== revision.current) throw new Error('Wallet changed. Start sign-in again.');
      await json('/api/quests/session', 'POST', { action: 'verify', nonce: challenge.nonce, signature }, undefined, controller.signal);
      await refresh(controller.signal);
      if (version === revision.current) setMessage('Wallet ownership verified. No tokens were transferred or approved.');
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Sign-in failed.'); }
    finally { if (signInAbort.current === controller) signInAbort.current = null; setBusy(false); }
  };
  const signOut = async () => {
    const signed = identityRef.current;
    if (!signed) return;
    setBusy(true); setError('');
    try { await json('/api/quests/session', 'DELETE', undefined, signed.csrf); revision.current++; clearPrivate(); setMessage('Quest session signed out.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign-out failed.'); }
    finally { setBusy(false); }
  };
  const act = async (body: Record<string, unknown>, admin = false): Promise<Record<string, unknown>> => {
    const signed = identityRef.current;
    if (!sameIdentity(connectionRef.current, signed, directoryRef.current) || !signed || Date.parse(signed.expiresAt) <= Date.now()) { setError('Connect the same wallet and network, then sign in again.'); throw new Error('Sign-in required.'); }
    setBusy(true); setError(''); setMessage(''); const version = revision.current;
    try {
      const result = await json<Record<string, unknown>>(admin ? '/api/quests/admin' : '/api/quests/actions', 'POST', { ...body, expectedWallet: signed.wallet, expectedNetwork: signed.network }, signed.csrf);
      if (version !== revision.current) return result;
      setMessage(body.action === 'quiz' ? result.passed ? 'Quiz verified. Your points record is saved.' : `Not all answers were correct. ${result.attemptsRemaining} attempts remain; wait 30 seconds before retrying.` : 'Saved. The latest verified state is shown below.');
      await refresh(); return result;
    } catch (e) { if (version === revision.current) setError(e instanceof Error ? e.message : 'The request failed.'); throw e; }
    finally { setBusy(false); }
  };
  const canAct = sameIdentity(connection, identity, directory) && !busy;
  const current = directory?.campaigns.find(item => item.id === selected) ?? directory?.campaigns[0];
  const progress = profile?.progress.find(item => item.campaignId === current?.id);
  const taskState = (task: string) => progress?.tasks.find(item => item.task === task);
  const choose = (id: string) => { setSelected(id); setAccepted(false); setAnswers([-1, -1, -1]); setContent(''); setMessage(''); setError(''); };
  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    draftRequestId.current ||= crypto.randomUUID();
    void act({ action: 'create', requestId: draftRequestId.current, title: form.get('title'), summary: form.get('summary'), network: form.get('network'), startsAt: utc(form.get('startsAt')), endsAt: utc(form.get('endsAt')), reviewEndsAt: utc(form.get('reviewEndsAt')), participantCap: Number(form.get('participantCap')), rewardKind: 'points_only' }, true).then(() => { draftRequestId.current = ''; }).catch(() => {});
  };
  return <section className={styles.panel} aria-label={adminMode ? 'Quest administration' : 'Published quest campaigns'}>
    <header className={styles.heading}><div><small>VERIFIED PARTICIPATION · POINTS ONLY</small><h2>{adminMode ? 'Quest campaign manager' : 'Published campaigns & my progress'}</h2></div><button type='button' disabled={busy} onClick={() => { setError(''); void refresh().catch(e => setError(e.message)); }}>Refresh</button></header>
    <p className={styles.notice}>No MSS2 payments, token approvals, paid entry, or reward claims. Pilot points have no cash value and do not promise a future airdrop.</p>
    {error && <p className={styles.error} role='alert'>{error}</p>}
    {message && <p className={styles.message} role='status'>{message}</p>}
    {!directory ? <p role='status'>Loading campaign availability…</p> : !directory.enabled ? <div className={styles.empty}><h3>Participation is not enabled yet.</h3><p>The quest interface is available to review. Wallet sign-in and campaign submissions remain switched off until the operator enables this pilot.</p></div> : <>
      <div className={styles.identity}><WalletConnect theme='mss' onConnectionChange={changed}/><div>{identity ? <><strong>Verified: <span className={styles.address}>{identity.wallet}</span></strong><p>{identity.network === 'arc' ? 'Arc' : 'Robinhood Chain'} · Session expires {identity.expiresAt}</p><button disabled={busy} onClick={() => void signOut()}>Sign out of Quests</button></> : <><p>Connect your wallet, then sign a readable sign-in message. Connection alone does not verify ownership.</p><button disabled={busy || !connection} onClick={() => void signIn()}>{busy ? 'Working…' : 'Verify wallet & sign in'}</button></>}{identity && !sameIdentity(connection, identity, directory) && <p>Connect this wallet on the same network to submit or manage tasks.</p>}</div></div>
      {identity && <div className={styles.summary}><h3>My verified progress · {identity.network === 'arc' ? 'Arc' : 'Robinhood Chain'}</h3>{profile ? <><strong>{profile.totalPoints} participation points</strong>{profile.progress.length ? profile.progress.map(item => <p key={item.campaignId}><b>{item.title}</b> · {item.points} points · {item.tasks.filter(task => task.status === 'approved').length}/2 tasks approved</p>) : <p>No joined campaigns on this network yet.</p>}{profile.hasMore && <p>Showing the latest 100 memberships. The points total includes all memberships on this network.</p>}</> : <p>Private progress is not loaded. Refresh to retry.</p>}{identity.admin && !adminMode && <Link href='/admin/quests'>Open campaign manager →</Link>}</div>}
      {!adminMode && <>{!directory.campaigns.length ? <div className={styles.empty}><h3>No published campaigns yet.</h3><p>Preview concepts below are not open for participation and confer no points.</p></div> : <>
        <label className={styles.field}>Choose a published campaign<select value={current?.id ?? ''} onChange={e => choose(e.target.value)}>{directory.campaigns.map(item => <option key={item.id} value={item.id}>{item.title} · {item.network} · {item.status}</option>)}</select></label>
        {directory.hasMore && <p>Showing the latest 100 published campaigns.</p>}
        {current && <article className={styles.campaign}><div className={styles.tags}><span>{current.network === 'arc' ? 'ARC' : 'ROBINHOOD CHAIN'}</span><span>{current.canParticipate ? 'ACCEPTING PARTICIPATION' : 'NOT ACCEPTING PARTICIPATION'}</span><span>POINTS ONLY</span></div><h3>{current.title}</h3><p>{current.summary}</p><dl className={styles.dates}><div><dt>Starts (UTC)</dt><dd>{current.startsAt}</dd></div><div><dt>Submissions end (UTC)</dt><dd>{current.endsAt}</dd></div><div><dt>Reviews end (UTC)</dt><dd>{current.reviewEndsAt}</dd></div><div><dt>Wallet places used</dt><dd>{current.participants} / {current.participantCap}</dd></div></dl>
          <details open><summary>Campaign rules · version 1 · up to 150 points</summary><p>{QUEST_PILOT_TERMS}</p><p>Contribution: submit an original MSS2 explanation or a concrete improvement suggestion, 80–2,000 characters. A pending submission is not an approved task. Review deadlines do not guarantee approval.</p></details>
          {!progress ? <div className={styles.join}><label><input type='checkbox' checked={accepted} onChange={e => setAccepted(e.target.checked)}/> I accept these points-only campaign rules and the stated record retention.</label><button disabled={!canAct || !accepted || !current.canParticipate || current.participants >= current.participantCap} onClick={() => void act({ action: 'join', campaignId: current.id, acceptedTerms: 1 }).catch(() => {})}>Join this campaign</button></div> : <div className={styles.tasks}>
            <form onSubmit={e => { e.preventDefault(); void act({ action: 'quiz', campaignId: current.id, answers }).catch(() => {}); }}><h4>1. Understand the pilot · 50 points</h4><p>{taskState('quiz')?.status === 'approved' ? 'Approved — points recorded.' : `${progress.quizAttempts}/5 attempts used. All three answers must be correct.`}</p>{!taskState('quiz') && <>{QUEST_QUIZ.map((question, i) => <fieldset key={question.question}><legend>{question.question}</legend>{question.options.map((option, index) => <label key={option}><input type='radio' name={`q-${i}`} checked={answers[i] === index} onChange={() => setAnswers(previous => previous.map((value, n) => n === i ? index : value))}/>{option}</label>)}</fieldset>)}<button disabled={!canAct || !current.canParticipate || answers.some(n => n < 0) || progress.quizAttempts >= 5}>Check answers</button></>}</form>
            <form onSubmit={e => { e.preventDefault(); void act({ action: 'contribution', campaignId: current.id, content }).catch(() => {}); }}><h4>2. Make a useful contribution · 100 points if approved</h4>{taskState('contribution') ? <><p>Status: <strong>{taskState('contribution')?.status}</strong></p><p>{taskState('contribution')?.reason || 'Awaiting administrator review. Unreviewed submissions earn no points.'}</p></> : <><label className={styles.field}>Your original MSS2 explanation or improvement suggestion<textarea value={content} onChange={e => setContent(e.target.value)} minLength={80} maxLength={2000} required rows={6}/></label><p>{content.length}/2,000 characters. One submission only; do not include private information.</p><button disabled={!canAct || !current.canParticipate || content.trim().length < 80}>Submit for review</button></>}</form>
          </div>}
        </article>}
      </>}</>}
      {adminMode && (!identity?.admin ? <p>Sign in with the configured administrator wallet to manage campaigns. Other wallets cannot access campaign drafts or private submissions.</p> : !administration ? <p>Administration records are not loaded. Refresh to retry.</p> : <>
        <form className={styles.campaign} onSubmit={create}><h3>Create a points-only draft</h3><p>Drafts are private. Publishing locks the description, network, dates, cap, rules, and point values. No campaign fees or token rewards are enabled.</p><label className={styles.field}>Campaign title<input name='title' required minLength={3} maxLength={100}/></label><label className={styles.field}>Description<textarea name='summary' required minLength={20} maxLength={1200} rows={3}/></label><div className={styles.grid}><label className={styles.field}>Campaign network<select name='network'><option value='arc'>Arc</option><option value='robinhood'>Robinhood Chain</option></select></label><label className={styles.field}>Maximum participating wallets<input type='number' name='participantCap' min={1} max={1000} defaultValue={100} required/></label>{[['startsAt', 'Starts (UTC)'], ['endsAt', 'Submissions end (UTC)'], ['reviewEndsAt', 'Reviews end (UTC)']].map(([name, label]) => <label key={name} className={styles.field}>{label}<input type='datetime-local' name={name} required/></label>)}</div><button disabled={!canAct}>Save private draft</button></form>
        <h3>Campaigns</h3>{administration.campaigns.length === 0 && <p>No campaign drafts have been created.</p>}{administration.campaigns.map(item => <article className={styles.campaign} key={item.id}><h4>{item.title} · {item.network}</h4><p>{item.summary}</p><p>{item.status} · {item.participants}/{item.participantCap} wallets · Submissions end {item.endsAt} · Reviews end {item.reviewEndsAt}</p><details><summary>Review frozen pilot rules</summary><p>{QUEST_PILOT_TERMS}</p></details>{item.status === 'draft' && <button disabled={!canAct} onClick={() => { if (window.confirm('Publish this points-only campaign? Its terms, dates, network, and cap will be locked.')) void act({ action: 'publish', campaignId: item.id }, true).catch(() => {}); }}>Publish points-only campaign</button>}{item.status === 'open' && <button disabled={!canAct} onClick={() => { if (window.confirm('Close participation now? This campaign cannot be reopened. Existing submissions can still be reviewed before their review deadline.')) void act({ action: 'close', campaignId: item.id }, true).catch(() => {}); }}>Close participation</button>}</article>)}{administration.hasMore && <p>Showing the latest 100 campaigns.</p>}
        <h3>Contribution review queue</h3><p>Check relevance, accuracy, originality, and usefulness. Review decisions are final and recorded with the administrator wallet and reason.</p>{administration.submissions.length === 0 && <p>No pending submissions.</p>}{administration.submissions.map(item => <form className={styles.campaign} key={`${item.campaignId}:${item.wallet}`} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act({ action: 'review', campaignId: item.campaignId, wallet: item.wallet, decision: form.get('decision'), reason: form.get('reason') }, true).catch(() => {}); }}><h4>{item.title} · {item.network}</h4><p className={styles.address}>{item.wallet}</p><p>Submitted {item.submittedAt} · Review deadline {item.reviewEndsAt}</p><blockquote>{item.content}</blockquote>{!item.reviewable ? <p>Review deadline passed. No points awarded for this pending submission.</p> : <><label className={styles.field}>Final decision<select name='decision' defaultValue='' required><option value='' disabled>Choose a decision</option><option value='approved'>Approve — award 100 points</option><option value='rejected'>Reject — award no points</option></select></label><label className={styles.field}>Reason visible to the participant<textarea name='reason' required minLength={5} maxLength={500} rows={2}/></label><button disabled={!canAct || item.wallet === identity.wallet}>Save final review</button>{item.wallet === identity.wallet && <p>You cannot review your own contribution.</p>}</>}</form>)}{administration.moreSubmissions && <p>Showing the first 100 pending submissions, with reviewable submissions first. Refresh after decisions to load more.</p>}
      </>)}
    </>}
  </section>;
}
