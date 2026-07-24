import { buildGraph, createDemoPhotos, parseImport } from "./data.js";
import {
  facebookConfigLabel,
  facebookIsConfigured,
  facebookLogout,
  importFacebookPhotos,
} from "./facebook.js";
import {
  orderedPeople,
  renderMatrix,
  renderNetwork,
  resetNetworkTransform,
} from "./viz.js";

const app = document.querySelector("#app");
if (!app) throw new Error("Application root is missing.");

app.innerHTML = `
  <div class="site-shell">
    <header class="topbar">
      <a class="wordmark" href="#" aria-label="SPINE home">
        <span class="wordmark-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span>SPINE</span>
      </a>
      <div class="topbar-actions">
        <span class="privacy-badge"><span class="status-dot"></span> Local-only analysis</span>
        <button class="text-button" id="privacy-open" type="button">Privacy</button>
      </div>
    </header>

    <main>
      <section class="hero" id="welcome-view">
        <div class="hero-copy">
          <p class="eyebrow">Spatial Proximity in Images for Network Exploration</p>
          <h1>See the shape of your <em>photo network.</em></h1>
          <p class="hero-lede">
            SPINE turns the people tagged together in your Facebook photos into a
            private, interactive relationship map. Your data stays in this browser.
          </p>

          <div class="connect-card">
            <button class="primary-button" id="facebook-connect" type="button">
              <span class="facebook-glyph" aria-hidden="true">f</span>
              Connect Facebook
            </button>
            <p class="config-note" id="facebook-config-note"></p>
            <div class="divider"><span>or explore without connecting</span></div>
            <div class="alternate-actions">
              <button class="secondary-button" id="demo-load" type="button">
                Explore demo
              </button>
              <button class="secondary-button" id="import-open" type="button">
                Import JSON
              </button>
              <input type="file" id="file-input" accept=".json,application/json" hidden />
            </div>
          </div>

          <p class="consent-note">
            Reads photo tag metadata only. No images, posts, or messages.
            <button class="inline-button" id="learn-more" type="button">How it works</button>
          </p>
        </div>

        <div class="hero-visual" aria-hidden="true">
          <div class="matrix-preview">
            <span class="axis-label axis-label-x">PEOPLE</span>
            <span class="axis-label axis-label-y">PEOPLE</span>
            <div class="preview-grid" id="preview-grid"></div>
            <div class="preview-focus">
              <span>AM × JO</span>
              <strong>12</strong>
              <small>shared photos</small>
            </div>
          </div>
          <p class="visual-caption"><span></span> Every cell is a shared moment</p>
        </div>
      </section>

      <section class="loading-view" id="loading-view" hidden aria-live="polite">
        <div class="loader-matrix" aria-hidden="true"></div>
        <p class="eyebrow">Building your map</p>
        <h2 id="loading-title">Reading tag metadata</h2>
        <p id="loading-count">Connecting securely…</p>
        <div class="progress-track"><span id="progress-bar"></span></div>
        <p class="loading-privacy">This work is happening on your device.</p>
      </section>

      <section class="workspace" id="workspace" hidden>
        <div class="workspace-heading">
          <div>
            <p class="eyebrow" id="source-label">Demo dataset</p>
            <h1>Your photo network</h1>
          </div>
          <div class="workspace-actions">
            <button class="secondary-button compact" id="export-json" type="button">Export JSON</button>
            <button class="icon-button" id="workspace-menu" type="button" aria-label="More options" aria-expanded="false">•••</button>
            <div class="menu" id="export-menu" hidden>
              <button type="button" id="export-csv">Export matrix CSV</button>
              <button type="button" id="replace-data">Replace data</button>
              <button type="button" class="danger-text" id="clear-data">Clear data</button>
            </div>
          </div>
        </div>

        <div class="stats-strip" aria-label="Dataset summary">
          <div><strong id="stat-people">0</strong><span>people tagged</span></div>
          <div><strong id="stat-photos">0</strong><span>photos read</span></div>
          <div><strong id="stat-pairs">0</strong><span>relationships</span></div>
          <div><strong id="stat-strongest">0</strong><span>strongest pair</span></div>
        </div>

        <div class="explorer">
          <aside class="controls">
            <div class="view-switch" aria-label="Visualization">
              <button type="button" data-view="matrix" aria-pressed="true">Matrix</button>
              <button type="button" data-view="network" aria-pressed="false">Network</button>
            </div>

            <label class="control-field">
              <span>Find a person</span>
              <div class="search-wrap">
                <input id="person-search" type="search" placeholder="Type a name…" autocomplete="off" />
                <button id="clear-search" type="button" aria-label="Clear person focus" hidden>×</button>
              </div>
            </label>
            <p class="search-result" id="search-result" aria-live="polite"></p>

            <label class="control-field">
              <span>Order people</span>
              <select id="sort-mode">
                <option value="community">Community</option>
                <option value="frequency">Photo frequency</option>
                <option value="strength">Relationship strength</option>
                <option value="name">Name</option>
              </select>
            </label>

            <fieldset class="control-field">
              <legend>Measure</legend>
              <div class="segmented">
                <button type="button" data-metric="count" aria-pressed="true">Shared photos</button>
                <button type="button" data-metric="normalized" aria-pressed="false">Relative strength</button>
              </div>
            </fieldset>

            <label class="control-field range-field">
              <span>Minimum shared photos <output id="threshold-output">1</output></span>
              <input id="threshold" type="range" min="1" max="10" value="1" />
            </label>

            <label class="control-field range-field" id="matrix-zoom-field">
              <span>Matrix scale <output id="zoom-output">100%</output></span>
              <input id="matrix-zoom" type="range" min="60" max="170" value="100" />
            </label>

            <button class="text-button reset-network" id="reset-network" type="button" hidden>
              Reset network view
            </button>

            <div class="legend">
              <span>Less</span>
              <i></i><i></i><i></i><i></i><i></i>
              <span>More</span>
            </div>
          </aside>

          <div class="viz-panel">
            <div class="viz-topline">
              <p id="visible-summary">Showing all relationships</p>
              <p class="interaction-hint" id="interaction-hint">Hover a cell to inspect it</p>
            </div>
            <div class="canvas-scroller" id="canvas-scroller">
              <canvas id="viz-canvas" tabindex="0"></canvas>
              <div class="empty-filter" id="empty-filter" hidden>
                <strong>No relationships at this threshold</strong>
                <button type="button" id="reset-threshold">Reset filter</button>
              </div>
            </div>
            <div class="selection-bar" id="selection-bar" hidden>
              <span class="selection-initials" id="selection-initials"></span>
              <span id="selection-detail"></span>
              <button type="button" id="selection-clear" aria-label="Clear selection">×</button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer>
      <span>SPINE 1.0</span>
      <p>Private by design. Built for exploration, not surveillance.</p>
      <span class="footer-links">
        <a class="text-button" href="./privacy.html">Privacy policy</a>
        <button class="text-button" id="footer-privacy" type="button">Data use</button>
      </span>
    </footer>
  </div>

  <div class="tooltip" id="tooltip" role="tooltip" hidden>
    <strong id="tooltip-title"></strong>
    <span id="tooltip-detail"></span>
  </div>

  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>

  <dialog id="privacy-dialog">
    <form method="dialog">
      <button class="dialog-close" aria-label="Close">×</button>
      <p class="eyebrow">Privacy by design</p>
      <h2>Your network stays yours.</h2>
      <div class="privacy-list">
        <div><span>01</span><p><strong>Read minimally</strong>SPINE requests photo tag metadata only. Version 1.0 does not request or display images.</p></div>
        <div><span>02</span><p><strong>Process locally</strong>Names, tags, and relationship counts remain in this browser’s memory and are not sent to a SPINE server.</p></div>
        <div><span>03</span><p><strong>Forget completely</strong>Clear Data removes the current analysis. Refreshing the page also clears it.</p></div>
      </div>
      <p class="dialog-footnote">
        Facebook only returns records permitted by its API and your account settings;
        “all photos” means all records exposed to this app through paginated API responses.
        Read the <a href="./privacy.html">full privacy policy</a> or
        <a href="./data-deletion.html">data deletion instructions</a>.
      </p>
      <button class="primary-button dialog-action">Got it</button>
    </form>
  </dialog>
`;

