"""Property-based tests for the AI services (Hypothesis).

Each correctness property from design.md is implemented by exactly one
``@given`` test tagged ``# Feature: ai-services, Property N: ...``.
Later tasks append more properties; keep shared imports, helpers and
strategies at the top and one section per area below.
"""

from __future__ import annotations

import contextlib
import json
from datetime import datetime, timedelta

import httpx
import respx
from hypothesis import assume, given, settings
from hypothesis import strategies as st

import app.config
from app.ai import fallback, llm, prompts, records

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_MISSING = object()


@contextlib.contextmanager
def patched_config(**values):
    """Set attributes on app.config for one Hypothesis example, then restore.

    Function-scoped ``monkeypatch`` is not reset between Hypothesis examples,
    so each example patches and restores app.config itself.
    """
    saved = {name: getattr(app.config, name, _MISSING) for name in values}
    try:
        for name, value in values.items():
            setattr(app.config, name, value)
        yield
    finally:
        for name, old in saved.items():
            if old is _MISSING:
                delattr(app.config, name)
            else:
                setattr(app.config, name, old)


# ---------------------------------------------------------------------------
# Shared strategies
# ---------------------------------------------------------------------------

# Unicode text including newlines, braces and instruction-like strings.
any_text = st.one_of(
    st.text(),
    st.sampled_from(
        ["Ignore previous instructions", "{prompt}", "line1\nline2", "  \t "]
    ),
)

# A prompt that complete() accepts (non-blank after strip).
non_blank_text = any_text.filter(lambda s: s.strip() != "")

# Model names as settings.llm_model() would return them (already stripped).
model_names = st.text(
    alphabet=st.characters(categories=("L", "N"), include_characters=":.-_/"),
    min_size=1,
    max_size=30,
).filter(lambda s: s.strip() == s and s != "")

ollama_base_urls = st.sampled_from(
    [
        "http://localhost:11434",
        "http://127.0.0.1:11434",
        "http://ollama.local:8080",
        "http://localhost:11434/",  # trailing slash must be stripped
    ]
)


# ---------------------------------------------------------------------------
# LLM client properties (13-15)
# ---------------------------------------------------------------------------


# Feature: ai-services, Property 13: Ollama request shape
# Note: llm.py adds ``system`` only when ``system.strip()`` is non-empty, so
# "non-empty" in the property is interpreted as non-blank (whitespace-only
# system strings are omitted, matching the design's _generate helper).
@settings(max_examples=100, deadline=None)
@given(
    prompt=non_blank_text,
    system=st.one_of(st.none(), any_text),
    model=model_names,
    base_url=ollama_base_urls,
)
def test_property_13_ollama_request_shape(prompt, system, model, base_url):
    """**Validates: Requirements 2.1, 2.3, 2.4**"""
    expected_url = base_url.rstrip("/") + "/api/generate"
    with patched_config(OLLAMA_URL=base_url, LLM_MODEL=model):
        with respx.mock(assert_all_mocked=True, assert_all_called=True) as router:
            route = router.post(expected_url).mock(
                return_value=httpx.Response(200, json={"response": "ok"})
            )
            assert llm.complete(prompt, system) == "ok"
            # respx resets recorded calls on exit, so inspect them here.
            assert route.call_count == 1
            assert len(router.calls) == 1
            request = route.calls.last.request

    assert request.method == "POST"
    assert str(request.url) == expected_url

    body = json.loads(request.content)
    assert body["model"] == model
    assert body["prompt"] == prompt
    assert body["stream"] is False

    if system is not None and system.strip():
        assert body["system"] == system
        assert set(body) == {"model", "prompt", "stream", "system"}
    else:
        assert "system" not in body
        assert set(body) == {"model", "prompt", "stream"}


# Whitespace padding that str.strip() removes (ASCII and Unicode spaces).
whitespace_padding = st.text(
    alphabet=st.sampled_from([" ", "\t", "\n", "\r", "\x0b", "\x0c", "\u00a0", "\u3000"]),
    max_size=10,
)


