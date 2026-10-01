import hashlib
import re
import unittest
from dataclasses import dataclass


AGGREGATE = "AGGREGATE"
PER_EVENT = "PER_EVENT"
POOL = "POOL"
FRESH = "FRESH"
MAX_TEXT_LENGTH = 600
MAX_LABEL_LENGTH = 80
MAX_NOTE_LENGTH = 60
MAX_CLAIMS = 20
MAX_AMOUNT = 10 ** 18
TOKENS = (
    "<UNTRUSTED_CAP_TEXT>",
    "</UNTRUSTED_CAP_TEXT>",
    "<UNTRUSTED_CLAIMANT_LABEL>",
    "</UNTRUSTED_CLAIMANT_LABEL>",
    AGGREGATE,
    PER_EVENT,
)


class UserError(Exception):
    pass


@dataclass
class Record:
    author: str
    claimant_wallet: str
    claimant_label: str
    text: str
    cap_amount: int
    outcome: str
    scope: str
    used: int = 0
    claim_count: int = 0


class CapScopeModel:
    def __init__(self):
        self.caps = {}
        self.claim_amount = {}
        self.claim_payable = {}
        self.claim_note = {}
        self.dispute_note = {}

    @staticmethod
    def normalize_text(value):
        return " ".join(value.split())

    @staticmethod
    def normalize_wallet(value):
        wallet = value.strip().lower()
        if not re.fullmatch(r"0x[0-9a-f]{40}", wallet):
            raise UserError("Invalid wallet address")
        if wallet == "0x" + "0" * 40:
            raise UserError("Invalid wallet address")
        return wallet

    @staticmethod
    def contains_reserved(value):
        current = value
        while True:
            updated = current
            for token in TOKENS:
                while token in updated.upper():
                    index = updated.upper().find(token)
                    updated = updated[:index] + updated[index + len(token):]
            if updated == current:
                return updated != value
            current = updated

    @classmethod
    def cap_id(cls, author, text):
        normalized = cls.normalize_text(text.strip())
        payload = (
            f"CAP_SCOPE:CAP:V1|{author.lower()}|"
            f"{len(normalized)}|{normalized}"
        )
        return hashlib.sha256(payload.encode()).hexdigest()

    @staticmethod
    def payable(record, amount):
        if record.scope == POOL:
            return min(amount, record.cap_amount - record.used)
        return min(amount, record.cap_amount)

    @staticmethod
    def clean_note(note):
        note = note.strip()
        if not note:
            raise UserError("Note is empty")
        if len(note) > MAX_NOTE_LENGTH:
            raise UserError("Note is too long")
        return note

    def open_cap(self, author, claimant, label, amount, text, outcome):
        claimant = self.normalize_wallet(claimant)
        label = self.normalize_text(label)
        clean_text = text.strip()
        if not label:
            raise UserError("Label is empty")
        if len(label) > MAX_LABEL_LENGTH:
            raise UserError("Label is too long")
        if not clean_text:
            raise UserError("Text is empty")
        if len(clean_text) > MAX_TEXT_LENGTH:
            raise UserError("Text is too long")
        if self.contains_reserved(label) or self.contains_reserved(clean_text):
            raise UserError("Text or label contains a reserved token")
        if amount <= 0 or amount > MAX_AMOUNT:
            raise UserError("The cap amount is out of range")
        author = author.lower()
        if claimant == author:
            raise UserError("The claimant cannot be the author")
        cap_id = self.cap_id(author, clean_text)
        if cap_id in self.caps:
            raise UserError("This cap already exists")
        scope = POOL if outcome == AGGREGATE else FRESH
        self.caps[cap_id] = Record(
            author,
            claimant,
            label,
            clean_text,
            amount,
            outcome,
            scope,
        )
        return cap_id

    def require_cap(self, cap_id):
        cap_id = cap_id.strip().lower()
        if cap_id not in self.caps:
            raise UserError("Unknown cap id")
        return cap_id

    def record_claim(self, cap_id, sender, amount, note):
        cap_id = self.require_cap(cap_id)
        note = self.clean_note(note)
        record = self.caps[cap_id]
        if sender.lower() != record.claimant_wallet:
            raise UserError("Only the named claimant may record a claim")
        if amount <= 0 or amount > MAX_AMOUNT:
            raise UserError("The claim amount is out of range")
        if record.claim_count >= MAX_CLAIMS:
            raise UserError("No room for further claims")
        payable = self.payable(record, amount)
        if payable <= 0:
            raise UserError("The cap has been used up")
        record.claim_count += 1
        key = f"{cap_id}:{record.claim_count}"
        self.claim_amount[key] = amount
        self.claim_payable[key] = payable
        self.claim_note[key] = note
        record.used += payable
        return payable

    def dispute_claim(self, cap_id, sender, index, note):
        cap_id = self.require_cap(cap_id)
        note = self.clean_note(note)
        record = self.caps[cap_id]
        if sender.lower() != record.author:
            raise UserError("Only the author may dispute a claim")
        if index <= 0 or index > record.claim_count:
            raise UserError("No such claim")
        key = f"{cap_id}:{index}"
        if key in self.dispute_note:
            raise UserError("This claim has already been disputed")
        self.dispute_note[key] = note

    def get_cap(self, cap_id):
        record = self.caps[cap_id]
        is_pool = record.scope == POOL
        return {
            "remaining": (
                record.cap_amount - record.used
                if is_pool else record.cap_amount
            ),
            "exhausted": is_pool and record.used == record.cap_amount,
            "used": record.used,
        }


