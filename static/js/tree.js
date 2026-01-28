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

// ------------------------------------------------------------
// Two-parent support WITHOUT duplicating people
//
// - Parent/child relationships are { parent, child }.
// - Spouse/partner relationships exist as edges only:
//      { "type": "spouse"|"partner", "a": "id1", "b": "id2" }
//
// Rendering rules:
// 1) Couples are created ONLY for co-parents (two people who share at least one child).
//    This keeps each person appearing exactly once in the ancestry tree.
// 2) Spouse relationships are drawn as extra SVG links between existing nodes,
//    so a person can be both a child (of parents) and a spouse (to someone else)
//    without being duplicated as a separate node.
// ------------------------------------------------------------
function buildTree(data) {
  const peopleById = new Map((data.people || []).map(p => [p.id, p]));

  const childrenByParent = new Map(); // parentId -> [childId]
  const parentsByChild = new Map();   // childId  -> [parentId]
  const spousePairs = [];             // [[a,b], ...]

  // Parse relationships
  for (const rel of (data.relationships || [])) {
    const t = (rel.type || "").toLowerCase();

    if (t === "spouse" || t === "partner") {
      if (rel.a && rel.b && peopleById.has(rel.a) && peopleById.has(rel.b)) {
        const a = rel.a, b = rel.b;
        // normalize to avoid dup pairs
        const key = [a, b].sort().join("+");
        if (!spousePairs.some(p => p.key === key)) spousePairs.push({ key, a, b });
      }
      continue;
    }

    // Default: treat as parent/child
    if (!rel.parent || !rel.child) continue;

    if (!childrenByParent.has(rel.parent)) childrenByParent.set(rel.parent, []);
    childrenByParent.get(rel.parent).push(rel.child);

    if (!parentsByChild.has(rel.child)) parentsByChild.set(rel.child, []);
    parentsByChild.get(rel.child).push(rel.parent);
  }

  const allChildren = new Set();
  for (const [childId] of parentsByChild) allChildren.add(childId);

  const rootPeople = (data.people || []).filter(p => !allChildren.has(p.id));
  if (!rootPeople.length) return { root: null, spousePairs: [], coupleKeys: new Set() };

  // Tracks people already placed inside a couple node, to avoid duplicates/cycles
  const coupledPeople = new Set();
  const coupleKeys = new Set();

  function personPayload(personId) {
    const p = peopleById.get(personId);
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      born: p.born || "",
      died: p.died || "",
      photo: p.photo || ""
    };
  }

  function coupleKey(a, b) {
    return [a, b].sort().join("+");
  }

  function getCoParent(personId) {
    // Find the first co-parent (based on relationship order)
    const kids = childrenByParent.get(personId) || [];
    for (const childId of kids) {
      const parents = parentsByChild.get(childId) || [];
      if (parents.length >= 2) {
        const other = parents.find(x => x !== personId);
        if (other && peopleById.has(other)) return other;
      }
    }
    return null;
  }

  function childrenForCouple(p1, p2) {
    // Children that list BOTH p1 and p2 as parents
    const kids1 = new Set(childrenByParent.get(p1) || []);
    const kids2 = new Set(childrenByParent.get(p2) || []);
    const both = [];
    for (const kid of kids1) {
      if (!kids2.has(kid)) continue;
      const parents = parentsByChild.get(kid) || [];
      if (parents.includes(p1) && parents.includes(p2)) both.push(kid);
    }
    return both;
  }

  function buildChildrenForUnit(unit) {
    let childIds = [];

    if (unit.type === "couple") {
      const [p1, p2] = unit.parents;
      childIds = childrenForCouple(p1, p2);
    } else {
      // Single-parent unit: only attach children that have EXACTLY one parent.
      // (Two-parent children will attach under a couple unit instead.)
      const kids = childrenByParent.get(unit.id) || [];
      childIds = kids.filter(kid => (parentsByChild.get(kid) || []).length <= 1);
    }

    const out = [];
    for (const childId of childIds) {
      const childUnit = buildUnitForPerson(childId);
      if (childUnit) out.push(childUnit);
    }
    return out;
  }

  function buildUnitForPerson(personId) {
    const p = peopleById.get(personId);
    if (!p) return null;

    const partnerId = getCoParent(personId);

    // Create couple ONLY for co-parents
    if (partnerId && !coupledPeople.has(personId) && !coupledPeople.has(partnerId)) {
      coupledPeople.add(personId);
      coupledPeople.add(partnerId);

      const pa = personPayload(personId);
      const pb = personPayload(partnerId);
      if (!pa || !pb) return null;

      const ck = coupleKey(pa.id, pb.id);
      coupleKeys.add(ck);

      const unit = {
        type: "couple",
        id: `couple:${ck}`,
        parents: [pa.id, pb.id],
        parentA: pa,
        parentB: pb
      };

      unit.children = buildChildrenForUnit(unit);
      if (!unit.children || unit.children.length === 0) delete unit.children;
      return unit;
    }

    // Person node
    const payload = personPayload(personId);
    if (!payload) return null;

    const node = { type: "person", ...payload };

    node.children = buildChildrenForUnit(node);
    if (!node.children || node.children.length === 0) delete node.children;
    return node;
  }

  // Build roots:
  // 1) Prefer couple roots where both parents are roots (co-parents).
  // 2) Then include remaining root people not already coupled.
  const roots = [];

  const rootIds = new Set(rootPeople.map(p => p.id));
  for (const rp of rootPeople) {
    if (coupledPeople.has(rp.id)) continue;

    const partnerId = getCoParent(rp.id);
    if (partnerId && rootIds.has(partnerId) && !coupledPeople.has(partnerId)) {
      const coupleRoot = buildUnitForPerson(rp.id);
      if (coupleRoot) roots.push(coupleRoot);
    }
  }

  for (const rp of rootPeople) {
    if (coupledPeople.has(rp.id)) continue;
    const rootNode = buildUnitForPerson(rp.id);
    if (rootNode) roots.push(rootNode);
  }

  if (!roots.length) {
    const first = (data.people || [])[0];
    if (!first) return { root: null, spousePairs: [], coupleKeys };
    return { root: buildUnitForPerson(first.id), spousePairs, coupleKeys };
  }

  if (roots.length > 1) {
    return {
      root: {
        type: "superroot",
        id: "__root__",
        name: "",
        born: "",
        died: "",
        photo: "",
        children: roots
      },
      spousePairs,
      coupleKeys
    };
  }

  return { root: roots[0], spousePairs, coupleKeys };
}

