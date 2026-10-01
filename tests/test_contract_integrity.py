import ast
import pathlib
import re
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "contracts" / "CapScope.py"
SOURCE = SOURCE_PATH.read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)

EXPECTED_REVERTS = {
    "Invalid wallet address",
    "Text is empty",
    "Text is too long",
    "Label is empty",
    "Label is too long",
    "Note is empty",
    "Note is too long",
    "Text or label contains a reserved token",
    "Unknown cap id",
    "The cap amount is out of range",
    "The claimant cannot be the author",
    "This cap already exists",
    "Only the named claimant may record a claim",
    "The claim amount is out of range",
    "No room for further claims",
    "The cap has been used up",
    "Only the author may dispute a claim",
    "No such claim",
    "This claim has already been disputed",
}


class ContractIntegrityTests(unittest.TestCase):
    def test_header_is_exact_v0216(self):
        self.assertEqual(
            SOURCE.splitlines()[:4],
            [
                "# v0.2.16",
                '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }',
                "",
                "from genlayer import *",
            ],
        )

    def test_exact_revert_set(self):
        found = set(re.findall(r'UserError\(\s*"([^"]+)"', SOURCE))
        self.assertEqual(found, EXPECTED_REVERTS)

    def test_every_revert_has_an_explicit_test_literal(self):
        tests = (ROOT / "tests" / "test_state_machine.py").read_text(encoding="utf-8")
        for message in EXPECTED_REVERTS:
            with self.subTest(message=message):
                self.assertIn(message, tests)

    def test_one_model_call_in_classifier_only(self):
        self.assertEqual(SOURCE.count("gl.nondet.exec_prompt"), 1)
        self.assertEqual(SOURCE.count("gl.vm.run_nondet_unsafe"), 1)
        classifier = SOURCE[
            SOURCE.index("def _classify_scope"):
            SOURCE.index("# WRITES")
        ]
        self.assertIn("gl.nondet.exec_prompt", classifier)

    def test_no_forbidden_features_or_preview(self):
        for forbidden in (
            "import genlayer as gl",
            "gl.contract.Contract",
            "run_nondet(",
            "message.raw",
            "message_raw",
            "nondet.web.render",
            "time.time",
            "datetime.now",
            "emit_transfer",
            "gl.evm",
        ):
            self.assertNotIn(forbidden, SOURCE)
        names = {
            node.name for node in ast.walk(TREE)
            if isinstance(node, ast.FunctionDef)
        }
        self.assertFalse(
            any(name.startswith(("preview_", "classify_", "dry_run_")) for name in names)
        )
        self.assertNotIn("reset_pool", names)

    def test_payable_law_is_not_duplicated(self):
        self.assertEqual(SOURCE.count("min(amount,"), 1)
        record_claim = SOURCE[
            SOURCE.index("def record_claim"):
            SOURCE.index("def dispute_claim")
        ]
        self.assertIn("self._payable(record, amount)", record_claim)
        self.assertNotIn("record.cap_amount) - int(record.used)", record_claim)

    def test_prompt_does_not_receive_amount_wallet_or_state(self):
        classifier = SOURCE[
            SOURCE.index("def _classify_scope"):
            SOURCE.index("# WRITES")
        ]
        for forbidden in ("cap_amount", "claimant_wallet", "record.used", "claim_count"):
            self.assertNotIn(forbidden, classifier)

    def test_id_excludes_amount_and_uses_normalized_text(self):
        id_method = SOURCE[
            SOURCE.index("def _cap_id_for"):
            SOURCE.index("def _normalized_cap_id")
        ]
        self.assertNotIn("cap_amount", id_method)
        self.assertIn("CAP_SCOPE:CAP:V1|", id_method)
        open_method = SOURCE[
            SOURCE.index("def open_cap"):
            SOURCE.index("def record_claim")
        ]
        self.assertIn("self._normalize_text(clean_text)", open_method)

    def test_views_return_empty_object_string_for_missing_ids(self):
        for name in ("get_cap", "get_claim", "get_claims"):
            start = SOURCE.index(f"def {name}")
            next_positions = [
                SOURCE.find(f"def {other}", start + 1)
                for other in ("get_claim", "get_claims", "get_rubric", "get_limits")
            ]
            ends = [pos for pos in next_positions if pos > start]
            end = min(ends) if ends else len(SOURCE)
            self.assertIn('return "{}"', SOURCE[start:end])

    def test_dispute_cannot_mutate_recorded_numbers(self):
        method = SOURCE[
            SOURCE.index("def dispute_claim"):
            SOURCE.index("# VIEWS")
        ]
        self.assertNotIn("claim_payable[", method)
        self.assertNotIn("record.used", method)

    def test_public_interface_is_exact(self):
        public_names = set()
        for node in ast.walk(TREE):
            if not isinstance(node, ast.FunctionDef):
                continue
            decorators = {ast.unparse(item) for item in node.decorator_list}
            if any(item.startswith("gl.public") for item in decorators):
                public_names.add(node.name)
        self.assertEqual(
            public_names,
            {
                "open_cap",
                "record_claim",
                "dispute_claim",
                "get_cap",
                "get_claim",
                "get_claims",
                "get_rubric",
                "get_limits",
            },
        )

    def test_locked_validation_order(self):
        open_method = SOURCE[
            SOURCE.index("def open_cap"):
            SOURCE.index("def record_claim")
        ]
        open_markers = [
            "self._normalize_wallet",
            "self._clean_open_fields",
            '"The cap amount is out of range"',
            '"The claimant cannot be the author"',
            '"This cap already exists"',
            "self._classify_scope",
        ]
        self.assertEqual(
            [open_method.index(marker) for marker in open_markers],
            sorted(open_method.index(marker) for marker in open_markers),
        )

        record_method = SOURCE[
            SOURCE.index("def record_claim"):
            SOURCE.index("def dispute_claim")
        ]
        record_markers = [
            "self._require_cap",
            "self._clean_note",
            '"Only the named claimant may record a claim"',
            '"The claim amount is out of range"',
            '"No room for further claims"',
            "self._payable(record, amount)",
            '"The cap has been used up"',
        ]
        self.assertEqual(
            [record_method.index(marker) for marker in record_markers],
            sorted(record_method.index(marker) for marker in record_markers),
        )

        dispute_method = SOURCE[
            SOURCE.index("def dispute_claim"):
            SOURCE.index("# VIEWS")
        ]
        dispute_markers = [
            "self._require_cap",
            "self._clean_note",
            '"Only the author may dispute a claim"',
            '"No such claim"',
            '"This claim has already been disputed"',
            "self.dispute_note[key] = clean_note",
        ]
        self.assertEqual(
            [dispute_method.index(marker) for marker in dispute_markers],
            sorted(dispute_method.index(marker) for marker in dispute_markers),
        )

    def test_main_view_exposes_verdict_scope_and_accounting(self):
        method = SOURCE[
            SOURCE.index("def get_cap"):
            SOURCE.index("def get_claim")
        ]
        for field in (
            '"author"',
            '"outcome"',
            '"claimant_wallet"',
            '"claimant_label"',
            '"text"',
            '"cap_amount"',
            '"scope"',
            '"used"',
            '"claim_count"',
            '"remaining"',
            '"exhausted"',
        ):
            with self.subTest(field=field):
                self.assertIn(field, method)


if __name__ == "__main__":
    unittest.main()
