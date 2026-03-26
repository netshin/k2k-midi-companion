console.log("starting app.js");

/* ============================
   GLOBAL STATE
============================ */

let patches = {};
let setups = {};
let midiControllers = {};
let modSources = {};
let kdfxLookup = null;
let dspAlgorithms = null;
let dspBlockDetails = {};
let keymapsData = null;
let fxPresetsData = null;
let programCategoriesData = null;
let synthModel = null;
let selectedModelEntry = null;
let availableModels = [];
let modelBasePath = "";
const modelConfigCache = new Map();
let mySynth = null;
let selectedMidiInput = null;
let selectedMode = "programs";
let selectedKdfxStudioId = null;
let selectedFxPresetId = null;
let selectedDspAlgorithmId = null;
let modSourceTooltipHideTimer = null;
let dspTooltipHideTimer = null;
let selectedProgramNumber = null;
let selectedSetupNumber = null;
let currentDisplayedType = "programs";
let currentDisplayedNumber = null;
let currentModSourceFilter = "all";
let currentDspAlgorithmFilters = {
  standard: true,
  triple: true,
  layer1: true,
  layer3: true,
};
let searchFilters = {
  programs: true,
  setups: true,
};
let searchProgramCategoryFilters = {};
let favoritesFilters = {
  programs: true,
  setups: true,
  kdfx: true,
};
let favoritesState = {
  programs: [],
  setups: [],
  kdfx: [],
};
let favoritesSortMode = "type";
let keymapFilters = {};

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

async function fetchJson(path, label) {
  const versionedPath = withCacheVersion(path);
  const response = await fetch(versionedPath);

  if (!response.ok) {
    console.error(`[load] Failed ${label}: ${versionedPath} (${response.status})`);
    throw new Error(`Failed to load ${label}: ${path}`);
  }

  console.log(`[load] ${label}: ${versionedPath}`);
  return response.json();
}


/* ============================
   LOAD DATA FILES
============================ */

async function loadData() {

  const modelConfigPath = await resolveModelConfigPathFromIndex();
  synthModel = await fetchJson(modelConfigPath, "model config");
  modelBasePath = dirname(modelConfigPath);

  patches = await fetchJson(resolveModelPath(synthModel.patchDataPath), "patch data");

  const midiCcPath = synthModel.midiCcDataPath || synthModel.controllerDataPath;
  midiControllers = await fetchJson(resolveModelPath(midiCcPath), "controller data");

  if (synthModel.modSourceDataPath) {
    modSources = await fetchJson(resolveModelPath(synthModel.modSourceDataPath), "mod source data");
  } else {
    modSources = {};
  }

  if (synthModel.setupDataPath) {
    setups = await fetchJson(resolveModelPath(synthModel.setupDataPath), "setup data");
  } else {
    setups = {};
  }

  if (synthModel.kdfxLookupDataPath) {
    kdfxLookup = await fetchJson(resolveModelPath(synthModel.kdfxLookupDataPath), "kdfx lookup data");
  } else {
    kdfxLookup = null;
  }

  if (synthModel.dspAlgorithmDataPath) {
    dspAlgorithms = await fetchJson(resolveModelPath(synthModel.dspAlgorithmDataPath), "dsp algorithm data");
  } else {
    dspAlgorithms = null;
  }

  if (synthModel.dspBlockDetailDataPath) {
    dspBlockDetails = await fetchJson(resolveModelPath(synthModel.dspBlockDetailDataPath), "dsp block detail data");
  } else {
    dspBlockDetails = {};
  }

  if (synthModel.keymapDataPath) {
    keymapsData = await fetchJson(resolveModelPath(synthModel.keymapDataPath), "keymap data");
  } else {
    keymapsData = null;
  }

  if (synthModel.fxPresetDataPath) {
    fxPresetsData = await fetchJson(resolveModelPath(synthModel.fxPresetDataPath), "fx preset data");
  } else {
    fxPresetsData = null;
  }

  if (synthModel.programCategoryDataPath) {
    programCategoriesData = await fetchJson(resolveModelPath(synthModel.programCategoryDataPath), "program category data");
  } else {
    programCategoriesData = null;
  }

  console.log("JSON loaded");
}

