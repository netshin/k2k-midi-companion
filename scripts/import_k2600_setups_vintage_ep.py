#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT.parent / "supporting materials/K2600/Extracted/Setups/K2600 Setup Control - Vintage Electric Pianos ROM.pdf"
SETUPS_PATH = ROOT / "Kurzweil/K2600/k2600_setups.json"

NS = "{http://www.w3.org/1999/xhtml}"

LEFT_BOUNDS = {
    "page": (0.0, 300.0),
    "id": (0.0, 60.0),
    "name": (60.0, 130.0),
    "control": (130.0, 180.0),
    "function": (180.0, 300.0),
}

RIGHT_BOUNDS = {
    "page": (300.0, 595.5),
    "id": (300.0, 332.0),
    "name": (332.0, 401.0),
    "control": (401.0, 430.0),
    "function": (430.0, 595.5),
}

CONTROL_RE = re.compile(r"^(MWheel|Data|CCPedal ?1|MIDI ?\d+(?: ?(?:\(Sw2\)|Sw2))?)$")
PROGRAM_ID_RE = re.compile(r"^\d{3}$")


def normalize_text(text: str) -> str:
    replacements = {
        "ﬂ": "fl",
        "ﬁ": "fi",
        "–": "-",
        "“": "\"",
        "”": "\"",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return re.sub(r"\s+", " ", text).strip()


def normalize_label(label: str) -> str:
    label = normalize_text(label)
    midi_match = re.match(r"^MIDI ?(\d+)(?: ?(?:\(Sw2\)|Sw2))?$", label)
    if midi_match:
        if "Sw2" in label:
            return f"MIDI {midi_match.group(1)} (Sw2)"
        return f"MIDI {midi_match.group(1)}"
    if label == "CCPedal 1":
        return "CCPedal 1"
    return label


def load_bbox_xml() -> ET.Element:
    xml = subprocess.check_output(["pdftotext", "-bbox-layout", str(PDF_PATH), "-"], text=True)
    return ET.fromstring(xml)


def row_cells(page: ET.Element, bounds: dict[str, tuple[float, float]]) -> list[dict[str, object]]:
    rows: dict[float, list[tuple[float, str]]] = defaultdict(list)
    page_min, page_max = bounds["page"]

    for word in page.iter(f"{NS}word"):
        x = float(word.attrib["xMin"])
        if not (page_min <= x < page_max):
            continue
        y = round(float(word.attrib["yMin"]), 1)
        rows[y].append((x, word.text or ""))

    def bucket(parts: list[tuple[float, str]], lo: float, hi: float) -> str:
        return normalize_text(" ".join(text for x, text in sorted(parts) if lo <= x < hi))

    result: list[dict[str, object]] = []
    for y in sorted(rows):
        parts = rows[y]
        result.append(
            {
                "y": y,
                "id": bucket(parts, *bounds["id"]),
                "name": bucket(parts, *bounds["name"]),
                "control": bucket(parts, *bounds["control"]),
                "function": bucket(parts, *bounds["function"]),
            }
        )
    return result


def should_append_continuation(previous_text: str, continuation: str) -> bool:
    previous_text = previous_text.strip()
    continuation = continuation.strip()
    if not continuation:
        return False
    if continuation.startswith(("(", "\"")):
        return True
    if previous_text.endswith(("(", "-", "/", ",", "^", "and", "Fil-", "Freq", "Reverb", "Ens")):
        return True
    if previous_text.endswith(("Time", "Gain", "Level")) and len(continuation.split()) <= 2:
        return True
    if "/" in continuation and len(continuation.split()) <= 4:
        return True
    return False


def build_controls_from_cluster(cluster_rows: list[dict[str, object]]) -> list[dict[str, str]]:
    controls: list[dict[str, str]] = []
    for row in cluster_rows:
        control = row["control"]
        function = row["function"]
        if control and CONTROL_RE.match(control):
            controls.append({
                "label": normalize_label(control),
                "description": function,
            })
            continue
        if not control and function and controls and should_append_continuation(controls[-1]["description"], function):
            controls[-1]["description"] = normalize_text(f"{controls[-1]['description']} {function}")
    return controls


def parse_column(rows: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    setups: dict[str, dict[str, object]] = {}
    relevant_rows = [
        row for row in rows
        if not (
            (row["id"] == "ID" and row["name"] == "Name")
            or "Vintage EP Setups" in row["name"]
            or "Vintage EP Setups" in row["function"]
            or "K2600 Vintage Electric Pianos User" in row["name"]
            or "K2600 Vintage Electric Pianos User" in row["function"]
        )
    ]

    id_indices = [index for index, row in enumerate(relevant_rows) if PROGRAM_ID_RE.match(row["id"])]

    for position, index in enumerate(id_indices):
        row = relevant_rows[index]
        current_y = float(row["y"])
        previous_y = float(relevant_rows[id_indices[position - 1]]["y"]) if position > 0 else None
        next_y = float(relevant_rows[id_indices[position + 1]]["y"]) if position + 1 < len(id_indices) else None

        lower_bound = -1.0 if previous_y is None else (previous_y + current_y) / 2
        upper_bound = 10_000.0 if next_y is None else (current_y + next_y) / 2

        band_rows = [
            band_row for band_row in relevant_rows
            if lower_bound <= float(band_row["y"]) < upper_bound
        ]
        controls = build_controls_from_cluster(band_rows)

        setups[row["id"]] = {
            "name": row["name"],
            "controls": controls,
            "categoryId": "vintage_electric_pianos",
            "categoryLabel": "Vintage Electric Pianos",
            "sourceLabel": "Vintage Electric Pianos",
        }

    return setups


def main() -> None:
    root = load_bbox_xml()
    imported: dict[str, dict[str, object]] = {}
    for page in root.findall(f".//{NS}page"):
        imported.update(parse_column(row_cells(page, LEFT_BOUNDS)))
        imported.update(parse_column(row_cells(page, RIGHT_BOUNDS)))

    existing = json.loads(SETUPS_PATH.read_text())
    existing.update(imported)
    SETUPS_PATH.write_text(json.dumps(existing, indent=2, ensure_ascii=False) + "\n")

    print(f"Imported Vintage Electric Pianos setups: {len(imported)}")
    for key in ["600", "605", "609", "615", "619"]:
        entry = imported.get(key)
        if entry:
            print(f"{key}: {entry['name']} ({len(entry['controls'])} controls)")
        else:
            print(f"{key}: MISSING")


if __name__ == "__main__":
    main()
