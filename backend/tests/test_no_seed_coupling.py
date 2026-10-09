# feature code must work on real data, so nothing outside seed.py may name a demo id or the demo patient
import ast

from app import config

APP_DIR = config.BACKEND_DIR / "app"
SEED_FILE = APP_DIR / "database" / "seed.py"


def test_no_app_code_depends_on_demo_data():
    found = []
    for path in sorted(APP_DIR.rglob("*.py")):
        if path == SEED_FILE:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                if node.value.startswith("seed-") or "Lola Nena" in node.value:
                    found.append(f"{path.relative_to(config.BACKEND_DIR)}:{node.lineno}: {node.value!r}")
    assert not found, "demo data referenced outside seed.py:\n" + "\n".join(found)
