// Shapes of the contract's JSON views. Amounts are decimal strings.

export type Cap = {
  cap_id: string;
  author: string;
  claimant_wallet: string;
  claimant_label: string;
  text: string;
  text_hash: string;
  outcome: "AGGREGATE" | "PER_EVENT" | string;
  scope: "POOL" | "FRESH" | string;
  state: "PROPOSED" | "ACTIVE" | "DECLINED" | string;
  cap_amount: string;
  used: string;
  remaining: string;
  claim_count: number;
  pending_count: number;
  exhausted: boolean;
};

export type Claim = {
  cap_id: string;
  index: number;
  amount: string;
  note: string;
  state: "PENDING" | "CONFIRMED" | "REJECTED" | string;
  payable: string;
  payable_if_confirmed_now: string;
  reject_note: string;
};

export type TxPhase = "idle" | "checking" | "signing" | "submitted" | "delayed" | "success" | "error";

export type TxStatus = { phase: TxPhase; message: string; hash?: string; action?: string };
