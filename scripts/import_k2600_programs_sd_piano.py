#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT.parent / "supporting materials/K2600/Extracted/Programs/K2600 Programs - Stereo Dynamic Piano.pdf"
PROGRAMS_PATH = ROOT / "Kurzweil/K2600/k2600_programs.json"

SPLIT_AT = 58
PROGRAM_RE = re.compile(r"^(\d{3})\s+(.+)$")
CONTROL_RE = re.compile(r"^(Mod Wheel|MIDI\s*\d+)(?:\s+(.+))?$")


def normalize_control(control_label: str, description: str) -> dict[str, object]:
    control_label = re.sub(r"\s+", " ", control_label).strip()
    description = re.sub(r"\s+", " ", description).strip()

    if control_label == "Mod Wheel":
        return {"type": "Modulation Wheel", "description": description}

    midi_match = re.match(r"^MIDI\s*(\d+)$", control_label)
    if midi_match:
        return {"type": "MIDI", "number": int(midi_match.group(1)), "description": description}

    return {"type": control_label, "description": description}


def parse_column(lines: list[str]) -> dict[str, dict[str, object]]:
    programs: dict[str, dict[str, object]] = {}
    current_id: str | None = None

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        program_match = PROGRAM_RE.match(line)
        if program_match:
            current_id = program_match.group(1)
            programs[current_id] = {
                "name": program_match.group(2).strip(),
                "controls": [],
                "categoryId": "piano",
                "categoryLabel": "Stereo Dynamic Piano",
                "sourceLabel": "Stereo Dynamic Piano",
            }
            continue

        if current_id is None:
            continue

        control_match = CONTROL_RE.match(line)
        if control_match:
            programs[current_id]["controls"].append(
                normalize_control(control_match.group(1), control_match.group(2) or "")
            )
            continue

        controls = programs[current_id]["controls"]
        pending = next((control for control in controls if not control.get("description")), None)
        if pending is not None:
            pending["description"] = line

    return programs


def main() -> None:
    text = subprocess.check_output(["pdftotext", "-layout", str(PDF_PATH), "-"], text=True)
    left_lines: list[str] = []
    right_lines: list[str] = []

    for raw_line in text.splitlines():
        left_lines.append(raw_line[:SPLIT_AT].rstrip())
        right_lines.append(raw_line[SPLIT_AT:].rstrip())

    imported = {}
    imported.update(parse_column(left_lines))
    imported.update(parse_column(right_lines))

    existing = json.loads(PROGRAMS_PATH.read_text())
    existing.update(imported)
    PROGRAMS_PATH.write_text(json.dumps(existing, indent=2, ensure_ascii=False) + "\n")

    print(f"Imported SD Piano programs: {len(imported)}")
    for key in ["700", "706", "712", "721", "729"]:
        entry = imported.get(key)
        if entry:
            print(f"{key}: {entry['name']} ({len(entry['controls'])} controls)")
        else:
            print(f"{key}: MISSING")


if __name__ == "__main__":
    main()
