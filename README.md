# Family Tree App (Lannister Demo • Photo Nodes)

Flask + D3 family tree app with **photo nodes**, preloaded with a **Lannister-focused Game of Thrones dataset**.

Changes vs the earlier version:
- **Preloaded dataset** in `data/family.json`
- **Preloaded images** in `static/uploads/lannister/`
- **Vertical flow** (top → down)
- **Simplified UI**: tree first; JSON editor is optional (collapsed)

> The included pictures are generated avatar PNGs (initials + styling). This keeps the project self-contained and avoids using copyrighted show imagery.

---

## Run it

```bash
# Windows: .\.venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m venv .venv
pip install -r requirements.txt
python app.py
```

Open: http://127.0.0.1:5000

---

## What’s preloaded

- Tywin + Joanna
- Cersei, Jaime, Tyrion
- Joffrey, Myrcella, Tommen

Data:
- `data/family.json`

Images:
- `static/uploads/lannister/*.png`

---

## Vertical flow

Rendering is vertical using:
- `d3.tree().size([width, height])`
- `d3.linkVertical()` for edges

Code: `static/js/tree.js`

---

## Simplified UI

Top bar:
- Reload
- Upload Photo
- Choose person
- Assign photo

Advanced:
- Expand “Advanced: Edit JSON”
- Save JSON back to `data/family.json`

---

## Replace preloaded images with real photos

1. Upload Photo
2. Choose a person
3. Assign Photo
4. Expand Advanced → Save JSON
