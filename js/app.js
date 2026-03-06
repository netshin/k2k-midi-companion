console.log("starting app.js");

/* ============================
   GLOBAL STATE
============================ */

let patches = {};
let controllers = {};
let mySynth = null;

let myBankMSB = 0;
let myBankLSB = 0;


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

  if (WebMidi.inputs.length === 0) {
    container.innerHTML = "<div>No MIDI devices detected</div>";
    modal.style.display = "flex";
    return;
  }

  WebMidi.inputs.forEach(input => {

    const tile = document.createElement("div");

    tile.className = "tile";
    tile.textContent = input.name;

    tile.onclick = () => connectDevice(input);

    container.appendChild(tile);

  });

  modal.style.display = "flex";
  
}


/* ============================
   CONNECT DEVICE
============================ */

function connectDevice(input) {

  mySynth = input;

  console.log("Connected to:", mySynth.name);

  /* save device id */

  localStorage.setItem("preferredMidiInput", input.id);

  attachMidiListeners();

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

  const patch = patches[patchNumber];

  if (!patch) {
    document.getElementById("display").textContent = "Unknown Patch";
    document.getElementById("notes").textContent = "";
    return;
  }

  document.getElementById("display").textContent = patch.name;

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


/* ============================
   APPLICATION STARTUP
============================ */

async function startApp() {

  await loadData();

  await startMIDI();

  setupSettingsButton();

}

document.addEventListener("DOMContentLoaded", startApp);