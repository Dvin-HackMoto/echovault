# Feature: hub-foundation, Property 6: CORS permits any origin, method and header
# **Validates: Requirements 6.1, 6.2**

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
TOKEN_CHARS = "!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

label = st.text(alphabet="abcdefghijklmnopqrstuvwxyz0123456789", min_size=1, max_size=12)
domain = st.lists(label, min_size=1, max_size=3).map(".".join)
ipv4 = st.tuples(*[st.integers(0, 255)] * 4).map(lambda t: ".".join(map(str, t)))
port = st.one_of(st.none(), st.integers(1, 65535))


@st.composite
def origins(draw):
    host = draw(st.one_of(domain, ipv4))
    p = draw(port)
    return f"http://{host}" if p is None else f"http://{host}:{p}"


# token-shaped header names (RFC 9110 tchar); commas and spaces cannot appear
header_names = st.text(alphabet=TOKEN_CHARS, min_size=1, max_size=20)


def _allows_origin(headers, origin):
    return headers.get("access-control-allow-origin") in ("*", origin)


def _split(value):
    return {item.strip().lower() for item in (value or "").split(",") if item.strip()}


# Feature: hub-foundation, Property 6: CORS permits any origin, method and header
@settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(origin=origins(), method=st.sampled_from(METHODS), requested=st.lists(header_names, max_size=5))
def test_cors_permits_any_origin_method_and_header(client, origin, method, requested):
    preflight_headers = {"Origin": origin, "Access-Control-Request-Method": method}
    if requested:
        preflight_headers["Access-Control-Request-Headers"] = ", ".join(requested)

    response = client.options("/health", headers=preflight_headers)
    assert response.status_code == 200
    assert _allows_origin(response.headers, origin)
    assert method.lower() in _split(response.headers.get("access-control-allow-methods"))
    allowed_headers = _split(response.headers.get("access-control-allow-headers"))
    for name in requested:
        assert name.lower() in allowed_headers

    plain = client.get("/health", headers={"Origin": origin})
    assert plain.status_code == 200
    assert _allows_origin(plain.headers, origin)