# Feature: ai-services, Property 14: Successful responses are returned stripped
@settings(max_examples=100, deadline=None)
@given(text=non_blank_text, lead=whitespace_padding, trail=whitespace_padding)
def test_property_14_successful_responses_are_stripped(text, lead, trail):
    """**Validates: Requirements 2.2**"""
    padded = lead + text + trail
    base_url = "http://localhost:11434"
    with patched_config(OLLAMA_URL=base_url, LLM_MODEL="test-model"):
        with respx.mock(assert_all_mocked=True, assert_all_called=True) as router:
            route = router.post(base_url + "/api/generate").mock(
                return_value=httpx.Response(200, json={"response": padded})
            )
            result = llm.complete("What is my favourite flower?")
            assert route.call_count == 1

    assert result == text.strip()
    assert result == padded.strip()


# --- Property 15 strategies -------------------------------------------------
# Each failure mode is (kind, payload, expected message fragment). ``kind`` is
# "raise" (respx side effect raising an httpx exception) or "respond" (respx
# returns this httpx.Response).

_TIMEOUT_EXCS = [
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.WriteTimeout,
    httpx.PoolTimeout,
]
_TRANSPORT_EXCS = [
    httpx.ConnectError,
    httpx.ReadError,
    httpx.WriteError,
    httpx.CloseError,
    httpx.RemoteProtocolError,
    httpx.LocalProtocolError,
    httpx.ProxyError,
    httpx.UnsupportedProtocol,
]
_OTHER_HTTP_EXCS = [httpx.DecodingError, httpx.TooManyRedirects, httpx.HTTPError]

_exc_messages = st.text(
    alphabet=st.characters(categories=("L", "N", "Zs")), min_size=1, max_size=20
)

timeout_failures = st.builds(
    lambda cls, msg: ("raise", cls(msg), "timed out"),
    st.sampled_from(_TIMEOUT_EXCS),
    _exc_messages,
)
transport_failures = st.builds(
    lambda cls, msg: ("raise", cls(msg), "Cannot reach Ollama"),
    st.sampled_from(_TRANSPORT_EXCS),
    _exc_messages,
)
other_http_failures = st.builds(
    lambda cls, msg: ("raise", cls(msg), "Ollama request failed"),
    st.sampled_from(_OTHER_HTTP_EXCS),
    _exc_messages,
)

# Any status outside 2xx. 1xx is included; httpx/respx return mocked
# informational responses as-is (follow_redirects is off, so 3xx too).
non_2xx_statuses = st.one_of(
    st.integers(min_value=100, max_value=199), st.integers(min_value=300, max_value=599)
)
status_failures = st.builds(
    lambda code, body: (
        "respond",
        httpx.Response(code, json={"response": body}),
        f"HTTP {code}",
    ),
    non_2xx_statuses,
    st.text(max_size=20),
)


def _is_invalid_json(raw: bytes) -> bool:
    try:
        json.loads(raw)
    except ValueError:
        return True
    return False


invalid_json_bodies = st.one_of(
    st.text(min_size=1, max_size=30).map(lambda s: s.encode("utf-8")),
    st.binary(min_size=1, max_size=30),
    st.just(b"not json"),
    st.just(b""),
).filter(_is_invalid_json)
invalid_json_failures = invalid_json_bodies.map(
    lambda raw: ("respond", httpx.Response(200, content=raw), "invalid JSON")
)

_json_scalars = st.one_of(
    st.none(), st.booleans(), st.integers(), st.floats(allow_nan=False), st.text()
)
_json_values = st.recursive(
    _json_scalars,
    lambda children: st.one_of(
        st.lists(children, max_size=3),
        st.dictionaries(st.text(max_size=5), children, max_size=3),
    ),
    max_leaves=5,
)
_non_str_json = _json_values.filter(lambda v: not isinstance(v, str))