async function resolveModelConfigPathFromIndex() {

  const indexPath = CONFIG?.modelsIndexPath || "models/index.json";
  const index = await fetchJson(indexPath, "models index");
  const models = Array.isArray(index.models) ? index.models : [];
  availableModels = models;

  if (models.length === 0) {
    throw new Error(`No models listed in index: ${indexPath}`);
  }

  const configuredPath = CONFIG?.modelConfigPath || null;
  const manufacturer = CONFIG?.manufacturer || null;
  const model = CONFIG?.model || null;
  const modelId = CONFIG?.modelId || null;
  const selectedModelKey = CONFIG?.selectedModelKey || null;
  const savedModelKey = getSavedModelSelectionKey() || null;

  let entry = null;

  if (savedModelKey) {
    entry = models.find(item => item.key === savedModelKey) || null;
  }

  if (!entry && selectedModelKey) {
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

function getModelSelectionStorageKey() {
  return "selected_model_key";
}

function getSavedModelSelectionKey() {
  return localStorage.getItem(getModelSelectionStorageKey()) || "";
}

function isFirstRunModelSelectionRequired() {
  return !getSavedModelSelectionKey();
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
  const midiDebugEnabled = document.getElementById("midiDebugEnabled");
  const midiChannelSelect = document.getElementById("midiChannelSelect");
  const needsModelSelection = isFirstRunModelSelectionRequired();

  container.innerHTML = "";
  selectedMidiInput = null;
  buildModelSelector();
  updateFavoritesTransferSummary();
  if (midiDebugEnabled) {
    midiDebugEnabled.checked = isMidiDebugEnabled();
  }
  if (midiChannelSelect) {
    midiChannelSelect.textContent = "";
    for (let channel = 1; channel <= 16; channel += 1) {
      const option = document.createElement("option");
      option.value = String(channel);
      option.textContent = String(channel);
      if (channel === getSelectedMidiChannel()) {
        option.selected = true;
      }
      midiChannelSelect.appendChild(option);
    }
  }

  if (WebMidi.inputs.length === 0) {
    container.innerHTML = '<div class="tile tile-disabled">No Interface Detected</div>';
    refreshModalModelPreview();
    modal.style.display = "flex";
    focusModelSelectorIfNeeded(needsModelSelection);
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

  refreshModalModelPreview();
  modal.style.display = "flex";
  focusModelSelectorIfNeeded(needsModelSelection);
  
}

function selectMidiInput(inputId) {

  selectedMidiInput = WebMidi.getInputById(inputId) || null;

  document.querySelectorAll("#deviceTiles .tile").forEach(tile => {
    tile.classList.toggle("active", tile.dataset.inputId === selectedMidiInput?.id);
  });

}

function buildModelSelector() {
  const select = document.getElementById("modelSelect");
  const savedModelKey = getSavedModelSelectionKey();

  if (!select) return;

  select.textContent = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a model...";
  placeholder.disabled = !isFirstRunModelSelectionRequired();
  placeholder.hidden = !isFirstRunModelSelectionRequired();
  placeholder.selected = !savedModelKey;
  select.appendChild(placeholder);

  availableModels.forEach(model => {
    const option = document.createElement("option");
    option.value = model.key;
    option.textContent = `${model.manufacturer} ${model.model}`;
    if (savedModelKey && model.key === selectedModelEntry?.key) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.onchange = () => {
    refreshModalModelPreview();
  };
}

function focusModelSelectorIfNeeded(needsModelSelection) {
  if (!needsModelSelection) return;

  const select = document.getElementById("modelSelect");
  if (!select) return;

  requestAnimationFrame(() => {
    select.focus();
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

  for (let channelNumber = 1; channelNumber <= 16; channelNumber += 1) {
    const cleanupChannel = mySynth.channels[channelNumber];
    cleanupChannel.removeListener("noteon");
    cleanupChannel.removeListener("controlchange");
    cleanupChannel.removeListener("programchange");
  }

  const channelNumber = getSelectedMidiChannel();
  const channel = mySynth.channels[channelNumber];

  midiDebugLog(`Listening on MIDI channel ${channelNumber}`);

  channel.addListener("noteon", e => {
    midiDebugLog(`CH${channelNumber} Note On`, {
      note: e.note?.identifier || e.note?.name || null,
      rawData: e.data || null,
    });
  });

  channel.addListener("controlchange", e => {
    midiDebugLog(`CH${channelNumber} Control Change`, {
      controller: e.controller?.number ?? null,
      value: e.rawValue,
      rawData: e.data || null,
    });

    if (e.controller.number === 0) {
      myBankMSB = e.rawValue;
      midiDebugLog(`CH${channelNumber} Bank MSB`, myBankMSB);
    }

    if (e.controller.number === 32) {
      myBankLSB = e.rawValue;
      midiDebugLog(`CH${channelNumber} Bank LSB`, myBankLSB);
    }
  });

  channel.addListener("programchange", e => {
    midiDebugLog(`CH${channelNumber} Program Change`, {
      bankMsb: myBankMSB,
      bankLsb: myBankLSB,
      program: e.value,
      rawData: e.data || null,
    });

    handleProgramChange(myBankMSB, myBankLSB, e.value);
  });

}


/* ============================
   PATCH DISPLAY
============================ */

function handleProgramChange(myBankMSB, myBankLSB, programNumber) {

  const itemNumber = computeItemNumber(myBankMSB, myBankLSB, programNumber, selectedMode);
  displayCatalogItem(selectedMode, itemNumber);
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
  const controls = Array.isArray(patch?.controls) ? patch.controls : [];
  const visibleControls = controls.filter(control => !isKdfxStudioInfoControl(control));
  const primaryControls = visibleControls.filter(control => control.type !== "Info" && control.type !== "MPress");
  const mpressControls = visibleControls.filter(control => control.type === "MPress");
  const infoControls = visibleControls.filter(control => control.type === "Info");

  primaryControls.forEach(control => {

    if (control.type === "MIDI") {

      notesHtml +=
        `<div class="ctrl-row">
          <span class="ctrl-name">${getMidiControllerDisplayLabel(control.number)}</span>
          <span class="ctrl-desc">${formatDisplayedNoteText(control.description)}</span>
        </div>`;

    }

    else {

      notesHtml +=
        `<div class="ctrl-row">
          <span class="ctrl-name">${formatControlTypeLabel(control.type)}</span>
          <span class="ctrl-desc">${formatDisplayedNoteText(control.description)}</span>
        </div>`;

    }

  });

  mpressControls.forEach(control => {
    notesHtml +=
      `<div class="ctrl-row">
        <span class="ctrl-name ctrl-name-mpress">MPress</span>
        <span class="ctrl-desc">${formatDisplayedNoteText(control.description)}</span>
      </div>`;
  });

  infoControls.forEach(control => {
    notesHtml += `<div class="meta">${formatDisplayedNoteText(control.description)}</div>`;
  });

  document.getElementById("notes").innerHTML = notesHtml;
}

function renderSetupNotes(setup) {

  const secondarySingular = getSecondaryLabelSingular().toLowerCase();
  const structuredRows = Array.isArray(setup.controls) ? setup.controls : [];

  if (structuredRows.length > 0) {
    const notesHtml = structuredRows.map(row => {
      if (!row.label) {
        return `<div class="meta">${row.description}</div>`;
      }

      const displayLabel = formatSetupControlLabel(row.label);

      return `<div class="ctrl-row">
        <span class="ctrl-name">${displayLabel}</span>
        <span class="ctrl-desc">${row.description}</span>
      </div>`;
    }).join("");

    document.getElementById("notes").innerHTML = notesHtml;
    return;
  }

  const hasRibbonText = Boolean(setup.longRibbonFunction);
  const text = stripKdfxStudioText(setup.longRibbonFunction) || `No ${secondarySingular} notes available`;
  const rows = parseSetupNoteRows(text);

  if (rows.length === 0) {
    const label = hasRibbonText ? "Long Ribbon" : "Notes";
    document.getElementById("notes").innerHTML =
      `<div class="ctrl-row">
        <span class="ctrl-name">${label}</span>
        <span class="ctrl-desc">${formatDisplayedNoteText(formatSetupNotesText(text))}</span>
      </div>`;
    return;
  }

  const notesHtml = rows.map(row => {
    if (!row.label) {
      return `<div class="meta">${formatDisplayedNoteText(row.description)}</div>`;
    }

    return `<div class="ctrl-row">
      <span class="ctrl-name">${formatSetupControlLabel(row.label)}</span>
      <span class="ctrl-desc">${formatDisplayedNoteText(row.description)}</span>
    </div>`;
  }).join("");

  document.getElementById("notes").innerHTML = notesHtml;
}

function formatControlTypeLabel(type) {

  if (typeof type !== "string") {
    return String(type || "");
  }

  const normalizedHardwareLabel = getHardwareControlDisplayLabel(type);
  if (normalizedHardwareLabel) {
    return normalizedHardwareLabel;
  }

  const sliderLabels = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "D,E", "E/F"]);

  if (sliderLabels.has(type)) {
    return `Slider ${type}`;
  }

  return type;
}

function isKdfxStudioInfoControl(control) {

  return control?.type === "Info"
    && typeof control?.description === "string"
    && control.description.startsWith("KDFX studio: ");
}

function stripKdfxStudioText(text) {

  if (typeof text !== "string" || text.length === 0) {
    return text;
  }

  return text
    .split(" | ")
    .map(section => section.trim())
    .filter(section => section.length > 0)
    .map(section => {
      const parts = section
        .split("; ")
        .map(part => part.trim())
        .filter(part => part.length > 0 && !part.startsWith("KDFX studio: "));

      return parts.join("; ");
    })
    .filter(section => section.length > 0)
    .join(" | ");
}

function formatSetupNotesText(text) {

  if (typeof text !== "string" || text.length === 0) {
    return text;
  }

  const withSliderLabels = text.replace(
    /(^|; )(A|B|C|D|E|F|G|H|D,E|E\/F): /g,
    (match, prefix, label) => `${prefix}${formatControlTypeLabel(label)}: `
  );

  return withSliderLabels.replaceAll(" | ", "<br>");
}

function parseSetupNoteRows(text) {

  if (typeof text !== "string" || text.trim() === "") {
    return [];
  }

  const tokens = text
    .replaceAll(" | ", "; ")
    .split("; ")
    .map(token => token.trim())
    .filter(Boolean);

  const rows = [];

  tokens.forEach(token => {
    const parsed = parseSetupNoteToken(token);

    if (!parsed) {
      if (rows.length > 0) {
        rows[rows.length - 1].description = `${rows[rows.length - 1].description}; ${token}`.trim();
      } else {
        rows.push({ label: "", description: token });
      }
      return;
    }

    const expanded = expandSetupNoteRow(parsed);
    rows.push(...expanded);
  });

  return rows
    .map((row, index) => ({ ...row, originalIndex: index }))
    .sort(compareSetupNoteRows)
    .map(({ originalIndex, ...row }) => row);
}

function parseSetupNoteToken(token) {

  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return null;
  }

  const colonMatch = normalizedToken.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    return {
      label: formatSetupControlLabel(colonMatch[1].trim()),
      description: colonMatch[2].trim(),
    };
  }

  const labelMatch = normalizedToken.match(/^(ModWhl|Mod Wh|ModWh|PSw ?\d?|PSw|FootSw\d*|FootSw|Lg Rib(?: sec \d)?|LgRbn|L Rib(?: Sect\d)?|L Rib|LRbn|Sm Rib Press|SmRbn|S Rib|MW\/SftP|MW|MPress|Press|Breath|Tempo|Sustain|Chan S|GAttVel|GKeyNum|KeyNum|AttVel|Velocity)\s+(.+)$/);

  if (labelMatch) {
    return {
      label: formatSetupControlLabel(labelMatch[1].trim()),
      description: labelMatch[2].trim(),
    };
  }

  return null;
}

function formatSetupControlLabel(label) {

  if (typeof label !== "string") {
    return String(label || "");
  }

  const compact = label.replace(/\s+/g, " ").trim();
  const directHardwareLabel = getHardwareControlDisplayLabel(compact);

  if (directHardwareLabel) {
    return directHardwareLabel;
  }

  if (/^[A-H]$/.test(compact) || compact === "D,E" || compact === "E/F") {
    return formatControlTypeLabel(compact);
  }

  if (/^Slider[A-H]$/i.test(compact)) {
    return compact.replace(/^Slider([A-H])$/i, "Slider $1");
  }

  const aliases = {
    "Mod Wh": "Modulation Wheel",
    "ModWh": "Modulation Wheel",
    "ModWhl": "Modulation Wheel",
    "MW": "Modulation Wheel",
    "L Rib": "Large Ribbon",
    "L Rib Sect1": "Large Ribbon Section 1",
    "L Rib Sect2": "Large Ribbon Section 2",
    "L Rib Sect3": "Large Ribbon Section 3",
    "LgRbn": "Large Ribbon",
    "LRbn": "Large Ribbon",
    "Lg Rib": "Large Ribbon",
    "Lg Rib sec 1": "Large Ribbon Section 1",
    "Lg Rib sec 2": "Large Ribbon Section 2",
    "Lg Rib sec 3": "Large Ribbon Section 3",
    "S Rib": "Small Ribbon",
    "SmRbn": "Small Ribbon",
    "Sm Rib": "Small Ribbon",
    "Sm Rib Press": "Small Ribbon Press",
  };

  const aliased = aliases[compact] || compact;
  const mappedAlias = getHardwareControlDisplayLabel(aliased) || aliased;

  return mappedAlias;
}

function expandSetupNoteRow(row) {

  if (!row?.label || typeof row.description !== "string") {
    return [row];
  }

  if (row.label === "Sliders") {
    const expanded = expandGroupedSliderDescription(row.description);
    return expanded.length > 0 ? expanded : [row];
  }

  const sliderRangeMatch = row.label.match(/^Sliders ([A-H])-([A-H])$/);
  if (sliderRangeMatch) {
    return expandSliderLetters(
      getLetterRange(sliderRangeMatch[1], sliderRangeMatch[2]),
      row.description
    );
  }

  return [row];
}

function expandGroupedSliderDescription(description) {

  const manualRows = getManualSetupSliderRows(description);
  if (manualRows.length > 0) {
    return manualRows;
  }

  const clauses = description
    .split(/\s*,\s*/)
    .map(clause => clause.trim())
    .filter(Boolean);

  const rows = [];

  for (const clause of clauses) {
    const expanded = expandSliderClause(clause);
    if (expanded.length === 0) {
      return [];
    }
    rows.push(...expanded);
  }

  return rows;
}

function getManualSetupSliderRows(description) {

  const normalized = description.replace(/\s+/g, " ").trim();

  const manualRowsByDescription = {
    "A-C group faders, PSw2: group mute": [
      { label: "Slider A", description: "group fader" },
      { label: "Slider B", description: "group fader" },
      { label: "Slider C", description: "group fader" },
    ],
    "A-C zone faders for zones 2-4, D detune piano & increase volume of pad, FootSw1: arp latch, L Rib: zone fader for arpeggiated zone": [
      { label: "Slider A", description: "zone 2 fader" },
      { label: "Slider B", description: "zone 3 fader" },
      { label: "Slider C", description: "zone 4 fader" },
      { label: "Slider D", description: "detune piano & increase volume of pad" },
    ],
    "A-B group faders, C decay time (flute), timbre (RH lead), L Rib: vibrato": [
      { label: "Slider A", description: "group fader" },
      { label: "Slider B", description: "group fader" },
      { label: "Slider C", description: "decay time (flute), timbre (RH lead)" },
    ],
    "A-B group faders, PSw1: arp latch": [
      { label: "Slider A", description: "group fader" },
      { label: "Slider B", description: "group fader" },
    ],
    "A key vel, timbre, B group fader, C mod rate, D wind key num, E zone fader": [
      { label: "Slider A", description: "key velocity, timbre" },
      { label: "Slider B", description: "group fader" },
      { label: "Slider C", description: "mod rate" },
      { label: "Slider D", description: "wind key num" },
      { label: "Slider E", description: "zone fader" },
    ],
  };

  return manualRowsByDescription[normalized] || [];
}

function expandSliderClause(clause) {

  const rangeMatch = clause.match(/^([A-H])-([A-H])\s+(.+)$/);
  if (rangeMatch) {
    return expandSliderLetters(
      getLetterRange(rangeMatch[1], rangeMatch[2]),
      rangeMatch[3]
    );
  }

  const andMatch = clause.match(/^([A-H])\s*&\s*([A-H])\s+(.+)$/);
  if (andMatch) {
    return expandSliderLetters(
      [andMatch[1], andMatch[2]],
      andMatch[3]
    );
  }

  const singleMatch = clause.match(/^([A-H])\s+(.+)$/);
  if (singleMatch) {
    return expandSliderLetters([singleMatch[1]], singleMatch[2]);
  }

  return [];
}

function expandSliderLetters(letters, description) {

  return letters.map(letter => ({
    label: `Slider ${letter}`,
    description: description.trim(),
  }));
}

function getLetterRange(start, end) {

  const alphabet = "ABCDEFGH";
  const startIndex = alphabet.indexOf(start);
  const endIndex = alphabet.indexOf(end);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return [];
  }

  return alphabet.slice(startIndex, endIndex + 1).split("");
}

function formatDisplayedNoteText(text) {

  if (typeof text !== "string" || text.length === 0) {
    return text;
  }

  return text
    .replace(/[;,\s]+$/, "")
    .replace(/\bLg Rib\b/g, "Large Ribbon")
    .replace(/\bL Rib\b/g, "Large Ribbon")
    .replace(/\bLgRbn\b/g, "Large Ribbon")
    .replace(/\bLRbn\b/g, "Large Ribbon")
    .replace(/\bS Rib\b/g, "Small Ribbon")
    .replace(/\bSm Rib\b/g, "Small Ribbon")
    .replace(/\bSmRbn\b/g, "Small Ribbon")
    .replace(/\bMod Wh\b/g, "Modulation Wheel")
    .replace(/\bModWhl\b/g, "Modulation Wheel")
    .replace(/\bModWh\b/g, "Modulation Wheel")
    .replace(/\bMW\b/g, "Modulation Wheel")
    .replace(/\brvbs\b/gi, "reverbs")
    .replace(/\brvb\b/gi, "reverb")
    .replace(/\blvls\b/gi, "levels")
    .replace(/\blvl\b/gi, "level")
    .replace(/\bw\/d\b/gi, "wet/dry")
    .replace(/\bdly\b/gi, "delay")
    .replace(/\bfb\b/gi, "feedback")
    .replace(/\bfreq\b/gi, "frequency")
    .replace(/\bfilt\b/gi, "filter")
    .replace(/\benv\b/gi, "envelope")
    .replace(/\bvel\b/gi, "velocity")
    .replace(/\bctl\b/gi, "control")
    .replace(/\bpredly\b/gi, "predelay")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function compareSetupNoteRows(a, b) {

  const priorityA = getSetupNoteRowPriority(a);
  const priorityB = getSetupNoteRowPriority(b);

  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  if (priorityA === 0 || priorityA === 1) {
    const orderA = getSliderLabelSortKey(a.label);
    const orderB = getSliderLabelSortKey(b.label);
    if (orderA !== orderB) {
      return orderA - orderB;
    }
  }

  return (a.originalIndex || 0) - (b.originalIndex || 0);
}

function getSetupNoteRowPriority(row) {

  const label = typeof row?.label === "string" ? row.label : "";

  if (label === "Sliders" || /^Sliders\b/.test(label)) {
    return 0;
  }

  if (/^Slider\b/.test(label)) {
    return 1;
  }

  if (!label) {
    return 99;
  }

  return 10;
}

function getSliderLabelSortKey(label) {

  if (typeof label !== "string") {
    return 999;
  }

  const match = label.match(/\b([A-H])\b/);
  if (!match) {
    return 0;
  }

  return "ABCDEFGH".indexOf(match[1]) + 1;
}

function displayCatalogItem(modeId, itemNumber) {

  const location = formatPatchLocation(itemNumber, modeId);
  const notes = document.getElementById("notes");
  currentDisplayedType = modeId;
  currentDisplayedNumber = itemNumber;
  updateFavoriteToggleButton();

  if (modeId === "programs") {
    selectedProgramNumber = itemNumber;

    const requiredRomCard = getRequiredRomCardForCatalogItem("programs", itemNumber);

    if (requiredRomCard && !isRomCardEnabled(requiredRomCard)) {
      setDisplayText("ROM Not Enabled", location);
      if (notes) {
        notes.textContent = `Enable "${requiredRomCard.label}" in Config to use this patch location.`;
      }
      renderSearchResults(getPatchSearchQuery());
      renderFavoritesResults(getFavoritesSearchQuery());
      return;
    }

    const patch = patches[itemNumber];

    if (!patch) {
      setDisplayText("Unknown Patch", location);
      if (notes) {
        notes.textContent = "";
      }
      renderSearchResults(getPatchSearchQuery());
      renderFavoritesResults(getFavoritesSearchQuery());
      return;
    }

    setDisplayText(patch.name, location);
    renderProgramNotes(patch);
    renderSearchResults(getPatchSearchQuery());
    renderFavoritesResults(getFavoritesSearchQuery());
    return;
  }

  if (modeId === "setups") {
    selectedSetupNumber = itemNumber;
    const requiredRomCard = getRequiredRomCardForCatalogItem("setups", itemNumber);

    if (requiredRomCard && !isRomCardEnabled(requiredRomCard)) {
      setDisplayText("ROM Not Enabled", location);
      if (notes) {
        notes.textContent = `Enable "${requiredRomCard.label}" in Config to use this patch location.`;
      }
      renderSearchResults(getPatchSearchQuery());
      renderFavoritesResults(getFavoritesSearchQuery());
      return;
    }

    const setup = resolveSetupByNumber(itemNumber);

    if (!setup) {
      setDisplayText(`Unknown ${getSecondaryLabelSingular()}`, location);
      if (notes) {
        notes.textContent = "";
      }
      renderSearchResults(getPatchSearchQuery());
      renderFavoritesResults(getFavoritesSearchQuery());
      return;
    }

    setDisplayText(setup.name, location);
    renderSetupNotes(setup);
    renderSearchResults(getPatchSearchQuery());
    renderFavoritesResults(getFavoritesSearchQuery());
  }
}

function getPatchSearchQuery() {
  return document.getElementById("patchSearch")?.value || "";
}

function focusPatchSearch() {
  focusInputById("patchSearch");
}

function getFavoritesSearchQuery() {
  return document.getElementById("favoritesSearch")?.value || "";
}

function focusFavoritesSearch() {
  focusInputById("favoritesSearch");
}

function getKdfxSearchQuery() {
  return document.getElementById("kdfxSearch")?.value || "";
}

function focusInputById(inputId) {

  const input = document.getElementById(inputId);

  if (!input) return;

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function getProgramLabelSingular() {
  return synthModel?.programLabelSingular || "Program";
}

function getProgramLabelPlural() {
  return synthModel?.programLabelPlural || "Programs";
}

function getSecondaryLabelSingular() {
  return synthModel?.setupLabelSingular || "Setup";
}

function getSecondaryLabelPlural() {
  return synthModel?.setupLabelPlural || "Setups";
}

function getKdfxLabelSingular() {
  return synthModel?.kdfxLabelSingular || "KDFX Studio";
}

function getKdfxLabelPlural() {
  return synthModel?.kdfxLabelPlural || "KDFX Studios";
}

function getFxPresetSearchQuery() {
  return document.getElementById("fxPresetsSearch")?.value || "";
}

function focusFxPresetsSearch() {
  focusInputById("fxPresetsSearch");
}

function getFavoritesCategoryLabels() {
  return {
    programs: getProgramLabelPlural().toLowerCase(),
    setups: getSecondaryLabelPlural().toLowerCase(),
    kdfx: getKdfxLabelPlural().toLowerCase(),
  };
}

function getProgramCategories() {
  return Array.isArray(programCategoriesData?.categories)
    ? programCategoriesData.categories
    : [];
}

function hasProgramCategories() {
  return getProgramCategories().length > 0;
}

function initializeProgramCategoryFilters() {
  searchProgramCategoryFilters = {};
  getProgramCategories().forEach(category => {
    searchProgramCategoryFilters[category.id] = true;
  });
}

function areAllProgramCategoriesActive() {
  const values = Object.values(searchProgramCategoryFilters);
  return values.length === 0 || values.every(Boolean);
}

function isProgramCategoryVisible(categoryId) {
  if (!hasProgramCategories()) {
    return true;
  }

  if (!categoryId) {
    return true;
  }

  return searchProgramCategoryFilters[categoryId] !== false;
}

function updateCategoryFilterButtons() {
  const container = document.getElementById("programCategoryFilters");

  if (!container) return;

  container.classList.toggle("hidden", !hasProgramCategories());

  if (!hasProgramCategories()) {
    container.textContent = "";
    return;
  }

  container.textContent = "";

  getProgramCategories().forEach(category => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "k2600-button";
    button.textContent = category.label;
    button.classList.toggle("active", searchProgramCategoryFilters[category.id] !== false);
    button.addEventListener("click", () => {
      toggleProgramCategoryFilter(category.id);
    });
    container.appendChild(button);
  });
}

function toggleProgramCategoryFilter(categoryId) {
  if (!(categoryId in searchProgramCategoryFilters)) return;

  const nextValue = !searchProgramCategoryFilters[categoryId];
  const activeCount = Object.values(searchProgramCategoryFilters).filter(Boolean).length;

  if (!nextValue && activeCount === 1) {
    return;
  }

  searchProgramCategoryFilters[categoryId] = nextValue;
  updateCategoryFilterButtons();
  renderSearchResults(getPatchSearchQuery());
}

function applyModelLabels() {
  const programPlural = getProgramLabelPlural();
  const secondarySingular = getSecondaryLabelSingular();
  const secondaryPlural = getSecondaryLabelPlural();

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text;
    }
  };

  setText("programsButton", programPlural);
  setText("setupsButton", secondaryPlural);
  setText("filterProgramsButton", programPlural);
  setText("filterSetupsButton", secondaryPlural);
  setText("favoritesFilterProgramsButton", programPlural);
  setText("favoritesFilterSetupsButton", secondaryPlural);
  setText("favoritesFilterKdfxButton", getKdfxLabelPlural());

  const searchButton = document.getElementById("searchButton");
  if (searchButton) {
    searchButton.title = `Search ${programPlural} and ${secondaryPlural} (Alt+R)`;
  }

  const favoritesButton = document.getElementById("favoritesButton");
  if (favoritesButton) {
    favoritesButton.title = "Display favorites (Alt+F)";
  }

  const programsButton = document.getElementById("programsButton");
  if (programsButton) {
    programsButton.title = `Display Details about ${programPlural} (Alt+P)`;
  }

  const setupsButton = document.getElementById("setupsButton");
  if (setupsButton) {
    setupsButton.title = `Display Details about ${secondaryPlural} (Alt+S)`;
  }

  const kdfxButton = document.getElementById("kdfxButton");
  if (kdfxButton) {
    kdfxButton.textContent = getKdfxLabelPlural();
    kdfxButton.title = `Display details about ${getKdfxLabelPlural()}`;
  }

  const kdfxViewTitle = document.getElementById("kdfxViewTitle");
  if (kdfxViewTitle) {
    kdfxViewTitle.textContent = getKdfxLabelPlural();
  }

  const kdfxSearch = document.getElementById("kdfxSearch");
  if (kdfxSearch) {
    kdfxSearch.placeholder = `Search ${getKdfxLabelSingular().toLowerCase()}...`;
  }

  const patchSearch = document.getElementById("patchSearch");
  if (patchSearch) {
    patchSearch.placeholder = `Search ${programPlural.toLowerCase()} and ${secondaryPlural.toLowerCase()} by name, location, or notes...`;
  }

  const favoritesSearch = document.getElementById("favoritesSearch");
  if (favoritesSearch) {
    favoritesSearch.placeholder = `Search favorites across ${programPlural.toLowerCase()}, ${secondaryPlural.toLowerCase()}, and ${getKdfxLabelPlural().toLowerCase()}...`;
  }

  const title = document.querySelector("title");
  if (title) {
    title.textContent = CONFIG?.appName || "K2k-MIDI-Companion";
  }

  const webButton = document.getElementById("webButton");
  if (webButton && synthModel?.displayName) {
    webButton.title = `Visit support for your ${synthModel.displayName}`;
  }

  const romSettingsHeading = document.getElementById("romSettingsHeading");
  if (romSettingsHeading) {
    romSettingsHeading.textContent = "Installed ROMs";
  }

  const favoritesSettingsHeading = document.getElementById("favoritesSettingsHeading");
  if (favoritesSettingsHeading) {
    favoritesSettingsHeading.textContent = "Favorites";
  }
}

function getProgramSearchEntries() {

  return Object.entries(patches || {})
    .map(([key, patch]) => {
      const number = Number(key);
      const categoryLabel = String(patch?.categoryLabel || "");

      return {
        number,
        type: "programs",
        typeLabel: getProgramLabelSingular(),
        name: String(patch?.name || `Unnamed ${getProgramLabelSingular()}`),
        location: formatPatchLocation(number, "programs"),
        categoryId: String(patch?.categoryId || ""),
        categoryLabel,
        meta: categoryLabel || "-",
        searchText: [
          number,
          formatPatchLocation(number, "programs"),
          patch?.name || "",
          categoryLabel,
        ].join(" ").toLowerCase(),
      };
    })
    .sort((a, b) => a.number - b.number);
}

function getSetupSearchEntries() {

  return Object.keys(setups || {})
    .map(key => {
      const number = Number(key);
      const setup = resolveSetupByNumber(number);
      const secondarySingular = getSecondaryLabelSingular().toLowerCase();
      const ribbonText = setup?.longRibbonFunction || `No ${secondarySingular} notes available`;
      const categoryLabel = String(setup?.categoryLabel || "");
      const meta = categoryLabel || "-";

      return {
        number,
        type: "setups",
        typeLabel: getSecondaryLabelSingular(),
        name: String(setup?.name || `Unnamed ${getSecondaryLabelSingular()}`),
        location: formatPatchLocation(number, "setups"),
        meta,
        searchText: [
          number,
          formatPatchLocation(number, "setups"),
          setup?.name || "",
          categoryLabel,
          ribbonText,
        ].join(" ").toLowerCase(),
      };
    })
    .filter(entry => entry.name)
    .sort((a, b) => a.number - b.number);
}

function getCombinedSearchEntries() {
  return [...getProgramSearchEntries(), ...getSetupSearchEntries()]
    .sort((a, b) => {
      const byNumber = a.number - b.number;
      if (byNumber !== 0) return byNumber;
      const byType = a.typeLabel.localeCompare(b.typeLabel, undefined, { sensitivity: "base" });
      if (byType !== 0) return byType;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

function compareEntriesByTypeThenName(a, b) {
  const typeOrder = a.type.localeCompare(b.type, undefined, { sensitivity: "base" });
  if (typeOrder !== 0) return typeOrder;

  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  if (byName !== 0) return byName;

  return a.number - b.number;
}

function compareEntriesByNameThenType(a, b) {
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  if (byName !== 0) return byName;

  const typeOrder = a.type.localeCompare(b.type, undefined, { sensitivity: "base" });
  if (typeOrder !== 0) return typeOrder;

  return a.number - b.number;
}

function getFavoriteEntries() {
  return [
    ...getCombinedSearchEntries(),
    ...getKdfxFavoriteEntries(),
  ]
    .filter(entry => isFavorite(entry.type, entry.number))
    .sort(favoritesSortMode === "name" ? compareEntriesByNameThenType : compareEntriesByTypeThenName);
}

function updateSearchFilterButtons() {

  const programsButton = document.getElementById("filterProgramsButton");
  const setupsButton = document.getElementById("filterSetupsButton");

  programsButton?.classList.toggle("active", searchFilters.programs);
  setupsButton?.classList.toggle("active", searchFilters.setups);
}

function updateFavoritesFilterButtons() {
  const programsButton = document.getElementById("favoritesFilterProgramsButton");
  const setupsButton = document.getElementById("favoritesFilterSetupsButton");
  const kdfxButton = document.getElementById("favoritesFilterKdfxButton");

  programsButton?.classList.toggle("active", favoritesFilters.programs);
  setupsButton?.classList.toggle("active", favoritesFilters.setups);
  kdfxButton?.classList.toggle("active", favoritesFilters.kdfx);
}

function updateFavoritesSortButton() {
  const sortButton = document.getElementById("favoritesSortButton");

  if (!sortButton) return;

  const isType = favoritesSortMode === "type";
  sortButton.classList.toggle("active", isType);
  sortButton.textContent = isType ? "Type" : "Name";
  sortButton.title = isType ? "Sort favorites by type first" : "Sort favorites by name first";
  sortButton.setAttribute("aria-label", sortButton.title);
}

function toggleSearchFilter(filterKey) {

  if (!(filterKey in searchFilters)) return;

  const nextValue = !searchFilters[filterKey];
  const activeCount = Object.values(searchFilters).filter(Boolean).length;

  if (!nextValue && activeCount === 1) {
    return;
  }

  searchFilters[filterKey] = nextValue;
  updateSearchFilterButtons();
  renderSearchResults(getPatchSearchQuery());
}

function toggleFavoritesFilter(filterKey) {
  if (!(filterKey in favoritesFilters)) return;

  const nextValue = !favoritesFilters[filterKey];
  const activeCount = Object.values(favoritesFilters).filter(Boolean).length;

  if (!nextValue && activeCount === 1) {
    return;
  }

  favoritesFilters[filterKey] = nextValue;
  updateFavoritesFilterButtons();
  renderFavoritesResults(getFavoritesSearchQuery());
}

function toggleFavoritesSort() {
  favoritesSortMode = favoritesSortMode === "type" ? "name" : "type";
  updateFavoritesSortButton();
  renderFavoritesResults(getFavoritesSearchQuery());
}

function openSearchResult(entry) {

  if (!entry) return;

  if (entry.type === "kdfx") {
    selectedKdfxStudioId = entry.number;
    showView("kdfx");
    renderKdfxList(getKdfxSearchQuery());
    renderKdfxDetail(entry.number);
    return;
  }

  if (entry.type === "setups") {
    showView("setups");
    displayCatalogItem("setups", entry.number);
    return;
  }

  showView("main");
  displayCatalogItem("programs", entry.number);
}

function isCatalogSearchEntryVisible(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  if (entry.type !== "programs" && entry.type !== "setups") {
    return true;
  }

  const requiredRomCard = getRequiredRomCardForCatalogItem(entry.type, entry.number);
  return !requiredRomCard || isRomCardEnabled(requiredRomCard);
}

function createFavoriteToggle(type, number, labelText = "Toggle favorite") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "favorite-toggle";
  button.textContent = "★";

  const updateState = () => {
    const active = isFavorite(type, number);
    const title = active ? `Remove ${labelText} from favorites` : `Add ${labelText} to favorites`;
    button.classList.toggle("active", active);
    button.title = title;
    button.setAttribute("aria-label", title);
  };

  updateState();
  button.addEventListener("click", event => {
    event.stopPropagation();
    toggleFavorite(type, number);
    updateState();
  });

  return button;
}

function createBrowserItem(entry, onOpen) {
  const item = document.createElement("div");
  item.className = "browser-item";
  item.dataset.type = entry.type;

  if (currentDisplayedType === entry.type && currentDisplayedNumber === entry.number) {
    item.classList.add("active");
  }

  const location = document.createElement("div");
  location.className = "browser-item-location";
  location.textContent = entry.location;

  const type = document.createElement("div");
  type.className = "browser-item-type";
  type.textContent = entry.typeLabel;

  const body = document.createElement("div");
  body.className = "browser-item-body";

  const name = document.createElement("div");
  name.className = "browser-item-name";
  name.textContent = entry.name;

  const meta = document.createElement("div");
  meta.className = "browser-item-meta";
  meta.textContent = entry.meta;

  const actions = document.createElement("div");
  actions.className = "browser-item-actions";
  actions.appendChild(createFavoriteToggle(entry.type, entry.number, `${entry.typeLabel.toLowerCase()} ${entry.location}`));

  body.appendChild(name);
  body.appendChild(meta);
  item.appendChild(location);
  item.appendChild(type);
  item.appendChild(body);
  item.appendChild(actions);
  item.addEventListener("click", () => onOpen(entry));

  return item;
}

function renderSearchResults(query = "") {

  const container = document.getElementById("patchSearchResults");
  const summary = document.getElementById("patchSearchSummary");

  if (!container) return;

  const text = query.trim().toLowerCase();
  const entries = getCombinedSearchEntries();
  const filteredEntries = entries.filter(entry => {
    if (!searchFilters[entry.type]) {
      return false;
    }

    if (!isCatalogSearchEntryVisible(entry)) {
      return false;
    }

    if (entry.type === "programs" && !isProgramCategoryVisible(entry.categoryId)) {
      return false;
    }

    return !text || entry.searchText.includes(text);
  });

  if (summary) {
    summary.textContent = `${filteredEntries.length} shown`;
  }

  container.textContent = "";

  if (filteredEntries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "browser-empty";
    empty.textContent = `No ${getProgramLabelPlural().toLowerCase()} or ${getSecondaryLabelPlural().toLowerCase()} match the search.`;
    container.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  filteredEntries.forEach(entry => {
    fragment.appendChild(createBrowserItem(entry, openSearchResult));
  });

  container.appendChild(fragment);
}

function renderFavoritesResults(query = "") {
  const container = document.getElementById("favoritesResults");
  const summary = document.getElementById("favoritesSummary");

  if (!container) return;

  const text = query.trim().toLowerCase();
  const entries = getFavoriteEntries();
  const filteredEntries = entries.filter(entry => {
    if (!favoritesFilters[entry.type]) {
      return false;
    }

    if (!isCatalogSearchEntryVisible(entry)) {
      return false;
    }

    return !text || entry.searchText.includes(text);
  });

  if (summary) {
    summary.textContent = `${filteredEntries.length} shown`;
  }

  container.textContent = "";

  if (filteredEntries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "browser-empty";
    empty.textContent = entries.length === 0
      ? `No favorites yet. Star a ${getProgramLabelSingular().toLowerCase()}, ${getSecondaryLabelSingular().toLowerCase()}, or ${getKdfxLabelSingular().toLowerCase()} to collect it here.`
      : "No favorites match the search.";
    container.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  filteredEntries.forEach(entry => {
    fragment.appendChild(createBrowserItem(entry, openSearchResult));
  });

  container.appendChild(fragment);
}

function getKeymapSearchQuery() {
  return document.getElementById("keymapsSearch")?.value || "";
}

function focusKeymapsSearch() {
  focusInputById("keymapsSearch");
}

function getKeymapCategories() {
  const sourceCategories = Array.isArray(keymapsData?.source?.categories)
    ? keymapsData.source.categories
    : [];
  const romCards = Array.isArray(synthModel?.romCards) ? synthModel.romCards : [];
  const savedRomIds = getSavedRomIds();
  const availableCategoryIds = new Set(
    Array.isArray(keymapsData?.keymaps)
      ? keymapsData.keymaps.map(entry => String(entry.categoryId || ""))
      : []
  );

  return sourceCategories.map(category => {
    if (category.id === "base_rom") {
      return {
        id: category.id,
        label: "Base ROM",
        enabled: true,
      };
    }

    const romCard = romCards.find(card => card.id === category.id);
    return {
      id: category.id,
      label: romCard?.label || category.label || category.id,
      enabled: availableCategoryIds.has(category.id) || (romCard ? savedRomIds.includes(category.id) : true),
    };
  });
}

function initializeKeymapFilters() {
  const categories = getKeymapCategories();
  keymapFilters = {};
  categories.forEach(category => {
    keymapFilters[category.id] = category.enabled !== false;
  });
}

function renderKeymapFilterButtons() {
  const container = document.getElementById("keymapsFilters");

  if (!container) return;

  const categories = getKeymapCategories();

  container.classList.toggle("hidden", categories.length <= 1);
  container.textContent = "";

  if (categories.length <= 1) {
    return;
  }

  categories.forEach(category => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "k2600-button";
    button.textContent = category.label;
    button.disabled = category.enabled === false;
    button.classList.toggle("active", category.enabled !== false && keymapFilters[category.id] !== false);
    button.addEventListener("click", () => {
      toggleKeymapFilter(category.id);
    });
    container.appendChild(button);
  });
}

function toggleKeymapFilter(categoryId) {
  if (!(categoryId in keymapFilters)) return;

  const category = getKeymapCategories().find(entry => entry.id === categoryId);
  if (category?.enabled === false) {
    return;
  }

  const nextValue = !keymapFilters[categoryId];
  const activeCount = Object.values(keymapFilters).filter(Boolean).length;

  if (!nextValue && activeCount === 1) {
    return;
  }

  keymapFilters[categoryId] = nextValue;
  renderKeymapFilterButtons();
  renderKeymaps(getKeymapSearchQuery());
}

function getKeymapEntries() {
  const categoriesById = Object.fromEntries(getKeymapCategories().map(category => [category.id, category.label]));

  return Array.isArray(keymapsData?.keymaps)
    ? keymapsData.keymaps.map(entry => ({
        number: Number(entry.number),
        name: String(entry.name || ""),
        categoryId: String(entry.categoryId || ""),
        categoryLabel: categoriesById[entry.categoryId] || String(entry.categoryLabel || entry.categoryId || ""),
        location: formatPatchLocation(Number(entry.number), "programs"),
        searchText: [
          entry.number,
          formatPatchLocation(Number(entry.number), "programs"),
          entry.name || "",
          categoriesById[entry.categoryId] || entry.categoryLabel || entry.categoryId || "",
        ].join(" ").toLowerCase(),
      }))
      .sort((a, b) => a.number - b.number)
    : [];
}

function renderKeymaps(query = "") {
  const container = document.getElementById("keymapsResults");
  const summary = document.getElementById("keymapsSummary");

  if (!container) return;

  const text = query.trim().toLowerCase();
  const entries = getKeymapEntries();
  const filteredEntries = entries.filter(entry => {
    if (keymapFilters[entry.categoryId] === false) {
      return false;
    }

    return !text || entry.searchText.includes(text);
  });

  if (summary) {
    summary.textContent = `${filteredEntries.length} shown`;
  }

  container.textContent = "";

  if (filteredEntries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "browser-empty";
    empty.textContent = "No keymaps match the search.";
    container.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  filteredEntries.forEach(entry => {
    const item = document.createElement("div");
    item.className = "keymap-row";

    const location = document.createElement("span");
    location.className = "keymap-id";
    location.textContent = entry.location;

    const type = document.createElement("span");
    type.className = "keymap-category";
    type.textContent = entry.categoryLabel;

    const name = document.createElement("span");
    name.className = "keymap-name";
    name.textContent = entry.name;

    item.appendChild(location);
    item.appendChild(name);
    item.appendChild(type);
    fragment.appendChild(item);
  });

  container.appendChild(fragment);
}

function getFxPresetEntries() {
  const sourcePresets = Array.isArray(fxPresetsData?.presets)
    ? fxPresetsData.presets
    : (kdfxLookup?.presetsById ? Object.values(kdfxLookup.presetsById) : []);

  return Array.isArray(sourcePresets)
    ? sourcePresets
      .map(entry => ({
        id: Number(entry.id),
        name: String(entry.name || ""),
        algorithmId: entry.algorithmId ?? null,
        algorithmName: entry.algorithmName || "",
        size: entry.size ?? null,
        algorithmPau: entry.algorithmId != null
          ? (kdfxLookup?.algorithmsById?.[String(entry.algorithmId)]?.pau ?? null)
          : null,
        v1: entry.v1 === true,
        v2: entry.v2 === true,
        source: entry.source || entry.sourceLabel || null,
        possibleDuplicate: entry.possibleDuplicate || null,
        badges: getObjectMetadataBadges(entry),
        searchText: `${entry.id} ${entry.name || ""} ${entry.algorithmName || ""}`.toLowerCase(),
      }))
      .sort((a, b) => a.id - b.id)
    : [];
}

function shouldShowFxPresetsView() {
  return synthModel?.showFxPresetsView !== false && getFxPresetEntries().length > 0;
}

function renderFxPresets(query = "") {
  const container = document.getElementById("fxPresetsResults");
  const summary = document.getElementById("fxPresetsSummary");

  if (!container) return;

  const text = query.trim().toLowerCase();
  const entries = getFxPresetEntries();
  const filteredEntries = entries.filter(entry => !text || entry.searchText.includes(text));

  if (summary) {
    summary.textContent = `${filteredEntries.length} shown`;
  }

  container.textContent = "";

  if (filteredEntries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "browser-empty";
    empty.textContent = "No KDFX presets match the search.";
    container.appendChild(empty);
    renderFxPresetDetail(null);
    return;
  }

  const visibleSelected = filteredEntries.some(entry => entry.id === selectedFxPresetId);
  if (!visibleSelected) {
    selectedFxPresetId = filteredEntries[0].id;
  }

  const fragment = document.createDocumentFragment();

  filteredEntries.forEach(entry => {
    const item = document.createElement("div");
    item.className = "fx-presets-item";

    if (selectedFxPresetId === entry.id) {
      item.classList.add("active");
    }

    const location = document.createElement("div");
    location.className = "browser-item-location";
    location.textContent = String(entry.id).padStart(3, "0");

    const body = document.createElement("div");
    body.className = "browser-item-body";

    const name = document.createElement("div");
    name.className = "browser-item-name";
    name.textContent = entry.name;

    body.appendChild(name);

    const badges = buildMetadataBadgeRow(entry.badges);
    if (badges) {
      body.appendChild(badges);
    }

    item.appendChild(location);
    item.appendChild(body);
    item.addEventListener("click", () => {
      selectedFxPresetId = entry.id;
      renderFxPresetDetail(entry.id);
      renderFxPresets(query);
    });
    fragment.appendChild(item);
  });

  container.appendChild(fragment);
  renderFxPresetDetail(selectedFxPresetId);
}

function renderFxPresetDetail(presetId) {
  const detail = document.getElementById("fxPresetsDetail");
  if (!detail) return;

  const entries = getFxPresetEntries();
  const entry = entries.find(item => item.id === presetId);

  if (!entry) {
    detail.textContent = "Select a KDFX preset to view details.";
    return;
  }

  detail.textContent = "";

  const heading = document.createElement("h3");
  heading.textContent = `${String(entry.id).padStart(3, "0")} ${entry.name}`;
  detail.appendChild(heading);

  const badges = buildMetadataBadgeRow(entry.badges);
  if (badges) {
    detail.appendChild(badges);
  }

  const algorithm = entry.algorithmId != null
    ? kdfxLookup?.algorithmsById?.[String(entry.algorithmId)] || null
    : null;

  const metaGrid = document.createElement("div");
  metaGrid.className = "fx-preset-meta-grid";

  const fields = [
    {
      label: "Description",
      value: algorithm?.description || "-",
      toneClass: "fx-preset-meta-description",
    },
    {
      label: "Algorithm",
      value: entry.algorithmId != null ? `${entry.algorithmId}` : "-",
      toneClass: "fx-preset-meta-algorithm",
    },
    {
      label: "PAUs",
      value: entry.size ?? entry.algorithmPau ?? "-",
      toneClass: "fx-preset-meta-pau",
    },
    {
      label: "Type",
      value: entry.source || "-",
      toneClass: "fx-preset-meta-type",
    },
  ];

  fields.forEach(field => {
    const cell = document.createElement("div");
    cell.className = `fx-preset-meta-cell ${field.toneClass}`;

    const label = document.createElement("div");
    label.className = "fx-preset-meta-label";
    label.textContent = field.label;

    const value = document.createElement("div");
    value.className = "fx-preset-meta-value";
    value.textContent = `${field.value}`;

    cell.appendChild(label);
    cell.appendChild(value);
    metaGrid.appendChild(cell);
  });

  detail.appendChild(metaGrid);

  const notes = buildObjectNoteBlock(buildObjectNotes(entry, "preset"));
  if (notes) {
    detail.appendChild(notes);
  }
}


/* ============================
   SETTINGS BUTTON (COG)
============================ */

function setupSettingsButton() {

  const settings = document.getElementById("settingsButton");
  const exportFavoritesButton = document.getElementById("exportFavoritesButton");
  const importFavoritesMergeButton = document.getElementById("importFavoritesMergeButton");
  const importFavoritesReplaceButton = document.getElementById("importFavoritesReplaceButton");
  const favoritesImportInput = document.getElementById("favoritesImportInput");

  if (settings) {
    settings.addEventListener("click", () => {
      showDeviceModal();
    });
  }

  exportFavoritesButton?.addEventListener("click", downloadFavoritesFile);
  importFavoritesMergeButton?.addEventListener("click", () => beginFavoritesImport("merge"));
  importFavoritesReplaceButton?.addEventListener("click", () => beginFavoritesImport("replace"));
  favoritesImportInput?.addEventListener("change", handleFavoritesImportSelection);

}


function setupWebButton() {

  const webButton = document.getElementById("webButton");

  if (!webButton) return;

  if (!synthModel?.supportUrl) {
    webButton.classList.add("hidden");
    return;
  }

  webButton.addEventListener("click", () => {
    const url = synthModel?.supportUrl;
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  });

}

function setupKdfxButton() {

  const searchButton = document.getElementById("searchButton");
  const favoritesButton = document.getElementById("favoritesButton");
  const keymapsButton = document.getElementById("keymapsButton");
  const programsButton = document.getElementById("programsButton");
  const setupsButton = document.getElementById("setupsButton");
  const fxPresetsButton = document.getElementById("fxPresetsButton");
  const dspButton = document.getElementById("dspButton");
  const modSourcesButton = document.getElementById("modSourcesButton");
  const kdfxButton = document.getElementById("kdfxButton");
  const dspSearch = document.getElementById("dspSearch");
  const modSourceSearch = document.getElementById("modSourceSearch");
  const modSourceFilterAll = document.getElementById("modSourceFilterAll");
  const modSourceFilterControls = document.getElementById("modSourceFilterControls");
  const modSourceFilterMidi = document.getElementById("modSourceFilterMidi");
  const dspFilterStandard = document.getElementById("dspFilterStandard");
  const dspFilterTriple = document.getElementById("dspFilterTriple");
  const dspFilterLayer1 = document.getElementById("dspFilterLayer1");
  const dspFilterLayer3 = document.getElementById("dspFilterLayer3");
  const searchInput = document.getElementById("kdfxSearch");
  const patchSearch = document.getElementById("patchSearch");
  const favoritesSearch = document.getElementById("favoritesSearch");
  const keymapsSearch = document.getElementById("keymapsSearch");
  const fxPresetsSearch = document.getElementById("fxPresetsSearch");
  const filterProgramsButton = document.getElementById("filterProgramsButton");
  const filterSetupsButton = document.getElementById("filterSetupsButton");
  const favoritesFilterProgramsButton = document.getElementById("favoritesFilterProgramsButton");
  const favoritesFilterSetupsButton = document.getElementById("favoritesFilterSetupsButton");
  const favoritesFilterKdfxButton = document.getElementById("favoritesFilterKdfxButton");
  const favoritesSortButton = document.getElementById("favoritesSortButton");
  const favoriteToggleButton = document.getElementById("favoriteToggleButton");

  if (searchButton) {
    searchButton.addEventListener("click", () => {
      showView("search");
      renderSearchResults(getPatchSearchQuery());
    });
  }

  if (favoritesButton) {
    favoritesButton.addEventListener("click", () => {
      showView("favorites");
      renderFavoritesResults(getFavoritesSearchQuery());
    });
  }

  if (keymapsButton) {
    if (!Array.isArray(keymapsData?.keymaps) || keymapsData.keymaps.length === 0) {
      keymapsButton.classList.add("hidden");
    } else {
      keymapsButton.addEventListener("click", () => {
        showView("keymaps");
        renderKeymaps(getKeymapSearchQuery());
      });
    }
  }

  if (fxPresetsButton) {
    if (!shouldShowFxPresetsView()) {
      fxPresetsButton.classList.add("hidden");
    } else {
      fxPresetsButton.addEventListener("click", () => {
        showView("fxpresets");
        renderFxPresets(getFxPresetSearchQuery());
      });
    }
  }

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
    if ((!modSources || Object.keys(modSources).length === 0) && (!midiControllers || Object.keys(midiControllers).length === 0)) {
      modSourcesButton.classList.add("hidden");
    } else {
      modSourcesButton.addEventListener("click", () => {
        showView("modsources");
        renderModSources(modSourceSearch?.value || "");
      });
    }
  }

  if (modSourceSearch && (Object.keys(modSources || {}).length > 0 || Object.keys(midiControllers || {}).length > 0)) {
    modSourceSearch.addEventListener("input", () => {
      renderModSources(modSourceSearch.value);
    });
  }

  if (modSourceFilterAll) {
    modSourceFilterAll.addEventListener("click", () => setModSourceFilter("all"));
  }

  if (modSourceFilterControls) {
    modSourceFilterControls.addEventListener("click", () => setModSourceFilter("controls"));
  }

  if (modSourceFilterMidi) {
    modSourceFilterMidi.addEventListener("click", () => setModSourceFilter("midi"));
  }

  updateModSourceFilterButtons();

  if (dspFilterStandard) {
    dspFilterStandard.addEventListener("click", () => setDspAlgorithmFilter("standard"));
  }

  if (dspFilterTriple) {
    dspFilterTriple.addEventListener("click", () => setDspAlgorithmFilter("triple"));
  }

  if (dspFilterLayer1) {
    dspFilterLayer1.addEventListener("click", () => setDspAlgorithmFilter("layer1"));
  }

  if (dspFilterLayer3) {
    dspFilterLayer3.addEventListener("click", () => setDspAlgorithmFilter("layer3"));
  }

  updateDspAlgorithmFilterButtons();

  if (dspButton) {
    if (!dspAlgorithms?.algorithmsById) {
      dspButton.classList.add("hidden");
    } else {
      dspButton.addEventListener("click", () => {
        showView("dsp");
        renderDspAlgorithmList(dspSearch?.value || "");
      });
    }
  }

  if (dspSearch) {
    dspSearch.addEventListener("input", () => {
      renderDspAlgorithmList(dspSearch.value);
    });
  }

  if (patchSearch) {
    patchSearch.addEventListener("input", () => {
      renderSearchResults(patchSearch.value);
    });
  }

  if (favoritesSearch) {
    favoritesSearch.addEventListener("input", () => {
      renderFavoritesResults(favoritesSearch.value);
    });
  }

  if (keymapsSearch) {
    keymapsSearch.addEventListener("input", () => {
      renderKeymaps(keymapsSearch.value);
    });
  }

  if (fxPresetsSearch) {
    fxPresetsSearch.addEventListener("input", () => {
      renderFxPresets(fxPresetsSearch.value);
    });
  }

  if (filterProgramsButton) {
    filterProgramsButton.addEventListener("click", () => {
      toggleSearchFilter("programs");
    });
  }

  if (filterSetupsButton) {
    filterSetupsButton.addEventListener("click", () => {
      toggleSearchFilter("setups");
    });
  }

  if (favoritesFilterProgramsButton) {
    favoritesFilterProgramsButton.addEventListener("click", () => {
      toggleFavoritesFilter("programs");
    });
  }

  if (favoritesFilterSetupsButton) {
    favoritesFilterSetupsButton.addEventListener("click", () => {
      toggleFavoritesFilter("setups");
    });
  }

  if (favoritesFilterKdfxButton) {
    favoritesFilterKdfxButton.addEventListener("click", () => {
      toggleFavoritesFilter("kdfx");
    });
  }

  if (favoritesSortButton) {
    favoritesSortButton.addEventListener("click", () => {
      toggleFavoritesSort();
    });
  }

  if (favoriteToggleButton) {
    favoriteToggleButton.addEventListener("click", () => {
      if (!Number.isFinite(currentDisplayedNumber)) {
        return;
      }

      toggleFavorite(currentDisplayedType, currentDisplayedNumber);
    });
  }

  updateSearchFilterButtons();
  updateCategoryFilterButtons();
  updateFavoritesFilterButtons();
  updateFavoritesSortButton();
  updateFavoriteToggleButton();
  renderKeymapFilterButtons();

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
  const searchView = document.getElementById("searchView");
  const favoritesView = document.getElementById("favoritesView");
  const keymapsView = document.getElementById("keymapsView");
  const fxPresetsView = document.getElementById("fxPresetsView");
  const dspView = document.getElementById("dspView");
  const modSourcesView = document.getElementById("modSourcesView");
  const kdfxView = document.getElementById("kdfxView");
  const searchButton = document.getElementById("searchButton");
  const favoritesButton = document.getElementById("favoritesButton");
  const keymapsButton = document.getElementById("keymapsButton");
  const programsButton = document.getElementById("programsButton");
  const setupsButton = document.getElementById("setupsButton");
  const fxPresetsButton = document.getElementById("fxPresetsButton");
  const dspButton = document.getElementById("dspButton");
  const modSourcesButton = document.getElementById("modSourcesButton");
  const kdfxButton = document.getElementById("kdfxButton");

  hideModSourceTooltip();
  hideDspTooltip();

  if (viewId === "search") {
    mainView?.classList.add("hidden");
    searchView?.classList.remove("hidden");
    favoritesView?.classList.add("hidden");
    keymapsView?.classList.add("hidden");
    fxPresetsView?.classList.add("hidden");
    dspView?.classList.add("hidden");
    modSourcesView?.classList.add("hidden");
    kdfxView?.classList.add("hidden");
    searchButton?.classList.add("active");
    favoritesButton?.classList.remove("active");
    keymapsButton?.classList.remove("active");
    programsButton?.classList.remove("active");
    setupsButton?.classList.remove("active");
    fxPresetsButton?.classList.remove("active");
    dspButton?.classList.remove("active");
    modSourcesButton?.classList.remove("active");
    kdfxButton?.classList.remove("active");
    focusPatchSearch();
    return;
  }

  if (viewId === "favorites") {
    selectedMode = "programs";
    mainView?.classList.add("hidden");
    searchView?.classList.add("hidden");
    favoritesView?.classList.remove("hidden");
    keymapsView?.classList.add("hidden");
    fxPresetsView?.classList.add("hidden");
    dspView?.classList.add("hidden");
    modSourcesView?.classList.add("hidden");
    kdfxView?.classList.add("hidden");
    searchButton?.classList.remove("active");
    favoritesButton?.classList.add("active");
    keymapsButton?.classList.remove("active");
    programsButton?.classList.remove("active");
    setupsButton?.classList.remove("active");
    fxPresetsButton?.classList.remove("active");
    dspButton?.classList.remove("active");
    modSourcesButton?.classList.remove("active");
    kdfxButton?.classList.remove("active");
    focusFavoritesSearch();
    return;
  }

  if (viewId === "keymaps") {
    selectedMode = "programs";
    mainView?.classList.add("hidden");
    searchView?.classList.add("hidden");
    favoritesView?.classList.add("hidden");
    keymapsView?.classList.remove("hidden");
    fxPresetsView?.classList.add("hidden");
    dspView?.classList.add("hidden");
    modSourcesView?.classList.add("hidden");
    kdfxView?.classList.add("hidden");
    searchButton?.classList.remove("active");
    favoritesButton?.classList.remove("active");
    keymapsButton?.classList.add("active");
    programsButton?.classList.remove("active");
    setupsButton?.classList.remove("active");
    fxPresetsButton?.classList.remove("active");
    dspButton?.classList.remove("active");
    modSourcesButton?.classList.remove("active");
    kdfxButton?.classList.remove("active");
    focusKeymapsSearch();
    return;
  }

  if (viewId === "fxpresets") {
    selectedMode = "programs";
    mainView?.classList.add("hidden");
    searchView?.classList.add("hidden");
    favoritesView?.classList.add("hidden");
    keymapsView?.classList.add("hidden");
    fxPresetsView?.classList.remove("hidden");
    dspView?.classList.add("hidden");
    modSourcesView?.classList.add("hidden");
    kdfxView?.classList.add("hidden");
    searchButton?.classList.remove("active");
    favoritesButton?.classList.remove("active");
    keymapsButton?.classList.remove("active");
    programsButton?.classList.remove("active");
    setupsButton?.classList.remove("active");
    fxPresetsButton?.classList.add("active");
    dspButton?.classList.remove("active");
    modSourcesButton?.classList.remove("active");
    kdfxButton?.classList.remove("active");
    focusFxPresetsSearch();
    return;
  }

  if (viewId === "dsp") {
    selectedMode = "programs";
    mainView?.classList.add("hidden");
    searchView?.classList.add("hidden");
    favoritesView?.classList.add("hidden");
    keymapsView?.classList.add("hidden");
    fxPresetsView?.classList.add("hidden");
    dspView?.classList.remove("hidden");
    modSourcesView?.classList.add("hidden");
    kdfxView?.classList.add("hidden");
    searchButton?.classList.remove("active");
    favoritesButton?.classList.remove("active");
    keymapsButton?.classList.remove("active");
    programsButton?.classList.remove("active");
    setupsButton?.classList.remove("active");
    fxPresetsButton?.classList.remove("active");
    dspButton?.classList.add("active");
    modSourcesButton?.classList.remove("active");
    kdfxButton?.classList.remove("active");
    focusInputById("dspSearch");
    return;
  }

  if (viewId === "kdfx") {
    selectedMode = "programs";
    mainView?.classList.add("hidden");
    searchView?.classList.add("hidden");
    favoritesView?.classList.add("hidden");
    keymapsView?.classList.add("hidden");
    fxPresetsView?.classList.add("hidden");
    dspView?.classList.add("hidden");
    modSourcesView?.classList.add("hidden");
    kdfxView?.classList.remove("hidden");
    searchButton?.classList.remove("active");
    favoritesButton?.classList.remove("active");
    keymapsButton?.classList.remove("active");
    programsButton?.classList.remove("active");
    setupsButton?.classList.remove("active");
    fxPresetsButton?.classList.remove("active");
    dspButton?.classList.remove("active");
    modSourcesButton?.classList.remove("active");
    kdfxButton?.classList.add("active");
    focusInputById("kdfxSearch");
    return;
  }

  if (viewId === "modsources") {
    selectedMode = "programs";
    mainView?.classList.add("hidden");
    searchView?.classList.add("hidden");
    favoritesView?.classList.add("hidden");
    keymapsView?.classList.add("hidden");
    fxPresetsView?.classList.add("hidden");
    dspView?.classList.add("hidden");
    modSourcesView?.classList.remove("hidden");
    kdfxView?.classList.add("hidden");
    searchButton?.classList.remove("active");
    favoritesButton?.classList.remove("active");
    keymapsButton?.classList.remove("active");
    programsButton?.classList.remove("active");
    setupsButton?.classList.remove("active");
    fxPresetsButton?.classList.remove("active");
    dspButton?.classList.remove("active");
    modSourcesButton?.classList.add("active");
    kdfxButton?.classList.remove("active");
    focusInputById("modSourceSearch");
    return;
  }

  if (viewId === "setups") {
    selectedMode = "setups";
    mainView?.classList.remove("hidden");
    searchView?.classList.add("hidden");
    favoritesView?.classList.add("hidden");
    keymapsView?.classList.add("hidden");
    fxPresetsView?.classList.add("hidden");
    dspView?.classList.add("hidden");
    modSourcesView?.classList.add("hidden");
    kdfxView?.classList.add("hidden");
    searchButton?.classList.remove("active");
    favoritesButton?.classList.remove("active");
    keymapsButton?.classList.remove("active");
    programsButton?.classList.remove("active");
    setupsButton?.classList.add("active");
    fxPresetsButton?.classList.remove("active");
    dspButton?.classList.remove("active");
    modSourcesButton?.classList.remove("active");
    kdfxButton?.classList.remove("active");
    return;
  }

  selectedMode = "programs";
  mainView?.classList.remove("hidden");
  searchView?.classList.add("hidden");
  favoritesView?.classList.add("hidden");
  keymapsView?.classList.add("hidden");
  fxPresetsView?.classList.add("hidden");
  dspView?.classList.add("hidden");
  modSourcesView?.classList.add("hidden");
  kdfxView?.classList.add("hidden");
  searchButton?.classList.remove("active");
  favoritesButton?.classList.remove("active");
  keymapsButton?.classList.remove("active");
  programsButton?.classList.add("active");
  setupsButton?.classList.remove("active");
  fxPresetsButton?.classList.remove("active");
  dspButton?.classList.remove("active");
  modSourcesButton?.classList.remove("active");
  kdfxButton?.classList.remove("active");
}

function renderModSources(query = "") {

  const list = document.getElementById("modSourceList");
  const tooltip = document.getElementById("modSourceTooltip");
  const summary = document.getElementById("modSourceSummary");

  if (!list) return;

  const text = query.trim().toLowerCase();

  const rows = getMergedModSourceRows()
    .filter(row => currentModSourceFilter === "all" || row.typeKey === currentModSourceFilter)
    .filter(row => {
      if (!text) return true;
      return String(row.assignedValue).includes(text)
        || row.typeLabel.toLowerCase().includes(text)
        || row.source.toLowerCase().includes(text)
        || row.details.toLowerCase().includes(text);
    });

  if (summary) {
    const filterLabel = currentModSourceFilter === "all"
      ? "All"
      : currentModSourceFilter === "controls"
        ? "Controls"
        : "MIDI";
    summary.textContent = `${rows.length} ${rows.length === 1 ? "entry" : "entries"} shown · ${filterLabel}`;
  }

  if (rows.length === 0) {
    list.textContent = "No modulation sources match the search.";
    hideModSourceTooltip();
    return;
  }

  list.textContent = "";

  const frag = document.createDocumentFragment();

  rows.forEach(row => {

    const rowEl = document.createElement("div");
    rowEl.className = "modsrc-row";

    const idEl = document.createElement("span");
    idEl.className = "modsrc-id";
    idEl.textContent = String(row.assignedValue);

    const typeEl = document.createElement("span");
    typeEl.className = "modsrc-type";
    typeEl.textContent = row.typeLabel;

    const nameEl = document.createElement("span");
    nameEl.className = "modsrc-name";
    nameEl.textContent = row.source;

    const defaultEl = document.createElement("span");
    defaultEl.className = "modsrc-default";
    defaultEl.textContent = row.defaultAssignment || "";

    if (row.details) {
      const nameTextEl = document.createElement("span");
      nameTextEl.className = "modsrc-name-text";
      nameTextEl.textContent = row.source;
      nameEl.textContent = "";
      nameEl.appendChild(nameTextEl);

      const iconEl = document.createElement("span");
      iconEl.className = "modsrc-info";
      iconEl.textContent = "i";
      iconEl.title = "Show details";
      iconEl.tabIndex = 0;
      iconEl.setAttribute("role", "button");
      iconEl.setAttribute("aria-label", `Show details for source ${row.assignedValue}`);

      const show = () => showModSourceTooltip(row.details, iconEl);
      const hide = () => scheduleHideModSourceTooltip();

      iconEl.addEventListener("mouseenter", show);
      iconEl.addEventListener("mouseleave", hide);
      iconEl.addEventListener("focus", show);
      iconEl.addEventListener("blur", hide);
      iconEl.addEventListener("click", () => showModSourceTooltip(row.details, iconEl));
      iconEl.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          showModSourceTooltip(row.details, iconEl);
        }
      });

      nameEl.appendChild(iconEl);
    }

    rowEl.appendChild(idEl);
    rowEl.appendChild(typeEl);
    rowEl.appendChild(nameEl);
    rowEl.appendChild(defaultEl);
    frag.appendChild(rowEl);
  });

  list.appendChild(frag);

  if (tooltip) {
    tooltip.onmouseenter = () => clearHideModSourceTooltipTimer();
    tooltip.onmouseleave = () => scheduleHideModSourceTooltip();
  }

}

function getMidiControllerEntry(number) {

  const entry = midiControllers?.[number];

  if (entry && typeof entry === "object") {
    return {
      label: String(entry.label || `CC ${number}`),
      details: String(entry.details || ""),
      defaultAssignment: String(entry.defaultAssignment || ""),
    };
  }

  if (typeof entry === "string") {
    return {
      label: entry,
      details: "",
      defaultAssignment: "",
    };
  }

  return {
    label: `CC ${number}`,
    details: "",
    defaultAssignment: "",
  };
}

function getMidiControllerLabel(number) {
  return getMidiControllerEntry(number).label;
}

function getMidiControllerDisplayLabel(number) {
  const entry = getMidiControllerEntry(number);
  const assignment = String(entry.defaultAssignment || "").trim();

  if (!assignment) {
    return entry.label;
  }

  return assignment;
}

function getHardwareControlDisplayLabel(label) {

  if (typeof label !== "string") {
    return "";
  }

  const trimmed = label.trim();
  if (!trimmed) {
    return "";
  }

  const midiMatch = trimmed.match(/^MIDI\s+(\d+)(?:\s+\(Sw2\))?$/i);
  if (midiMatch) {
    return getMidiControllerDisplayLabel(Number(midiMatch[1]));
  }

  const normalized = trimmed.toLowerCase();

  if (normalized === "mwheel" || normalized === "mod wheel" || normalized === "modulation wheel") {
    return getMidiControllerDisplayLabel(1);
  }

  if (normalized === "data" || normalized === "data entry") {
    return getMidiControllerDisplayLabel(6);
  }

  if (normalized === "ccpedal 1" || normalized === "cc pedal 1") {
    return getMidiControllerDisplayLabel(4);
  }

  if (normalized === "ccpedal 2" || normalized === "cc pedal 2") {
    return getMidiControllerDisplayLabel(2);
  }

  if (normalized === "suspedal" || normalized === "sus pedal" || normalized === "sustain pedal") {
    return getMidiControllerDisplayLabel(64);
  }

  return "";
}

function getMergedModSourceRows() {

  const controlRows = Object.entries(modSources || {}).map(([assignedValue, source]) => {
    const sourceObj = (source && typeof source === "object")
      ? source
      : { label: String(source || ""), details: "" };

    return {
      assignedValue: Number(assignedValue),
      typeKey: "controls",
      typeLabel: "Control",
      source: String(sourceObj.label || ""),
      details: String(sourceObj.details || ""),
      defaultAssignment: "",
    };
  });

  const midiRows = Object.entries(midiControllers || {}).map(([assignedValue, source]) => {
    const sourceObj = (source && typeof source === "object")
      ? source
      : { label: String(source || ""), details: "", defaultAssignment: "" };

    return {
      assignedValue: Number(assignedValue),
      typeKey: "midi",
      typeLabel: "MIDI",
      source: String(sourceObj.label || ""),
      details: String(sourceObj.details || ""),
      defaultAssignment: String(sourceObj.defaultAssignment || ""),
    };
  });

  return [...controlRows, ...midiRows].sort((a, b) => {
    if (a.assignedValue !== b.assignedValue) {
      return a.assignedValue - b.assignedValue;
    }

    if (a.typeKey === b.typeKey) {
      return a.source.localeCompare(b.source);
    }

    return a.typeKey === "midi" ? -1 : 1;
  });
}

function updateModSourceFilterButtons() {

  const allButton = document.getElementById("modSourceFilterAll");
  const controlsButton = document.getElementById("modSourceFilterControls");
  const midiButton = document.getElementById("modSourceFilterMidi");

  allButton?.classList.toggle("active", currentModSourceFilter === "all");
  controlsButton?.classList.toggle("active", currentModSourceFilter === "controls");
  midiButton?.classList.toggle("active", currentModSourceFilter === "midi");
}

function setModSourceFilter(filter) {

  currentModSourceFilter = filter;
  updateModSourceFilterButtons();
  renderModSources(document.getElementById("modSourceSearch")?.value || "");
}

function clearHideModSourceTooltipTimer() {
  if (!modSourceTooltipHideTimer) return;
  clearTimeout(modSourceTooltipHideTimer);
  modSourceTooltipHideTimer = null;
}

function hideModSourceTooltip() {
  const tooltip = document.getElementById("modSourceTooltip");
  if (!tooltip) return;
  tooltip.classList.add("hidden");
}

function clearDspTooltipHideTimer() {
  if (!dspTooltipHideTimer) return;
  clearTimeout(dspTooltipHideTimer);
  dspTooltipHideTimer = null;
}

function hideDspTooltip() {
  const tooltip = document.getElementById("dspTooltip");
  if (!tooltip) return;
  tooltip.classList.add("hidden");
}

function scheduleHideDspTooltip() {
  clearDspTooltipHideTimer();
  dspTooltipHideTimer = setTimeout(() => {
    hideDspTooltip();
  }, 180);
}

function scheduleHideModSourceTooltip() {
  clearHideModSourceTooltipTimer();
  modSourceTooltipHideTimer = setTimeout(() => {
    hideModSourceTooltip();
  }, 180);
}

function showModSourceTooltip(text, anchorEl) {

  const tooltip = document.getElementById("modSourceTooltip");
  if (!tooltip || !anchorEl) return;

  clearHideModSourceTooltipTimer();

  tooltip.textContent = text;
  tooltip.classList.remove("hidden");

  const rect = anchorEl.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();
  const margin = 12;

  let left = rect.left - tipRect.width - margin;
  if (left < margin) {
    left = Math.min(window.innerWidth - tipRect.width - margin, rect.right + margin);
  }

  let top = rect.top;
  if (top + tipRect.height > window.innerHeight - margin) {
    top = window.innerHeight - tipRect.height - margin;
  }
  if (top < margin) {
    top = margin;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showDspTooltip(content, anchorEl) {

  const tooltip = document.getElementById("dspTooltip");
  if (!tooltip || !anchorEl) return;

  clearDspTooltipHideTimer();

  tooltip.textContent = "";
  tooltip.classList.remove("hidden");
  tooltip.onmouseenter = () => clearDspTooltipHideTimer();
  tooltip.onmouseleave = () => scheduleHideDspTooltip();

  const headerText = String(content?.header || "").trim();
  const bodyText = String(content?.body || "").trim();

  if (headerText) {
    const header = document.createElement("span");
    header.className = "tooltip-header";
    header.textContent = headerText;
    tooltip.appendChild(header);
  }

  if (bodyText) {
    const lines = bodyText
      .split("\n")
      .map(line => line.trim().replace(/\.\s*$/, ""))
      .filter(Boolean);

    if (lines.length > 0) {
      const list = document.createElement("ul");
      list.className = "tooltip-body tooltip-list";

      lines.forEach(line => {
        const item = document.createElement("li");
        item.textContent = line;
        list.appendChild(item);
      });

      tooltip.appendChild(list);
    }
  }

  const rect = anchorEl.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();
  const margin = 12;

  let left = rect.left - tipRect.width - margin;
  if (left < margin) {
    left = Math.min(window.innerWidth - tipRect.width - margin, rect.right + margin);
  }

  let top = rect.top;
  if (top + tipRect.height > window.innerHeight - margin) {
    top = window.innerHeight - tipRect.height - margin;
  }
  if (top < margin) {
    top = margin;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function getDspBlockDetail(blockId) {

  const directDetail = dspBlockDetails?.[blockId];
  const blockLabel = String(dspAlgorithms?.blocksById?.[blockId]?.label || "").trim();
  const normalizedLabelKey = blockLabel
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/!/g, " bang ")
    .replace(/&/g, " and ")
    .replace(/\//g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const detail = directDetail || dspBlockDetails?.[normalizedLabelKey];

  if (!detail) {
    return null;
  }

  if (typeof detail === "string") {
    const text = detail.trim();
    if (!text) return null;
    return {
      header: "",
      body: text,
    };
  }

  if (typeof detail === "object") {
    const explicitHeader = String(detail.header || "").trim();
    const text = String(detail.details || detail.description || "").trim();

    if (!explicitHeader && !text) {
      return null;
    }

    return {
      header: explicitHeader,
      body: text,
    };
  }

  return null;
}

function renderKdfxList(query = "") {

  if (!kdfxLookup?.studiosById) return;

  const container = document.getElementById("kdfxStudioList");
  const summary = document.getElementById("kdfxSummary");
  if (!container) return;

  const text = query.trim().toLowerCase();
  const studios = getKdfxFavoriteEntries()
    .sort((a, b) => a.id - b.id)
    .filter(studio => !text || studio.searchText.includes(text));

  if (summary) {
    summary.textContent = `${studios.length} shown`;
  }

  container.innerHTML = "";

  studios.forEach(studio => {
    const item = document.createElement("div");
    item.className = "kdfx-list-item";

    if (selectedKdfxStudioId === studio.id) {
      item.classList.add("active");
    }

    const main = document.createElement("div");
    main.className = "kdfx-list-item-main";

    const title = document.createElement("div");
    title.className = "kdfx-list-item-title";
    title.textContent = `${String(studio.id).padStart(3, "0")}  ${studio.name}`;

    const meta = document.createElement("span");
    meta.className = "kdfx-list-item-meta";
    meta.textContent = studio.meta;

    const badges = buildMetadataBadgeRow(studio.badges);

    const actions = document.createElement("div");
    actions.className = "kdfx-list-item-actions";
    actions.appendChild(createFavoriteToggle("kdfx", studio.id, `${getKdfxLabelSingular().toLowerCase()} ${String(studio.id).padStart(3, "0")}`));

    main.appendChild(title);
    if (studio.meta) {
      main.appendChild(meta);
    }
    if (badges) {
      main.appendChild(badges);
    }
    item.appendChild(main);
    item.appendChild(actions);

    item.onclick = () => {
      selectedKdfxStudioId = studio.id;
      renderKdfxDetail(studio.id);
      renderKdfxList(query);
    };

    container.appendChild(item);
  });

  if (selectedKdfxStudioId && studios.some(studio => studio.id === selectedKdfxStudioId)) {
    renderKdfxDetail(selectedKdfxStudioId);
  }

  const visibleSelected = studios.some(studio => studio.id === selectedKdfxStudioId);
  if (!visibleSelected && studios.length > 0) {
    selectedKdfxStudioId = studios[0].id;
    renderKdfxDetail(selectedKdfxStudioId);
    renderKdfxList(query);
  }

  if (studios.length === 0) {
    document.getElementById("kdfxStudioDetail").textContent = `No ${getKdfxLabelPlural().toLowerCase()} match the search.`;
    selectedKdfxStudioId = null;
  }
}

function getKdfxFavoriteEntries() {
  if (!kdfxLookup?.studiosById) {
    return [];
  }

  return Object.values(kdfxLookup.studiosById).map(studio => {
    const busCount = studio.buses ? Object.keys(studio.buses).length : 0;
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

    return {
      id: Number(studio.id),
      type: "kdfx",
      number: Number(studio.id),
      location: String(studio.id).padStart(3, "0"),
      typeLabel: getKdfxLabelSingular(),
      name: String(studio.name || ""),
      meta: busCount > 0 ? `${busCount} bus${busCount === 1 ? "" : "es"}` : "",
      badges: getObjectMetadataBadges(studio),
      searchText: [`${studio.id}`, studio.name, ...busTokens].join(" ").toLowerCase(),
    };
  });
}

function getObjectMetadataBadges(entry) {
  if (!entry || typeof entry !== "object") {
    return [];
  }

  const badges = [];

  if (entry.possibleDuplicate) {
    badges.push({ label: "Possible Duplicate", tone: "duplicate" });
  }

  return badges;
}

function buildMetadataBadgeRow(badges) {
  if (!Array.isArray(badges) || badges.length === 0) {
    return null;
  }

  const row = document.createElement("div");
  row.className = "metadata-badges";

  badges.forEach(badge => {
    const chip = document.createElement("span");
    chip.className = `metadata-badge metadata-badge-${badge.tone || "default"}`;
    chip.textContent = badge.label;
    row.appendChild(chip);
  });

  return row;
}

function buildObjectNotes(entry, objectLabel) {
  if (!entry || typeof entry !== "object") {
    return [];
  }

  const notes = [];

  if (entry.possibleDuplicate) {
    notes.push({
      tone: "duplicate",
      text: `Possible duplicate of ${objectLabel} ${String(entry.possibleDuplicate).padStart(3, "0")}. Match not yet verified.`,
    });
  }

  return notes;
}

function buildObjectNoteBlock(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return null;
  }

  const container = document.createElement("div");
  container.className = "kdfx-notes";

  notes.forEach(note => {
    const item = document.createElement("div");
    item.className = `kdfx-note kdfx-note-${note.tone || "default"}`;
    item.textContent = note.text;
    container.appendChild(item);
  });

  return container;
}

function getKdfxAlgorithmDetail(algorithmId) {
  if (!algorithmId || !kdfxLookup?.algorithmsById?.[String(algorithmId)]) {
    return null;
  }

  const algorithm = kdfxLookup.algorithmsById[String(algorithmId)];
  const description = String(algorithm.description || "").trim();
  const body = description;

  if (!body) {
    return null;
  }

  return {
    header: `A${String(algorithm.id).padStart(3, "0")} ${algorithm.name || ""}`.trim(),
    body,
  };
}

function renderKdfxDetail(studioId) {

  if (!kdfxLookup?.studiosById) return;

  const detail = document.getElementById("kdfxStudioDetail");
  if (!detail) return;

  const studio = kdfxLookup.studiosById[String(studioId)];
  if (!studio) {
    detail.textContent = `${getKdfxLabelSingular()} not found.`;
    return;
  }

  detail.textContent = "";

  const heading = document.createElement("h3");
  heading.textContent = `${String(studio.id).padStart(3, "0")} ${studio.name}`;
  detail.appendChild(heading);

  const studioBadges = buildMetadataBadgeRow(getObjectMetadataBadges(studio));
  if (studioBadges) {
    detail.appendChild(studioBadges);
  }

  const buses = studio.buses || {};
  const busCount = Object.keys(buses).length;

  const meta = document.createElement("div");
  meta.className = "kdfx-detail-meta";
  meta.textContent = busCount > 0
    ? `${busCount} bus${busCount === 1 ? "" : "es"} configured`
    : "";
  if (meta.textContent) {
    detail.appendChild(meta);
  }

  const notes = buildObjectNoteBlock(buildObjectNotes(studio, getKdfxLabelSingular().toLowerCase()));
  if (notes) {
    detail.appendChild(notes);
  }

  const lines = [];
  const formatKdfxBusLabel = busKey => {
    if (busKey === "aux") {
      return "AUX";
    }

    const match = /^bus(\d+)$/i.exec(busKey);
    if (match) {
      return `BUS${match[1]}`;
    }

    return String(busKey || "").toUpperCase();
  };

  Object.entries(buses).forEach(([busKey, bus]) => {
    const presetId = bus.presetId;
    const preset = presetId ? kdfxLookup.presetsById?.[String(presetId)] : null;
    const algorithm = preset?.algorithmId
      ? kdfxLookup.algorithmsById?.[String(preset.algorithmId)]
      : null;

    const busLabel = formatKdfxBusLabel(busKey);
    const presetName = bus.presetName || "N/A";
    const algorithmName = algorithm?.name || bus.algorithmName || preset?.algorithmName || "";
    const presetIdLabel = presetId ? `P${String(presetId).padStart(3, "0")}` : "";
    const algorithmId = preset?.algorithmId || bus.algorithmId || null;
    const algorithmIdLabel = algorithmId ? `${algorithmId}` : "";
    const algorithmDetail = getKdfxAlgorithmDetail(algorithmId);

    const row = document.createElement("div");
    row.className = "kdfx-line";

    const busEl = document.createElement("span");
    busEl.className = "kdfx-label kdfx-bus";
    busEl.textContent = busLabel;
    row.appendChild(busEl);

    const presetEl = document.createElement("span");
    presetEl.className = "kdfx-preset";
    presetEl.textContent = presetName;
    row.appendChild(presetEl);

    const presetIdEl = document.createElement("span");
    presetIdEl.className = "kdfx-preset-id";
    presetIdEl.textContent = presetIdLabel ? `[${presetIdLabel}]` : "";
    row.appendChild(presetIdEl);

    const algorithmWrap = document.createElement("span");
    algorithmWrap.className = "kdfx-algorithm-wrap";

    const algorithmEl = document.createElement("span");
    algorithmEl.className = "kdfx-algorithm";
    algorithmEl.textContent = algorithmName;
    algorithmWrap.appendChild(algorithmEl);

    const algorithmInfoSlot = document.createElement("span");
    algorithmInfoSlot.className = "kdfx-algorithm-info";
    algorithmWrap.appendChild(algorithmInfoSlot);

    if (algorithmDetail) {
      const info = document.createElement("span");
      info.className = "modsrc-info";
      info.textContent = "i";
      info.title = "Show algorithm details";
      info.tabIndex = 0;
      info.setAttribute("role", "button");
      info.setAttribute("aria-label", `Show details for algorithm ${algorithmIdLabel || algorithmName}`);

      const show = () => showDspTooltip(algorithmDetail, info);
      const hide = () => scheduleHideDspTooltip();

      info.addEventListener("mouseenter", show);
      info.addEventListener("mouseleave", hide);
      info.addEventListener("focus", show);
      info.addEventListener("blur", hide);
      info.addEventListener("click", show);
      info.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          show();
        }
      });

      algorithmInfoSlot.appendChild(info);
    }

    row.appendChild(algorithmWrap);

    const algorithmIdEl = document.createElement("span");
    algorithmIdEl.className = "kdfx-algorithm-id";
    const algorithmPau = algorithmId ? kdfxLookup.algorithmsById?.[String(algorithmId)]?.pau : null;
    algorithmIdEl.textContent = algorithmIdLabel ? `[${algorithmIdLabel}]` : "";
    row.appendChild(algorithmIdEl);

    const algorithmPauEl = document.createElement("span");
    algorithmPauEl.className = "kdfx-algorithm-pau";
    algorithmPauEl.textContent = algorithmPau != null ? `${algorithmPau}` : "";
    row.appendChild(algorithmPauEl);

    lines.push(row);
  });

  const legend = document.getElementById("kdfxLegend");
  const hasRouting = lines.length > 0;
  legend?.classList.toggle("hidden", !hasRouting);

  if (!hasRouting) {
    return;
  }

  lines.forEach(line => detail.appendChild(line));
}

function getDspAlgorithmEntries() {

  if (!dspAlgorithms?.algorithmsById) {
    return [];
  }

  return Object.values(dspAlgorithms.algorithmsById)
    .map(algorithm => {
      const stages = Array.isArray(algorithm.stages) ? algorithm.stages : [];
      const blockLabels = stages.flatMap(stage => {
        const optionSet = dspAlgorithms.optionSetsById?.[stage.optionSetId];
        const blockIds = Array.isArray(optionSet?.blockIds) ? optionSet.blockIds : [];
        return blockIds.map(blockId => dspAlgorithms.blocksById?.[blockId]?.label || blockId);
      });

      return {
        id: Number(algorithm.algorithmId),
        algorithmType: algorithm.algorithmType || "standard",
        layerRole: algorithm.layerRole || "standard",
        stageCount: stages.length,
        labels: blockLabels,
        sourcePage: algorithm.sourcePage || "",
        typeLabel: getDspAlgorithmTypeLabel(algorithm),
        layerLabel: getDspAlgorithmLayerLabel(algorithm),
        searchText: [
          algorithm.algorithmId,
          getDspAlgorithmTypeLabel(algorithm),
          getDspAlgorithmLayerLabel(algorithm),
          algorithm.sourcePage || "",
          ...blockLabels,
        ].join(" ").toLowerCase(),
      };
    })
    .sort((a, b) => a.id - b.id);
}

function getDspAlgorithmTypeLabel(algorithm) {

  if ((algorithm?.algorithmType || "standard") === "triple") {
    return "Triple Layer";
  }

  return "Standard Layer";
}

function getDspAlgorithmLayerLabel(algorithm) {

  switch (algorithm?.layerRole) {
    case "layer_1":
      return "Layer 1";
    case "layer_2":
      return "Layer 2";
    case "layer_3":
      return "Layer 3";
    default:
      return "";
  }
}

function matchesDspAlgorithmFilters(entry) {

  if (entry.algorithmType !== "triple") {
    return currentDspAlgorithmFilters.standard;
  }

  if (!currentDspAlgorithmFilters.triple) {
    return false;
  }

  if (currentDspAlgorithmFilters.layer1 && currentDspAlgorithmFilters.layer3) {
    return true;
  }

  return (
    (currentDspAlgorithmFilters.layer1 && entry.layerRole === "layer_1") ||
    (currentDspAlgorithmFilters.layer3 && entry.layerRole === "layer_3")
  );
}

function updateDspAlgorithmFilterButtons() {

  const standardButton = document.getElementById("dspFilterStandard");
  const tripleButton = document.getElementById("dspFilterTriple");
  const layer1Button = document.getElementById("dspFilterLayer1");
  const layer3Button = document.getElementById("dspFilterLayer3");
  const canUseLayerFilters = currentDspAlgorithmFilters.triple;

  standardButton?.classList.toggle("active", currentDspAlgorithmFilters.standard);
  tripleButton?.classList.toggle("active", currentDspAlgorithmFilters.triple);
  layer1Button?.classList.toggle("active", currentDspAlgorithmFilters.layer1);
  layer3Button?.classList.toggle("active", currentDspAlgorithmFilters.layer3);

  if (layer1Button) {
    layer1Button.disabled = !canUseLayerFilters;
  }

  if (layer3Button) {
    layer3Button.disabled = !canUseLayerFilters;
  }
}

function setDspAlgorithmFilter(filterKey) {

  if ((filterKey === "layer1" || filterKey === "layer3") && !currentDspAlgorithmFilters.triple) {
    return;
  }

  if (filterKey === "triple") {
    currentDspAlgorithmFilters.triple = !currentDspAlgorithmFilters.triple;

    if (currentDspAlgorithmFilters.triple) {
      currentDspAlgorithmFilters.layer1 = true;
      currentDspAlgorithmFilters.layer3 = true;
    } else {
      currentDspAlgorithmFilters.layer1 = false;
      currentDspAlgorithmFilters.layer3 = false;
    }
  } else {
    currentDspAlgorithmFilters[filterKey] = !currentDspAlgorithmFilters[filterKey];
  }

  updateDspAlgorithmFilterButtons();
  renderDspAlgorithmList(getDspSearchQuery());
}

function getDspSearchQuery() {
  return document.getElementById("dspSearch")?.value || "";
}

function renderDspAlgorithmList(query = "") {

  if (!dspAlgorithms?.algorithmsById) return;

  const container = document.getElementById("dspAlgorithmList");
  const summary = document.getElementById("dspSummary");
  if (!container) return;

  const text = query.trim().toLowerCase();
  const entries = getDspAlgorithmEntries()
    .filter(entry => matchesDspAlgorithmFilters(entry))
    .filter(entry => !text || entry.searchText.includes(text));

  container.textContent = "";
  if (summary) {
    summary.textContent = `${entries.length} algorithms`;
  }

  if (entries.length === 0) {
    container.textContent = "No DSP algorithms match the current search/filter.";
    renderDspAlgorithmDetail(null);
    return;
  }

  const visibleSelected = entries.some(entry => entry.id === selectedDspAlgorithmId);
  if (!visibleSelected) {
    selectedDspAlgorithmId = entries[0].id;
  }

  const fragment = document.createDocumentFragment();

  entries.forEach(entry => {
    const item = document.createElement("div");
    item.className = "kdfx-list-item";

    if (selectedDspAlgorithmId === entry.id) {
      item.classList.add("active");
    }

    const main = document.createElement("div");
    main.className = "kdfx-list-item-main";

    const title = document.createElement("div");
    title.className = "kdfx-list-item-title";
    title.textContent = `Algorithm ${entry.id}`;

    const meta = document.createElement("span");
    meta.className = "dsp-list-item-meta";
    meta.textContent = [
      entry.typeLabel,
      entry.layerLabel,
      `${entry.stageCount} stages`,
    ].filter(Boolean).join(" | ");

    main.appendChild(title);
    main.appendChild(meta);
    item.appendChild(main);
    item.addEventListener("click", () => {
      selectedDspAlgorithmId = entry.id;
      renderDspAlgorithmDetail(entry.id);
      renderDspAlgorithmList(query);
    });
    fragment.appendChild(item);
  });

  container.appendChild(fragment);
  renderDspAlgorithmDetail(selectedDspAlgorithmId);
}

function renderDspAlgorithmDetail(algorithmId) {

  const meta = document.getElementById("dspAlgorithmMeta");
  const detail = document.getElementById("dspAlgorithmDetail");

  if (!detail) return;

  if (!algorithmId || !dspAlgorithms?.algorithmsById?.[String(algorithmId)]) {
    if (meta) {
      meta.textContent = "";
    }
    detail.textContent = "Select an algorithm to view its stages.";
    return;
  }

  const algorithm = dspAlgorithms.algorithmsById[String(algorithmId)];
  const stages = Array.isArray(algorithm.stages) ? algorithm.stages : [];

  detail.textContent = "";

  const heading = document.createElement("h3");
  heading.textContent = `Algorithm ${algorithm.algorithmId}`;
  detail.appendChild(heading);

  if (meta) {
    meta.textContent = [
      getDspAlgorithmTypeLabel(algorithm),
      getDspAlgorithmLayerLabel(algorithm),
      `${stages.length} stages`,
    ].filter(Boolean).join(" | ");
  }

  const grid = document.createElement("div");
  grid.className = "dsp-stage-grid";

  stages.forEach((stage, index) => {
    const optionSet = dspAlgorithms.optionSetsById?.[stage.optionSetId];
    const blockIds = Array.isArray(optionSet?.blockIds) ? optionSet.blockIds : [];

    const card = document.createElement("div");
    card.className = `dsp-stage dsp-stage-${stage.kind === "fixed" ? "fixed" : "choice"}`;

    const title = document.createElement("div");
    title.className = "dsp-stage-title";
    title.textContent = `Stage ${index + 1}`;

    const kind = document.createElement("span");
    kind.className = "dsp-stage-kind";
    kind.textContent = stage.kind === "fixed" ? "Fixed Block" : "Selectable Blocks";

    const options = document.createElement("div");
    options.className = "dsp-stage-options";

    blockIds.forEach(blockId => {
      const block = dspAlgorithms.blocksById?.[blockId];
      const blockDetail = getDspBlockDetail(blockId);
      const option = document.createElement("div");
      option.className = "dsp-option";
      
      const optionLabel = document.createElement("span");
      optionLabel.className = "dsp-option-label";
      optionLabel.textContent = block?.label || blockId;
      option.appendChild(optionLabel);

      if (blockDetail) {
        const info = document.createElement("span");
        info.className = "modsrc-info";
        info.textContent = "i";
        info.title = "Show details";
        info.tabIndex = 0;
        info.setAttribute("role", "button");
        info.setAttribute("aria-label", `Show details for ${block?.label || blockId}`);

        const show = () => showDspTooltip(blockDetail, info);
        const hide = () => scheduleHideDspTooltip();

        info.addEventListener("mouseenter", show);
        info.addEventListener("mouseleave", hide);
        info.addEventListener("focus", show);
        info.addEventListener("blur", hide);
        info.addEventListener("click", show);
        info.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            show();
          }
        });

        option.appendChild(info);
      }

      options.appendChild(option);
    });

    card.appendChild(title);
    card.appendChild(kind);
    card.appendChild(options);
    grid.appendChild(card);
  });

  detail.appendChild(grid);
}


