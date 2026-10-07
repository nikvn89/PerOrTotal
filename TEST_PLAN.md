# TEST_PLAN

## Cases (each pair shares its surface and carries opposite labels; the CapScope set, unchanged)

| Case | Text | Expected |
|---|---|---|
| A1 | Our liability is limited to the agreed sum in total. | AGGREGATE → POOL |
| A2 | Across all claims together, we will not pay more than the agreed sum. | AGGREGATE → POOL |
| A3 | The agreed sum is the most we will ever pay under this arrangement. | AGGREGATE → POOL |
| A4 | Once the agreed sum has been paid out, nothing further is payable. | AGGREGATE → POOL |
| A5 | Every payment we make is taken from one agreed sum. | AGGREGATE → POOL |
| P1 | Our liability is limited to the agreed sum for each incident. | PER_EVENT → FRESH |
| P2 | For any one claim, we will not pay more than the agreed sum. | PER_EVENT → FRESH |
| P3 | The agreed sum is the most we will pay on any single occasion. | PER_EVENT → FRESH |
| P4 | Each new incident starts again from the full agreed sum. | PER_EVENT → FRESH |
| P5 | Every claim is measured on its own against the agreed sum. | PER_EVENT → FRESH |

`CAPACCORD_KILLSET_CHECK.py` proves no word or word pair separates the classes, and that the rubric shares no content
word with any case.

## Deterministic behaviour → test (`tests/contract/test_capaccord.py`, Direct Mode, model mocked)

| Behaviour | Test |
|---|---|
| The tooth: POOL draws down, FRESH renews — after both parties act | `test_tooth_pool_draws_down_and_fresh_renews`, `test_reading_is_frozen_at_open_and_shown_before_acceptance` |
| Claimant acceptance of the exact text | `test_nothing_can_be_claimed_before_the_claimant_accepts`, `test_the_claimant_accepts_the_exact_text_by_its_hash`, `test_declined_cap_stays_closed`, `test_the_author_cannot_accept_for_the_claimant`, `test_revert_text_hash_mismatch` |
| Author confirmation of each claim | `test_a_recorded_claim_draws_nothing_until_confirmed`, `test_rejected_claim_draws_nothing_and_keeps_its_note`, `test_pool_payable_is_computed_in_confirmation_order`, `test_fresh_payable_is_capped_per_claim`, `test_a_claim_is_decided_once`, `test_the_claimant_cannot_confirm_their_own_claim` |
| Limits | `test_used_up_pool_refuses_new_claims_but_fresh_does_not`, `test_the_claim_cap_counts_every_claim` |
| Roles and ids | `test_a_stranger_is_refused_by_every_restricted_write`, `test_cap_id_recipe_and_whitespace_variants`, `test_another_author_gets_another_cap`, `test_wallets_are_stored_lower_case_and_ids_accept_0x` |
| Fail-safe, validator, prompt | `test_fail_safe_on_unparseable_output`, `test_fail_safe_on_unknown_label`, `test_fenced_json_output_is_parsed`, `test_validator_rejects_disagreement_and_bad_shapes`, `test_prompt_never_sees_wallets_amounts_or_state`, `test_reserved_tokens_are_refused_in_text_and_label` |
| The rubric is CapScope's, verbatim | `test_rubric_is_the_capscope_rubric_verbatim`, `test_limits_and_rubric` |
| Every revert string has a dedicated test; check order | `test_every_revert_string_has_exactly_one_dedicated_test`, `test_check_order_claimant_before_state`, `test_check_order_author_before_claim_index` |
| Ids shared with the frontend | `test_vectors_match_contract` |

Frontend (`tests/js/*.test.ts`): Python-string parity, cap ids and text hashes against the contract vectors, view
parsing, every revert sentence equal to the source and fired in the source's order, the payable preview, postconditions
for every write, receipt classification, calldata sizes, source hash, repository rules.
