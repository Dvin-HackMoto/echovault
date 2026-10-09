# Feature: hub-foundation, Property 7: Photo serving round trip
# **Validates: Requirements 6.4, 6.5**

import mimetypes

from hypothesis import HealthCheck, assume, given, settings
from hypothesis import strategies as st

from app import config

EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"]
NAME_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
# Windows device names cannot be used as file names, even with an extension
RESERVED = {"con", "prn", "aux", "nul"} | {f"{p}{i}" for p in ("com", "lpt") for i in range(10)}

stems = st.text(alphabet=NAME_CHARS, min_size=1, max_size=30).filter(lambda s: s.lower() not in RESERVED)
names = st.builds(lambda stem, ext: f"{stem}.{ext}", stems, st.sampled_from(EXTENSIONS))


def _media_type(response):
    return response.headers["content-type"].split(";")[0].strip()


# Feature: hub-foundation, Property 7: Photo serving round trip
@settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(name=names, content=st.binary(max_size=4096), missing=names)
def test_photo_serving_round_trip(client, name, content, missing):
    # Windows file systems ignore case, so the missing name must differ beyond case
    assume(name.lower() != missing.lower())
    photo = config.PHOTO_DIR / name
    photo.write_bytes(content)
    try:
        response = client.get(f"/photos/{name}")
        assert response.status_code == 200
        assert response.content == content
        assert _media_type(response) == mimetypes.guess_type(name)[0]

        assert client.get(f"/photos/{missing}").status_code == 404
    finally:
        photo.unlink()
