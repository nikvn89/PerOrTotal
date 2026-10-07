import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calldataBytes, CALLDATA_LIMIT } from "./lib/calldata";
import { CONTRACT_ADDRESS, EXPLORER_BASE, SOURCE_SHA256 } from "./lib/config";
import { errorMessage } from "./lib/errors";
import { connectedWallet, getCap, getClaims, getLimits, requestWallet, sendWrite, waitForVerdict } from "./lib/genlayer";
import { capIdOf, fmt, idsFromInput, short, textHashOf } from "./lib/ids";
import type { Limits } from "./lib/parse";
import { pyLen, pyNormalize, pyStrip } from "./lib/pytext";
import {
  acceptBlock, claimBlock, confirmBlock, declineBlock, MAX_LABEL_LENGTH, MAX_NOTE_LENGTH, openBlock, parseWhole, previewPayable,
  rejectBlock, REVERTS, UI, walletOrEmpty,
} from "./lib/rules";
import type { Cap, Claim, TxStatus } from "./lib/types";
import { acceptVerified, claimVerified, confirmVerified, declineVerified, openVerified, rejectVerified } from "./lib/verify";

type Verify = () => Promise<string | null>;
type View = "overview" | "cap" | "open" | "verify";

const IDLE: TxStatus = { phase: "idle", message: "" };
const NAV: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "cap", label: "Caps" },
  { id: "open", label: "Propose a cap" },
  { id: "verify", label: "Verification" },
];
const STORE_KEY = "perortotal.caps";

function readCaps(): string[] {
  try {
    return idsFromInput(window.localStorage.getItem(STORE_KEY) ?? "");
  } catch {
    return [];
  }
}

function saveCaps(ids: string[]) {
  try {
    window.localStorage.setItem(STORE_KEY, ids.join(","));
  } catch {
    /* storage unavailable: the URL still carries the open cap */
  }
}

function capFromUrl(): string {
  return idsFromInput(new URLSearchParams(window.location.search).get("c") ?? "")[0] ?? "";
}

function setCapInUrl(id: string) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("c", id);
  else url.searchParams.delete("c");
  window.history.replaceState(null, "", url.toString());
}