function renderFromJson(data) {
  const built = buildTree(data);
  const rootObj = built.root;
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

  const layout = d3.tree().nodeSize([110, 150]); // [xSpacing, ySpacing]
  layout(root);

  // Base links (parent-child)
  g.selectAll(".link")
    .data(root.links())
    .enter()
    .append("path")
    .attr("class", "link")
    .attr("fill", "none")
    .attr("stroke", "#444")
    .attr("stroke-width", 2)
    .attr("d", d => {
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
    .attr("class", "node")
    .attr("transform", d => `translate(${d.x},${d.y})`);

  const r = 28;
  const coupleGap = 12;
  const coupleOffset = r + coupleGap;

  // Map personId -> anchor position in the rendered tree (to draw spouse edges)
  // If a person appears in a couple node, we map them to that couple-side anchor.
  // If the person also appears as a standalone node (shouldn't happen in a tree),
  // we keep the first mapping (prefer their ancestry placement).
  const personAnchor = new Map();

  // Clip paths + anchors
  nodes.each(function(d, i) {
    const t = d.data.type || "person";
    if (t === "couple") {
      defs.append("clipPath").attr("id", `clip-${i}-a`)
        .append("circle").attr("r", r).attr("cx", -coupleOffset).attr("cy", 0);
      defs.append("clipPath").attr("id", `clip-${i}-b`)
        .append("circle").attr("r", r).attr("cx", +coupleOffset).attr("cy", 0);

      // anchors for spouse edges / linking
      const aId = d.data.parentA?.id;
      const bId = d.data.parentB?.id;
      if (aId && !personAnchor.has(aId)) personAnchor.set(aId, { x: d.x - coupleOffset, y: d.y });
      if (bId && !personAnchor.has(bId)) personAnchor.set(bId, { x: d.x + coupleOffset, y: d.y });
    } else {
      defs.append("clipPath").attr("id", `clip-${i}`)
        .append("circle").attr("r", r).attr("cx", 0).attr("cy", 0);

      const pid = d.data.id;
      if (pid && !personAnchor.has(pid)) personAnchor.set(pid, { x: d.x, y: d.y });
    }
  });

  // Draw nodes
  nodes.each(function(d, i) {
    const group = d3.select(this);
    const t = d.data.type || "person";

    if (t === "superroot") return;

    if (t === "couple") {
      group.append("circle")
        .attr("r", r + 3)
        .attr("cx", -coupleOffset)
        .attr("cy", 0)
        .attr("fill", "#0b0c10")
        .attr("stroke", "#666")
        .attr("stroke-width", 2);

      group.append("circle")
        .attr("r", r + 3)
        .attr("cx", +coupleOffset)
        .attr("cy", 0)
        .attr("fill", "#0b0c10")
        .attr("stroke", "#666")
        .attr("stroke-width", 2);

      group.append("image")
        .attr("href", d.data.parentA?.photo || "")
        .attr("x", -coupleOffset - r)
        .attr("y", -r)
        .attr("width", r * 2)
        .attr("height", r * 2)
        .attr("clip-path", `url(#clip-${i}-a)`)
        .on("error", function() { d3.select(this).attr("visibility", "hidden"); });

      group.append("image")
        .attr("href", d.data.parentB?.photo || "")
        .attr("x", +coupleOffset - r)
        .attr("y", -r)
        .attr("width", r * 2)
        .attr("height", r * 2)
        .attr("clip-path", `url(#clip-${i}-b)`)
        .on("error", function() { d3.select(this).attr("visibility", "hidden"); });

      group.append("text")
        .attr("dy", r + 18)
        .attr("text-anchor", "middle")
        .attr("fill", "#e8e8e8")
        .attr("font-size", 12)
        .text(`${d.data.parentA?.name || ""}  +  ${d.data.parentB?.name || ""}`);

      return;
    }

    group.append("circle")
      .attr("r", r + 3)
      .attr("fill", "#0b0c10")
      .attr("stroke", "#666")
      .attr("stroke-width", 2);

    group.append("image")
      .attr("href", d.data.photo || "")
      .attr("x", -r)
      .attr("y", -r)
      .attr("width", r * 2)
      .attr("height", r * 2)
      .attr("clip-path", `url(#clip-${i})`)
      .on("error", function() { d3.select(this).attr("visibility", "hidden"); });

    group.append("text")
      .attr("dy", r + 18)
      .attr("text-anchor", "middle")
      .attr("fill", "#e8e8e8")
      .attr("font-size", 12)
      .text(d.data.name || "");

    group.append("text")
      .attr("dy", r + 34)
      .attr("text-anchor", "middle")
      .attr("fill", "#bdbdbd")
      .attr("font-size", 10)
      .text(() => {
        const born = d.data.born ? `b. ${d.data.born}` : "";
        const died = d.data.died ? `d. ${d.data.died}` : "";
        return [born, died].filter(Boolean).join("  ");
      });
  });

  // Spouse edges: draw between existing anchors, skipping pairs already represented
  // as co-parent couple nodes (those are already visually paired).
  const spouseLinks = [];
  for (const p of (built.spousePairs || [])) {
    if (built.coupleKeys && built.coupleKeys.has(p.key)) continue; // already a couple node
    const a = personAnchor.get(p.a);
    const b = personAnchor.get(p.b);
    if (!a || !b) continue; // one side not rendered
    spouseLinks.push({ a, b, key: p.key });
  }

  g.selectAll(".spouse-link")
    .data(spouseLinks)
    .enter()
    .append("path")
    .attr("class", "spouse-link")
    .attr("fill", "none")
    .attr("stroke", "#777")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "6,6")
    .attr("d", d => {
      // simple horizontal-ish connector with a small midpoint jog
      const x0 = d.a.x, y0 = d.a.y;
      const x1 = d.b.x, y1 = d.b.y;
      const midX = (x0 + x1) / 2;
      return `M ${x0} ${y0} H ${midX} V ${y1} H ${x1}`;
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