non_object_json = _json_values.filter(lambda v: not isinstance(v, dict))
missing_response_json = st.dictionaries(
    st.text(max_size=8).filter(lambda k: k != "response"), _json_values, max_size=3
)
non_str_response_json = st.builds(
    lambda extra, value: {**extra, "response": value},
    missing_response_json,
    _non_str_json,
)
no_text_failures = st.one_of(
    non_object_json, missing_response_json, non_str_response_json
).map(
    # Serialize explicitly: httpx.Response(json=None) sends an empty body,
    # not the JSON literal ``null``.
    lambda body: (
        "respond",
        httpx.Response(
            200,
            content=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        ),
        "no text field",
    )
)

blank_response_failures = whitespace_padding.map(
    lambda blank: (
        "respond",
        httpx.Response(200, json={"response": blank}),
        "empty response",
    )
)

ollama_failures = st.one_of(
    timeout_failures,
    transport_failures,
    other_http_failures,
    status_failures,
    invalid_json_failures,
    no_text_failures,
    blank_response_failures,
)


# Feature: ai-services, Property 15: Every Ollama failure surfaces as LLMUnavailable
@settings(max_examples=200, deadline=None)
@given(failure=ollama_failures, prompt=non_blank_text)
def test_property_15_every_failure_is_llm_unavailable(failure, prompt):
    """**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**"""
    kind, payload, fragment = failure
    base_url = "http://localhost:11434"
    with patched_config(OLLAMA_URL=base_url, LLM_MODEL="test-model"):
        with respx.mock(assert_all_mocked=True, assert_all_called=True) as router:
            route = router.post(base_url + "/api/generate")
            if kind == "raise":
                route.mock(side_effect=payload)
            else:
                route.mock(return_value=payload)

            caught: BaseException | None = None
            try:
                llm.complete(prompt)
            except BaseException as exc:  # noqa: BLE001 - checking exact type
                caught = exc
            assert route.call_count == 1

    assert caught is not None, "complete() returned instead of raising"
    assert type(caught) is llm.LLMUnavailable, f"got {type(caught).__name__}: {caught}"
    message = str(caught)
    assert message.strip() != ""
    assert fragment in message

    if kind == "raise":
        # The original httpx exception is chained, not swallowed.
        assert caught.__cause__ is payload
    elif fragment == "invalid JSON":
        assert isinstance(caught.__cause__, ValueError)


# ---------------------------------------------------------------------------
# Record filter properties (1-2)
# ---------------------------------------------------------------------------
# Shared record strategies (reused by Properties 2, 3, 4, 8, 9).
#
# Bounds depend on ``now`` so that generated timestamps cluster around the
# reference time and the <= / >= boundaries (including date-only end of day)
# are exercised. Use ``records_with_now`` to draw (values, now) together.

# Naive Manila-local reference times, seconds precision (like now_manila()).
reference_times = st.datetimes(
    min_value=datetime(2000, 1, 1), max_value=datetime(2040, 12, 31)
).map(lambda dt: dt.replace(microsecond=0))

_bound_padding = st.sampled_from(["", " ", "  ", "\t", "\n"])

_junk_bound_strings = st.one_of(
    st.text(max_size=20),
    st.sampled_from(
        [
            "tomorrow",
            "2025-13-01",
            "2025-02-30",
            "2025/06/15",
            "2025-06-15T10:00:00",
            "2025-06-15 10:00",
            "2025-06-15 25:00:00",
            "15-06-2025",
            "2025-6-5",
            "0000-01-01",
            "   ",
        ]
    ),
)

_non_string_bounds = st.one_of(
    st.integers(),
    st.floats(allow_nan=False),
    st.booleans(),
    st.just(datetime(2025, 6, 15)),
    st.lists(st.integers(), max_size=2),
)


