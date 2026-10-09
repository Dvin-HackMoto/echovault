# Feature: hub-foundation, Property 9: get_role accepts exactly the ROLES values
# **Validates: Requirements 8.1, 8.2**
# get_role is called directly: HTTP parsing strips surrounding whitespace before the dependency sees it.

import pytest
from fastapi import HTTPException
from hypothesis import given
from hypothesis import strategies as st

from app.constants import ROLES
from app.middleware.dependencies import get_role

WHITESPACE = st.sampled_from([" ", "\t", "\n", "\r", "\u00a0"])


@st.composite
def role_variants(draw):
    """A role with random casing and optional surrounding whitespace."""
    role = draw(st.sampled_from(ROLES))
    cased = "".join(c.upper() if draw(st.booleans()) else c for c in role)
    left = "".join(draw(st.lists(WHITESPACE, max_size=2)))
    right = "".join(draw(st.lists(WHITESPACE, max_size=2)))
    return left + cased + right


header_values = st.one_of(
    st.none(),
    st.sampled_from(ROLES),
    role_variants(),
    st.text(),
)


# Feature: hub-foundation, Property 9: get_role accepts exactly the ROLES values
@given(header_values)
def test_get_role_accepts_exactly_roles(h):
    if h in ROLES:
        assert get_role(h) == h
    else:
        with pytest.raises(HTTPException) as exc:
            get_role(h)
        assert exc.value.status_code == 401
        for role in ROLES:
            assert role in exc.value.detail