/* =====================
ROM CARD SELECTION
======================= */
function getRequiredRomCardForPatch(patchNumber) {

  return getRequiredRomCardForCatalogItem("programs", patchNumber);
}

function getRequiredRomCardForCatalogItem(modeId, itemNumber) {
  const entry = modeId === "setups"
    ? resolveSetupByNumber(itemNumber)
    : patches?.[itemNumber];
  const romId = entry?.romId || null;

  if (romId) {
    return (synthModel?.romCards || []).find(card => card.id === romId) || null;
  }

  const rules = modeId === "setups"
    ? (synthModel?.setupAccessRules || [])
    : (synthModel?.patchAccessRules || []);

  for (const rule of rules) {
    if (itemNumber >= rule.start && itemNumber <= rule.end) {
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

  return buildRomSelectorForModel(synthModel);
}

function buildRomSelectorForModel(modelConfig) {

  const container = document.getElementById("romTiles");
  const heading = document.getElementById("romSettingsHeading");

  if (!container) return;
  container.innerHTML = "";

  const romCards = modelConfig?.romCards || [];

  if (heading) {
    heading.textContent = "Installed ROMs";
    heading.classList.toggle("hidden", romCards.length === 0);
  }

  container.classList.toggle("hidden", romCards.length === 0);

  if (romCards.length === 0) {
    return;
  }

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

function saveRomSelection(modelConfig = synthModel) {

  const active = [...document.querySelectorAll(".romTile.active")]
      .map(el => el.dataset.romId);

  localStorage.setItem(getRomStorageKey(modelConfig), JSON.stringify(active));

}

function restoreRomSelection(modelConfig = synthModel) {

  const saved = getSavedRomIds(modelConfig);

  document.querySelectorAll(".romTile").forEach(tile => {

    if (saved.includes(tile.dataset.romId)) {
      tile.classList.add("active");
    }

  });

}

function getSavedRomIds(modelConfig = synthModel) {

  const romCards = modelConfig?.romCards || [];
  const savedByModel = localStorage.getItem(getRomStorageKey(modelConfig));
  const savedLegacy = localStorage.getItem("k2600_roms");
  let saved = [];

  try {
    saved = JSON.parse(savedByModel || savedLegacy || "[]");
  } catch (error) {
    console.warn("Ignoring invalid saved ROM selection", error);
    saved = [];
  }

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
    localStorage.setItem(getRomStorageKey(modelConfig), JSON.stringify(normalized));
  }

  return normalized;
}

async function getModelConfigForEntry(entry) {
  if (!entry?.configPath) {
    return null;
  }

  if (entry.key === selectedModelEntry?.key) {
    return synthModel;
  }

  if (modelConfigCache.has(entry.key)) {
    return modelConfigCache.get(entry.key);
  }

  const config = await fetchJson(entry.configPath, `${entry.model} model config`);
  modelConfigCache.set(entry.key, config);
  return config;
}

async function refreshModalModelPreview() {
  const select = document.getElementById("modelSelect");
  const selectedKey = select?.value || selectedModelEntry?.key || "";
  const entry = availableModels.find(model => model.key === selectedKey) || selectedModelEntry || null;
  const modelConfig = await getModelConfigForEntry(entry);

  buildRomSelectorForModel(modelConfig);
  restoreRomSelection(modelConfig);

  return modelConfig;
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

function getMidiDebugStorageKey() {
  const modelId = synthModel?.modelId || "default";
  return `${modelId}_midiDebugEnabled`;
}

function getMidiChannelStorageKey() {
  const modelId = synthModel?.modelId || "default";
  return `${modelId}_midiReceiveChannel`;
}

function isMidiDebugEnabled() {
  const stored = localStorage.getItem(getMidiDebugStorageKey());

  if (stored === "true") {
    return true;
  }

  if (stored === "false") {
    return false;
  }

  return CONFIG?.midi?.debugEnabled === true;
}

function setMidiDebugEnabled(enabled) {
  localStorage.setItem(getMidiDebugStorageKey(), enabled ? "true" : "false");
}

function getSelectedMidiChannel() {
  const stored = Number(localStorage.getItem(getMidiChannelStorageKey()));

  if (Number.isInteger(stored) && stored >= 1 && stored <= 16) {
    return stored;
  }

  return 1;
}

function setSelectedMidiChannel(channel) {
  const normalized = Number(channel);
  const nextChannel = Number.isInteger(normalized) && normalized >= 1 && normalized <= 16 ? normalized : 1;
  localStorage.setItem(getMidiChannelStorageKey(), String(nextChannel));
}

function midiDebugLog(...args) {
  if (!isMidiDebugEnabled()) {
    return;
  }

  console.log("[MIDI DEBUG]", ...args);
}

function getRomStorageKey(modelConfig = synthModel) {
  const modelId = modelConfig?.modelId || "default";
  return `${modelId}_roms`;
}

function getFavoritesStorageKey() {
  const modelId = synthModel?.modelId || "default";
  return `${modelId}_favorites`;
}

function normalizeFavoriteNumberList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map(item => Number(item))
      .filter(item => Number.isFinite(item))
  )].sort((a, b) => a - b);
}

