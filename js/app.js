console.log("starting app.js");

/* ============================
   GLOBAL STATE
============================ */

let patches = {};
let setups = {};
let midiControllers = {};
let modSources = {};
let kdfxLookup = null;
let synthModel = null;
let selectedModelEntry = null;
let modelBasePath = "";
let mySynth = null;
let selectedMidiInput = null;
let selectedMode = "programs";
let selectedKdfxStudioId = null;

let myBankMSB = 0;
let myBankLSB = 0;
const NEEDS_MIDI_MESSAGE = "Configure a MIDI Interface...";
const WAITING_MESSAGE = "Waiting...";


function withCacheVersion(path) {

  const version = CONFIG?.appVersion;

  if (!version || typeof path !== "string" || path.trim() === "") {
    return path;
  }

  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}v=${encodeURIComponent(version)}`;
}


/* ============================
   LOAD DATA FILES
============================ */

async function loadData() {

  const modelConfigPath = await resolveModelConfigPathFromIndex();
  const modelResponse = await fetch(withCacheVersion(modelConfigPath));

  if (!modelResponse.ok) {
    throw new Error(`Failed to load model config: ${modelConfigPath}`);
  }

  synthModel = await modelResponse.json();
  modelBasePath = dirname(modelConfigPath);

  const patchResponse = await fetch(withCacheVersion(resolveModelPath(synthModel.patchDataPath)));
  patches = await patchResponse.json();

  const midiCcPath = synthModel.midiCcDataPath || synthModel.controllerDataPath;
  const midiCcResponse = await fetch(withCacheVersion(resolveModelPath(midiCcPath)));
  midiControllers = await midiCcResponse.json();

  if (synthModel.modSourceDataPath) {
    const modSourceResponse = await fetch(withCacheVersion(resolveModelPath(synthModel.modSourceDataPath)));
    modSources = await modSourceResponse.json();
  } else {
    modSources = {};
  }

  if (synthModel.setupDataPath) {
    const setupResponse = await fetch(withCacheVersion(resolveModelPath(synthModel.setupDataPath)));
    setups = await setupResponse.json();
  }

  if (synthModel.kdfxLookupDataPath) {
    const kdfxResponse = await fetch(withCacheVersion(resolveModelPath(synthModel.kdfxLookupDataPath)));
    if (kdfxResponse.ok) {
      kdfxLookup = await kdfxResponse.json();
    }
  }

  console.log("JSON loaded");
}

async function resolveModelConfigPathFromIndex() {

  const indexPath = CONFIG?.modelsIndexPath || "models/index.json";
  const response = await fetch(withCacheVersion(indexPath));

  if (!response.ok) {
    throw new Error(`Failed to load models index: ${indexPath}`);
  }

  const index = await response.json();
  const models = Array.isArray(index.models) ? index.models : [];

  if (models.length === 0) {
    throw new Error(`No models listed in index: ${indexPath}`);
  }

  const configuredPath = CONFIG?.modelConfigPath || null;
  const manufacturer = CONFIG?.manufacturer || null;
  const model = CONFIG?.model || null;
  const modelId = CONFIG?.modelId || null;
  const selectedModelKey = CONFIG?.selectedModelKey || null;

  let entry = null;

  if (selectedModelKey) {
    entry = models.find(item => item.key === selectedModelKey) || null;
  }

  if (!entry && configuredPath) {
    entry = models.find(item => item.configPath === configuredPath) || null;
  }

  if (!entry && (manufacturer || model || modelId)) {
    entry = models.find(item =>
      (!manufacturer || item.manufacturer === manufacturer) &&
      (!model || item.model === model) &&
      (!modelId || item.modelId === modelId)
    ) || null;
  }

  if (!entry) {
    entry = models.find(item => item.default === true) || models[0];
  }

  if (!entry?.configPath) {
    throw new Error(`Invalid model entry in index: missing configPath`);
  }

  assertSafeRelativePath(entry.configPath, "model config path");
  selectedModelEntry = entry;
  return entry.configPath;
}

function dirname(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function resolveModelPath(path) {

  if (!path) return path;

  assertSafeRelativePath(path, "model data path");

  const allowed = Array.isArray(selectedModelEntry?.allowedDataFiles)
    ? selectedModelEntry.allowedDataFiles
    : [];

  if (allowed.length > 0 && !allowed.includes(path)) {
    throw new Error(`Blocked data path not in allow-list: ${path}`);
  }

  return modelBasePath ? `${modelBasePath}/${path}` : path;
}

function assertSafeRelativePath(path, label) {

  if (typeof path !== "string" || path.trim() === "") {
    throw new Error(`Invalid ${label}: empty`);
  }

  if (path.startsWith("/") || path.includes("..") || /^(https?:)?\/\//.test(path)) {
    throw new Error(`Unsafe ${label}: ${path}`);
  }
}


/* ============================
   MIDI STARTUP
============================ */

async function startMIDI() {

  await WebMidi.enable();

  console.log("WebMidi Enabled");

  let savedId = localStorage.getItem(getMidiStorageKey());

  if (!savedId) {
    const legacySavedId = localStorage.getItem("preferredMidiInput");
    if (legacySavedId) {
      localStorage.setItem(getMidiStorageKey(), legacySavedId);
      savedId = legacySavedId;
    }
  }

  if (savedId) {

    const device = WebMidi.getInputById(savedId);

    if (device) {

      console.log("Auto-connecting to:", device.name);

      connectDevice(device);

      return;

    }

  }

  /* fallback to manual selection */

  showDeviceModal();

}


/* ============================
   DEVICE SELECTOR OVERLAY
============================ */

function showDeviceModal() {

  const modal = document.getElementById("deviceModal");
  const container = document.getElementById("deviceTiles");

  container.innerHTML = "";
  selectedMidiInput = null;

  if (WebMidi.inputs.length === 0) {
    container.innerHTML = '<div class="tile tile-disabled">No Interface Detected</div>';
    buildRomSelector();
    restoreRomSelection();
    modal.style.display = "flex";
    return;
  }

  selectedMidiInput = WebMidi.inputs[0];

  WebMidi.inputs.forEach((input, index) => {

    const tile = document.createElement("div");

    tile.className = "tile";
    tile.textContent = input.name;
    tile.dataset.inputId = input.id;

    if (index === 0) {
      tile.classList.add("active");
    }

    tile.onclick = () => selectMidiInput(input.id);

    container.appendChild(tile);

  });

  buildRomSelector();
  restoreRomSelection();
  modal.style.display = "flex";
  
}

function selectMidiInput(inputId) {

  selectedMidiInput = WebMidi.getInputById(inputId) || null;

  document.querySelectorAll("#deviceTiles .tile").forEach(tile => {
    tile.classList.toggle("active", tile.dataset.inputId === selectedMidiInput?.id);
  });

}


/* ============================
   CONNECT DEVICE
============================ */

function connectDevice(input) {

  if (!input) return;

  mySynth = input;

  console.log("Connected to:", mySynth.name);

  /* save device id */

  localStorage.setItem(getMidiStorageKey(), input.id);

  attachMidiListeners();
  setWaitingDisplay();

  document.getElementById("deviceModal").style.display = "none";

}


/* ============================
   MIDI EVENT LISTENERS
============================ */

function attachMidiListeners() {

  if (!mySynth) return;

  const channel = mySynth.channels[1];

  /* remove previous listeners if user reconnects */

  channel.removeListener("noteon");
  channel.removeListener("controlchange");
  channel.removeListener("programchange");


  /* NOTE EVENTS */

  channel.addListener("noteon", e => {
    console.log("Note:", e.note.name);
  });


  /* BANK SELECT */

  channel.addListener("controlchange", e => {

    if (e.controller.number === 0) {
      myBankMSB = e.rawValue;
      console.log("Bank MSB:", myBankMSB);
    }

    if (e.controller.number === 32) {
      myBankLSB = e.rawValue;
      console.log("Bank LSB:", myBankLSB);
    }

  });


  /* PROGRAM CHANGE */

  channel.addListener("programchange", e => {

    console.log(
      "Bank MSB:", myBankMSB,
      "Bank LSB:", myBankLSB,
      "Program:", e.value
    );

    handleProgramChange(myBankMSB, myBankLSB, e.value);

  });

}


/* ============================
   PATCH DISPLAY
============================ */

function handleProgramChange(myBankMSB, myBankLSB, programNumber) {

  const itemNumber = computeItemNumber(myBankMSB, myBankLSB, programNumber, selectedMode);
  const location = formatPatchLocation(itemNumber, selectedMode);

  if (selectedMode === "programs") {
    const requiredRomCard = getRequiredRomCardForPatch(itemNumber);

    if (requiredRomCard && !isRomCardEnabled(requiredRomCard)) {
      setDisplayText("ROM Not Enabled", location);
      document.getElementById("notes").textContent =
        `Enable "${requiredRomCard.label}" in Config to use this patch location.`;
      return;
    }

    const patch = patches[itemNumber];

    if (!patch) {
      setDisplayText("Unknown Patch", location);
      document.getElementById("notes").textContent = "";
      return;
    }

    setDisplayText(patch.name, location);
    renderProgramNotes(patch);
    return;
  }

  if (selectedMode === "setups") {
    const setup = resolveSetupByNumber(itemNumber);

    if (!setup) {
      setDisplayText("Unknown Setup", location);
      document.getElementById("notes").textContent = "";
      return;
    }

    setDisplayText(setup.name, location);
    renderSetupNotes(setup);
  }
}

function resolveSetupByNumber(setupNumber) {

  if (setups[setupNumber]) {
    return setups[setupNumber];
  }

  const oneBasedCandidate = setupNumber + 1;
  return setups[oneBasedCandidate] || null;
}

function renderProgramNotes(patch) {

  let notesHtml = "";

  patch.controls.forEach(control => {

    if (control.type === "MIDI" || control.type === "MPress") {

      const isMPress = control.type === "MPress";
      const ctrlName = isMPress
        ? "MPress"
        : (midiControllers[control.number] || `CC ${control.number}`);
      const ctrlNameClass = isMPress ? "ctrl-name ctrl-name-mpress" : "ctrl-name";

      notesHtml +=
        `<div class="ctrl-row">
          <span class="${ctrlNameClass}">${ctrlName}</span>
          <span class="ctrl-desc">${control.description}</span>
        </div>`;

    }

    else if (control.type === "Info") {

      notesHtml += `<div class="meta">${control.description}</div>`;

    }

    else {

      notesHtml += `<div class="meta">${control.type} — ${control.description}</div>`;

    }

  });

  document.getElementById("notes").innerHTML = notesHtml;
}

function renderSetupNotes(setup) {

  const text = setup.longRibbonFunction || "No setup notes available";
  document.getElementById("notes").innerHTML =
    `<div class="ctrl-row">
      <span class="ctrl-name">Long Ribbon</span>
      <span class="ctrl-desc">${text}</span>
    </div>`;
}


/* ============================
   SETTINGS BUTTON (COG)
============================ */

function setupSettingsButton() {

  const settings = document.getElementById("settingsButton");

  if (!settings) return;

  settings.addEventListener("click", () => {

    showDeviceModal();

  });

}


function setupWebButton() {

  const webButton = document.getElementById("webButton");

  if (!webButton) return;

  webButton.addEventListener("click", () => {
    const url = synthModel?.supportUrl;
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  });

}

function setupKdfxButton() {

  const programsButton = document.getElementById("programsButton");
  const setupsButton = document.getElementById("setupsButton");
  const modSourcesButton = document.getElementById("modSourcesButton");
  const kdfxButton = document.getElementById("kdfxButton");
  const modSourceSearch = document.getElementById("modSourceSearch");
  const searchInput = document.getElementById("kdfxSearch");

  if (programsButton) {
    programsButton.addEventListener("click", () => {
      showView("main");
    });
  }

  if (setupsButton) {
    if (!setups || Object.keys(setups).length === 0) {
      setupsButton.classList.add("hidden");
    } else {
      setupsButton.addEventListener("click", () => {
        showView("setups");
      });
    }
  }

  if (modSourcesButton) {
    modSourcesButton.addEventListener("click", () => {
      showView("modsources");
      renderModSources(modSourceSearch?.value || "");
    });
  }

  if (modSourceSearch) {
    modSourceSearch.addEventListener("input", () => {
      renderModSources(modSourceSearch.value);
    });
  }

  if (!kdfxButton) return;

  if (!kdfxLookup?.studiosById) {
    kdfxButton.classList.add("hidden");
    return;
  }

  kdfxButton.addEventListener("click", () => {
    showView("kdfx");
    renderKdfxList(searchInput?.value || "");
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderKdfxList(searchInput.value);
    });
  }

}

function showView(viewId) {

  const mainView = document.getElementById("mainView");
  const modSourcesView = document.getElementById("modSourcesView");
  const kdfxView = document.getElementById("kdfxView");
  const programsButton = document.getElementById("programsButton");
  const setupsButton = document.getElementById("setupsButton");
  const modSourcesButton = document.getElementById("modSourcesButton");
  const kdfxButton = document.getElementById("kdfxButton");

  if (viewId === "kdfx") {
    selectedMode = "programs";
    mainView?.classList.add("hidden");
    modSourcesView?.classList.add("hidden");
    kdfxView?.classList.remove("hidden");
    programsButton?.classList.remove("active");
    setupsButton?.classList.remove("active");
    modSourcesButton?.classList.remove("active");
    kdfxButton?.classList.add("active");
    return;
  }

  if (viewId === "modsources") {
    selectedMode = "programs";
    mainView?.classList.add("hidden");
    modSourcesView?.classList.remove("hidden");
    kdfxView?.classList.add("hidden");
    programsButton?.classList.remove("active");
    setupsButton?.classList.remove("active");
    modSourcesButton?.classList.add("active");
    kdfxButton?.classList.remove("active");
    return;
  }

  if (viewId === "setups") {
    selectedMode = "setups";
    mainView?.classList.remove("hidden");
    modSourcesView?.classList.add("hidden");
    kdfxView?.classList.add("hidden");
    programsButton?.classList.remove("active");
    setupsButton?.classList.add("active");
    modSourcesButton?.classList.remove("active");
    kdfxButton?.classList.remove("active");
    return;
  }

  selectedMode = "programs";
  mainView?.classList.remove("hidden");
  modSourcesView?.classList.add("hidden");
  kdfxView?.classList.add("hidden");
  programsButton?.classList.add("active");
  setupsButton?.classList.remove("active");
  modSourcesButton?.classList.remove("active");
  kdfxButton?.classList.remove("active");
}

function renderModSources(query = "") {

  const list = document.getElementById("modSourceList");

  if (!list) return;

  const text = query.trim().toLowerCase();

  const rows = Object.entries(modSources || {})
    .map(([assignedValue, source]) => ({
      assignedValue: Number(assignedValue),
      source: String(source || ""),
    }))
    .sort((a, b) => a.assignedValue - b.assignedValue)
    .filter(row => {
      if (!text) return true;
      return String(row.assignedValue).includes(text) || row.source.toLowerCase().includes(text);
    });

  if (rows.length === 0) {
    list.textContent = "No modulation sources match the search.";
    return;
  }

  list.innerHTML = rows
    .map(row =>
      `<div class="modsrc-row"><span class="modsrc-id">${row.assignedValue}</span><span class="modsrc-name">${row.source}</span></div>`
    )
    .join("");

}

function renderKdfxList(query = "") {

  if (!kdfxLookup?.studiosById) return;

  const container = document.getElementById("kdfxStudioList");
  if (!container) return;

  const text = query.trim().toLowerCase();
  const studios = Object.values(kdfxLookup.studiosById)
    .sort((a, b) => a.id - b.id)
    .filter(studio => {
      if (!text) return true;

      const busTokens = studio.buses
        ? Object.values(studio.buses).flatMap(bus => {
            const presetId = bus.presetId;
            const preset = presetId ? kdfxLookup.presetsById?.[String(presetId)] : null;
            const algorithmId = preset?.algorithmId || bus.algorithmId || null;
            const algorithm = algorithmId ? kdfxLookup.algorithmsById?.[String(algorithmId)] : null;

            return [
              bus.presetName || "",
              `${presetId || ""}`,
              preset?.name || "",
              `${algorithmId || ""}`,
              algorithm?.name || "",
            ];
          })
        : [];

      const haystack = [`${studio.id}`, studio.name, ...busTokens]
        .join(" ")
        .toLowerCase();

      return haystack.includes(text);
    });

  container.innerHTML = "";

  studios.forEach(studio => {
    const item = document.createElement("div");
    item.className = "kdfx-list-item";
    item.textContent = `${String(studio.id).padStart(3, "0")}  ${studio.name}`;

    if (selectedKdfxStudioId === studio.id) {
      item.classList.add("active");
    }

    item.onclick = () => {
      selectedKdfxStudioId = studio.id;
      renderKdfxDetail(studio.id);
      renderKdfxList(query);
    };

    container.appendChild(item);
  });

  if (!selectedKdfxStudioId && studios.length > 0) {
    selectedKdfxStudioId = studios[0].id;
    renderKdfxDetail(selectedKdfxStudioId);
    renderKdfxList(query);
  }

  if (studios.length === 0) {
    document.getElementById("kdfxStudioDetail").textContent = "No studios match the search.";
  }
}

function renderKdfxDetail(studioId) {

  if (!kdfxLookup?.studiosById) return;

  const detail = document.getElementById("kdfxStudioDetail");
  if (!detail) return;

  const studio = kdfxLookup.studiosById[String(studioId)];
  if (!studio) {
    detail.textContent = "Studio not found.";
    return;
  }

  const lines = [];
  const buses = studio.buses || {};

  Object.entries(buses).forEach(([busKey, bus]) => {
    const presetId = bus.presetId;
    const preset = presetId ? kdfxLookup.presetsById?.[String(presetId)] : null;
    const algorithm = preset?.algorithmId
      ? kdfxLookup.algorithmsById?.[String(preset.algorithmId)]
      : null;

    const busLabel = busKey.toUpperCase();
    const presetName = bus.presetName || "N/A";
    const algorithmName = algorithm?.name || (preset?.algorithmName || "Unknown");
    const presetIdLabel = presetId ? `P${String(presetId).padStart(3, "0")}` : "P---";
    const algorithmId = preset?.algorithmId || bus.algorithmId || null;
    const algorithmIdLabel = algorithmId ? `A${String(algorithmId).padStart(3, "0")}` : "A---";

    lines.push(
      `<div class="kdfx-line"><span class="kdfx-label kdfx-bus">${busLabel}</span><span class="kdfx-preset">${presetName}</span> <span class="kdfx-preset-id">[${presetIdLabel}]</span> <span class="kdfx-algorithm">(${algorithmName})</span> <span class="kdfx-algorithm-id">[${algorithmIdLabel}]</span></div>`
    );
  });

  detail.innerHTML = `<h3>${String(studio.id).padStart(3, "0")} ${studio.name}</h3>${lines.join("")}`;
}


/* =====================
ROM CARD SELECTION
======================= */
function getRequiredRomCardForPatch(patchNumber) {

  const rules = synthModel?.patchAccessRules || [];

  for (const rule of rules) {
    if (patchNumber >= rule.start && patchNumber <= rule.end) {
      const rom = (synthModel.romCards || []).find(card => card.id === rule.requiresRomId);
      return rom || null;
    }
  }

  return null;
}

function isRomCardEnabled(card) {

  const saved = getSavedRomIds();
  return saved.includes(card.id);
}


function buildRomSelector() {

  const container = document.getElementById("romTiles");

  container.innerHTML = "";

  const romCards = synthModel?.romCards || [];

  romCards.forEach(card => {

    const tile = document.createElement("div");

    tile.className = "romTile";

    tile.textContent = card.label;
    tile.dataset.romId = card.id;

    tile.onclick = () => {
      tile.classList.toggle("active");
    };

    container.appendChild(tile);

  });

}

function saveRomSelection() {

  const active = [...document.querySelectorAll(".romTile.active")]
      .map(el => el.dataset.romId);

  localStorage.setItem(getRomStorageKey(), JSON.stringify(active));

}

function restoreRomSelection() {

  const saved = getSavedRomIds();

  document.querySelectorAll(".romTile").forEach(tile => {

    if (saved.includes(tile.dataset.romId)) {
      tile.classList.add("active");
    }

  });

}

function getSavedRomIds() {

  const romCards = synthModel?.romCards || [];
  const savedByModel = localStorage.getItem(getRomStorageKey());
  const savedLegacy = localStorage.getItem("k2600_roms");
  const saved = JSON.parse(savedByModel || savedLegacy || "[]");

  if (!Array.isArray(saved)) {
    return [];
  }

  const ids = [];

  saved.forEach(item => {
    const byId = romCards.find(card => card.id === item);
    if (byId) {
      ids.push(byId.id);
      return;
    }

    const byLabel = romCards.find(card => card.label === item);
    if (byLabel) {
      ids.push(byLabel.id);
      return;
    }

    const byAlias = romCards.find(card => (card.aliases || []).includes(item));
    if (byAlias) {
      ids.push(byAlias.id);
    }
  });

  const normalized = [...new Set(ids)];

  if (!savedByModel && normalized.length > 0) {
    localStorage.setItem(getRomStorageKey(), JSON.stringify(normalized));
  }

  return normalized;
}

function formatPatchLocation(patchNumber, modeId = selectedMode) {
  const digits = modeId === "setups"
    ? (synthModel?.setupLocationDigits || 2)
    : (synthModel?.locationDigits || 3);
  return String(patchNumber).padStart(digits, "0");
}

function computeItemNumber(bankMsb, bankLsb, programNumber, modeId) {

  const formula = modeId === "setups"
    ? (synthModel?.setupIndex?.formula || "program_only")
    : (synthModel?.programIndex?.formula || "lsb_times_100_plus_program");

  if (formula === "lsb_times_100_plus_program") {
    return (bankLsb * 100) + programNumber;
  }

  if (formula === "midi_program_only") {
    return programNumber;
  }

  if (formula === "program_only") {
    return programNumber;
  }

  if (formula === "program_plus_1") {
    return programNumber + 1;
  }

  console.warn(`Unknown program index formula "${formula}", falling back to lsb_times_100_plus_program`);
  return (bankLsb * 100) + programNumber;
}

function getMidiStorageKey() {
  const modelId = synthModel?.modelId || "default";
  return `${modelId}_preferredMidiInput`;
}

function getRomStorageKey() {
  const modelId = synthModel?.modelId || "default";
  return `${modelId}_roms`;
}

function setDisplayText(mainText, locationText = null) {

  const display = document.getElementById("display");

  if (!display) return;

  display.textContent = "";

  const nameLine = document.createElement("div");
  nameLine.className = "display-name";
  nameLine.textContent = mainText;
  display.appendChild(nameLine);

  if (!locationText) return;

  const locationLine = document.createElement("div");
  locationLine.className = "display-location";
  const modeLabel = selectedMode === "setups" ? "Setup" : "Program";
  locationLine.textContent = `${modeLabel}: ${locationText}`;
  display.appendChild(locationLine);

}

function setNeedsMidiDisplay() {

  const notes = document.getElementById("notes");

  setDisplayText(NEEDS_MIDI_MESSAGE);

  if (notes) {
    notes.textContent = "";
  }

}

function setWaitingDisplay() {

  setDisplayText(WAITING_MESSAGE);

}


const modal = document.querySelector(".modal");
const okButton = document.querySelector(".okButton");
const cancelButton = document.querySelector(".cancelButton");

/* ===============================
   CLOSE MODAL
================================ */

function closeModal() {
  if (modal) {
    modal.style.display = "none";
  }
}


/* ===============================
   SAVE SETTINGS
================================ */

function saveSettings() {

  if (selectedMidiInput) {
    connectDevice(selectedMidiInput);
  } else if (!mySynth) {
    setNeedsMidiDisplay();
  }

  saveRomSelection();

  console.log("Settings saved");

  closeModal();
}

function cancelSettings() {
  closeModal();

  if (!mySynth) {
    setNeedsMidiDisplay();
  }
}


/* ===============================
   BUTTON HANDLERS
================================ */

okButton.addEventListener("click", saveSettings);

cancelButton.addEventListener("click", cancelSettings);


/* ===============================
   KEYBOARD SHORTCUTS
================================ */

document.addEventListener("keydown", function(e) {

  if (modal.style.display === "none") return;

  if (e.key === "Enter") {
    saveSettings();
  }

  if (e.key === "Escape") {
    cancelSettings();
  }

});






/* ============================
   APPLICATION STARTUP
============================ */

async function startApp() {

  await loadData();

  if (synthModel?.manufacturer) {
    document.title = `${synthModel.manufacturer} ${synthModel.displayName} Patch Display`;
  }

  await startMIDI();
  setupSettingsButton();
  setupWebButton();
  setupKdfxButton();
  showView("main");

}

document.addEventListener("DOMContentLoaded", startApp);
