"""
Deterministic tests for contracts/CapAccord.py in GenLayer Direct Mode
(genlayer-test: the real py-genlayer v0.2.16 SDK with storage, TreeMap, u256,
Keccak256 and gl.vm.UserError; the model is mocked).

The mocked labels are ASSUMED labels that drive the deterministic code paths.
They say nothing about what the real model returns; the on-chain runs do.

Run:  python3 -m pytest tests/contract -q -p no:cacheprovider
"""

import re
from pathlib import Path

import pytest
from gltest.direct.loader import create_address

from glkit import J, check_revert_coverage, hx, keccak_hex, lo, norm

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = str(ROOT / "contracts" / "CapAccord.py")

A1 = "Our liability is limited to the agreed sum in total."
A2 = "Across all claims together, we will not pay more than the agreed sum."
A3 = "The agreed sum is the most we will ever pay under this arrangement."
A4 = "Once the agreed sum has been paid out, nothing further is payable."
A5 = "Every payment we make is taken from one agreed sum."
P1 = "Our liability is limited to the agreed sum for each incident."
P2 = "For any one claim, we will not pay more than the agreed sum."
P3 = "The agreed sum is the most we will pay on any single occasion."
P4 = "Each new incident starts again from the full agreed sum."
P5 = "Every claim is measured on its own against the agreed sum."
ASSUMED_AGGREGATE = (A1, A2, A3, A4, A5)
LABEL = "the Claimant"

M_ONLY_CLAIMANT_ACCEPT = "Only the named claimant may accept or decline"
M_NOT_AWAITING = "This cap is not awaiting acceptance"
M_MISMATCH = "The accepted text does not match this cap"
M_NOT_ACTIVE = "This cap is not active"
M_ONLY_AUTHOR = "Only the author may confirm or reject a claim"
M_NOT_PENDING = "This claim is not pending"
M_USED_UP = "The cap has been used up"
M_ONLY_CLAIMANT_CLAIM = "Only the named claimant may record a claim"


def mock_labels(vm):
    for text in ASSUMED_AGGREGATE:
        vm.mock_llm(re.escape(text), '{"outcome":"AGGREGATE"}')
    vm.mock_llm(r"(?s).*", '{"outcome":"PER_EVENT"}')


