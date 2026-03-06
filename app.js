let patches = {};
console.log ("starting app.js")
fetch("k2600_programs.json")
  .then(response => {
    console.log("Got response:", response);
    return response.json();
  })
  .then(data => {
    console.log("Parsed JSON:", data);
    patches = data;
  });


let controllers = {};

fetch("k2600_controllers.json")
  .then(r => r.json())
  .then(data => {
    controllers = data;
  });


function handleProgramChange(myBankMSB,myBankLSB,programNumber) {
  console.log (programNumber);
  let patchNumber = (myBankLSB * 100) + programNumber;
  const patch = patches[patchNumber];

  if (!patch) {
    document.getElementById("display").textContent = "Unknown Patch";
    document.getElementById("notes").textContent = "";
    return;
  }

  // Show patch name
  document.getElementById("display").textContent = patch.name;

  // Build formatted controls list
  let notesHtml = "";

  patch.controls.forEach(control => {

    if (control.type === "MIDI") {
      const ctrlName = controllers[control.number] || `CC ${control.number}`;
      notesHtml += `<div class="ctrl-row"><span class="ctrl-name">`+ctrlName + `</span><span class="ctrl-desc">${control.description}</span></div>`;
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

