console.log("starting app.js");

/* ============================
   GLOBAL STATE
============================ */

let patches = {};
let controllers = {};
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

  const patchResponse = await fetch("k2600_programs.json");
  patches = await patchResponse.json();

  const controllerResponse = await fetch("k2600_controllers.json");
  controllers = await controllerResponse.json();

  console.log("JSON loaded");
}


/* ============================
   MIDI STARTUP
============================ */

async function startMIDI() {

  await WebMidi.enable();

  console.log("WebMidi Enabled");

  const savedId = localStorage.getItem("preferredMidiInput");

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

  localStorage.setItem("preferredMidiInput", input.id);

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

  let patchNumber = (myBankLSB * 100) + programNumber;
  const location = formatPatchLocation(patchNumber);

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


/* =====================
ROM CARD SELECTION
======================= */
const romCards = [
  "Orchestral",
  "Contemporary",
  "Piano",
  "Vintage Keys"
];


function buildRomSelector() {

  const container = document.getElementById("romTiles");

  container.innerHTML = "";

  romCards.forEach(name => {

    const tile = document.createElement("div");

    tile.className = "romTile";

    tile.textContent = name;

    tile.onclick = () => {
      tile.classList.toggle("active");
    };

    container.appendChild(tile);

  });

}

function saveRomSelection() {

  const active = [...document.querySelectorAll(".romTile.active")]
      .map(el => el.textContent);

  localStorage.setItem("k2600_roms", JSON.stringify(active));

}

function restoreRomSelection() {

  const saved = JSON.parse(localStorage.getItem("k2600_roms") || "[]");

  document.querySelectorAll(".romTile").forEach(tile => {

    if (saved.includes(tile.textContent)) {
      tile.classList.add("active");
    }

  });

}

function formatPatchLocation(patchNumber) {
  return String(patchNumber).padStart(3, "0");
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

  await startMIDI();
  setupSettingsButton();

}

document.addEventListener("DOMContentLoaded", startApp);