const same = (a: string, b: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const STATE_LINE: Record<string, string> = {
  PROPOSED: "Waiting for the claimant to accept the text and its reading",
  ACTIVE: "Accepted by both — claims can be recorded",
  DECLINED: "Declined by the claimant — closed",
};

export default function App() {
  const urlCap = capFromUrl();
  const [view, setView] = useState<View>(urlCap ? "cap" : "overview");
  const [me, setMe] = useState("");
  const [capId, setCapId] = useState(urlCap);
  const [known, setKnown] = useState<string[]>(() => {
    const list = readCaps();
    return urlCap && !list.includes(urlCap) ? [urlCap, ...list] : list;
  });
  const [cap, setCap] = useState<Cap | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "missing" | "error">("idle");
  const [limits, setLimits] = useState<Limits | null>(null);

  const [openInput, setOpenInput] = useState("");
  const [claimant, setClaimant] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [text, setText] = useState("");
  const [taken, setTaken] = useState(false);

  const [read, setRead] = useState(false);
  const [claimAmount, setClaimAmount] = useState("");
  const [claimNote, setClaimNote] = useState("");
  const [rejectNotes, setRejectNotes] = useState<Record<number, string>>({});

  const [status, setStatus] = useState<TxStatus>(IDLE);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<number | null>(null);
  const recheck = useRef<Verify | null>(null);

  // ---------- reads ----------
  const loadCap = useCallback(async (id: string) => {
    if (!id) {
      setCap(null);
      setClaims([]);
      setLoadState("idle");
      return;
    }
    setLoadState("loading");
    try {
      const [c, ks] = await Promise.all([getCap(id), getClaims(id)]);
      if (!c) {
        setCap(null);
        setClaims([]);
        setLoadState("missing");
        return;
      }
      setCap(c);
      setClaims(ks ?? []);
      setLabels((l) => ({ ...l, [id]: `${c.scope} · ${fmt(c.cap_amount)}` }));
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    connectedWallet().then(setMe).catch(() => setMe(""));
    window.ethereum?.on?.("accountsChanged", (accounts: string[]) => {
      setMe((accounts?.[0] ?? "").toLowerCase());
      recheck.current = null;
      setStatus(IDLE);
      setFresh(null);
      setRead(false);
    });
    getLimits().then(setLimits).catch(() => setLimits(null));
  }, []);

  useEffect(() => {
    setCapInUrl(capId);
    setRead(false);
    void loadCap(capId);
  }, [capId, loadCap]);

  useEffect(() => saveCaps(known), [known]);

  useEffect(() => {
    known.filter((id) => !labels[id]).forEach((id) => {
      getCap(id).then((c) => c && setLabels((l) => ({ ...l, [id]: `${c.scope} · ${fmt(c.cap_amount)}` }))).catch(() => undefined);
    });
  }, [known, labels]);

  // ---------- derived ----------
  const newId = me && pyLen(pyStrip(text)) > 0 ? capIdOf(me, text) : "";
  useEffect(() => {
    let live = true;
    setTaken(false);
    if (!newId) return;
    const t = setTimeout(() => { getCap(newId).then((c) => live && setTaken(!!c)).catch(() => undefined); }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [newId]);
  const amountWhole = parseWhole(amount);
  const openBytes = useMemo(() => calldataBytes("open_cap", [claimant, label, amountWhole ?? 0n, text]), [claimant, label, amountWhole, text]);
  const openReason = openBlock({ me, claimant, label, amount, text, exists: taken, bytes: openBytes });

  const claimWhole = parseWhole(claimAmount);
  const claimBytes = useMemo(() => calldataBytes("record_claim", [capId || "0".repeat(64), claimWhole ?? 0n, claimNote]), [capId, claimWhole, claimNote]);
  const isAuthor = !!cap && same(cap.author, me);
  const isClaimant = !!cap && same(cap.claimant_wallet, me);

  // ---------- writes ----------
  async function connect() {
    try {
      setMe(await requestWallet());
    } catch (e) {
      setStatus({ phase: "error", message: errorMessage(e) });
    }
  }

  async function runWrite(action: string, method: string, args: unknown[], verify: Verify) {
    setBusy(true);
    recheck.current = null;
    try {
      setStatus({ phase: "signing", message: "Confirm the transaction in your wallet…", action });
      const hash = await sendWrite(me, method, args, 0n);
      setStatus({ phase: "submitted", message: "Submitted. Waiting for validators to accept it…", hash, action });
      const verdict = await waitForVerdict(hash);
      if (verdict.kind === "error") {
        setStatus({ phase: "error", message: verdict.reason, hash, action });
        return;
      }
      if (verdict.kind === "pending") {
        recheck.current = verify;
        setStatus({ phase: "delayed", message: "Submitted — confirmation delayed. Check again re-reads the accepted state; do not send it twice.", hash, action });
        return;
      }
      setStatus({ phase: "checking", message: "Executed. Reading the accepted state…", hash, action });
      const done = await verify();
      if (done) {
        setStatus({ phase: "success", message: done, hash, action });
      } else {
        recheck.current = verify;
        setStatus({ phase: "delayed", message: "Executed, but the accepted state does not show the change yet. Check again in a moment.", hash, action });
      }
    } catch (e) {
      setStatus({ phase: "error", message: errorMessage(e), action });
    } finally {
      setBusy(false);
    }
  }

  async function checkAgain() {
    const verify = recheck.current;
    if (!verify) return;
    setBusy(true);
    try {
      const done = await verify();
      if (done) {
        recheck.current = null;
        setStatus((s) => ({ ...s, phase: "success", message: done }));
      } else {
        setStatus((s) => ({ ...s, message: "The accepted state does not show the change yet. Try again shortly." }));
      }
    } catch (e) {
      setStatus((s) => ({ ...s, message: errorMessage(e) }));
    } finally {
      setBusy(false);
    }
  }

  function openCapView(id: string) {
    setKnown((k) => [id, ...k.filter((x) => x !== id)]);
    setCapId(id);
    setView("cap");
  }

  function onOpenInput() {
    const id = idsFromInput(openInput)[0];
    if (!id) {
      setStatus({ phase: "error", message: "Paste a 64-character cap id or a PerOrTotal link.", action: "Caps" });
      return;
    }
    setOpenInput("");
    openCapView(id);
  }

  async function onPropose() {
    if (openReason || amountWhole === null) return;
    const s = { id: capIdOf(me, text), me, claimant: walletOrEmpty(claimant), label, amount: amountWhole.toString(), text };
    if (await getCap(s.id)) {
      setTaken(true);
      return;
    }
    await runWrite("Propose", "open_cap", [s.claimant, pyNormalize(label), amountWhole, pyStrip(text)], async () => {
      const c = await getCap(s.id);
      if (!openVerified(c, s)) return null;
      setText("");
      setAmount("");
      openCapView(s.id);
      await loadCap(s.id);
      return `Validators read the text as ${c!.outcome} — ${c!.scope === "POOL" ? "one shared pool that claims draw down" : "a fresh limit for every claim"}. Nothing is active until ${short(c!.claimant_wallet)} accepts this exact text and reading. Share the cap link.`;
    });
  }

  async function onAccept() {
    if (!cap) return;
    const c0 = await getCap(cap.cap_id);
    if (!c0 || acceptBlock(c0, me, read)) return;
    await runWrite("Accept", "accept_cap", [c0.cap_id, textHashOf(c0.text)], async () => {
      const c = await getCap(c0.cap_id);
      if (!acceptVerified(c, c0)) return null;
      await loadCap(c0.cap_id);
      return `Accepted. You signed the text by its hash (${short(c0.text_hash, 8, 6)}) together with its ${c0.scope} reading; you can now record claims.`;
    });
  }

  async function onDecline() {
    if (!cap) return;
    const c0 = await getCap(cap.cap_id);
    if (!c0 || declineBlock(c0, me)) return;
    await runWrite("Decline", "decline_cap", [c0.cap_id], async () => {
      const c = await getCap(c0.cap_id);
      if (!declineVerified(c)) return null;
      await loadCap(c0.cap_id);
      return "Declined. The cap is closed and no claim can be recorded against it.";
    });
  }

  async function onClaim() {
    if (!cap || claimWhole === null) return;
    const c0 = await getCap(cap.cap_id);
    if (!c0 || claimBlock(c0, me, claimAmount, claimNote, claimBytes)) return;
    const note = claimNote;
    await runWrite("Record claim", "record_claim", [c0.cap_id, claimWhole, pyStrip(note)], async () => {
      const [c, ks] = await Promise.all([getCap(c0.cap_id), getClaims(c0.cap_id)]);
      const k = ks?.find((x) => x.index === (c?.claim_count ?? -1));
      if (!claimVerified(c0, c, k, claimWhole.toString(), note)) return null;
      setClaimAmount("");
      setClaimNote("");
      setFresh(k!.index);
      await loadCap(c0.cap_id);
      return `Claim #${k!.index} recorded for ${fmt(k!.amount)}. It draws nothing until the author confirms it; if confirmed now it would pay ${fmt(k!.payable_if_confirmed_now)}.`;
    });
  }

  async function onConfirm(k0: Claim) {
    if (!cap) return;
    const [c0, ks0] = await Promise.all([getCap(cap.cap_id), getClaims(cap.cap_id)]);
    const before = ks0?.find((x) => x.index === k0.index);
    if (!c0 || !before || confirmBlock(c0, before, me)) return;
    await runWrite("Confirm", "confirm_claim", [c0.cap_id, before.index], async () => {
      const [c, ks] = await Promise.all([getCap(c0.cap_id), getClaims(c0.cap_id)]);
      const k = ks?.find((x) => x.index === before.index);
      if (!confirmVerified(c0, before, c, k)) return null;
      setFresh(before.index);
      await loadCap(c0.cap_id);
      return `Claim #${before.index} confirmed: payable ${fmt(k!.payable)} of ${fmt(k!.amount)} asked. ${c!.scope === "POOL" ? `${fmt(c!.remaining)} remains in the pool.` : "The next claim starts again from the full ceiling."}`;
    });
  }

  async function onReject(k0: Claim) {
    if (!cap) return;
    const note = rejectNotes[k0.index] ?? "";
    const [c0, ks0] = await Promise.all([getCap(cap.cap_id), getClaims(cap.cap_id)]);
    const before = ks0?.find((x) => x.index === k0.index);
    if (!c0 || !before || rejectBlock(c0, before, me, note)) return;
    await runWrite("Reject", "reject_claim", [c0.cap_id, before.index, pyStrip(note)], async () => {
      const [c, ks] = await Promise.all([getCap(c0.cap_id), getClaims(c0.cap_id)]);
      const k = ks?.find((x) => x.index === before.index);
      if (!rejectVerified(c0, c, k, note)) return null;
      setRejectNotes((r) => ({ ...r, [before.index]: "" }));
      setFresh(before.index);
      await loadCap(c0.cap_id);
      return `Claim #${before.index} rejected with your note. It draws nothing from the ceiling.`;
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus({ phase: "success", message: "Cap link copied. The claimant opens it with their own wallet to accept or decline.", action: "Share" });
    } catch {
      setStatus({ phase: "error", message: "Could not copy; copy the address bar instead.", action: "Share" });
    }
  }

  // ---------- one claim (a render function, not a component: note boxes keep focus) ----------
  function renderClaim(k: Claim) {
    if (!cap) return null;
    const cReason = confirmBlock(cap, k, me);
    const note = rejectNotes[k.index] ?? "";
    const rReason = rejectBlock(cap, k, me, note);
    const tone = k.state === "CONFIRMED" ? "v-right" : k.state === "REJECTED" ? "v-other" : "v-one";
    return (
      <article key={k.index} className={`flash claim st-${k.state.toLowerCase()} ${fresh === k.index ? "fresh" : ""}`}>
        <header className="flash-top">
          <span className="due-pill">Claim #{k.index}</span>
          <span className={`verdict ${tone}`}>{k.state}</span>
        </header>
        <p className="purpose">{k.note}</p>
        <dl className="stats">
          <div><dt>Asked</dt><dd>{fmt(k.amount)}</dd></div>
          <div><dt>{k.state === "PENDING" ? "Payable if confirmed now" : "Payable"}</dt><dd>{fmt(k.state === "PENDING" ? k.payable_if_confirmed_now : k.payable)}</dd></div>
          <div><dt>Decided by</dt><dd>{k.state === "PENDING" ? "author, pending" : "author"}</dd></div>
        </dl>
        {k.reject_note && <p className="fine">Rejection note: “{k.reject_note}”</p>}
        {k.state === "PENDING" && isAuthor && (
          <div className="practise">
            <span className="action">
              <button className="btn btn-primary" onClick={() => onConfirm(k)} disabled={busy || !!cReason}>Confirm</button>
              {cReason && <span className="reason">{cReason}</span>}
            </span>
            <div className="row">
              <input aria-label={`Rejection note for claim ${k.index}`} placeholder="Reason to reject" value={note}
                onChange={(e) => setRejectNotes((r) => ({ ...r, [k.index]: e.target.value }))} />
              <button className="btn btn-ghost" onClick={() => onReject(k)} disabled={busy || !!rReason}>Reject</button>
            </div>
            {note && rReason && <span className="reason">{rReason}</span>}
          </div>
        )}
        {k.state === "PENDING" && !isAuthor && <p className="fine">{me ? REVERTS.onlyAuthor : UI.noWallet}</p>}
      </article>
    );
  }

  const acceptReason = cap ? acceptBlock(cap, me, read) : UI.noWallet;
  const claimReason = cap ? claimBlock(cap, me, claimAmount, claimNote, claimBytes) : UI.noWallet;
  const claimPreview = cap && claimWhole !== null && claimWhole > 0n ? previewPayable(cap, claimWhole) : null;

  // ---------- view ----------
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="badge"><img src="/logo-192.png" alt="" width={34} height={34} /></span>
          <div>
            <div className="brand-name">PerOrTotal</div>
            <div className="brand-sub">TWO-PARTY CEILING LEDGER</div>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {NAV.map((n) => (
            <button key={n.id} className={`tab ${view === n.id ? "active" : ""}`} onClick={() => setView(n.id)}>{n.label}</button>
          ))}
        </nav>
        {me ? <div className="wallet mono" title={me}>◆ {short(me)}</div> : <button className="btn btn-ghost" onClick={connect}>◆ Connect wallet</button>}
      </header>

      <div className={`runtime runtime-${status.phase}`} aria-live="polite">
        <span className="dot" aria-hidden="true" />
        <span className="runtime-tag">{status.phase === "idle" ? "STUDIONET" : (status.action ?? "STATUS").toUpperCase()}</span>
        <span className="runtime-msg">
          {status.phase === "idle" ? <>Contract <a className="mono" href={`${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">{short(CONTRACT_ADDRESS, 6, 4)}</a> on GenLayer StudioNet · chain 61999</> : status.message}
        </span>
        {status.hash && <a className="mono runtime-link" href={`${EXPLORER_BASE}/tx/${status.hash}`} target="_blank" rel="noreferrer">tx {short(status.hash, 10, 8)}</a>}
        {status.phase === "delayed" && recheck.current && <button className="btn btn-ghost small" onClick={checkAgain} disabled={busy}>Check again</button>}
      </div>

      <main className="main">
        {view === "overview" && (
          <>
            <section className="hero">
              <div className="hero-left">
                <p className="eyebrow">TWO-PARTY LEDGER · AI-READ · GENLAYER</p>
                <h1>One pool, or a fresh limit every time?</h1>
                <p className="lede">
                  An author proposes a ceiling and the words that set it. GenLayer validators read the words once: one pool that
                  claims draw down, or a fresh limit for every claim. Nothing counts until the claimant accepts that exact text
                  and reading, and no claim is payable until the author confirms it.
                </p>
                <div className="cta">
                  <button className="btn btn-primary big" onClick={() => setView("open")}>Propose a cap →</button>
                  <button className="btn btn-ghost big" onClick={() => setView("cap")}>Open a cap</button>
                </div>
              </div>
              <div className="hero-right">
                {[
                  ["01", "Author proposes", "Ceiling, claimant wallet and the agreement text. Validators freeze the reading: AGGREGATE → POOL, PER_EVENT → FRESH."],
                  ["02", "Claimant accepts", "The claimant signs the hash of the exact text they read, with its reading — or declines. Until then nothing is active."],
                  ["03", "Author confirms each claim", "The claimant records what happened; it is payable only once the author confirms it, or rejected with a note and draws nothing."],
                ].map(([n, t, d], i) => (
                  <div className={`step ${i === 0 ? "lit" : ""}`} key={n}>
                    <span className="step-n mono">{n}</span>
                    <div><p className="step-t">{t}</p><p className="step-d">{d}</p></div>
                  </div>
                ))}
              </div>
            </section>
            <section className="features">
              <div className="feature">
                <span className="f-icon" aria-hidden="true">◇</span>
                <h2>Same claims, different totals</h2>
                <p>With a ceiling of 10,000 and two confirmed claims of 6,000: a POOL pays 6,000 + 4,000, a FRESH limit pays 6,000 + 6,000.</p>
              </div>
              <div className="feature">
                <span className="f-icon" aria-hidden="true">✦</span>
                <h2>No fact from one side alone</h2>
                <p>The text is the author's, but it binds only once the claimant signs its hash. A claim is the claimant's, but it pays only once the author confirms it.</p>
              </div>
              <div className="feature">
                <span className="f-icon" aria-hidden="true">↗</span>
                <h2>A ledger, not a wallet</h2>
                <p>No funds are held or moved; payable amounts are ledger numbers. Unclear readings count as PER_EVENT, so a pool is never drawn down on a guess.</p>
              </div>
            </section>
          </>
        )}

        {view === "cap" && (
          <>
            <section className="panel head">
              <div>
                <p className="eyebrow">CAP</p>
                <h1>{cap ? `${cap.scope === "POOL" ? "One pool" : "Fresh per claim"} · ${fmt(cap.cap_amount)}` : "Open a cap"}</h1>
                <p className="muted">{cap ? STATE_LINE[cap.state] ?? cap.state : "Paste a cap id or link, or pick one you used here."}</p>
              </div>
              <div className="row">
                <input className="mono" aria-label="Cap id" placeholder="Cap id or link" value={openInput} onChange={(e) => setOpenInput(e.target.value)} spellCheck={false} />
                <button className="btn btn-ghost" onClick={onOpenInput}>Open</button>
                <button className="btn btn-ghost" onClick={copyLink} disabled={!cap}>Copy cap link</button>
              </div>
            </section>

            {known.length > 0 && (
              <div className="chips-row">
                {known.map((id) => (
                  <button key={id} className={`chip-btn ${id === capId ? "on" : ""}`} onClick={() => openCapView(id)}>{labels[id] ?? short(id, 8, 6)}</button>
                ))}
              </div>
            )}

            {loadState === "loading" && <section className="panel empty"><p className="muted mono">Reading the cap…</p></section>}
            {loadState === "missing" && <section className="panel empty"><p className="reason">{REVERTS.unknown}</p></section>}
            {loadState === "error" && <section className="panel empty"><p className="reason">Could not read this cap. Try again.</p></section>}

            {cap && (
              <section className="ledger-grid">
                <div className="panel agreement">
                  <header className="flash-top">
                    <span className={`due-pill ${cap.state === "ACTIVE" ? "now" : ""}`}>{cap.state}</span>
                    <span className={`verdict ${cap.scope === "POOL" ? "v-rec" : "v-one"}`}>{cap.outcome} · {cap.scope}</span>
                  </header>
                  <p className="sense-label">Agreement text (proposed by the author)</p>
                  <blockquote className="agreement-text">{cap.text}</blockquote>
                  <p className="fine mono">Text hash {cap.text_hash}</p>
                  <dl className="facts two-col">
                    <div><dt>Author</dt><dd className="mono">{short(cap.author, 8, 6)}{isAuthor ? " · you" : ""}</dd></div>
                    <div><dt>Claimant ({cap.claimant_label})</dt><dd className="mono">{short(cap.claimant_wallet, 8, 6)}{isClaimant ? " · you" : ""}</dd></div>
                  </dl>
                  {cap.state === "PROPOSED" && isClaimant && (
                    <div className="practise">
                      <label className="check">
                        <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
                        <span>I have read this text and accept its reading as <b>{cap.scope === "POOL" ? "one shared pool" : "a fresh limit for every claim"}</b>.</span>
                      </label>
                      <span className="action">
                        <button className="btn btn-ghost" onClick={onDecline} disabled={busy || !!declineBlock(cap, me)}>Decline</button>
                        <button className="btn btn-primary" onClick={onAccept} disabled={busy || !!acceptReason}>Accept text and reading</button>
                      </span>
                      {acceptReason && acceptReason !== UI.notRead && <span className="reason">{acceptReason}</span>}
                    </div>
                  )}
                  {cap.state === "PROPOSED" && !isClaimant && <p className="reason">{me ? REVERTS.onlyClaimantAccept : UI.noWallet}</p>}
                </div>
                <div className="panel totals">
                  <div className="total"><span>Ceiling</span><b>{fmt(cap.cap_amount)}</b></div>
                  <div className="total"><span>{cap.scope === "POOL" ? "Remaining in the pool" : "Limit for the next claim"}</span><b>{fmt(cap.remaining)}</b></div>
                  <div className="total"><span>Confirmed payable</span><b>{fmt(cap.used)}</b></div>
                  <div className="total"><span>Claims · pending</span><b>{cap.claim_count} · {cap.pending_count}</b></div>
                </div>
              </section>
            )}

            {cap && cap.state === "ACTIVE" && !isClaimant && (
              <p className="fine">{me ? REVERTS.onlyClaimantClaim : UI.noWallet} — the claimant records claims; the author confirms or rejects each one.</p>
            )}

            {cap && cap.state === "ACTIVE" && isClaimant && (
              <section className="panel form compact">
                <p className="sense-label">Record a claim (claimant)</p>
                <div className="two">
                  <div>
                    <label htmlFor="camount">Amount asked</label>
                    <input id="camount" className="mono" inputMode="numeric" placeholder="6000" value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="cnote">What happened</label>
                    <input id="cnote" placeholder="Storm damage, 3 March" value={claimNote} onChange={(e) => setClaimNote(e.target.value)} />
                    <span className="fine">{pyLen(pyStrip(claimNote))} / {MAX_NOTE_LENGTH} characters</span>
                  </div>
                </div>
                <div className="form-foot">
                  <span className={`meter mono ${claimBytes > CALLDATA_LIMIT ? "over" : ""}`}>
                    {claimPreview !== null ? `Payable if the author confirms now: ${fmt(claimPreview)} · ` : ""}{claimBytes} / {CALLDATA_LIMIT} bytes
                  </span>
                  <span className="action">
                    {(claimAmount || claimNote) && claimReason && claimReason !== REVERTS.noteEmpty && <span className="reason">{claimReason}</span>}
                    <button className="btn btn-primary" onClick={onClaim} disabled={busy || !!claimReason}>Record claim</button>
                  </span>
                </div>
              </section>
            )}

            {cap && claims.length > 0 && (
              <section>
                <h2 className="section-title">Claims</h2>
                <div className="grid">{[...claims].reverse().map((k) => renderClaim(k))}</div>
              </section>
            )}
          </>
        )}

        {view === "open" && (
          <section className="panel form">
            <p className="eyebrow">PROPOSE A CAP</p>
            <h1>Author: the ceiling and the words that set it</h1>
            <p className="muted">Validators read only the text and the claimant's label — never the amount or any wallet. The claimant must accept before anything counts.</p>
            <label htmlFor="claimant">Claimant wallet</label>
            <input id="claimant" className="mono" placeholder="0x…" value={claimant} onChange={(e) => setClaimant(e.target.value)} spellCheck={false} />
            <div className="two">
              <div>
                <label htmlFor="label">Claimant label</label>
                <input id="label" placeholder="the Claimant" value={label} onChange={(e) => setLabel(e.target.value)} />
                <span className="fine">{pyLen(pyNormalize(label))} / {MAX_LABEL_LENGTH} characters</span>
              </div>
              <div>
                <label htmlFor="amount">Ceiling</label>
                <input id="amount" className="mono" inputMode="numeric" placeholder="10000" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <label htmlFor="text">Agreement text</label>
            <textarea id="text" rows={3} placeholder="Every payment we make is taken from one agreed sum." value={text} onChange={(e) => setText(e.target.value)} />
            <div className="form-foot">
              <span className={`meter mono ${openBytes > CALLDATA_LIMIT ? "over" : ""}`}>{pyLen(pyStrip(text))} characters · {openBytes} / {CALLDATA_LIMIT} bytes</span>
              <span className="action">
                {(text || claimant || amount) && openReason && openReason !== REVERTS.textEmpty && <span className="reason">{openReason}</span>}
                <button className="btn btn-primary" onClick={onPropose} disabled={busy || !!openReason}>Propose cap</button>
              </span>
            </div>
            {newId && <p className="fine mono">Cap id: {newId}<br />Text hash the claimant will sign: {textHashOf(text)}</p>}
          </section>
        )}

        {view === "verify" && (
          <section className="panel form">
            <p className="eyebrow">VERIFICATION</p>
            <h1>What you are talking to</h1>
            <dl className="facts">
              <div><dt>Contract</dt><dd className="mono"><a href={`${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">{CONTRACT_ADDRESS}</a></dd></div>
              <div><dt>Source SHA-256</dt><dd className="mono">{SOURCE_SHA256}</dd></div>
              <div><dt>Contract name · version</dt><dd className="mono">{limits ? `${limits.contract_name ?? "?"} · ${limits.version ?? "?"}` : "reading…"}</dd></div>
              <div><dt>Rubric hash (from get_limits)</dt><dd className="mono">{limits?.rubric_hash ?? "reading…"}</dd></div>
              <div><dt>Two-party rules (from get_limits)</dt><dd className="mono">{limits?.two_party ? `claimant accepts text hash: ${limits.two_party.claimant_accepts_text_hash} · author confirms each claim: ${limits.two_party.author_confirms_each_claim}` : "reading…"}</dd></div>
            </dl>
            <p className="muted">
              Every revert the app can predict disables the button and shows the contract's own sentence. Whether the text means
              one pool or a fresh limit per claim is decided only by validators inside open_cap(); the app reads the verdict back.
              No funds are held: payable amounts are ledger numbers.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
