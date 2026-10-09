# HUB-1: constants match the CHECK constraints in schema.sql
import ast
import re
from pathlib import Path

from app import constants
from app.database import seed as seed_module
from app.database.connection import SCHEMA_PATH

CHECKS = {
    ("caregivers", "access_level"): constants.ACCESS_LEVELS,
    ("people", "trust"): constants.TRUST_STATUSES,
    ("places", "trust"): constants.TRUST_STATUSES,
    ("memories", "category"): constants.CATEGORIES,
    ("memories", "importance"): constants.IMPORTANCE_LEVELS,
    ("memories", "trust"): constants.TRUST_STATUSES,
    ("memories", "validity"): constants.VALIDITY_TYPES,
    ("memories", "source"): constants.MEMORY_SOURCES,
    ("schedule_items", "kind"): constants.SCHEDULE_KINDS,
    ("schedule_acks", "response"): constants.ACK_RESPONSES,
    ("medication_logs", "status"): constants.MED_STATUSES,
    ("medication_logs", "confirmed_by"): constants.MED_CONFIRMED_BY,
    ("trivia_questions", "kind"): constants.TRIVIA_KINDS,
    ("trivia_questions", "source"): constants.TRIVIA_SOURCES,
    ("activity_log", "activity"): constants.ACTIVITIES,
    ("activity_log", "outcome"): constants.OUTCOMES,
    ("assistant_log", "input_mode"): constants.INPUT_MODES,
    ("assistant_log", "answer_mode"): constants.ANSWER_MODES,
}

# enums the seeder writes (Requirement 2.7)
SEEDER_ENUMS = (
    constants.ACCESS_LEVELS, constants.CATEGORIES, constants.IMPORTANCE_LEVELS,
    constants.TRUST_STATUSES, constants.VALIDITY_TYPES, constants.MEMORY_SOURCES,
    constants.SCHEDULE_KINDS, constants.TRIVIA_KINDS, constants.TRIVIA_SOURCES,
)


def schema_checks(schema: str | None = None) -> dict:
    """Extract {(table, column): values} from every CHECK (<column> IN (...)) in the schema text."""
    found = {}
    if schema is None:
        schema = SCHEMA_PATH.read_text(encoding="utf-8")
    for table in re.finditer(r"CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\n\);", schema, flags=re.DOTALL):
        for check in re.finditer(r"CHECK \((\w+) IN \((.*?)\)\)", table.group(2), flags=re.DOTALL):
            found[(table.group(1), check.group(1))] = tuple(re.findall(r"'([^']*)'", check.group(2)))
    return found


def check_mismatches(found: dict, expected: dict = CHECKS) -> list[str]:
    """One message per (table, column) whose schema values differ from the mapped tuple."""
    problems = []
    for table, column in sorted(set(found) | set(expected)):
        schema_values = found.get((table, column))
        mapped = expected.get((table, column))
        if schema_values == mapped:
            continue
        if mapped is None:
            problems.append(f"{table}.{column}: CHECK values {schema_values} have no mapped tuple")
        elif schema_values is None:
            problems.append(f"{table}.{column}: mapped tuple {mapped} has no CHECK in the schema")
        else:
            problems.append(f"{table}.{column}: schema has {schema_values}, constants have {mapped}")
    return problems


def test_constants_match_schema_checks():
    problems = check_mismatches(schema_checks())
    assert not problems, "\n".join(problems)
    assert schema_checks() == CHECKS


def test_unmapped_check_fails_and_names_table_column_values():
    extra = "\nCREATE TABLE IF NOT EXISTS extra_table (\n    color TEXT CHECK (color IN ('red', 'blue'))\n);\n"
    found = schema_checks(SCHEMA_PATH.read_text(encoding="utf-8") + extra)
    assert found != CHECKS
    problems = check_mismatches(found)
    assert len(problems) == 1
    assert "extra_table" in problems[0]
    assert "color" in problems[0]
    assert "red" in problems[0] and "blue" in problems[0]


def test_changed_check_values_are_reported():
    found = {**schema_checks(), ("memories", "importance"): ("critical", "general")}
    problems = check_mismatches(found)
    assert problems == [
        "memories.importance: schema has ('critical', 'general'), "
        f"constants have {constants.IMPORTANCE_LEVELS}"
    ]


def test_constant_tuples_are_pairwise_distinct():
    tuples = [
        constants.ROLES, constants.LANGUAGES, constants.INTENTS, constants.SETTING_KEYS,
        *{id(t): t for t in CHECKS.values()}.values(),
    ]
    for values in tuples:
        assert len(set(values)) == len(values), f"duplicate values in {values}"
    assert len(set(tuples)) == len(tuples), "two constant tuples have the same values"


def test_trust_columns_share_trust_statuses():
    for table in ("people", "places", "memories"):
        assert CHECKS[(table, "trust")] is constants.TRUST_STATUSES


def test_roles():
    assert constants.ROLES == ("patient", "caregiver")


def test_tuples_without_checks_have_exact_values():
    assert constants.LANGUAGES == ("fil", "en", "fil-en")
    assert constants.INTENTS == ("who_is", "next_event", "medication", "general")
    assert constants.SETTING_KEYS == ("game_topics", "trivia_frequency_min", "quiet_hours", "game_difficulty")


def _add_table_args(tree: ast.AST) -> set[int]:
    """ids of the string nodes that are table names: add(...)'s first argument and CLEARED_TABLES."""
    exempt = set()
    for node in ast.walk(tree):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "add"
                and node.args and isinstance(node.args[0], ast.Constant)):
            exempt.add(id(node.args[0]))
        if (isinstance(node, ast.Assign) and [getattr(t, "id", None) for t in node.targets] == ["CLEARED_TABLES"]
                and isinstance(node.value, ast.Tuple)):
            exempt.update(id(element) for element in node.value.elts)
    return exempt


def test_seeder_has_no_enum_literals():
    tree = ast.parse(Path(seed_module.__file__).read_text(encoding="utf-8"))
    enum_values = {value for values in SEEDER_ENUMS for value in values}
    exempt = _add_table_args(tree)
    hits = [
        f"line {node.lineno}: {node.value!r}"
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
        and node.value in enum_values and id(node) not in exempt
    ]
    assert not hits, "seed.py writes enum literals instead of constants:\n" + "\n".join(hits)
