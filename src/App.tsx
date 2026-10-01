import { useEffect, useMemo, useState } from 'react'
import {
  Cap,
  Claim,
  capScope,
  connectWallet,
  normalizeError,
  openCapCalldataBytes,
  passiveWallet,
  settleCapWrite,
} from './genlayer'
import { CONTRACT_ADDRESS, contractExplorerUrl, transactionExplorerUrl } from './config'
import { capIdFor, isCapId } from './ids'
import { requireCapAbsent } from './preflight.mjs'
import { pyLen, pyNormalizeWhitespace, pyStrip } from './pytext.mjs'
import { claimBlockReason, disputeBlockReason, predictedPayable } from './domain.mjs'

type Notice = { tone: 'info' | 'success' | 'error'; text: string; hash?: string }
type Loaded = { cap: Cap; claims: Claim[] }

const short = (value: string, left = 7, right = 5) =>
  value ? `${value.slice(0, left)}…${value.slice(-right)}` : '—'

function CapCard({
  loaded,
  account,
  busy,
  onRefresh,
  onRecord,
  onDispute,
}: {
  loaded: Loaded
  account: string
  busy: boolean
  onRefresh: (id: string) => Promise<void>
  onRecord: (loaded: Loaded, amount: string, note: string) => Promise<void>
  onDispute: (loaded: Loaded, claim: Claim, note: string) => Promise<void>
}) {
  const { cap, claims } = loaded
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [disputes, setDisputes] = useState<Record<number, string>>({})
  const reason = claimBlockReason(cap, account, amount, note, pyStrip, pyLen)
  const payable = predictedPayable(cap, amount)
  const panel = cap.scope === 'POOL'
    ? 'One pool: every claim draws it down'
    : 'Fresh limit: every claim starts from the full cap'

  return (
    <article className={`cap-card ${cap.scope.toLowerCase()}`}>
      <header className="cap-head">
        <div>
          <p className="mono">{cap.scope} · {cap.outcome}</p>
          <h3>{cap.claimant_label}</h3>
        </div>
        <button className="quiet" disabled={busy} onClick={() => onRefresh(cap.cap_id)}>Refresh</button>
      </header>

      <div className="scope-line">{panel}</div>
      <blockquote>{cap.text}</blockquote>

      <div className="cap-metric">
        {cap.scope === 'POOL' ? (
          <><strong>{cap.remaining}</strong><span>Remaining of {cap.cap_amount}</span></>
        ) : (
          <><strong>{cap.used}</strong><span>Recorded so far · No running limit</span></>
        )}
      </div>
      <div className="meter" aria-label={cap.scope === 'POOL' ? 'remaining pool' : 'recorded total'}>
        <span style={{ width: `${Math.min(100, cap.scope === 'POOL' ? (cap.used / cap.cap_amount) * 100 : (cap.used / Math.max(cap.cap_amount, 1)) * 50)}%` }} />
      </div>

      <div className="claim-form">
        <label>
          <span>Claim amount</span>
          <input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 6000" />
        </label>
        <label>
          <span>Claim note</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={60} placeholder="What is being recorded?" />
        </label>
        {Number(amount) > 0 && (
          <p className="preview-line">
            A claim of {amount} would be recorded as <strong>{payable}</strong>
            <small>computed in your browser from the recorded cap</small>
          </p>
        )}
        <button className="record" disabled={busy || Boolean(reason)} onClick={() => onRecord(loaded, amount, note)}>
          Record claim
        </button>
        <p className={reason ? 'block-reason' : 'ready-reason'}>{reason || 'Ready to submit from the named claimant wallet'}</p>
      </div>

      <div className="claims">
        <div className="claims-title"><h4>Immutable claim ledger</h4><span>{claims.length}/20</span></div>
        {claims.length === 0 ? <p className="empty-row">No claims recorded.</p> : (
          <div className="claim-list">
            {claims.map((claim) => {
              const dispute = disputes[claim.index] || ''
              const disputeReason = disputeBlockReason(cap, claim, account, dispute, pyStrip, pyLen)
              return (
                <div className="claim-row" key={claim.index}>
                  <div className="claim-n">#{claim.index}</div>
                  <div><span>Asked</span><strong>{claim.amount}</strong></div>
                  <div><span>Recorded</span><strong>{claim.payable}</strong></div>
                  <div className={claim.payable < claim.amount ? 'cut' : 'full'}>
                    {claim.payable < claim.amount ? 'CUT' : 'FULL'}
                  </div>
                  <p>{claim.note}</p>
                  {claim.dispute_note ? (
                    <p className="disputed">Disputed: {claim.dispute_note}</p>
                  ) : (
                    <div className="dispute-control">
                      <input
                        value={dispute}
                        onChange={(event) => setDisputes((current) => ({ ...current, [claim.index]: event.target.value }))}
                        maxLength={60}
                        placeholder="Author dispute note"
                      />
                      <button disabled={busy || Boolean(disputeReason)} onClick={() => onDispute(loaded, claim, dispute)}>Dispute</button>
                      <small>{disputeReason || 'Ready'}</small>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <footer className="cap-id"><span>CAP ID</span><code>{cap.cap_id}</code><button onClick={() => navigator.clipboard.writeText(cap.cap_id)}>Copy</button></footer>
    </article>
  )
}

export default function App() {
  const [account, setAccount] = useState('')
  const [claimantWallet, setClaimantWallet] = useState('')
  const [claimantLabel, setClaimantLabel] = useState('')
  const [capAmount, setCapAmount] = useState('')
  const [text, setText] = useState('')
  const [lookupId, setLookupId] = useState('')
  const [createdId, setCreatedId] = useState('')
  const [loaded, setLoaded] = useState<Loaded[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const cleanText = pyStrip(text)
  const cleanLabel = pyNormalizeWhitespace(claimantLabel)
  const textLength = pyLen(cleanText)
  const calldataBytes = useMemo(() => {
    try { return openCapCalldataBytes(claimantWallet, cleanLabel, capAmount || '0', cleanText) }
    catch { return 0 }
  }, [claimantWallet, cleanLabel, capAmount, cleanText])

  const upsert = (value: Loaded) => setLoaded((current) => {
    const next = current.filter((item) => item.cap.cap_id !== value.cap.cap_id)
    return [value, ...next].slice(0, 2)
  })

  const load = async (id: string, announce = true) => {
    const cleanId = id.trim().toLowerCase()
    if (!isCapId(cleanId)) throw new Error('Cap ID must be 64 hexadecimal characters.')
    const value = { cap: await capScope.getCap(cleanId), claims: await capScope.getClaims(cleanId) }
    upsert(value)
    if (announce) setNotice({ tone: 'success', text: 'Accepted cap state loaded.' })
    return value
  }

  useEffect(() => {
    passiveWallet().then(setAccount).catch(() => undefined)
    const ethereum = window.ethereum
    if (!ethereum?.on) return
    const changed = (accounts: string[]) => setAccount(accounts?.[0] || '')
    ethereum.on('accountsChanged', changed)
    return () => ethereum.removeListener?.('accountsChanged', changed)
  }, [])

  const handleConnect = async () => {
    try {
      setBusy(true)
      setAccount(await connectWallet())
      setNotice({ tone: 'success', text: 'Wallet connected to StudioNet.' })
    } catch (error) { setNotice({ tone: 'error', text: normalizeError(error) }) }
    finally { setBusy(false) }
  }

  const handleOpen = async () => {
    try {
      if (!account) throw new Error('Connect the author wallet first.')
      if (!/^0x[a-fA-F0-9]{40}$/.test(claimantWallet.trim()) || /^0x0{40}$/i.test(claimantWallet.trim())) throw new Error('Invalid wallet address')
      if (claimantWallet.trim().toLowerCase() === account.toLowerCase()) throw new Error('The claimant cannot be the author')
      if (!cleanLabel) throw new Error('Label is empty')
      if (pyLen(cleanLabel) > 80) throw new Error('Label is too long')
      if (!cleanText) throw new Error('Text is empty')
      if (textLength > 600) throw new Error('Text is too long')
      if (!/^\d+$/.test(capAmount) || BigInt(capAmount) <= 0n || BigInt(capAmount) > 10n ** 18n) throw new Error('The cap amount is out of range')
      if (calldataBytes > 255) throw new Error('Serialized calldata exceeds the proven 255-byte path.')
      setBusy(true)
      const id = capIdFor(account, cleanText)
      await requireCapAbsent(capScope.getCap, id)
      const hash = await capScope.openCap(account, claimantWallet, cleanLabel, capAmount, cleanText)
      setCreatedId(id); setLookupId(id)
      setNotice({ tone: 'info', text: 'Submitted — waiting for accepted state.', hash })
      const outcome = await settleCapWrite(hash, id, (cap) => cap.cap_id === id)
      if (outcome.status === 'SUCCESS') {
        upsert({ cap: outcome.cap, claims: outcome.claims })
        setNotice({ tone: 'success', text: 'Cap accepted and reloaded.', hash })
      } else setNotice({ tone: 'info', text: 'Submitted — confirmation delayed. Refresh the known ID; do not resubmit.', hash })
    } catch (error) { setNotice({ tone: 'error', text: normalizeError(error) }) }
    finally { setBusy(false) }
  }

  const handleRecord = async (item: Loaded, amount: string, note: string) => {
    try {
      const reason = claimBlockReason(item.cap, account, amount, note, pyStrip, pyLen)
      if (reason) throw new Error(reason)
      setBusy(true)
      const expected = item.cap.claim_count + 1
      const hash = await capScope.recordClaim(account, item.cap.cap_id, amount, note)
      setNotice({ tone: 'info', text: 'Submitted — waiting for accepted state.', hash })
      const outcome = await settleCapWrite(hash, item.cap.cap_id, (cap) => cap.claim_count >= expected)
      if (outcome.status === 'SUCCESS') {
        upsert({ cap: outcome.cap, claims: outcome.claims })
        setNotice({ tone: 'success', text: 'Claim recorded in accepted state.', hash })
      } else setNotice({ tone: 'info', text: 'Submitted — confirmation delayed. Refresh state; do not resubmit.', hash })
    } catch (error) { setNotice({ tone: 'error', text: normalizeError(error) }) }
    finally { setBusy(false) }
  }

  const handleDispute = async (item: Loaded, claim: Claim, note: string) => {
    try {
      const reason = disputeBlockReason(item.cap, claim, account, note, pyStrip, pyLen)
      if (reason) throw new Error(reason)
      setBusy(true)
      const cleanNote = pyStrip(note)
      const hash = await capScope.disputeClaim(account, item.cap.cap_id, claim.index, cleanNote)
      setNotice({ tone: 'info', text: 'Submitted — waiting for accepted state.', hash })
      const outcome = await settleCapWrite(hash, item.cap.cap_id, (_cap, claims) =>
        claims.some((value) => value.index === claim.index && value.dispute_note === cleanNote))
      if (outcome.status === 'SUCCESS') {
        upsert({ cap: outcome.cap, claims: outcome.claims })
        setNotice({ tone: 'success', text: 'Dispute recorded without changing payable.', hash })
      } else setNotice({ tone: 'info', text: 'Submitted — confirmation delayed. Refresh state; do not resubmit.', hash })
    } catch (error) { setNotice({ tone: 'error', text: normalizeError(error) }) }
    finally { setBusy(false) }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top"><img src="/perortotal-logo.png" alt="PerOrTotal" /><span><strong>PerOrTotal</strong><small>One pool or a fresh limit?</small></span></a>
        <div className="top-actions"><a href={contractExplorerUrl()} target="_blank" rel="noreferrer">Explorer ↗</a><button onClick={handleConnect} disabled={busy}>{account ? short(account) : 'Connect wallet'}</button></div>
      </header>

      <main id="top">
        <section className="hero">
          <div><p className="kicker">RECORDED CEILING · SEMANTIC SCOPE</p><h1>One number.<br /><em>Two memories.</em></h1><p>GenLayer decides whether earlier claims draw down one shared ceiling or every claim starts from the full ceiling again.</p></div>
          <div className="hero-compare"><div><b>ONE POOL</b><strong>10k → 4k → 0</strong><small>remembers earlier claims</small></div><div><b>FRESH EACH TIME</b><strong>10k · 10k · 10k</strong><small>each claim stands alone</small></div></div>
        </section>

        <div className="funds-warning"><strong>No funds are held or transferred.</strong> “Recorded” is an immutable ledger number, not a payment.</div>
        {!CONTRACT_ADDRESS && <div className="notice error">Project contract address is not configured. Set <code>VITE_CONTRACT_ADDRESS</code> after the separate Project deployment.</div>}
        {notice && <div className={`notice ${notice.tone}`}><span>{notice.text}</span>{notice.hash && <a href={transactionExplorerUrl(notice.hash)} target="_blank" rel="noreferrer">{short(notice.hash, 10, 8)} ↗</a>}</div>}

        <section className="workspace">
          <aside className="control-panel">
            <p className="section-no">01 / OPEN</p><h2>Record a ceiling</h2><p className="muted">The connected wallet becomes the author. Production forms start empty.</p>
            <label><span>Claimant wallet</span><input value={claimantWallet} onChange={(e) => setClaimantWallet(e.target.value)} placeholder="0x…" /></label>
            <label><span>Claimant label</span><input value={claimantLabel} onChange={(e) => setClaimantLabel(e.target.value)} placeholder="e.g. the Claimant" maxLength={80} /><small>{pyLen(cleanLabel)}/80</small></label>
            <label><span>Ceiling amount</span><input inputMode="numeric" value={capAmount} onChange={(e) => setCapAmount(e.target.value)} placeholder="e.g. 10000" /></label>
            <label><span>Real agreement text</span><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the actual wording. No demo text is inserted." maxLength={600} /><small className={calldataBytes > 255 ? 'danger' : ''}>{textLength}/600 characters · {calldataBytes}/255 serialized bytes</small></label>
            <button className="primary" onClick={handleOpen} disabled={busy || !CONTRACT_ADDRESS || calldataBytes > 255}>{busy ? 'Working…' : 'Open cap'}</button>
            {createdId && <div className="created"><span>Latest computed ID</span><code>{createdId}</code><button onClick={() => navigator.clipboard.writeText(createdId)}>Copy ID</button></div>}
            <hr />
            <p className="section-no">02 / LOAD</p><h2>Load accepted state</h2>
            <label><span>Cap ID</span><input value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="64 hexadecimal characters" /></label>
            <button className="secondary" disabled={busy || !CONTRACT_ADDRESS} onClick={async () => { try { setBusy(true); await load(lookupId) } catch (error) { setNotice({ tone: 'error', text: normalizeError(error) }) } finally { setBusy(false) } }}>Load cap</button>
          </aside>

          <section className="board">
            <header><div><p className="section-no">03 / COMPARE</p><h2>Same sequence, different memory</h2></div><span>{loaded.length}/2 caps visible</span></header>
            {loaded.length === 0 ? <div className="empty"><img src="/perortotal-logo.png" alt="" /><h3>No cap loaded</h3><p>Create a cap or paste a known ID. Load one POOL and one FRESH cap side by side to reveal the difference.</p></div> : <div className="cap-grid">{loaded.map((item) => <CapCard key={item.cap.cap_id} loaded={item} account={account} busy={busy} onRefresh={async (id) => { await load(id, false) }} onRecord={handleRecord} onDispute={handleDispute} />)}</div>}
          </section>
        </section>
      </main>
      <footer><span>PerOrTotal · StudioNet 61999 · accepted-state reads</span><span>{CONTRACT_ADDRESS ? short(CONTRACT_ADDRESS, 10, 8) : 'Awaiting separate Project deployment'}</span></footer>
    </div>
  )
}
