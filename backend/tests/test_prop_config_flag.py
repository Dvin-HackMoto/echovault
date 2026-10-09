import os
from unittest.mock import patch

from hypothesis import given
from hypothesis import strategies as st

from app import config

TRUE_WORDS = ("1", "true", "yes", "on")

# NUL and surrogates cannot be environment values
env_text = st.text(alphabet=st.characters(blacklist_categories=("Cs",), blacklist_characters="\x00"))

whitespace = st.text(alphabet=" \t\n\r\x0b\x0c", max_size=3)


@st.composite
def true_word_variants(draw):
    word = draw(st.sampled_from(TRUE_WORDS))
    cased = "".join(c.upper() if draw(st.booleans()) else c.lower() for c in word)
    return draw(whitespace) + cased + draw(whitespace)


# Feature: hub-foundation, Property 2: DEMO_MODE parsing matches the model
# **Validates: Requirements 1.5, 1.6**
@given(st.one_of(env_text, true_word_variants()))
def test_demo_mode_parsing_matches_model(s):
    with patch.dict(os.environ, {"DEMO_MODE": s}):
        result = config._flag("DEMO_MODE")
    # on Windows an empty value may remove the var; unset also maps to False
    assert result is (s.strip().lower() in TRUE_WORDS)
