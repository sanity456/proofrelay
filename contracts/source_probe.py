# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import typing


class SourceAccessProbe(gl.Contract):
    owner: Address
    last_result: str
    last_revision: str
    last_quote: str

    def __init__(self):
        self.owner = gl.message.sender_address
        self.last_result = "NOT_RUN"
        self.last_revision = ""
        self.last_quote = ""

    @gl.public.write
    def inspect_wikipedia_snapshot(self, revision_id: str, expected_text: str) -> str:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError("Only the probe deployer may run this check")
        if not revision_id or len(revision_id) > 16:
            raise gl.vm.UserError("Revision ID is invalid")
        for character in revision_id:
            if character < "0" or character > "9":
                raise gl.vm.UserError("Revision ID must contain only digits")
        if not expected_text or len(expected_text) > 240:
            raise gl.vm.UserError("Enter a short passage to check")

        url = "https://en.wikipedia.org/w/rest.php/v1/revision/" + revision_id

        def fetch_snapshot_result() -> str:
            response = gl.nondet.web.get(url)
            if response.status != 200:
                return "HTTP_" + str(response.status)

            try:
                payload = json.loads(response.body.decode("utf-8"))
                fetched_revision = str(payload.get("id", ""))
                wikitext = payload.get("source", "")
            except (UnicodeDecodeError, json.JSONDecodeError, AttributeError, TypeError):
                return "INVALID_RESPONSE"

            if fetched_revision != revision_id:
                return "REVISION_MISMATCH"
            if not isinstance(wikitext, str) or not wikitext:
                return "INVALID_RESPONSE"
            intro = wikitext.split("\n==", 1)[0]
            if expected_text in intro:
                return "MATCH"
            return "TEXT_MISSING"

        result = gl.eq_principle.strict_eq(fetch_snapshot_result)
        self.last_result = result
        self.last_revision = revision_id
        self.last_quote = expected_text
        return result

    @gl.public.view
    def get_config(self) -> typing.Any:
        return {"product": "ProofRelay Source Probe", "rules_version": "probe-2"}

    @gl.public.view
    def get_last_result(self) -> typing.Any:
        return {
            "result": self.last_result,
            "revision_id": self.last_revision,
            "quote": self.last_quote,
        }