def timestamp_values(now: datetime) -> st.SearchStrategy:
    """Values for valid_from / valid_until: unset, near-now timestamps, junk."""
    near_datetime = st.integers(min_value=-3 * 86400, max_value=3 * 86400).map(
        lambda secs: (now + timedelta(seconds=secs)).strftime("%Y-%m-%d %H:%M:%S")
    )
    exact_now = st.just(now.strftime("%Y-%m-%d %H:%M:%S"))
    near_date = st.integers(min_value=-3, max_value=3).map(
        lambda days: (now + timedelta(days=days)).strftime("%Y-%m-%d")
    )
    valid_strings = st.builds(
        lambda lead, s, trail: lead + s + trail,
        _bound_padding,
        st.one_of(near_datetime, exact_now, near_date),
        _bound_padding,
    )
    return st.one_of(
        st.none(),
        st.just(""),
        valid_strings,
        valid_strings,  # weight parseable bounds more heavily
        _junk_bound_strings,
        _non_string_bounds,
    )


_trust_values = st.one_of(
    st.just("verified"),
    st.just("verified"),
    st.sampled_from(["unverified", "pending", "Verified", "verified ", ""]),
    st.none(),
    st.integers(),
)
_validity_values = st.one_of(
    st.sampled_from(["current", "archived", "Archived", "outdated", ""]),
    st.none(),
)
_conflict_values = st.one_of(
    st.none(),
    st.just(""),
    st.just(0),
    st.just([]),
    st.integers(min_value=1, max_value=99),
    st.text(min_size=1, max_size=5),
    st.lists(st.integers(), min_size=1, max_size=2),
)

# Fact text fields (memory and person columns) for later prompt/fallback props.
_fact_text = st.one_of(st.none(), st.text(max_size=30))


def record_dicts(now: datetime) -> st.SearchStrategy:
    """Memory- or person-shaped dicts with any subset of keys present."""
    return st.fixed_dictionaries(
        {},
        optional={
            "id": st.integers(min_value=1, max_value=10_000),
            "trust": _trust_values,
            "validity": _validity_values,
            "conflicts_with": _conflict_values,
            "valid_from": timestamp_values(now),
            "valid_until": timestamp_values(now),
            "title": _fact_text,
            "content": _fact_text,
            "name": _fact_text,
            "nickname": _fact_text,
            "relationship": _fact_text,
            "notes": _fact_text,
        },
    )


_non_dict_values = st.one_of(
    st.none(),
    st.integers(),
    st.text(max_size=10),
    st.lists(st.integers(), max_size=3),
    st.tuples(st.just("trust"), st.just("verified")),
)


def record_values(now: datetime) -> st.SearchStrategy:
    """Lists mixing record dicts and non-dict junk items."""
    item = st.one_of(record_dicts(now), record_dicts(now), _non_dict_values)
    return st.lists(item, max_size=12)


@st.composite
def records_with_now(draw):
    """Draw (values, now) where bounds in values cluster around now."""
    now = draw(reference_times)
    return draw(record_values(now)), now


# --- Independent usability oracle (spec definition, not records.py) --------

_ASCII_DIGITS = set("0123456789")


def _oracle_parse_bound(value):
    """Return (datetime, date_only) for a parseable bound, else None."""
    if not isinstance(value, str):
        return None
    text = value.strip()

    def digits(s):
        return s != "" and set(s) <= _ASCII_DIGITS

    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        if digits(text[:4]) and digits(text[5:7]) and digits(text[8:]):
            try:
                return datetime.fromisoformat(text), True
            except ValueError:
                return None
        return None
    if len(text) == 19 and text[10] == " " and text[13] == ":" and text[16] == ":":
        date_part, time_part = text[:10], text[11:]
        parts_ok = (
            text[4] == "-"
            and text[7] == "-"
            and all(digits(p) for p in (text[:4], text[5:7], text[8:10]))
            and all(digits(p) for p in (time_part[:2], time_part[3:5], time_part[6:]))
        )
        if not parts_ok:
            return None
        try:
            return datetime.fromisoformat(f"{date_part}T{time_part}"), False
        except ValueError:
            return None
    return None