function loadFavorites() {
  const raw = localStorage.getItem(getFavoritesStorageKey());

  if (!raw) {
    favoritesState = {
      programs: [],
      setups: [],
      kdfx: [],
    };
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    favoritesState = {
      programs: normalizeFavoriteNumberList(parsed?.programs),
      setups: normalizeFavoriteNumberList(parsed?.setups),
      kdfx: normalizeFavoriteNumberList(parsed?.kdfx),
    };
  } catch (error) {
    console.warn("Failed to parse favorites, resetting", error);
    favoritesState = {
      programs: [],
      setups: [],
      kdfx: [],
    };
  }
}

function saveFavorites() {
  localStorage.setItem(getFavoritesStorageKey(), JSON.stringify({
    programs: favoritesState.programs,
    setups: favoritesState.setups,
    kdfx: favoritesState.kdfx,
  }));
  updateFavoritesTransferSummary();
}

function createFavoritesExportPayload() {
  return {
    modelId: synthModel?.modelId || "default",
    manufacturer: synthModel?.manufacturer || "",
    model: synthModel?.model || "",
    version: 2,
    exportedAt: new Date().toISOString(),
    favorites: {
      programs: favoritesState.programs,
      setups: favoritesState.setups,
      kdfx: favoritesState.kdfx,
    },
  };
}

