function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function edgeKey(a, b) {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function activeRelationships(data, threshold) {
  return data.relationships.filter((edge) => edge.count >= threshold);
}

export function orderedPeople(data, options) {
  const activeIds = new Set();
  activeRelationships(data, options.threshold).forEach((edge) => {
    activeIds.add(edge.source);
    activeIds.add(edge.target);
  });
  if (options.focusId) activeIds.add(options.focusId);

  const people = data.people.filter((person) => activeIds.has(person.id));
  return people.sort((a, b) => {
    if (options.sort === "name") return a.name.localeCompare(b.name);
    if (options.sort === "frequency") {
      return b.photoCount - a.photoCount || a.name.localeCompare(b.name);
    }
    if (options.sort === "strength") {
      return b.strength - a.strength || a.name.localeCompare(b.name);
    }
    return (
      a.community - b.community ||
      b.strength - a.strength ||
      a.name.localeCompare(b.name)
    );
  });
}

function setCanvasSize(canvas, width, height) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

export function renderMatrix(canvas, data, options, onHover, onSelect) {
  const people = orderedPeople(data, options);
  const relationships = activeRelationships(data, options.threshold);
  const edges = new Map(
    relationships.map((edge) => [edgeKey(edge.source, edge.target), edge]),
  );
  const labelSize = 52;
  const cell = Math.round(18 * options.zoom);
  const size = labelSize + people.length * cell;
  const context = setCanvasSize(canvas, size, size);
  const foreground = cssColor("--ink");
  const muted = cssColor("--muted-ink");
  const line = cssColor("--line");
  const primary = cssColor("--signal");
  const cluster = cssColor("--cluster");
  const surface = cssColor("--surface");

  context.fillStyle = surface;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = line;
  context.lineWidth = 1;
  context.font = "600 10px 'IBM Plex Mono', monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";

  people.forEach((person, index) => {
    const position = labelSize + index * cell;
    const focused = !options.focusId || options.focusId === person.id;
    context.fillStyle = focused ? foreground : muted;
    context.globalAlpha = focused ? 1 : 0.48;
    context.fillText(
      person.initials.slice(0, 3),
      labelSize / 2,
      position + cell / 2,
    );
    context.save();
    context.translate(position + cell / 2, labelSize / 2);
    context.rotate(-Math.PI / 2);
    context.fillText(person.initials.slice(0, 3), 0, 0);
    context.restore();
    context.globalAlpha = 1;
  });

  const maxCount = Math.max(1, ...relationships.map((edge) => edge.count));
  const maxNormalized = Math.max(
    0.01,
    ...relationships.map((edge) => edge.normalized),
  );

  people.forEach((row, rowIndex) => {
    people.forEach((column, columnIndex) => {
      const x = labelSize + columnIndex * cell;
      const y = labelSize + rowIndex * cell;
      if (row.id === column.id) {
        context.fillStyle = line;
        context.globalAlpha = 0.45;
        context.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        return;
      }
      const edge = edges.get(edgeKey(row.id, column.id));
      if (!edge) return;
      const value =
        options.metric === "count"
          ? edge.count / maxCount
          : edge.normalized / maxNormalized;
      const focused =
        !options.focusId ||
        edge.source === options.focusId ||
        edge.target === options.focusId;
      context.fillStyle =
        row.community === column.community ? primary : cluster;
      context.globalAlpha = (0.12 + Math.sqrt(value) * 0.86) * (focused ? 1 : 0.12);
      context.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    });
  });
  context.globalAlpha = 1;

  const hitTest = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (size / rect.width);
    const y = (event.clientY - rect.top) * (size / rect.height);
    const column = Math.floor((x - labelSize) / cell);
    const row = Math.floor((y - labelSize) / cell);
    if (x < labelSize && row >= 0 && row < people.length) {
      return { kind: "person", x: event.clientX, y: event.clientY, person: people[row] };
    }
    if (y < labelSize && column >= 0 && column < people.length) {
      return {
        kind: "person",
        x: event.clientX,
        y: event.clientY,
        person: people[column],
      };
    }
    if (
      row < 0 ||
      column < 0 ||
      row >= people.length ||
      column >= people.length
    ) {
      return null;
    }
    const source = people[row];
    const target = people[column];
    if (source.id === target.id) {
      return { kind: "person", x: event.clientX, y: event.clientY, person: source };
    }
    const relationship = edges.get(edgeKey(source.id, target.id));
    if (!relationship) return null;
    return {
      kind: "pair",
      x: event.clientX,
      y: event.clientY,
      source,
      target,
      relationship,
    };
  };

  canvas.onpointermove = (event) => onHover(hitTest(event));
  canvas.onpointerleave = () => onHover(null);
  canvas.onclick = (event) => {
    const info = hitTest(event);
    if (info) onSelect(info);
  };
  canvas.onkeydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const strongest = relationships[0];
    if (!strongest) return;
    const source = data.people.find((person) => person.id === strongest.source);
    const target = data.people.find((person) => person.id === strongest.target);
    if (source && target) {
      event.preventDefault();
      onSelect({
        kind: "pair",
        x: canvas.getBoundingClientRect().left + 80,
        y: canvas.getBoundingClientRect().top + 80,
        source,
        target,
        relationship: strongest,
      });
    }
  };
  canvas.setAttribute(
    "aria-label",
    `Relationship matrix with ${people.length} people. Hover cells for names and shared photo counts.`,
  );
}

let networkScale = 1;
let networkOffsetX = 0;
let networkOffsetY = 0;