const state = {
  data: null,
  view: "matrix",
  sort: "community",
  metric: "count",
  threshold: 1,
  focusId: null,
  zoom: 1,
  selected: null,
};

function required(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const welcomeView = required("#welcome-view");
const loadingView = required("#loading-view");
const workspace = required("#workspace");
const canvas = required("#viz-canvas");
const tooltip = required("#tooltip");
const toast = required("#toast");
const privacyDialog = required("#privacy-dialog");
const fileInput = required("#file-input");
let toastTimer = 0;

function seedPreview() {
  const grid = required("#preview-grid");
  const values = [
    0, 0, 1, 0, 2, 0, 0, 0, 1, 3, 0, 0, 0, 2, 4, 1, 0, 0, 2, 1, 3, 0, 0, 0,
    1, 0, 2, 4, 0, 1, 0, 0, 0, 1, 0, 3, 2, 0, 0, 0, 4, 2, 1, 0, 0, 3, 0, 1,
    0, 0, 1, 0, 4, 2, 0, 0, 2, 0, 0, 1, 0, 3, 0, 0, 1, 0, 2, 0, 3, 1, 0, 4,
  ];
  values.forEach((value) => {
    const cell = document.createElement("i");
    cell.style.setProperty("--value", `${value / 4}`);
    grid.appendChild(cell);
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3600);
}

function showLoading(title, count) {
  welcomeView.hidden = true;
  workspace.hidden = true;
  loadingView.hidden = false;
  required("#loading-title").textContent = title;
  required("#loading-count").textContent = count;
  required("#progress-bar").style.width = "16%";
}

function setProgress(message, current) {
  required("#loading-title").textContent = message;
  required("#loading-count").textContent = `${current.toLocaleString()} records processed`;
  const width = Math.min(92, 22 + Math.log2(current + 1) * 9);
  required("#progress-bar").style.width = `${width}%`;
}

function sourceName(source) {
  if (source === "facebook") return "Facebook tag metadata";
  if (source === "import") return "Imported dataset";
  return "Demo dataset";
}

function acceptData(data) {
  if (!data.people.length) {
    throw new Error("No tagged people were found in this dataset.");
  }
  state.data = data;
  state.focusId = null;
  state.threshold = 1;
  state.selected = null;
  required("#threshold").value = "1";
  required("#threshold-output").textContent = "1";
  loadingView.hidden = true;
  welcomeView.hidden = true;
  workspace.hidden = false;
  required("#source-label").textContent = sourceName(data.source);
  required("#stat-people").textContent = data.people.length.toLocaleString();
  required("#stat-photos").textContent = data.photoCount.toLocaleString();
  required("#stat-pairs").textContent = data.relationships.length.toLocaleString();
  required("#stat-strongest").textContent = (
    data.relationships[0]?.count ?? 0
  ).toLocaleString();
  const maxCount = Math.max(1, ...data.relationships.map((edge) => edge.count));
  const threshold = required("#threshold");
  threshold.max = String(maxCount);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function vizOptions() {
  return {
    threshold: state.threshold,
    metric: state.metric,
    sort: state.sort,
    focusId: state.focusId,
    zoom: state.zoom,
  };
}

function updateTooltip(info) {
  if (!info) {
    tooltip.hidden = true;
    return;
  }
  const title = required("#tooltip-title");
  const detail = required("#tooltip-detail");
  if (info.kind === "person" && info.person) {
    title.textContent = info.person.name;
    detail.textContent = `${info.person.photoCount} tagged photos · ${info.person.strength} shared moments`;
  } else if (info.source && info.target && info.relationship) {
    title.textContent = `${info.source.name} × ${info.target.name}`;
    detail.textContent = `${info.relationship.count} shared ${
      info.relationship.count === 1 ? "photo" : "photos"
    } · ${Math.round(info.relationship.normalized * 100)}% relative strength`;
  }
  tooltip.style.left = `${Math.min(window.innerWidth - 280, info.x + 16)}px`;
  tooltip.style.top = `${Math.min(window.innerHeight - 90, info.y + 16)}px`;
  tooltip.hidden = false;
}

function updateSelection(info) {
  state.selected = info;
  const bar = required("#selection-bar");
  if (!info) {
    bar.hidden = true;
    return;
  }
  const initials = required("#selection-initials");
  const detail = required("#selection-detail");
  if (info.kind === "person" && info.person) {
    initials.textContent = info.person.initials;
    initials.setAttribute("title", info.person.name);
    detail.textContent = `${info.person.photoCount} tagged photos · community ${
      info.person.community + 1
    }`;
  } else if (info.source && info.target && info.relationship) {
    initials.textContent = `${info.source.initials} × ${info.target.initials}`;
    initials.setAttribute("title", `${info.source.name} × ${info.target.name}`);
    detail.textContent = `${info.relationship.count} shared ${
      info.relationship.count === 1 ? "photo" : "photos"
    }`;
  }
  bar.hidden = false;
}

function render() {
  if (!state.data) return;
  const options = vizOptions();
  const people = orderedPeople(state.data, options);
  const activeEdges = state.data.relationships.filter(
    (edge) => edge.count >= state.threshold,
  );
  required("#visible-summary").textContent = `${people.length.toLocaleString()} people · ${activeEdges.length.toLocaleString()} relationships`;
  required("#empty-filter").hidden = activeEdges.length > 0;
  canvas.hidden = activeEdges.length === 0;
  required("#interaction-hint").textContent =
    state.view === "matrix"
      ? "Hover a cell to inspect it"
      : "Drag to pan · scroll to zoom";
  required("#matrix-zoom-field").hidden = state.view !== "matrix";
  required("#reset-network").hidden = state.view !== "network";
  required("#canvas-scroller").classList.toggle(
    "network-mode",
    state.view === "network",
  );
  if (!activeEdges.length) return;
  if (state.view === "matrix") {
    renderMatrix(canvas, state.data, options, updateTooltip, updateSelection);
  } else {
    renderNetwork(canvas, state.data, options, updateTooltip, (info) => {
      updateSelection(info);
      if (info.person) {
        state.focusId = state.focusId === info.person.id ? null : info.person.id;
        updateSearchResult();
        render();
      }
    });
  }
}

function updateSearchResult() {
  const result = required("#search-result");
  const clear = required("#clear-search");
  if (!state.data || !state.focusId) {
    result.textContent = "";
    clear.hidden = true;
    return;
  }
  const person = state.data.people.find((item) => item.id === state.focusId);
  if (!person) return;
  result.textContent = `Focused: ${person.initials}`;
  result.setAttribute("title", person.name);
  clear.hidden = false;
}

function download(name, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportJson() {
  if (!state.data) return;
  download(
    `spine-network-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(state.data, null, 2),
    "application/json",
  );
  showToast("Local JSON export created.");
}

function csvCell(value) {
  const stringValue = String(value);
  return `"${stringValue.replaceAll('"', '""')}"`;
}

function exportCsv() {
  if (!state.data) return;
  const people = [...state.data.people].sort((a, b) => a.name.localeCompare(b.name));
  const values = new Map<string, number>();
  state.data.relationships.forEach((edge) => {
    values.set(`${edge.source}\u0000${edge.target}`, edge.count);
    values.set(`${edge.target}\u0000${edge.source}`, edge.count);
  });
  const rows = [
    ["", ...people.map((person) => person.initials)].map(csvCell).join(","),
    ...people.map((row) =>
      [
        row.initials,
        ...people.map((column) =>
          row.id === column.id
            ? row.photoCount
            : values.get(`${row.id}\u0000${column.id}`) ?? 0,
        ),
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  download(
    `spine-matrix-${new Date().toISOString().slice(0, 10)}.csv`,
    rows.join("\n"),
    "text/csv;charset=utf-8",
  );
  showToast("Matrix CSV export created.");
}

async function handleFacebook() {
  showLoading("Connecting to Facebook", "Waiting for permission…");
  try {
    const photos = await importFacebookPhotos(setProgress);
    setProgress("Building the relationship matrix", photos.length);
    acceptData(buildGraph(photos, "facebook"));
  } catch (error) {
    loadingView.hidden = true;
    welcomeView.hidden = false;
    showToast(error instanceof Error ? error.message : "Facebook import failed.");
  }
}

async function handleFile(file) {
  showLoading("Reading your local file", file.name);
  try {
    const text = await file.text();
    const data = parseImport(JSON.parse(text));
    acceptData(data);
    showToast("Local file imported. Nothing was uploaded.");
  } catch (error) {
    loadingView.hidden = true;
    welcomeView.hidden = false;
    showToast(error instanceof Error ? error.message : "The file could not be imported.");
  } finally {
    fileInput.value = "";
  }
}

function clearData(showWelcome = true) {
  state.data = null;
  state.selected = null;
  state.focusId = null;
  canvas.width = 0;
  canvas.height = 0;
  workspace.hidden = true;
  loadingView.hidden = true;
  welcomeView.hidden = !showWelcome;
  void facebookLogout();
  showToast("Current analysis cleared.");
}

function bindEvents() {
  required("#facebook-connect").addEventListener("click", () => void handleFacebook());
  required("#demo-load").addEventListener("click", () => {
    showLoading("Preparing the demo network", "Generating sample tag records…");
    window.setTimeout(() => acceptData(buildGraph(createDemoPhotos(), "demo")), 420);
  });
  [required("#import-open"), required("#replace-data")].forEach((button) =>
    button.addEventListener("click", () => fileInput.click()),
  );
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void handleFile(file);
  });

  [required("#privacy-open"), required("#learn-more"), required("#footer-privacy")].forEach(
    (button) => button.addEventListener("click", () => privacyDialog.showModal()),
  );

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      document.querySelectorAll("[data-view]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      updateTooltip(null);
      updateSelection(null);
      render();
    });
  });

  document.querySelectorAll("[data-metric]").forEach((button) => {
    button.addEventListener("click", () => {
      state.metric = button.dataset.metric;
      document.querySelectorAll("[data-metric]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      render();
    });
  });

  required("#sort-mode").addEventListener("change", (event) => {
    state.sort = event.currentTarget.value;
    render();
  });
  required("#threshold").addEventListener("input", (event) => {
    state.threshold = Number(event.currentTarget.value);
    required("#threshold-output").textContent = String(state.threshold);
    updateSelection(null);
    render();
  });
  required("#matrix-zoom").addEventListener("input", (event) => {
    state.zoom = Number(event.currentTarget.value) / 100;
    required("#zoom-output").textContent = `${Math.round(state.zoom * 100)}%`;
    render();
  });

  const search = required("#person-search");
  search.addEventListener("input", () => {
    if (!state.data) return;
    const query = search.value.trim().toLocaleLowerCase();
    const person =
      query.length >= 2
        ? state.data.people
            .filter((item) => item.name.toLocaleLowerCase().includes(query))
            .sort((a, b) => b.strength - a.strength)[0]
        : null;
    state.focusId = person?.id ?? null;
    updateSearchResult();
    render();
  });
  required("#clear-search").addEventListener("click", () => {
    search.value = "";
    state.focusId = null;
    updateSearchResult();
    render();
  });
  required("#selection-clear").addEventListener("click", () => updateSelection(null));
  required("#reset-threshold").addEventListener("click", () => {
    state.threshold = 1;
    required("#threshold").value = "1";
    required("#threshold-output").textContent = "1";
    render();
  });
  required("#reset-network").addEventListener("click", () => {
    resetNetworkTransform();
    render();
  });

  const menuButton = required("#workspace-menu");
  const menu = required("#export-menu");
  menuButton.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    menuButton.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", (event) => {
    if (
      !menu.hidden &&
      event.target instanceof Node &&
      !menu.contains(event.target) &&
      event.target !== menuButton
    ) {
      menu.hidden = true;
      menuButton.setAttribute("aria-expanded", "false");
    }
  });

  required("#export-json").addEventListener("click", exportJson);
  required("#export-csv").addEventListener("click", exportCsv);
  required("#clear-data").addEventListener("click", () => clearData());
  window.addEventListener("resize", () => {
    if (state.data && state.view === "network") render();
  });
}

function configureFacebookButton() {
  const button = required("#facebook-connect");
  const note = required("#facebook-config-note");
  if (facebookIsConfigured()) {
    note.textContent = facebookConfigLabel();
    note.classList.add("is-configured");
    return;
  }
  button.disabled = true;
  note.textContent = "Facebook import unlocks when a public App ID is configured.";
}

seedPreview();
configureFacebookButton();
bindEvents();