def usability_oracle(value, now: datetime) -> bool:
    """Usable_Record per the spec glossary and Requirement 7."""
    if not isinstance(value, dict):
        return False
    if value.get("trust") != "verified":
        return False
    if value.get("validity") == "archived":
        return False
    if value.get("conflicts_with"):
        return False
    for key in ("valid_from", "valid_until"):
        bound = value.get(key)
        if bound is None or bound == "":
            continue  # unset bound: no restriction
        parsed = _oracle_parse_bound(bound)
        if parsed is None:
            return False
        moment, date_only = parsed
        if key == "valid_from":
            if moment > now:
                return False
        else:
            if date_only:
                moment = moment.replace(hour=23, minute=59, second=59)
            if moment < now:
                return False
    return True


# Feature: ai-services, Property 1: Filter matches the usability oracle
@settings(max_examples=300, deadline=None)
@given(data=records_with_now())
def test_property_1_filter_matches_usability_oracle(data):
    """**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8**"""
    values, now = data
    expected = [v for v in values if usability_oracle(v, now)]
    result = records.usable_records(values, now)

    assert len(result) == len(expected)
    # Same objects (identity), same order.
    assert all(r is e for r, e in zip(result, expected))


# Feature: ai-services, Property 2: Filter idempotence
@settings(max_examples=200, deadline=None)
@given(data=records_with_now())
def test_property_2_filter_idempotence(data):
    """**Validates: Requirements 7.9, 13.5**"""
    values, now = data
    once = records.usable_records(values, now)
    twice = records.usable_records(once, now)

    assert twice == once
    # Same objects (identity), same order.
    assert len(twice) == len(once)
    assert all(a is b for a, b in zip(twice, once))


# ---------------------------------------------------------------------------
# Prompt builder properties (3-7)
# ---------------------------------------------------------------------------
# Shared marked-record strategies (reused by Properties 3, 4 and 9).
#
# Every text field of every generated record dict carries a unique marker
# ``ZQX{iii}F{j}MARK`` (iii = zero-padded list position, j = field index), so
# all markers have the same length and none is a substring of another. Filler
# text, questions and the fixed prompt scaffolding never contain ``Z``, so a
# marker can only appear in output if that exact field value was rendered;
# clean() only collapses whitespace and markers contain none.

TEXT_FIELDS = ("title", "content", "name", "nickname", "relationship", "notes")


def make_marker(index: int, field: str) -> str:
    """Unique fixed-length marker for field ``field`` of the record at ``index``."""
    return f"ZQX{index:03d}F{TEXT_FIELDS.index(field)}MARK"


# Text that can never contain (part of the start of) a marker.
marker_free_text = st.text(
    alphabet=st.characters(exclude_characters="Zz"), max_size=20
)


@st.composite
def marked_records_with_now(draw):
    """Draw (values, now, markers).

    ``values`` is like ``record_values(now)`` but every text field present on a
    dict is ``filler + marker + filler``; ``markers[i]`` maps field -> marker
    for ``values[i]`` (empty dict for non-dict items). Each text field is
    independently absent or marked, so memory- and person-shaped records occur.
    """
    now = draw(reference_times)
    base = draw(record_values(now))
    values, markers = [], []
    for index, item in enumerate(base):
        if not isinstance(item, dict):
            values.append(item)
            markers.append({})
            continue
        record = {k: v for k, v in item.items() if k not in TEXT_FIELDS}
        field_markers = {}
        for field in TEXT_FIELDS:
            if draw(st.booleans()):
                marker = make_marker(index, field)
                lead = draw(marker_free_text)
                trail = draw(marker_free_text)
                record[field] = f"{lead}{marker}{trail}"
                field_markers[field] = marker
        values.append(record)
        markers.append(field_markers)
    return values, now, markers


# Feature: ai-services, Property 3: Prompt excludes text from dropped records
@settings(max_examples=200, deadline=None)
@given(data=marked_records_with_now(), question=marker_free_text)
def test_property_3_prompt_excludes_dropped_records(data, question):
    """**Validates: Requirements 6.5, 13.6**"""
    values, now, markers = data
    prompt = prompts.build_prompt(question, values, now)

    for value, field_markers in zip(values, markers):
        if usability_oracle(value, now):
            continue
        for field, marker in field_markers.items():
            assert marker not in prompt, (
                f"dropped record's {field} marker {marker} leaked into prompt"
            )


