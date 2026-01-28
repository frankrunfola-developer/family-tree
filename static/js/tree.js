const canvas = document.getElementById("canvas");
const reloadBtn = document.getElementById("reloadBtn");
const saveBtn = document.getElementById("saveBtn");
const jsonBox = document.getElementById("jsonBox");
const personSelect = document.getElementById("personSelect");
const photoUpload = document.getElementById("photoUpload");
const assignPhotoBtn = document.getElementById("assignPhotoBtn");

let currentData = null;
let uploadedPhotoUrl = null;

async function fetchFamily() {
  const res = await fetch("/api/family");
  const data = await res.json();
  currentData = data;

  if (jsonBox) jsonBox.value = JSON.stringify(data, null, 2);
  populatePersonSelect(data);
  renderFromJson(data);
}

function populatePersonSelect(data) {
  personSelect.innerHTML = "";
  for (const p of data.people || []) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    personSelect.appendChild(opt);
  }
}

function buildTree(data) {
  const peopleById = new Map((data.people || []).map(p => [p.id, p]));
  const childrenByParent = new Map();

  for (const rel of (data.relationships || [])) {
    if (!childrenByParent.has(rel.parent)) childrenByParent.set(rel.parent, []);
    childrenByParent.get(rel.parent).push(rel.child);
  }

  const allChildren = new Set((data.relationships || []).map(r => r.child));
  const rootPerson = (data.people || []).find(p => !allChildren.has(p.id)) || (data.people || [])[0];
  if (!rootPerson) return null;

  function buildNode(personId) {
    const p = peopleById.get(personId);
    if (!p) return null;

    const kids = (childrenByParent.get(personId) || [])
      .map(buildNode)
      .filter(Boolean);

    return {
      id: p.id,
      name: p.name,
      born: p.born || "",
      died: p.died || "",
      photo: p.photo || "",
      children: kids.length ? kids : undefined
    };
  }

  return buildNode(rootPerson.id);
}

function renderFromJson(data) {
  const rootObj = buildTree(data);
  if (!rootObj) {
    canvas.innerHTML = `<div style="padding:16px;">No data to render.</div>`;
    return;
  }

  canvas.innerHTML = "";
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  const svg = d3.select(canvas)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g").attr("transform", "translate(40,40)");

  const root = d3.hierarchy(rootObj);

  // Vertical: x = left/right, y = depth (down)
  //const layout = d3.tree().size([width - 80, height - 80]);
  const layout = d3.tree()
    .nodeSize([130, 150]); // [xSpacing, ySpacing] -> make these smaller to pack nodes tighter

  layout(root);

  g.selectAll(".link")
    .data(root.links())
    .enter()
    .append("path")
    .attr("fill", "none")
    .attr("stroke", "#444")
    .attr("stroke-width", 2)
    //.attr("d", d3.linkVertical().x(d => d.x).y(d => d.y)); // curved links
    .attr("d", d => { //90 degree elbow links
      const x0 = d.source.x, y0 = d.source.y;
      const x1 = d.target.x, y1 = d.target.y;
      const midY = (y0 + y1) / 2;
      return `M ${x0} ${y0} V ${midY} H ${x1} V ${y1}`;
    });
  

  const defs = svg.append("defs");
  const nodes = g.selectAll(".node")
    .data(root.descendants())
    .enter()
    .append("g")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  const r = 28;

  nodes.each(function(_, i) {
    defs.append("clipPath")
      .attr("id", `clip-${i}`)
      .append("circle")
      .attr("r", r)
      .attr("cx", 0)
      .attr("cy", 0);
  });

  nodes.append("circle")
    .attr("r", r + 3)
    .attr("fill", "#0b0c10")
    .attr("stroke", "#666")
    .attr("stroke-width", 2);

  nodes.append("image")
    .attr("href", d => d.data.photo || "")
    .attr("x", -r)
    .attr("y", -r)
    .attr("width", r * 2)
    .attr("height", r * 2)
    .attr("clip-path", (d, i) => `url(#clip-${i})`)
    .on("error", function() { d3.select(this).attr("visibility", "hidden"); });

  nodes.append("text")
    .attr("dy", r + 18)
    .attr("text-anchor", "middle")
    .attr("fill", "#e8e8e8")
    .attr("font-size", 12)
    .text(d => d.data.name);

  nodes.append("text")
    .attr("dy", r + 34)
    .attr("text-anchor", "middle")
    .attr("fill", "#bdbdbd")
    .attr("font-size", 10)
    .text(d => {
      const born = d.data.born ? `b. ${d.data.born}` : "";
      const died = d.data.died ? `d. ${d.data.died}` : "";
      return [born, died].filter(Boolean).join("  ");
    });

  svg.call(
    d3.zoom()
      .scaleExtent([0.4, 2.0])
      .on("zoom", (event) => g.attr("transform", event.transform))
  );
}

reloadBtn.addEventListener("click", fetchFamily);

if (saveBtn && jsonBox) {
  saveBtn.addEventListener("click", async () => {
    let parsed;
    try { parsed = JSON.parse(jsonBox.value); }
    catch { alert("JSON is invalid. Fix it first."); return; }

    const res = await fetch("/api/family", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Save failed: ${err.error || res.statusText}`);
      return;
    }

    currentData = parsed;
    populatePersonSelect(parsed);
    renderFromJson(parsed);
    alert("Saved.");
  });
}

photoUpload.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const out = await res.json();

  if (!res.ok) { alert(out.error || "Upload failed"); return; }

  uploadedPhotoUrl = out.url;
  alert("Uploaded. Select a person and click Assign Photo.");
});

assignPhotoBtn.addEventListener("click", () => {
  if (!uploadedPhotoUrl) { alert("Upload a photo first."); return; }
  if (!currentData) { alert("No data loaded."); return; }

  const personId = personSelect.value;
  const person = (currentData.people || []).find(p => p.id === personId);
  if (!person) { alert("Selected person not found."); return; }

  person.photo = uploadedPhotoUrl;
  if (jsonBox) jsonBox.value = JSON.stringify(currentData, null, 2);

  renderFromJson(currentData);
  uploadedPhotoUrl = null;
});

fetchFamily();
