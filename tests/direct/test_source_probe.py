import json


CONTRACT = "contracts/source_probe.py"
REVISION = "1380958329"
QUOTE = "landing in the Sea of Tranquility"
URL = rf"https://en\.wikipedia\.org/w/rest\.php/v1/revision/{REVISION}"


def mock_revision(vm, *, revision=REVISION, text=QUOTE, status=200):
    payload = {"id": int(revision), "source": text + "\n== References ==\nignored"}
    vm.clear_mocks()
    vm.mock_web(URL, {"status": status, "body": json.dumps(payload)})


def test_probe_records_exact_pinned_quote(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT)
    mock_revision(direct_vm, text=f"Apollo 11 landed in the {QUOTE} on July 20, 1969.")

    assert contract.inspect_wikipedia_snapshot(REVISION, QUOTE) == "MATCH"
    assert contract.get_last_result() == {
        "result": "MATCH",
        "revision_id": REVISION,
        "quote": QUOTE,
    }


def test_probe_distinguishes_missing_quote(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT)
    mock_revision(direct_vm, text="An unrelated introduction.")

    assert contract.inspect_wikipedia_snapshot(REVISION, QUOTE) == "TEXT_MISSING"


def test_probe_ignores_quote_outside_lead(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT)
    payload = {"id": int(REVISION), "source": "Lead text.\n== History ==\n" + QUOTE}
    direct_vm.clear_mocks()
    direct_vm.mock_web(URL, {"status": 200, "body": json.dumps(payload)})

    assert contract.inspect_wikipedia_snapshot(REVISION, QUOTE) == "TEXT_MISSING"


def test_probe_rejects_revision_mismatch(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT)
    mock_revision(direct_vm, revision="1380958000")

    assert contract.inspect_wikipedia_snapshot(REVISION, QUOTE) == "REVISION_MISMATCH"


def test_probe_reports_http_failure_without_claiming_match(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT)
    direct_vm.mock_web(URL, {"status": 503, "body": ""})

    assert contract.inspect_wikipedia_snapshot(REVISION, QUOTE) == "HTTP_503"


def test_only_deployer_can_run_probe(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_bob

    with direct_vm.expect_revert("Only the probe deployer"):
        contract.inspect_wikipedia_snapshot(REVISION, QUOTE)


def test_probe_rejects_unbounded_inputs(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT)

    with direct_vm.expect_revert("Revision ID is invalid"):
        contract.inspect_wikipedia_snapshot("x" * 17, QUOTE)
    with direct_vm.expect_revert("only digits"):
        contract.inspect_wikipedia_snapshot("1380958a", QUOTE)
    with direct_vm.expect_revert("short passage"):
        contract.inspect_wikipedia_snapshot(REVISION, "q" * 241)
