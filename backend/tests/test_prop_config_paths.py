# Feature: hub-foundation, Property 1: Path settings resolve against backend/
# **Validates: Requirements 1.3, 1.4**

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from hypothesis import given
from hypothesis import strategies as st

from app import config

SAFE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789_-"

# a safe segment: [a-z0-9_-]+ with an optional extension, never "." or ".."
segment = st.builds(
    lambda stem, ext: stem + ext,
    st.text(alphabet=SAFE_CHARS, min_size=1, max_size=12),
    st.sampled_from(["", ".db", ".sqlite", ".jpg"]),
)
segments = st.lists(segment, min_size=1, max_size=4)

# relative paths written with either separator, as a user might in .env
relative_paths = st.builds(lambda parts, sep: sep.join(parts), segments, st.sampled_from(["/", os.sep]))

# absolute paths valid on this OS: under the temp dir, or anchored at the backend's drive/root
absolute_roots = st.sampled_from([Path(tempfile.gettempdir()), Path(config.BACKEND_DIR.anchor)])
absolute_paths = st.builds(lambda root, parts: str(root.joinpath(*parts)), absolute_roots, segments)

working_dirs = st.sampled_from([
    config.BACKEND_DIR,
    config.BACKEND_DIR.parent,
    config.BACKEND_DIR / "tests",
    Path(tempfile.gettempdir()),
])

names = st.sampled_from([("DB_PATH", "storage/echovault.db"), ("PHOTO_DIR", "storage/photos")])


# Feature: hub-foundation, Property 1: Path settings resolve against backend/
@given(
    setting=names,
    kind_and_value=st.one_of(
        relative_paths.map(lambda v: ("relative", v)),
        absolute_paths.map(lambda v: ("absolute", v)),
    ),
    cwd=working_dirs,
)
def test_path_settings_resolve_against_backend(setting, kind_and_value, cwd):
    name, default = setting
    kind, value = kind_and_value
    original_cwd = os.getcwd()
    try:
        os.chdir(cwd)
        with patch.dict(os.environ, {name: value}):
            result = config._path(name, default)
    finally:
        os.chdir(original_cwd)

    if kind == "relative":
        assert result == config.BACKEND_DIR / Path(value)
    else:
        assert Path(value).is_absolute()
        assert result == Path(value)
    assert result.is_absolute()