function updateFavoritesTransferSummary(message = "") {
  const summary = document.getElementById("favoritesTransferSummary");

  if (!summary) return;

  const labels = getFavoritesCategoryLabels();
  const totalCount = favoritesState.programs.length + favoritesState.setups.length + favoritesState.kdfx.length;
  summary.textContent = message || `${totalCount} favorite${totalCount === 1 ? "" : "s"} saved (${favoritesState.programs.length} ${labels.programs}, ${favoritesState.setups.length} ${labels.setups}, ${favoritesState.kdfx.length} ${labels.kdfx}).`;
}

function refreshFavoritesUi() {
  updateFavoriteToggleButton();
  updateFavoritesTransferSummary();
  renderSearchResults(getPatchSearchQuery());
  renderFavoritesResults(getFavoritesSearchQuery());
  renderKdfxList(getKdfxSearchQuery());
}

function downloadFavoritesFile() {
  const payload = createFavoritesExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const modelId = synthModel?.modelId || "favorites";

  link.href = url;
  link.download = `${modelId}-favorites.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  const totalCount = payload.favorites.programs.length + payload.favorites.setups.length + payload.favorites.kdfx.length;
  updateFavoritesTransferSummary(`Exported ${totalCount} favorites.`);
}

function parseFavoritesImportPayload(text) {
  const parsed = JSON.parse(text);
  const modelId = synthModel?.modelId || "default";

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Import file is not a valid favorites object.");
  }

  if (parsed.modelId && parsed.modelId !== modelId) {
    throw new Error(`Import file is for model "${parsed.modelId}", expected "${modelId}".`);
  }

  const favoriteRoot = parsed.favorites && typeof parsed.favorites === "object"
    ? parsed.favorites
    : parsed;

  return {
    programs: normalizeFavoriteNumberList(favoriteRoot.programs),
    setups: normalizeFavoriteNumberList(favoriteRoot.setups),
    kdfx: normalizeFavoriteNumberList(favoriteRoot.kdfx),
  };
}

function applyImportedFavorites(importedFavorites, mode = "merge") {
  const nextPrograms = mode === "replace"
    ? importedFavorites.programs
    : normalizeFavoriteNumberList([...favoritesState.programs, ...importedFavorites.programs]);

  const nextSetups = mode === "replace"
    ? importedFavorites.setups
    : normalizeFavoriteNumberList([...favoritesState.setups, ...importedFavorites.setups]);

  const nextKdfx = mode === "replace"
    ? importedFavorites.kdfx
    : normalizeFavoriteNumberList([...favoritesState.kdfx, ...importedFavorites.kdfx]);

  favoritesState = {
    programs: nextPrograms,
    setups: nextSetups,
    kdfx: nextKdfx,
  };

  saveFavorites();
  refreshFavoritesUi();

  const totalCount = nextPrograms.length + nextSetups.length + nextKdfx.length;
  updateFavoritesTransferSummary(`${mode === "replace" ? "Replaced" : "Merged"} favorites. ${totalCount} total.`);
}

function beginFavoritesImport(mode = "merge") {
  const input = document.getElementById("favoritesImportInput");

  if (!input) return;

  input.dataset.importMode = mode;
  input.value = "";
  input.click();
}

async function handleFavoritesImportSelection(event) {
  const input = event.target;
  const file = input?.files?.[0];

  if (!file) {
    return;
  }

  const mode = input.dataset.importMode === "replace" ? "replace" : "merge";

  try {
    const text = await file.text();
    const importedFavorites = parseFavoritesImportPayload(text);
    applyImportedFavorites(importedFavorites, mode);
  } catch (error) {
    console.error("Failed to import favorites", error);
    updateFavoritesTransferSummary(error instanceof Error ? error.message : "Failed to import favorites.");
  } finally {
    input.value = "";
  }
}

function isFavorite(type, number) {
  return favoritesState[type]?.includes(Number(number)) || false;
}

function toggleFavorite(type, number) {
  if (!favoritesState[type]) {
    return false;
  }

  const normalizedNumber = Number(number);
  const current = favoritesState[type];
  const next = current.includes(normalizedNumber)
    ? current.filter(item => item !== normalizedNumber)
    : [...current, normalizedNumber].sort((a, b) => a - b);

  favoritesState = {
    ...favoritesState,
    [type]: next,
  };

  saveFavorites();
  updateFavoriteToggleButton();
  renderSearchResults(getPatchSearchQuery());
  renderFavoritesResults(getFavoritesSearchQuery());
  renderKdfxList(getKdfxSearchQuery());
  return favoritesState[type].includes(normalizedNumber);
}

function updateFavoriteToggleButton() {
  const button = document.getElementById("favoriteToggleButton");

  if (!button) return;

  const isCatalogMode = currentDisplayedType === "programs" || currentDisplayedType === "setups";
  const hasNumber = Number.isFinite(currentDisplayedNumber);

  button.classList.toggle("hidden", !isCatalogMode || !hasNumber);

  if (!isCatalogMode || !hasNumber) {
    return;
  }

  const active = isFavorite(currentDisplayedType, currentDisplayedNumber);
  const label = active ? "Remove current item from favorites" : "Add current item to favorites";

  button.classList.toggle("active", active);
  button.title = label;
  button.setAttribute("aria-label", label);
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
  const modeLabel = selectedMode === "setups" ? getSecondaryLabelSingular() : getProgramLabelSingular();
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

async function saveSettings() {
  const selectedModelKey = document.getElementById("modelSelect")?.value || selectedModelEntry?.key || "";
  const midiDebugEnabled = document.getElementById("midiDebugEnabled")?.checked === true;
  const midiChannel = Number(document.getElementById("midiChannelSelect")?.value || getSelectedMidiChannel());
  const modelChanged = Boolean(selectedModelKey && selectedModelKey !== selectedModelEntry?.key);

  if (!selectedModelKey) {
    const select = document.getElementById("modelSelect");
    select?.focus();
    return;
  }

  if (selectedModelKey) {
    localStorage.setItem(getModelSelectionStorageKey(), selectedModelKey);
  }

  setMidiDebugEnabled(midiDebugEnabled);
  setSelectedMidiChannel(midiChannel);

  const selectedModelEntryForSave = availableModels.find(model => model.key === selectedModelKey) || selectedModelEntry || null;
  const selectedModelConfig = await getModelConfigForEntry(selectedModelEntryForSave) || synthModel;

  if (selectedMidiInput) {
    connectDevice(selectedMidiInput);
  } else if (!mySynth) {
    setNeedsMidiDisplay();
  }

  saveRomSelection(selectedModelConfig);

  if (!modelChanged) {
    initializeKeymapFilters();
    renderKeymapFilterButtons();
    renderKeymaps(getKeymapSearchQuery());
    renderSearchResults(getPatchSearchQuery());
    renderFavoritesResults(getFavoritesSearchQuery());
  }

  console.log("Settings saved");

  if (modelChanged) {
    window.location.reload();
    return;
  }

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

function setupKeyboardShortcuts() {

  document.addEventListener("keydown", e => {

    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
      return;
    }

    if (modal.style.display !== "none") {
      return;
    }

    const code = e.code;

    if (code === "KeyR") {
      e.preventDefault();
      showView("search");
      renderSearchResults(getPatchSearchQuery());
      return;
    }

    if (code === "KeyF") {
      e.preventDefault();
      showView("favorites");
      renderFavoritesResults(getFavoritesSearchQuery());
      return;
    }

    if (code === "KeyP") {
      e.preventDefault();
      showView("main");
      return;
    }

    if (code === "KeyS") {
      const setupsButton = document.getElementById("setupsButton");
      if (setupsButton?.classList.contains("hidden")) {
        return;
      }
      e.preventDefault();
      showView("setups");
      return;
    }

    if (code === "KeyM") {
      const modSourcesButton = document.getElementById("modSourcesButton");
      if (modSourcesButton?.classList.contains("hidden")) {
        return;
      }
      e.preventDefault();
      showView("modsources");
      renderModSources(document.getElementById("modSourceSearch")?.value || "");
      return;
    }

    if (code === "KeyC") {
      e.preventDefault();
      showDeviceModal();
    }
  });
}


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
  applyModelLabels();
  loadFavorites();
  initializeProgramCategoryFilters();
  initializeKeymapFilters();

  await startMIDI();
  setupSettingsButton();
  setupWebButton();
  setupKdfxButton();
  setupKeyboardShortcuts();
  renderSearchResults(getPatchSearchQuery());
  renderFavoritesResults(getFavoritesSearchQuery());
  renderKeymaps(getKeymapSearchQuery());
  showView("main");

  if (isFirstRunModelSelectionRequired()) {
    showDeviceModal();
  }

}

document.addEventListener("DOMContentLoaded", startApp);
