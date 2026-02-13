from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

APP_DIR = Path(__file__).parent
DATA_DIR = APP_DIR / "data"
UPLOAD_DIR = APP_DIR / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTS = {".png", ".jpg", ".jpeg", ".webp"}

app = Flask(__name__)


def allowed_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTS


def family_path(name: str) -> Path:
    safe = "".join(c for c in name.lower() if c.isalnum() or c in ("-", "_"))
    return DATA_DIR / f"family_{safe}.json"


def load_family_file(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"people": [], "relationships": []}
    return json.loads(path.read_text(encoding="utf-8"))


def save_family_file(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


@app.get("/")
def index():
    return render_template("index.html")


# ✅ What tree.js is calling
@app.get("/api/tree/<name>")
def api_tree(name: str):
    path = family_path(name)
    if not path.exists():
        return jsonify({"error": "not found", "expected_file": str(path)}), 404
    return jsonify(load_family_file(path))


# Optional save endpoint if you want it
@app.post("/api/tree/<name>")
def api_tree_save(name: str):
    payload = request.get_json(force=True, silent=False)
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid JSON"}), 400
    if "people" not in payload or "relationships" not in payload:
        return jsonify({"error": "JSON must include people and relationships"}), 400

    path = family_path(name)
    save_family_file(path, payload)
    return jsonify({"ok": True})


# ✅ Backwards-compatible endpoints (still use gupta by default)
@app.get("/api/family")
def api_get_family():
    return jsonify(load_family_file(family_path("gupta")))


@app.post("/api/family")
def api_save_family():
    payload = request.get_json(force=True, silent=False)
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid JSON"}), 400
    if "people" not in payload or "relationships" not in payload:
        return jsonify({"error": "JSON must include people and relationships"}), 400

    save_family_file(family_path("gupta"), payload)
    return jsonify({"ok": True})


@app.post("/api/upload")
def api_upload():
    if "file" not in request.files:
        return jsonify({"error": "No file field"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400

    if not allowed_file(f.filename):
        return jsonify({"error": "Only png/jpg/jpeg/webp allowed"}), 400

    filename = secure_filename(f.filename)

    base = Path(filename).stem
    ext = Path(filename).suffix.lower()
    final = filename
    i = 1
    while (UPLOAD_DIR / final).exists():
        final = f"{base}_{i}{ext}"
        i += 1

    out_path = UPLOAD_DIR / final
    f.save(out_path)

    return jsonify({"url": f"/static/uploads/{final}"})

###################################
# RUNNING LOCALLY
###################################
#if __name__ == "__main__":
    #app.run(host="127.0.0.1", port=5000, debug=True)
