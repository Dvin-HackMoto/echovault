# hash/check PIN, find the caregiver a PIN belongs to, slow down PIN guessing
#
# A PIN is never stored, returned or logged: only its salted PBKDF2 hash is kept in
# caregivers.pin_hash, and no error message repeats the PIN that was sent.
import hashlib
import hmac
import re
import secrets
import sqlite3
import time

_ALGORITHM = "pbkdf2_sha256"
_ITERATIONS = 200_000

# a PIN is 4 to 8 digits (what a caregiver can type on the phone's number pad)
PIN_PATTERN = re.compile(r"\d{4,8}")

# after this many wrong PINs in a row, PIN login is refused for LOCKOUT_SECONDS
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 30


def hash_pin(pin: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), _ITERATIONS)
    return f"{_ALGORITHM}${_ITERATIONS}${salt}${digest.hex()}"


def check_pin(pin: str, pin_hash: str) -> bool:
    try:
        algorithm, iterations, salt, expected = pin_hash.split("$")
        if algorithm != _ALGORITHM:
            return False
        digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), int(iterations))
    except (ValueError, AttributeError):
        return False
    return hmac.compare_digest(digest.hex(), expected)


def is_valid_pin(pin: object) -> bool:
    """For code that sets a PIN: 4 to 8 digits."""
    return isinstance(pin, str) and PIN_PATTERN.fullmatch(pin) is not None


# columns that are safe to return; pin_hash never leaves this module
PUBLIC_COLUMNS = "id, name, relationship, access_level"


def find_caregivers_by_pin(
    conn: sqlite3.Connection, pin: str, caregiver_id: str | None = None
) -> list[dict]:
    """Active caregivers whose PIN matches (normally one). With caregiver_id, only that
    caregiver is checked. Every candidate is checked, so the time taken does not show
    which caregiver matched."""
    sql = f"SELECT {PUBLIC_COLUMNS}, pin_hash FROM caregivers WHERE is_active = 1"
    params: tuple = ()
    if caregiver_id is not None:
        sql += " AND id = ?"
        params = (caregiver_id,)
    matches = []
    for row in conn.execute(sql + " ORDER BY created_at, id", params).fetchall():
        caregiver = dict(row)
        if check_pin(pin, caregiver.pop("pin_hash")):
            matches.append(caregiver)
    return matches


class LoginThrottle:
    """Counts wrong PINs in a row for the whole hub (one family, one hub). After
    MAX_FAILED_ATTEMPTS, login is refused for LOCKOUT_SECONDS; a correct PIN resets it.
    In memory only: restarting the hub clears it."""

    def __init__(self, clock=time.monotonic):
        self._clock = clock
        self._failures = 0
        self._locked_until = 0.0

    def retry_after(self) -> int:
        """Seconds until login is allowed again, 0 when it is allowed now."""
        remaining = self._locked_until - self._clock()
        return max(0, int(remaining + 0.999))

    def failed(self) -> None:
        self._failures += 1
        if self._failures >= MAX_FAILED_ATTEMPTS:
            self._locked_until = self._clock() + LOCKOUT_SECONDS
            self._failures = 0

    def succeeded(self) -> None:
        self._failures = 0
        self._locked_until = 0.0


throttle = LoginThrottle()
