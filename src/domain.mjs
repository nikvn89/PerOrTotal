export function predictedPayable(cap, rawAmount) {
  const amount = Number(rawAmount)
  if (!Number.isSafeInteger(amount) || amount <= 0) return 0
  return Math.min(amount, cap.scope === 'POOL' ? cap.remaining : cap.cap_amount)
}

export function claimBlockReason(cap, account, rawAmount, note, pyStrip, pyLen) {
  if (!account) return 'Connect a wallet first.'
  if (account.toLowerCase() !== cap.claimant_wallet.toLowerCase()) {
    return 'Only the named claimant may record a claim'
  }
  const amount = Number(rawAmount)
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10 ** 18) {
    return 'The claim amount is out of range'
  }
  const cleanNote = pyStrip(note)
  if (!cleanNote) return 'Note is empty'
  if (pyLen(cleanNote) > 60) return 'Note is too long'
  if (cap.claim_count >= 20) return 'No room for further claims'
  if (cap.scope === 'POOL' && cap.exhausted) return 'The cap has been used up'
  return ''
}

export function disputeBlockReason(cap, claim, account, note, pyStrip, pyLen) {
  if (!account) return 'Connect a wallet first.'
  if (account.toLowerCase() !== cap.author.toLowerCase()) {
    return 'Only the author may dispute a claim'
  }
  const cleanNote = pyStrip(note)
  if (!cleanNote) return 'Note is empty'
  if (pyLen(cleanNote) > 60) return 'Note is too long'
  if (claim.dispute_note) return 'This claim has already been disputed'
  return ''
}