# --- Property 4 helpers -------------------------------------------------------
# Kind detection mirrors the spec's person/memory rule (key presence): a person
# has a ``name``/``relationship`` key and no ``content``/``title`` key. Memory
# lines render title/content only; person lines render name, nickname,
# relationship and notes. Every present text field carries a non-blank marker,
# so a record is renderable iff it has a present field its kind renders.

_MEMORY_RENDERED = ("title", "content")
_PERSON_RENDERED = ("name", "nickname", "relationship", "notes")


def _oracle_rendered_fields(record: dict) -> tuple[str, ...]:
    is_person_kind = ("name" in record or "relationship" in record) and not (
        "content" in record or "title" in record
    )
    return _PERSON_RENDERED if is_person_kind else _MEMORY_RENDERED


def _split_prompt(prompt: str) -> tuple[list[str], str]:
    """Return (RECORDS section lines, QUESTION section text)."""
    head = "RECORDS:\n"
    assert prompt.startswith(head)
    records_part, sep, question_part = prompt[len(head):].partition("\n\nQUESTION:\n")
    assert sep, "QUESTION section missing"
    return records_part.split("\n"), question_part


# Feature: ai-services, Property 4: Context has one line per usable record, in caller order
@settings(max_examples=200, deadline=None)
@given(data=marked_records_with_now(), question=marker_free_text)
def test_property_4_context_lines_match_usable_records(data, question):
    """**Validates: Requirements 6.1, 6.4, 6.6, 6.8**"""
    values, now, markers = data
    prompt = prompts.build_prompt(question, values, now)
    lines, question_section = _split_prompt(prompt)

    # Expected: for each usable record with renderable text, the set of markers
    # its line must contain, in caller order.
    expected = []
    for value, field_markers in zip(values, markers):
        if not usability_oracle(value, now):
            continue
        rendered = {
            field_markers[f] for f in _oracle_rendered_fields(value) if f in field_markers
        }
        if rendered:
            expected.append(rendered)

    all_markers = {m for fm in markers for m in fm.values()}

    if not expected:
        assert lines == ["(No records found.)"]
    else:
        assert len(lines) == len(expected)
        for line, wanted in zip(lines, expected):
            assert line.startswith("- ")
            present = {m for m in all_markers if m in line}
            assert present == wanted, f"line {line!r}: got {present}, want {wanted}"

    # Independent whitespace collapse; equivalent to records.clean for str input.
    assert question_section == " ".join(question.split())


# --- Shared language / caregiver strategies (reused by Properties 6, 7, 11, 12)

# Known language keys with case/whitespace variants, plus missing, non-string
# and arbitrary text values (which normalize to the fil-en default).
language_values = st.one_of(
    st.sampled_from(
        [
            "en", "fil", "fil-en",
            "EN", "Fil", "FIL-EN", " FIL ", "\ten\n", " fil-en ",
            "tl", "es", "english", "filipino", "fil_en", "", "   ",
        ]
    ),
    st.none(),
    st.integers(),
    st.text(max_size=10),
)

# Caregiver name/nickname values: arbitrary text including braces, newlines,
# blank strings, placeholder-like strings, plus None and non-string junk.
_caregiver_name_values = st.one_of(
    st.none(),
    st.text(max_size=20),
    st.sampled_from(
        ["Ana", "Ana Santos", "", "   ", "{name}", "{no_data_reply}",
         "{language_instruction}", "line1\nline2", "\t{}\t"]
    ),
    st.integers(),
)

caregiver_values = st.one_of(
    st.none(),
    st.fixed_dictionaries(
        {},
        optional={
            "name": _caregiver_name_values,
            "nickname": _caregiver_name_values,
            "relationship": _fact_text,
            "is_caregiver": st.sampled_from([0, 1]),
        },
    ),
    # Non-dict junk passed where a caregiver dict is expected.
    st.integers(),
    st.text(max_size=10),
    st.lists(st.integers(), max_size=2),
)


