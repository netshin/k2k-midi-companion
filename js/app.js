console.log("starting app.js");

/* ============================
   GLOBAL STATE
============================ */

let patches = {};
let controllers = {};
let synthModel = null;
let mySynth = null;
let selectedMidiInput = null;

let myBankMSB = 0;
let myBankLSB = 0;
const NEEDS_MIDI_MESSAGE = "Configure a MIDI Interface...";
const WAITING_MESSAGE = "Waiting...";


/* ============================
   LOAD DATA FILES
============================ */

async function loadData() {

  const modelConfigPath = CONFIG?.modelConfigPath || "k2600_model.json";
  const modelResponse = await fetch(modelConfigPath);
  synthModel = await modelResponse.json();

  const patchResponse = await fetch(synthModel.patchDataPath);
  patches = await patchResponse.json();

  const controllerResponse = await fetch(synthModel.controllerDataPath);
  controllers = await controllerResponse.json();

  console.log("JSON loaded");
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

  const patchNumber = computePatchNumber(myBankMSB, myBankLSB, programNumber);
  const location = formatPatchLocation(patchNumber);
  const requiredRomCard = getRequiredRomCardForPatch(patchNumber);

  if (requiredRomCard && !isRomCardEnabled(requiredRomCard)) {
    setDisplayText("ROM Not Enabled", location);
    document.getElementById("notes").textContent =
      `Enable "${requiredRomCard.label}" in Config to use this patch location.`;
    return;
  }

  const patch = patches[patchNumber];

  if (!patch) {
    setDisplayText("Unknown Patch", location);
    document.getElementById("notes").textContent = "";
    return;
  }

  setDisplayText(patch.name, location);

  let notesHtml = "";

  patch.controls.forEach(control => {

    if (control.type === "MIDI") {

      const ctrlName = controllers[control.number] || `CC ${control.number}`;

      notesHtml +=
        `<div class="ctrl-row">
          <span class="ctrl-name">${ctrlName}</span>
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

function formatPatchLocation(patchNumber) {
  const digits = synthModel?.locationDigits || 3;
  return String(patchNumber).padStart(digits, "0");
}

function computePatchNumber(bankMsb, bankLsb, programNumber) {

  const formula = synthModel?.programIndex?.formula || "lsb_times_100_plus_program";

  if (formula === "lsb_times_100_plus_program") {
    return (bankLsb * 100) + programNumber;
  }

  if (formula === "midi_program_only") {
    return programNumber;
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
  locationLine.textContent = `Location: ${locationText}`;
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

}

document.addEventListener("DOMContentLoaded", startApp);