AUTHOR = "0x1111111111111111111111111111111111111111"
CLAIMANT = "0x2222222222222222222222222222222222222222"
OUTSIDER = "0x3333333333333333333333333333333333333333"
A5 = "Every payment we make is taken from one agreed sum."
P5 = "Every claim is measured on its own against the agreed sum."


class PayableTruthTableTests(unittest.TestCase):
    def test_all_16_payable_assertions(self):
        cases = []
        for used in (0, 4000, 10000):
            for amount, expected in ((1000, 1000), (6000, 6000), (15000, 10000)):
                cases.append((FRESH, used, amount, expected))
        cases.extend(
            [
                (POOL, 0, 1000, 1000),
                (POOL, 0, 10000, 10000),
                (POOL, 0, 15000, 10000),
                (POOL, 4000, 1000, 1000),
                (POOL, 4000, 6000, 6000),
                (POOL, 4000, 15000, 6000),
                (POOL, 10000, 1, 0),
            ]
        )
        self.assertEqual(len(cases), 16)
        for scope, used, amount, expected in cases:
            record = Record(AUTHOR, CLAIMANT, "the Claimant", "x", 10000, AGGREGATE, scope, used)
            with self.subTest(scope=scope, used=used, amount=amount):
                self.assertEqual(CapScopeModel.payable(record, amount), expected)