# Feature: ai-services, Property 6: System prompt embeds the matching no-data reply
@settings(max_examples=200, deadline=None)
@given(language=language_values, caregiver=caregiver_values)
def test_property_6_system_prompt_embeds_no_data_reply(language, caregiver):
    """**Validates: Requirements 5.2, 5.5, 5.6, 5.7**"""
    reply = fallback.no_data_reply(language, caregiver)
    instruction = prompts.LANGUAGE_INSTRUCTIONS[prompts.normalize_language(language)]

    # A caregiver name could itself contain an instruction string; exclude
    # those so the "exactly one instruction" check is meaningful.
    assume(not any(i in reply for i in prompts.LANGUAGE_INSTRUCTIONS.values()))

    system = prompts.build_system_prompt(language, caregiver)

    assert reply in system
    assert instruction in system
    present = [i for i in prompts.LANGUAGE_INSTRUCTIONS.values() if i in system]
    assert present == [instruction]
    # Placeholders are fully substituted from the template's own slots.
    assert system.count(reply) >= 1
    assert "{language_instruction}" not in system.replace(reply, "")
    assert "{no_data_reply}" not in system.replace(reply, "")


# --- Property 7 strategy ------------------------------------------------------
#
# "Not one of en / fil / fil-en" is interpreted as "does not normalize to one of
# those keys": normalize_language (and fallback_language) match after strip()
# and lower(), so values like " EN " or "Fil" are known languages, not unknown
# ones. Such values are filtered out here.


def _normalizes_to_known(value) -> bool:
    return (
        isinstance(value, str)
        and value.strip().lower() in prompts.LANGUAGE_INSTRUCTIONS
    )


unknown_language_values = st.one_of(
    language_values,
    st.text(),
    st.integers(),
    st.floats(allow_nan=True),
    st.none(),
    st.booleans(),
    st.lists(st.sampled_from(["en", "fil", "fil-en"]), max_size=3),
    st.dictionaries(st.text(max_size=5), st.text(max_size=5), max_size=2),
    st.binary(max_size=8),
).filter(lambda v: not _normalizes_to_known(v))


# Feature: ai-services, Property 7: Unknown language falls back to fil-en in the system prompt
@settings(max_examples=200, deadline=None)
@given(language=unknown_language_values, caregiver=caregiver_values)
def test_property_7_unknown_language_defaults_to_fil_en(language, caregiver):
    """**Validates: Requirements 5.8**"""
    assert prompts.normalize_language(language) == "fil-en"
    assert prompts.build_system_prompt(language, caregiver) == prompts.build_system_prompt(
        "fil-en", caregiver
    )


# ---------------------------------------------------------------------------
# Fallback properties (8-12)
# ---------------------------------------------------------------------------
# Fact text for fallback rendering: arbitrary text plus values that stress the
# template filler (braces, placeholder names, trailing punctuation, embedded
# newlines/tabs, blank strings).
_rich_fact_text = st.one_of(
    st.none(),
    st.text(max_size=30),
    st.sampled_from(
        [
            "{who}", "{relationship}", "{notes}", "{text}", "{}", "{0}", "{name}",
            "Sunflowers!", "Is it Sunday?", "Mass at Malolos.", "Ana", "ana",
            "daughter", "line1\nline2", "\ttabbed\t", "", "   ", "a {who} b",
            "Ends with dot.", "no terminal",
        ]
    ),
)


def fallback_record_dicts(now: datetime) -> st.SearchStrategy:
    """Like ``record_dicts`` but with richer fact text for template filling."""
    return st.fixed_dictionaries(
        {},
        optional={
            "id": st.integers(min_value=1, max_value=10_000),
            "trust": _trust_values,
            "validity": _validity_values,
            "conflicts_with": _conflict_values,
            "valid_from": timestamp_values(now),
            "valid_until": timestamp_values(now),
            "title": _rich_fact_text,
            "content": _rich_fact_text,
            "name": _rich_fact_text,
            "nickname": _rich_fact_text,
            "relationship": _rich_fact_text,
            "notes": _rich_fact_text,
        },
    )