@pytest.fixture
def env(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    a, c, s = create_address("author"), create_address("claimant"), create_address("stranger")
    mock_labels(direct_vm)
    direct_vm.sender = a
    return direct_vm, contract, a, c, s


def cap_id(author, text):
    t = norm(text.strip())
    return keccak_hex("CAP_ACCORD:CAP:V1|" + lo(author) + "|" + str(len(t)) + "|" + t)


def text_hash(text):
    return keccak_hex(norm(text.strip()))


def open_(vm, contract, a, c, text, amount=10000):
    vm.sender = a
    contract.open_cap(hx(c), LABEL, amount, text)
    return cap_id(a, text)


def active(vm, contract, a, c, text, amount=10000):
    cid = open_(vm, contract, a, c, text, amount)
    vm.sender = c
    contract.accept_cap(cid, text_hash(text))
    return cid


def claim(vm, contract, c, cid, amount, note="claim"):
    vm.sender = c
    contract.record_claim(cid, amount, note)
    return J(contract.get_cap(cid))["claim_count"]


def confirm(vm, contract, a, cid, index):
    vm.sender = a
    contract.confirm_claim(cid, index)
    return J(contract.get_claim(cid, index))


def cap(contract, cid):
    return J(contract.get_cap(cid))


# ---------------------------------------------------------------------
# The tooth: the same claims, POOL versus FRESH — only after both parties act
# ---------------------------------------------------------------------

def test_tooth_pool_draws_down_and_fresh_renews(env):
    vm, contract, a, c, _ = env
    pool = active(vm, contract, a, c, A5)
    fresh = active(vm, contract, a, c, P5)
    assert (cap(contract, pool)["scope"], cap(contract, fresh)["scope"]) == ("POOL", "FRESH")
    for cid in (pool, fresh):
        claim(vm, contract, c, cid, 6000, "first")
        claim(vm, contract, c, cid, 6000, "second")
    assert [confirm(vm, contract, a, pool, i)["payable"] for i in (1, 2)] == ["6000", "4000"]
    assert [confirm(vm, contract, a, fresh, i)["payable"] for i in (1, 2)] == ["6000", "6000"]
    assert (cap(contract, pool)["remaining"], cap(contract, pool)["exhausted"]) == ("0", True)
    assert (cap(contract, fresh)["remaining"], cap(contract, fresh)["used"]) == ("10000", "12000")


def test_reading_is_frozen_at_open_and_shown_before_acceptance(env):
    vm, contract, a, c, _ = env
    cid = open_(vm, contract, a, c, A1)
    row = cap(contract, cid)
    assert (row["state"], row["outcome"], row["scope"], row["text_hash"]) == ("PROPOSED", "AGGREGATE", "POOL", text_hash(A1))
    vm.sender = c
    contract.accept_cap(cid, "0x" + text_hash(A1).upper())
    row = cap(contract, cid)
    assert (row["state"], row["outcome"], row["scope"]) == ("ACTIVE", "AGGREGATE", "POOL")


# ---------------------------------------------------------------------
# Two-party acceptance of the cap
# ---------------------------------------------------------------------

def test_nothing_can_be_claimed_before_the_claimant_accepts(env):
    vm, contract, a, c, _ = env
    cid = open_(vm, contract, a, c, P1)
    vm.sender = c
    with vm.expect_revert(M_NOT_ACTIVE):
        contract.record_claim(cid, 100, "early")


def test_the_claimant_accepts_the_exact_text_by_its_hash(env):
    vm, contract, a, c, _ = env
    text = "  Our liability is   limited to the agreed sum for each\tincident. "
    cid = open_(vm, contract, a, c, text)
    assert cap(contract, cid)["text_hash"] == text_hash(P1)
    vm.sender = c
    contract.accept_cap(cid, text_hash(P1))
    assert cap(contract, cid)["state"] == "ACTIVE"


def test_declined_cap_stays_closed(env):
    vm, contract, a, c, _ = env
    cid = open_(vm, contract, a, c, P2)
    vm.sender = c
    contract.decline_cap(cid)
    assert cap(contract, cid)["state"] == "DECLINED"
    with vm.expect_revert(M_NOT_AWAITING):
        contract.accept_cap(cid, text_hash(P2))
    with vm.expect_revert(M_NOT_ACTIVE):
        contract.record_claim(cid, 100, "late")


def test_the_author_cannot_accept_for_the_claimant(env):
    vm, contract, a, c, _ = env
    cid = open_(vm, contract, a, c, P3)
    vm.sender = a
    with vm.expect_revert(M_ONLY_CLAIMANT_ACCEPT):
        contract.accept_cap(cid, text_hash(P3))
    with vm.expect_revert(M_ONLY_CLAIMANT_ACCEPT):
        contract.decline_cap(cid)
    assert cap(contract, cid)["state"] == "PROPOSED"


# ---------------------------------------------------------------------
# Two-party claims: recorded by the claimant, made payable by the author
# ---------------------------------------------------------------------

def test_a_recorded_claim_draws_nothing_until_confirmed(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, A2)
    claim(vm, contract, c, cid, 6000, "first")
    row = J(contract.get_claim(cid, 1))
    assert (row["state"], row["payable"], row["payable_if_confirmed_now"]) == ("PENDING", "0", "6000")
    assert (cap(contract, cid)["used"], cap(contract, cid)["pending_count"]) == ("0", 1)


def test_rejected_claim_draws_nothing_and_keeps_its_note(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, A3)
    claim(vm, contract, c, cid, 7000, "roof")
    claim(vm, contract, c, cid, 6000, "window")
    vm.sender = a
    contract.reject_claim(cid, 1, "Not covered")
    row = J(contract.get_claim(cid, 1))
    assert (row["state"], row["payable"], row["reject_note"], row["payable_if_confirmed_now"]) == ("REJECTED", "0", "Not covered", "0")
    assert confirm(vm, contract, a, cid, 2)["payable"] == "6000"
    assert (cap(contract, cid)["used"], cap(contract, cid)["remaining"], cap(contract, cid)["pending_count"]) == ("6000", "4000", 0)


def test_pool_payable_is_computed_in_confirmation_order(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, A4)
    claim(vm, contract, c, cid, 6000, "first")
    claim(vm, contract, c, cid, 6000, "second")
    assert confirm(vm, contract, a, cid, 2)["payable"] == "6000"
    assert J(contract.get_claim(cid, 1))["payable_if_confirmed_now"] == "4000"
    assert confirm(vm, contract, a, cid, 1)["payable"] == "4000"


def test_fresh_payable_is_capped_per_claim(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P4)
    claim(vm, contract, c, cid, 25000, "big")
    assert confirm(vm, contract, a, cid, 1)["payable"] == "10000"
    assert cap(contract, cid)["remaining"] == "10000"


def test_a_claim_is_decided_once(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P5)
    claim(vm, contract, c, cid, 100, "x")
    confirm(vm, contract, a, cid, 1)
    vm.sender = a
    with vm.expect_revert(M_NOT_PENDING):
        contract.reject_claim(cid, 1, "late")
    assert J(contract.get_claim(cid, 1))["state"] == "CONFIRMED"


def test_used_up_pool_refuses_new_claims_but_fresh_does_not(env):
    vm, contract, a, c, _ = env
    pool = active(vm, contract, a, c, A5, amount=1000)
    claim(vm, contract, c, pool, 1000, "all")
    confirm(vm, contract, a, pool, 1)
    vm.sender = c
    with vm.expect_revert(M_USED_UP):
        contract.record_claim(pool, 1, "more")
    fresh = active(vm, contract, a, c, P1, amount=1000)
    for _ in range(3):
        claim(vm, contract, c, fresh, 1000, "again")


def test_the_claim_cap_counts_every_claim(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P2, amount=10 ** 6)
    for i in range(20):
        claim(vm, contract, c, cid, 1, f"c{i}")
    vm.sender = c
    with vm.expect_revert("No room for further claims"):
        contract.record_claim(cid, 1, "21st")


# ---------------------------------------------------------------------
# Roles, ids and stored text
# ---------------------------------------------------------------------

def test_a_stranger_is_refused_by_every_restricted_write(env):
    vm, contract, a, c, s = env
    cid = open_(vm, contract, a, c, P3)
    vm.sender = s
    with vm.expect_revert(M_ONLY_CLAIMANT_ACCEPT):
        contract.accept_cap(cid, text_hash(P3))
    with vm.expect_revert(M_ONLY_CLAIMANT_ACCEPT):
        contract.decline_cap(cid)
    vm.sender = c
    contract.accept_cap(cid, text_hash(P3))
    claim(vm, contract, c, cid, 10, "x")
    vm.sender = s
    with vm.expect_revert(M_ONLY_CLAIMANT_CLAIM):
        contract.record_claim(cid, 10, "x")
    with vm.expect_revert(M_ONLY_AUTHOR):
        contract.confirm_claim(cid, 1)
    with vm.expect_revert(M_ONLY_AUTHOR):
        contract.reject_claim(cid, 1, "no")


def test_the_claimant_cannot_confirm_their_own_claim(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P4)
    claim(vm, contract, c, cid, 10, "x")
    vm.sender = c
    with vm.expect_revert(M_ONLY_AUTHOR):
        contract.confirm_claim(cid, 1)


def test_cap_id_recipe_and_whitespace_variants(env):
    vm, contract, a, c, _ = env
    cid = open_(vm, contract, a, c, "  Every claim is measured   on its own against the agreed sum. ")
    assert cid == cap_id(a, P5)
    assert cap(contract, cid)["text"] == "Every claim is measured   on its own against the agreed sum."
    vm.sender = a
    with vm.expect_revert("This cap already exists"):
        contract.open_cap(hx(c), LABEL, 5, P5)


def test_another_author_gets_another_cap(env):
    vm, contract, a, c, s = env
    one = open_(vm, contract, a, c, P5)
    two = open_(vm, contract, s, c, P5)
    assert one != two and cap(contract, two)["author"] == lo(s)


def test_wallets_are_stored_lower_case_and_ids_accept_0x(env):
    vm, contract, a, c, _ = env
    vm.sender = a
    contract.open_cap(hx(c).upper().replace("0X", "0x"), LABEL, 10, P1)
    cid = cap_id(a, P1)
    row = J(contract.get_cap("0x" + cid.upper()))
    assert (row["claimant_wallet"], row["author"]) == (lo(c), lo(a))


# ---------------------------------------------------------------------
# Model fail-safe, validator, prompt
# ---------------------------------------------------------------------

def fresh_cap(direct_vm, direct_deploy, reply):
    contract = direct_deploy(CONTRACT)
    a, c = create_address("author"), create_address("claimant")
    direct_vm.mock_llm(r"(?s).*", reply)
    direct_vm.sender = a
    contract.open_cap(hx(c), LABEL, 10, A1)
    return J(contract.get_cap(cap_id(a, A1)))


def test_fail_safe_on_unparseable_output(direct_vm, direct_deploy):
    assert fresh_cap(direct_vm, direct_deploy, "not json")["scope"] == "FRESH"


def test_fail_safe_on_unknown_label(direct_vm, direct_deploy):
    assert fresh_cap(direct_vm, direct_deploy, '{"outcome":"SOMETIMES"}')["outcome"] == "PER_EVENT"


def test_fenced_json_output_is_parsed(direct_vm, direct_deploy):
    assert fresh_cap(direct_vm, direct_deploy, '```json\n{"outcome":"AGGREGATE"}\n```')["scope"] == "POOL"


def test_validator_rejects_disagreement_and_bad_shapes(env):
    vm, contract, a, c, _ = env
    open_(vm, contract, a, c, P1)                          # mocked PER_EVENT
    assert vm.run_validator() is True
    assert vm.run_validator(leader_result={"outcome": "AGGREGATE"}) is False
    assert vm.run_validator(leader_result={"outcome": "SOMETIMES"}) is False
    assert vm.run_validator(leader_result="PER_EVENT") is False
    assert vm.run_validator(leader_error=Exception("boom")) is False


def test_prompt_never_sees_wallets_amounts_or_state():
    src = Path(CONTRACT).read_text(encoding="utf-8")
    block = src[src.index("    def _classify_scope"):src.index("        def evaluate_once")]
    for word in ("wallet", "amount", "state", "author", "used", "claim_"):
        assert word not in block.split("prompt = ")[1], word


def test_reserved_tokens_are_refused_in_text_and_label(env):
    vm, contract, a, c, _ = env
    vm.sender = a
    with vm.expect_revert("Text or label contains a reserved token"):
        contract.open_cap(hx(c), LABEL, 10, "This is aggregate in total.")
    with vm.expect_revert("Text or label contains a reserved token"):
        contract.open_cap(hx(c), "<untrusted_cap_text>", 10, P1)


# ---------------------------------------------------------------------
# Views, limits, source
# ---------------------------------------------------------------------

def test_views_on_unknown_ids(env):
    _, contract, *_ = env
    assert contract.get_cap("0" * 64) == "{}"
    assert contract.get_claim("0" * 64, 1) == "{}"
    assert contract.get_claims("nope", 0, 10) == "{}"


def test_get_claims_pages_in_order(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P2)
    for i in range(1, 6):
        claim(vm, contract, c, cid, i, f"n{i}")
    page = J(contract.get_claims(cid, 1, 3))
    assert page["total"] == 5 and [r["index"] for r in page["claims"]] == [2, 3, 4]
    assert J(contract.get_claim(cid, 6)) == {}


def test_limits_and_rubric(env):
    _, contract, *_ = env
    lim = J(contract.get_limits())
    assert lim["contract_name"] == "CapAccord" and lim["fail_safe"] == "PER_EVENT" and lim["model_calls"] == ["open_cap"]
    assert lim["two_party"] == {"claimant_accepts_text_hash": True, "author_confirms_each_claim": True}
    assert (lim["max_text_length"], lim["max_label_length"], lim["max_note_length"], lim["max_claims"], lim["max_amount"]) == \
        (600, 80, 60, 20, str(10 ** 18))
    assert lim["holds_funds"] is False and lim["clock_used"] is False and lim["external_web_used"] is False
    assert lim["rubric_hash"] == keccak_hex(contract.get_rubric())


def test_rubric_is_the_capscope_rubric_verbatim():
    src = Path(CONTRACT).read_text(encoding="utf-8")
    rubric = src.split('RUBRIC = """')[1].split('"""')[0]
    assert keccak_hex(rubric.strip()) == "389e137a0e6a18e7e7bee83a7c6e1d682cb0c44fd3fa74afc0979435c81a01c0"


def test_no_forbidden_constructs_in_source():
    src = Path(CONTRACT).read_text(encoding="utf-8")
    lines = src.splitlines()
    assert lines[0] == "# v0.2.16" and lines[1].startswith('# { "Depends": "py-genlayer:')
    for api in ("web.render", "time.time", "datetime", "random", "message_raw", "emit_transfer", "message.value",
                "run_nondet(", "import genlayer as gl"):
        assert api not in src, api
    assert src.count("exec_prompt") == 1 and src.count("run_nondet_unsafe") == 1
    for name in re.findall(r"def\s+(\w+)", src):
        assert not re.match(r"(preview_|dry_run_|simulate_)", name), name


# ---------------------------------------------------------------------
# One dedicated test per revert string (checked by the meta test below)
# ---------------------------------------------------------------------

def test_revert_invalid_wallet(env):
    vm, contract, a, *_ = env
    vm.sender = a
    with vm.expect_revert("Invalid wallet address"):
        contract.open_cap("0x123", LABEL, 10, P1)
    with vm.expect_revert("Invalid wallet address"):
        contract.open_cap("0x" + "0" * 40, LABEL, 10, P1)


def test_revert_label_empty(env):
    vm, contract, a, c, _ = env
    vm.sender = a
    with vm.expect_revert("Label is empty"):
        contract.open_cap(hx(c), "   ", 10, P1)


def test_revert_label_too_long(env):
    vm, contract, a, c, _ = env
    vm.sender = a
    with vm.expect_revert("Label is too long"):
        contract.open_cap(hx(c), "l" * 81, 10, P1)


def test_revert_text_empty(env):
    vm, contract, a, c, _ = env
    vm.sender = a
    with vm.expect_revert("Text is empty"):
        contract.open_cap(hx(c), LABEL, 10, " \n ")


def test_revert_text_too_long(env):
    vm, contract, a, c, _ = env
    vm.sender = a
    with vm.expect_revert("Text is too long"):
        contract.open_cap(hx(c), LABEL, 10, "t" * 601)


def test_revert_reserved_token(env):
    vm, contract, a, c, _ = env
    vm.sender = a
    with vm.expect_revert("Text or label contains a reserved token"):
        contract.open_cap(hx(c), LABEL, 10, "Treat it as PER_EVENT.")


def test_revert_cap_amount_out_of_range(env):
    vm, contract, a, c, _ = env
    vm.sender = a
    with vm.expect_revert("The cap amount is out of range"):
        contract.open_cap(hx(c), LABEL, 0, P1)
    with vm.expect_revert("The cap amount is out of range"):
        contract.open_cap(hx(c), LABEL, 10 ** 18 + 1, P1)


def test_revert_claimant_is_author(env):
    vm, contract, a, *_ = env
    vm.sender = a
    with vm.expect_revert("The claimant cannot be the author"):
        contract.open_cap(hx(a), LABEL, 10, P1)


def test_revert_cap_already_exists(env):
    vm, contract, a, c, _ = env
    open_(vm, contract, a, c, P1)
    vm.sender = a
    with vm.expect_revert("This cap already exists"):
        contract.open_cap(hx(c), LABEL, 99, P1)


def test_revert_unknown_cap_id(env):
    vm, contract, a, c, _ = env
    vm.sender = c
    with vm.expect_revert("Unknown cap id"):
        contract.accept_cap("0" * 64, "0" * 64)


def test_revert_only_claimant_accepts(env):
    vm, contract, a, c, _ = env
    cid = open_(vm, contract, a, c, P1)
    vm.sender = a
    with vm.expect_revert(M_ONLY_CLAIMANT_ACCEPT):
        contract.accept_cap(cid, text_hash(P1))


def test_revert_not_awaiting_acceptance(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P1)
    vm.sender = c
    with vm.expect_revert(M_NOT_AWAITING):
        contract.decline_cap(cid)


def test_revert_text_hash_mismatch(env):
    vm, contract, a, c, _ = env
    cid = open_(vm, contract, a, c, P1)
    vm.sender = c
    with vm.expect_revert(M_MISMATCH):
        contract.accept_cap(cid, text_hash(A1))
    assert cap(contract, cid)["state"] == "PROPOSED"


def test_revert_note_empty(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P1)
    vm.sender = c
    with vm.expect_revert("Note is empty"):
        contract.record_claim(cid, 10, "  ")


def test_revert_note_too_long(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P1)
    vm.sender = c
    with vm.expect_revert("Note is too long"):
        contract.record_claim(cid, 10, "n" * 61)


def test_revert_only_claimant_records(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P1)
    vm.sender = a
    with vm.expect_revert(M_ONLY_CLAIMANT_CLAIM):
        contract.record_claim(cid, 10, "self-serve")


def test_revert_cap_not_active(env):
    vm, contract, a, c, _ = env
    cid = open_(vm, contract, a, c, P1)
    vm.sender = c
    with vm.expect_revert(M_NOT_ACTIVE):
        contract.record_claim(cid, 10, "early")


def test_revert_claim_amount_out_of_range(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P1)
    vm.sender = c
    with vm.expect_revert("The claim amount is out of range"):
        contract.record_claim(cid, 0, "zero")


def test_revert_no_room(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P1, amount=100)
    for i in range(20):
        claim(vm, contract, c, cid, 1, f"c{i}")
    vm.sender = c
    with vm.expect_revert("No room for further claims"):
        contract.record_claim(cid, 1, "one more")


def test_revert_cap_used_up(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, A1, amount=500)
    claim(vm, contract, c, cid, 500, "a")
    claim(vm, contract, c, cid, 500, "b")
    confirm(vm, contract, a, cid, 1)
    vm.sender = a
    with vm.expect_revert(M_USED_UP):
        contract.confirm_claim(cid, 2)
    contract.reject_claim(cid, 2, "Pool used up")


def test_revert_only_author_decides(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P1)
    claim(vm, contract, c, cid, 10, "x")
    vm.sender = c
    with vm.expect_revert(M_ONLY_AUTHOR):
        contract.reject_claim(cid, 1, "mine")


def test_revert_no_such_claim(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P1)
    vm.sender = a
    with vm.expect_revert("No such claim"):
        contract.confirm_claim(cid, 1)


def test_revert_claim_not_pending(env):
    vm, contract, a, c, _ = env
    cid = active(vm, contract, a, c, P1)
    claim(vm, contract, c, cid, 10, "x")
    vm.sender = a
    contract.reject_claim(cid, 1, "no")
    with vm.expect_revert(M_NOT_PENDING):
        contract.confirm_claim(cid, 1)


def test_check_order_claimant_before_state(env):
    vm, contract, a, c, s = env
    cid = active(vm, contract, a, c, P1)
    vm.sender = s
    with vm.expect_revert(M_ONLY_CLAIMANT_ACCEPT):
        contract.accept_cap(cid, "0" * 64)


def test_check_order_author_before_claim_index(env):
    vm, contract, a, c, s = env
    cid = active(vm, contract, a, c, P1)
    vm.sender = s
    with vm.expect_revert(M_ONLY_AUTHOR):
        contract.confirm_claim(cid, 99)


def test_every_revert_string_has_exactly_one_dedicated_test():
    check_revert_coverage(CONTRACT, __file__, globals(), expected_count=23)