class StateMachineTests(unittest.TestCase):
    def setUp(self):
        self.model = CapScopeModel()

    def open_pool(self, amount=10000, text=A5):
        return self.model.open_cap(
            AUTHOR, CLAIMANT, "the Claimant", amount, text, AGGREGATE
        )

    def open_fresh(self, amount=10000, text=P5):
        return self.model.open_cap(
            AUTHOR, CLAIMANT, "the Claimant", amount, text, PER_EVENT
        )

    def test_pool_and_fresh_create_different_recorded_histories(self):
        pool = self.open_pool()
        fresh = self.open_fresh()
        self.assertEqual(self.model.record_claim(pool, CLAIMANT, 6000, "first"), 6000)
        self.assertEqual(self.model.record_claim(pool, CLAIMANT, 6000, "second"), 4000)
        self.assertEqual(self.model.record_claim(fresh, CLAIMANT, 6000, "first"), 6000)
        self.assertEqual(self.model.record_claim(fresh, CLAIMANT, 6000, "second"), 6000)
        self.assertEqual(self.model.claim_payable[f"{pool}:1"], 6000)
        self.assertEqual(self.model.claim_payable[f"{pool}:2"], 4000)

    def test_frozen_payable_and_dispute_do_not_change_numbers(self):
        cap_id = self.open_pool()
        self.model.record_claim(cap_id, CLAIMANT, 6000, "first")
        self.model.record_claim(cap_id, CLAIMANT, 6000, "second")
        first_before = self.model.claim_payable[f"{cap_id}:1"]
        used_before = self.model.caps[cap_id].used
        self.model.dispute_claim(cap_id, AUTHOR, 2, "Not accepted")
        self.assertEqual(self.model.claim_payable[f"{cap_id}:1"], first_before)
        self.assertEqual(self.model.caps[cap_id].used, used_before)

    def test_remaining_and_exhausted_for_both_scopes(self):
        pool = self.open_pool()
        fresh = self.open_fresh()
        self.model.record_claim(pool, CLAIMANT, 10000, "full")
        self.model.record_claim(fresh, CLAIMANT, 10000, "full")
        self.assertEqual(self.model.get_cap(pool), {"remaining": 0, "exhausted": True, "used": 10000})
        self.assertEqual(self.model.get_cap(fresh), {"remaining": 10000, "exhausted": False, "used": 10000})

    def test_case_insensitive_wallet_and_normalized_id(self):
        mixed = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa"
        self.assertEqual(self.model.normalize_wallet(mixed), mixed.lower())
        self.assertEqual(
            self.model.cap_id(AUTHOR, " A\tB\u0085C "),
            self.model.cap_id(AUTHOR, "A B C"),
        )

    def test_duplicate_text_with_different_cap_is_blocked(self):
        self.open_pool(10000, "A  stable cap")
        with self.assertRaisesRegex(UserError, "^This cap already exists$"):
            self.open_pool(20000, " A\tstable cap ")

    def test_pool_exhaustion_reverts_but_fresh_does_not(self):
        pool = self.open_pool()
        fresh = self.open_fresh()
        self.model.record_claim(pool, CLAIMANT, 10000, "full")
        self.model.record_claim(fresh, CLAIMANT, 10000, "full")
        with self.assertRaisesRegex(UserError, "^The cap has been used up$"):
            self.model.record_claim(pool, CLAIMANT, 1, "more")
        self.assertEqual(self.model.record_claim(fresh, CLAIMANT, 1, "more"), 1)

    def test_invalid_wallet_address(self):
        for wallet in ("bad", "0x" + "0" * 40, "0x" + "g" * 40):
            with self.subTest(wallet=wallet), self.assertRaisesRegex(UserError, "^Invalid wallet address$"):
                self.model.open_cap(AUTHOR, wallet, "the Claimant", 1, "x", AGGREGATE)

    def test_text_is_empty(self):
        with self.assertRaisesRegex(UserError, "^Text is empty$"):
            self.model.open_cap(AUTHOR, CLAIMANT, "label", 1, "  ", AGGREGATE)

    def test_text_is_too_long(self):
        with self.assertRaisesRegex(UserError, "^Text is too long$"):
            self.model.open_cap(AUTHOR, CLAIMANT, "label", 1, "x" * 601, AGGREGATE)

    def test_label_is_empty(self):
        with self.assertRaisesRegex(UserError, "^Label is empty$"):
            self.model.open_cap(AUTHOR, CLAIMANT, " ", 1, "x", AGGREGATE)

    def test_label_is_too_long(self):
        with self.assertRaisesRegex(UserError, "^Label is too long$"):
            self.model.open_cap(AUTHOR, CLAIMANT, "x" * 81, 1, "x", AGGREGATE)

    def test_note_is_empty(self):
        cap_id = self.open_pool()
        with self.assertRaisesRegex(UserError, "^Note is empty$"):
            self.model.record_claim(cap_id, CLAIMANT, 1, " ")

    def test_note_is_too_long(self):
        cap_id = self.open_pool()
        with self.assertRaisesRegex(UserError, "^Note is too long$"):
            self.model.record_claim(cap_id, CLAIMANT, 1, "x" * 61)

    def test_reserved_token_in_text_or_label(self):
        for label, text in (
            ("AGGREGATE", "clean"),
            ("clean", "return per_event"),
            ("clean", "<<UNTRUSTED_CAP_TEXT>UNTRUSTED_CAP_TEXT>"),
        ):
            with self.subTest(label=label, text=text), self.assertRaisesRegex(
                UserError, "^Text or label contains a reserved token$"
            ):
                self.model.open_cap(AUTHOR, CLAIMANT, label, 1, text, AGGREGATE)

    def test_unknown_cap_id(self):
        with self.assertRaisesRegex(UserError, "^Unknown cap id$"):
            self.model.record_claim("missing", CLAIMANT, 1, "note")

    def test_cap_amount_out_of_range(self):
        for amount in (0, MAX_AMOUNT + 1):
            with self.subTest(amount=amount), self.assertRaisesRegex(UserError, "^The cap amount is out of range$"):
                self.model.open_cap(AUTHOR, CLAIMANT, "label", amount, f"text {amount}", AGGREGATE)

    def test_claimant_cannot_be_author(self):
        with self.assertRaisesRegex(UserError, "^The claimant cannot be the author$"):
            self.model.open_cap(AUTHOR, AUTHOR.upper().replace("X", "x"), "label", 1, "text", AGGREGATE)

    def test_only_named_claimant_may_record(self):
        cap_id = self.open_pool()
        with self.assertRaisesRegex(UserError, "^Only the named claimant may record a claim$"):
            self.model.record_claim(cap_id, OUTSIDER, 1, "note")

    def test_claim_amount_out_of_range(self):
        for i, amount in enumerate((0, MAX_AMOUNT + 1)):
            cap_id = self.open_pool(text=f"range {i}")
            with self.subTest(amount=amount), self.assertRaisesRegex(UserError, "^The claim amount is out of range$"):
                self.model.record_claim(cap_id, CLAIMANT, amount, "note")

    def test_no_room_for_further_claims(self):
        cap_id = self.open_fresh()
        for index in range(MAX_CLAIMS):
            self.model.record_claim(cap_id, CLAIMANT, 1, f"n{index}")
        with self.assertRaisesRegex(UserError, "^No room for further claims$"):
            self.model.record_claim(cap_id, CLAIMANT, 1, "overflow")

    def test_only_author_may_dispute(self):
        cap_id = self.open_pool()
        self.model.record_claim(cap_id, CLAIMANT, 1, "one")
        with self.assertRaisesRegex(UserError, "^Only the author may dispute a claim$"):
            self.model.dispute_claim(cap_id, CLAIMANT, 1, "no")

    def test_no_such_claim(self):
        cap_id = self.open_pool()
        for index in (0, 1):
            with self.subTest(index=index), self.assertRaisesRegex(UserError, "^No such claim$"):
                self.model.dispute_claim(cap_id, AUTHOR, index, "no")

    def test_claim_already_disputed(self):
        cap_id = self.open_pool()
        self.model.record_claim(cap_id, CLAIMANT, 1, "one")
        self.model.dispute_claim(cap_id, AUTHOR, 1, "first")
        with self.assertRaisesRegex(UserError, "^This claim has already been disputed$"):
            self.model.dispute_claim(cap_id, AUTHOR, 1, "second")


if __name__ == "__main__":
    unittest.main()