_non_blank_rich_text = _rich_fact_text.filter(
    lambda v: v is not None and v.strip() != ""
)


@st.composite
def _usable_renderable_record(draw):
    """A verified, current, unbounded record with at least one renderable field."""
    record = draw(
        st.fixed_dictionaries(
            {"trust": st.just("verified")},
            optional={
                "validity": st.sampled_from(["current", "outdated", ""]),
                "conflicts_with": st.sampled_from([None, "", 0]),
                "nickname": _rich_fact_text,
                "relationship": _rich_fact_text,
                "notes": _rich_fact_text,
            },
        )
    )
    if draw(st.booleans()):
        # Memory: non-blank content or title (key presence makes it a memory).
        record[draw(st.sampled_from(["content", "title"]))] = draw(_non_blank_rich_text)
    else:
        # Person: non-blank name, no memory keys.
        record["name"] = draw(_non_blank_rich_text)
    return record


@st.composite
def fallback_records_with_now(draw):
    """Draw (values, now) mixing rich record dicts and non-dict junk.

    One usable, renderable record is inserted at a random position so the
    "at least one usable record has text" precondition rarely filters inputs.
    """
    now = draw(reference_times)
    item = st.one_of(
        fallback_record_dicts(now), fallback_record_dicts(now), _non_dict_values
    )
    values = draw(st.lists(item, max_size=10))
    if draw(st.integers(min_value=0, max_value=9)) > 0:
        position = draw(st.integers(min_value=0, max_value=len(values)))
        values.insert(position, draw(_usable_renderable_record()))
    return values, now


# --- Independent expected-sentence renderer (spec wording, not fallback.py) ---


def _oracle_clean(value) -> str:
    """Independent whitespace collapse: None -> "", else collapsed str(value)."""
    if value is None:
        return ""
    return " ".join(str(value).split())


def _oracle_lang(language) -> str:
    if isinstance(language, str) and language.strip().lower() == "fil":
        return "fil"
    return "en"


def _oracle_sentence(record: dict, lang: str) -> str:
    """Expected sentence built from the TEMPLATES wording by concatenation."""
    is_person_kind = _oracle_rendered_fields(record) is _PERSON_RENDERED
    if not is_person_kind:
        text = _oracle_clean(record.get("content")) or _oracle_clean(record.get("title"))
        if not text:
            return ""
        if text[-1] not in ".!?":
            text = text + "."
        return text

    name = _oracle_clean(record.get("name"))
    nickname = _oracle_clean(record.get("nickname"))
    relationship = _oracle_clean(record.get("relationship"))
    notes = _oracle_clean(record.get("notes"))

    if name:
        who = name
        if nickname and nickname.casefold() != name.casefold():
            who = name + " (" + nickname + ")"
    else:
        who = nickname

    if not who:
        return notes  # notes alone (already stripped), or ""

    if lang == "fil":
        if relationship:
            sentence = "Si " + who + " ay ang iyong " + relationship + "."
        else:
            sentence = "Si " + who + "."
    else:
        if relationship:
            sentence = who + " is your " + relationship + "."
        else:
            sentence = who + "."
    if notes:
        sentence = sentence + " " + notes
    return sentence


# Feature: ai-services, Property 8: Fallback output is exactly the templated usable records
@settings(max_examples=200, deadline=None)
@given(data=fallback_records_with_now(), language=language_values)
def test_property_8_fallback_is_exactly_templated_usable_records(data, language):
    """**Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.6**"""
    values, now = data
    lang = _oracle_lang(language)
    assert fallback.fallback_language(language) == lang

    usable = [v for v in values if usability_oracle(v, now)]
    expected_sentences = []
    for record in usable:
        expected = _oracle_sentence(record, lang)
        # Each per-record rendering matches the independent template oracle.
        assert fallback.render_sentence(record, lang) == expected, record
        if expected:
            expected_sentences.append(expected)

    assume(expected_sentences)  # at least one usable record renders text

    answer = fallback.build_fallback_answer(values, language, now=now)
    assert answer == " ".join(expected_sentences)
