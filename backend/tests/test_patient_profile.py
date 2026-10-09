"""SET-2 patient profile endpoint tests."""


def _patient_count(conn):
    return conn.execute("SELECT COUNT(*) FROM patient").fetchone()[0]


def test_patient_can_read_profile(client, patient_headers):
    resp = client.get("/patient", headers=patient_headers)
    assert resp.status_code == 200
    # Seeded profile exists; patient reads it to apply font scale / voice / mode.
    data = resp.json()
    assert "font_scale" in data
    assert "voice_enabled" in data
    assert "managed_mode" in data


def test_patient_cannot_update_profile(client, patient_headers):
    resp = client.put(
        "/patient", json={"full_name": "X"}, headers=patient_headers
    )
    assert resp.status_code == 403


def test_create_then_update_keeps_single_row(client, caregiver_headers, db_conn):
    # Start clean so we exercise the create path explicitly.
    db_conn.execute("DELETE FROM patient")
    db_conn.commit()
    assert _patient_count(db_conn) == 0

    create = client.put(
        "/patient",
        json={"full_name": "Elena Santos", "language": "fil-en", "font_scale": 1.6},
        headers=caregiver_headers,
    )
    assert create.status_code == 200
    assert _patient_count(db_conn) == 1

    update = client.put(
        "/patient",
        json={"preferred_name": "Lola Nena", "managed_mode": 1},
        headers=caregiver_headers,
    )
    assert update.status_code == 200
    assert _patient_count(db_conn) == 1  # still exactly one row

    data = update.json()
    assert data["id"] == 1
    assert data["full_name"] == "Elena Santos"
    assert data["preferred_name"] == "Lola Nena"
    assert data["managed_mode"] == 1


def test_create_requires_full_name(client, caregiver_headers, db_conn):
    db_conn.execute("DELETE FROM patient")
    db_conn.commit()
    resp = client.put(
        "/patient", json={"language": "en"}, headers=caregiver_headers
    )
    assert resp.status_code == 400


def test_invalid_language_rejected(client, caregiver_headers):
    resp = client.put(
        "/patient",
        json={"full_name": "X", "language": "es"},
        headers=caregiver_headers,
    )
    assert resp.status_code == 400


def test_valid_languages_accepted(client, caregiver_headers):
    for lang in ("fil", "en", "fil-en"):
        resp = client.put(
            "/patient",
            json={"full_name": "X", "language": lang},
            headers=caregiver_headers,
        )
        assert resp.status_code == 200, "language %r should be accepted" % (lang,)
        assert resp.json()["language"] == lang