export function resetNetworkTransform() {
  networkScale = 1;
  networkOffsetX = 0;
  networkOffsetY = 0;
}

export function renderNetwork(canvas, data, options, onHover, onSelect) {
  const people = orderedPeople(data, options);
  const relationships = activeRelationships(data, options.threshold);
  const width = Math.max(680, canvas.parentElement?.clientWidth ?? 680);
  const height = Math.min(680, Math.max(500, width * 0.66));
  const context = setCanvasSize(canvas, width, height);
  const foreground = cssColor("--ink");
  const muted = cssColor("--muted-ink");
  const line = cssColor("--line");
  const signal = cssColor("--signal");
  const cluster = cssColor("--cluster");
  const surface = cssColor("--surface");
  const byId = new Map(people.map((person) => [person.id, person]));
  const maxStrength = Math.max(1, ...people.map((person) => person.strength));
  const maxEdge = Math.max(1, ...relationships.map((edge) => edge.count));
  const communities = [...new Set(people.map((person) => person.community))];
  const points = [];

  communities.forEach((community, communityIndex) => {
    const members = people.filter((person) => person.community === community);
    const clusterAngle = (communityIndex / Math.max(1, communities.length)) * Math.PI * 2;
    const clusterRadius = communities.length > 1 ? Math.min(width, height) * 0.25 : 0;
    const centerX = width / 2 + Math.cos(clusterAngle) * clusterRadius;
    const centerY = height / 2 + Math.sin(clusterAngle) * clusterRadius;
    members.forEach((person, index) => {
      const angle =
        (index / Math.max(1, members.length)) * Math.PI * 2 + clusterAngle * 0.3;
      const radius = 12 + Math.sqrt(person.strength / maxStrength) * 12;
      const orbit = 36 + members.length * 7;
      points.push({
        person,
        x: centerX + Math.cos(angle) * orbit,
        y: centerY + Math.sin(angle) * orbit,
        radius,
      });
    });
  });

  const pointById = new Map(points.map((point) => [point.person.id, point]));
  const draw = () => {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    context.setTransform(
      ratio * networkScale,
      0,
      0,
      ratio * networkScale,
      ratio * networkOffsetX,
      ratio * networkOffsetY,
    );
    context.fillStyle = surface;
    context.fillRect(
      -networkOffsetX / networkScale,
      -networkOffsetY / networkScale,
      width / networkScale,
      height / networkScale,
    );

    relationships.forEach((edge) => {
      const source = pointById.get(edge.source);
      const target = pointById.get(edge.target);
      if (!source || !target) return;
      const focused =
        !options.focusId ||
        edge.source === options.focusId ||
        edge.target === options.focusId;
      context.strokeStyle =
        source.person.community === target.person.community ? signal : cluster;
      context.globalAlpha =
        (0.14 + (edge.count / maxEdge) * 0.5) * (focused ? 1 : 0.08);
      context.lineWidth = 0.75 + Math.sqrt(edge.count / maxEdge) * 3;
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.stroke();
    });

    points.forEach((point) => {
      const focused = !options.focusId || options.focusId === point.person.id;
      context.globalAlpha = focused ? 1 : 0.2;
      context.fillStyle = point.person.community % 2 === 0 ? signal : cluster;
      context.beginPath();
      context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = surface;
      context.lineWidth = 3;
      context.stroke();
      context.fillStyle = foreground;
      context.font = "600 10px 'IBM Plex Mono', monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(point.person.initials.slice(0, 3), point.x, point.y);
    });
    context.globalAlpha = 1;
  };
  draw();

  const locate = (event) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) * (width / rect.width);
    const screenY = (event.clientY - rect.top) * (height / rect.height);
    const x = (screenX - networkOffsetX) / networkScale;
    const y = (screenY - networkOffsetY) / networkScale;
    return (
      [...points]
        .reverse()
        .find((point) => Math.hypot(point.x - x, point.y - y) <= point.radius + 4) ??
      null
    );
  };

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.onpointerdown = (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove = (event) => {
    if (dragging) {
      networkOffsetX += event.clientX - lastX;
      networkOffsetY += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      draw();
      onHover(null);
      return;
    }
    const point = locate(event);
    onHover(
      point
        ? {
            kind: "person",
            x: event.clientX,
            y: event.clientY,
            person: point.person,
          }
        : null,
    );
  };
  canvas.onpointerup = (event) => {
    dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  };
  canvas.onpointerleave = () => {
    dragging = false;
    onHover(null);
  };
  canvas.onclick = (event) => {
    const point = locate(event);
    if (point) {
      onSelect({
        kind: "person",
        x: event.clientX,
        y: event.clientY,
        person: point.person,
      });
    }
  };
  canvas.onwheel = (event) => {
    event.preventDefault();
    const nextScale = Math.max(
      0.65,
      Math.min(2.5, networkScale * (event.deltaY > 0 ? 0.9 : 1.1)),
    );
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (width / rect.width);
    const y = (event.clientY - rect.top) * (height / rect.height);
    const worldX = (x - networkOffsetX) / networkScale;
    const worldY = (y - networkOffsetY) / networkScale;
    networkOffsetX = x - worldX * nextScale;
    networkOffsetY = y - worldY * nextScale;
    networkScale = nextScale;
    draw();
  };
  canvas.setAttribute(
    "aria-label",
    `Network map with ${people.length} people and ${relationships.length} relationships. Drag to pan and use the mouse wheel to zoom.`,
  );
}
