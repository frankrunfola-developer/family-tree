from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

APP_DIR = Path(__file__).parent
DATA_FILE = APP_DIR / "data" / "family.json"

UPLOAD_DIR = APP_DIR / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTS = {".png", ".jpg", ".jpeg", ".webp"}

app = Flask(__name__)


def load_family() -> Dict[str, Any]:
    if not DATA_FILE.exists():
        return {"people": [], "relationships": []}
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def save_family(payload: Dict[str, Any]) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def allowed_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTS


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/family")
def api_get_family():
    return jsonify(load_family())


@app.post("/api/family")
def api_save_family():
    payload = request.get_json(force=True, silent=False)

    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid JSON"}), 400
    if "people" not in payload or "relationships" not in payload:
        return jsonify({"error": "JSON must include people and relationships"}), 400

    save_family(payload)
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


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
