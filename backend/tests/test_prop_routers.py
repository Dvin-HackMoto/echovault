# Feature: hub-foundation, Property 8: Router registration returns exactly the valid features, in order
import importlib
import shutil
import sys
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from hypothesis import given
from hypothesis import strategies as st

from app.main import register_feature_routers

KINDS = ["valid", "no_router", "not_api_router", "no_router_py", "plain_file"]

ROUTER_SOURCES = {
    "valid": (
        "from fastapi import APIRouter\n"
        "router = APIRouter()\n"
        "@router.get('/{name}/ping')\n"
        "def ping():\n"
        "    return {{'feature': '{name}'}}\n"
    ),
    "no_router": "# placeholder, no router yet\nVALUE = 1\n",
    "not_api_router": "router = {{'not': 'an APIRouter'}}\n",
}

layouts = st.dictionaries(
    keys=st.from_regex(r"[a-z][a-z0-9_]{0,8}", fullmatch=True),
    values=st.sampled_from(KINDS),
    max_size=8,
)


def build_layout(root: Path, package: str, layout: dict[str, str]) -> Path:
    features = root / package
    features.mkdir()
    (features / "__init__.py").write_text("")
    for name, kind in layout.items():
        if kind == "plain_file":
            (features / f"{name}.txt").write_text("not a feature")
            continue
        folder = features / name
        folder.mkdir()
        if kind in ROUTER_SOURCES:
            (folder / "router.py").write_text(ROUTER_SOURCES[kind].format(name=name))
    return features


def route_paths(app: FastAPI) -> set[str]:
    # newer FastAPI wraps included routers lazily in app.routes, so read the
    # flattened view from the OpenAPI schema; build a fresh one each call
    app.openapi_schema = None
    return set(app.openapi()["paths"])


@given(layout=layouts)
def test_registration_returns_exactly_valid_features_in_order(layout):
    """**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6**"""
    package = f"feat_{uuid.uuid4().hex}"
    root = Path(tempfile.mkdtemp())
    sys.path.insert(0, str(root))
    try:
        features = build_layout(root, package, layout)
        importlib.invalidate_caches()

        app = FastAPI()
        before = route_paths(app)
        registered = register_feature_routers(app, features, package)

        valid = sorted(name for name, kind in layout.items() if kind == "valid")
        assert registered == valid

        # exactly the declared routes were added, nothing else
        assert route_paths(app) == before | {f"/{name}/ping" for name in valid}

        client = TestClient(app)
        for name in valid:
            response = client.get(f"/{name}/ping")
            assert response.status_code == 200
            assert response.json() == {"feature": name}
        for name in set(layout) - set(valid):
            assert client.get(f"/{name}/ping").status_code == 404
    finally:
        sys.path.remove(str(root))
        for module in [m for m in sys.modules if m == package or m.startswith(package + ".")]:
            del sys.modules[module]
        shutil.rmtree(root, ignore_errors=True)
