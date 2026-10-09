"""SET-3 GET /dashboard tests, including the engagement-only constraint."""

# Keys that would represent a cognitive score / rating — these must NEVER
# appear in the dashboard activity summary (PRODUCT.md + ARCHITECTURE 10/11).
_FORBIDDEN_SUMMARY_KEYS = {
    "score",
    "rating",
    "percentage",
    "accuracy",
    "correct",
    "incorrect",
}


def test_patient_cannot_read_dashboard(client, patient_headers):
    assert client.get("/dashboard", headers=patient_headers).status_code == 403


def test_dashboard_returns_all_sections(client, caregiver_headers):
    resp = client.get("/dashboard", headers=caregiver_headers)
    assert resp.status_code == 200
    data = resp.json()

    for section in (
        "unverified_memories",
        "conflicting_pairs",
        "outdated_memories",
        "medication_attention",
        "flagged_answers",
        "activity_summary",
    ):
        assert section in data, "missing section %r" % (section,)
        assert isinstance(data[section], list)

    # Seeded demo rows should be present in each section.
    unverified_ids = {m["id"] for m in data["unverified_memories"]}
    assert "mem-ai-1" in unverified_ids  # the ai_suggested one
    assert all(m["trust"] == "unverified" for m in data["unverified_memories"])

    # Conflicting pair deduped to a single entry.
    assert len(data["conflicting_pairs"]) == 1
    assert data["conflicting_pairs"][0]["id"] == "mem-conf-a"

    outdated_ids = {m["id"] for m in data["outdated_memories"]}
    assert "mem-outdated-1" in outdated_ids

    med_ids = {m["id"] for m in data["medication_attention"]}
    assert "medlog-unconfirmed-1" in med_ids  # past-due unconfirmed
    assert "medlog-skipped-1" in med_ids      # skipped
    # Joined medication name/dose present.
    assert all("medication_name" in m for m in data["medication_attention"])

    flagged_ids = {a["id"] for a in data["flagged_answers"]}
    assert "asst-flagged-1" in flagged_ids

    assert len(data["activity_summary"]) >= 1


def test_activity_summary_is_engagement_only(client, caregiver_headers):
    data = client.get("/dashboard", headers=caregiver_headers).json()
    summary = data["activity_summary"]
    assert summary, "activity_summary should not be empty with seeded data"

    for entry in summary:
        # Only engagement fields allowed.
        assert "played_count" in entry
        assert "skipped_count" in entry
        # No cognitive-score fields anywhere in the entry.
        offending = _FORBIDDEN_SUMMARY_KEYS & set(entry.keys())
        assert not offending, "forbidden score keys present: %r" % (offending,)
