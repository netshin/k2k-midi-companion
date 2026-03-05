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


function handleProgramChange(myBankMSB,myBankLSB,programNumber) {
  console.log (programNumber[0].toString());
  let myProgramNumber = programNumber[0].toString();
  const patch = patches[myProgramNumber];

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
      notesHtml += `<div class="cc">CC ${control.number} — ${control.description}</div>`;
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

