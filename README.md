# Family Tree App (Lannister Demo • Photo Nodes)

A lightweight **Flask + D3.js** app that renders a **family tree with photo nodes**.

This version ships with:
- A **preloaded Lannister-focused dataset** (Tywin/Joanna → Cersei/Jaime/Tyrion → Joffrey/Myrcella/Tommen)
- **Preloaded images** (generated, self-contained)
- **Vertical flow** (top → down)
- **Simple UI** (tree first; JSON editor is optional / collapsed)
---

## Quickstart

### 1) Create a virtual environment

**Windows (PowerShell)**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**macOS / Linux / Git Bash**
```bash
python -m venv .venv
source .venv/bin/activate
```

### 2) Install dependencies
```bash
pip install -r requirements.txt
```

### 3) Run the app
```bash
python app.py
```

Open: http://127.0.0.1:5000

---

## File structure (with comments)

```text
family-tree-got/
├─ app.py                      # Flask server: serves the page + JSON API + photo upload endpoint
├─ requirements.txt            # Python dependencies (Flask)
├─ README.md                   # You are here
│
├─ data/
│  └─ family.json              # The family tree data (people + parent→child relationships)
│
├─ templates/
│  └─ index.html               # Main HTML page (simple UI + loads D3 + tree.js)
│
└─ static/
   ├─ css/
   │  └─ styles.css            # App styling (layout, fonts, canvas sizing)
   │
   ├─ js/
   │  └─ tree.js               # D3 rendering + UI events (vertical layout + photo nodes)
   │
   └─ uploads/
      ├─ lannister/            # Preloaded pics referenced by the JSON
      │  ├─ tywin.png
      │  ├─ joanna.png
      │  ├─ cersei.png
      │  ├─ jaime.png
      │  ├─ tyrion.png
      │  ├─ joffrey.png
      │  ├─ myrcella.png
      │  └─ tommen.png
      └─ (your uploads...)     # New photos you upload via the UI land here
```

---

## How it works (quick mental model)

### Backend (Flask)
- `GET /`  
  Serves the UI page (`templates/index.html`)
- `GET /api/family`  
  Returns the JSON in `data/family.json`
- `POST /api/family`  
  Saves JSON back to `data/family.json`
- `POST /api/upload`  
  Uploads an image into `static/uploads/` and returns a URL like:
  - `/static/uploads/yourfile.png`

### Frontend (D3.js)
- Loads JSON from `/api/family`
- Builds a parent→child hierarchy
- Renders a **vertical tree** (top → down)
- Each node shows:
  - circular photo (clipped)
  - name
  - optional born/died line
- Includes zoom/pan

---

## Data model (`data/family.json`)

```json
{
  "people": [
    {
      "id": "tywin",
      "name": "Tywin Lannister",
      "born": "242 AC",
      "died": "",
      "photo": "/static/uploads/lannister/tywin.png"
    }
  ],
  "relationships": [
    { "parent": "tywin", "child": "cersei" }
  ]
}
```

### Rules / assumptions
- Relationships are **directed parent → child**
- Root ancestor is computed as:
  - “the person who is never listed as a child”
- This is a **single-tree MVP**
  - Multiple disconnected families will require a “choose root” option or multiple renders

---

## Using the UI

Top bar:
1. **Reload**: reloads `data/family.json` from disk
2. **Upload Photo**: upload `.png`, `.jpg`, `.jpeg`, `.webp`
3. **Select person → Assign Photo**: updates that person’s `photo` field in-memory

To persist changes:
- Expand **Advanced: Edit JSON**
- Click **Save JSON**

---

## Common tweaks

### Make nodes closer together
Edit: `static/js/tree.js`

- Find `nodeSize([xSpacing, ySpacing])`
- Reduce the numbers to pack tighter.

### 90-degree links (elbows) instead of curved
Edit: `static/js/tree.js`

- Replace the `d` path generator on the link with an elbow path:
  `M x0 y0 V midY H x1 V y1`

---

## Next upgrades (if you want this to feel “real”)
1. Spouse rendering (sideways relationship)
2. Export to PNG/SVG/PDF
3. Multiple roots / choose root
4. GEDCOM import (bigger project)
