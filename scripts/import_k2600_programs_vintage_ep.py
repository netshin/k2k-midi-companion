#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT.parent / "supporting materials/K2600/Extracted/Programs/K2600 Program Control - Vintage Electric Pianos ROM.pdf"
PROGRAMS_PATH = ROOT / "Kurzweil/K2600/k2600_programs.json"

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
    "id": (300.0, 333.0),
    "name": (333.0, 400.0),
    "control": (400.0, 450.0),
    "function": (450.0, 595.5),
}

FULL_PAGE_BOUNDS = {
    "page": (150.0, 595.5),
    "id": (150.0, 195.0),
    "name": (195.0, 265.0),
    "control": (265.0, 316.0),
    "function": (316.0, 595.5),
}

CONTROL_TOKEN_RE = re.compile(r"^(MWheel|Data|Mpress|SusPedal|CCPedal\d+|MIDI ?\d+(?: ?\([^)]+\))?)$")
PROGRAM_ID_RE = re.compile(r"^\d{3}$")


def load_bbox_xml() -> ET.Element:
    xml = subprocess.check_output(
        ["pdftotext", "-bbox-layout", str(PDF_PATH), "-"],
        text=True,
    )
    return ET.fromstring(xml)


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def row_cells(page: ET.Element, bounds: dict[str, tuple[float, float]]) -> list[dict[str, str]]:
    rows: dict[float, list[tuple[float, str]]] = defaultdict(list)
    page_min, page_max = bounds["page"]

    for word in page.iter(f"{NS}word"):
        x = float(word.attrib["xMin"])
        if not (page_min <= x < page_max):
            continue
        y = round(float(word.attrib["yMin"]), 1)
        rows[y].append((x, word.text or ""))

    def bucket(parts: list[tuple[float, str]], lo: float, hi: float) -> str:
        return clean_text(" ".join(text for x, text in sorted(parts) if lo <= x < hi))

    result: list[dict[str, str]] = []
    for y in sorted(rows):
        parts = rows[y]
        result.append(
            {
                "id": bucket(parts, *bounds["id"]),
                "name": bucket(parts, *bounds["name"]),
                "control": bucket(parts, *bounds["control"]),
                "function": bucket(parts, *bounds["function"]),
            }
        )

    return result


def normalize_control_token(token: str) -> dict[str, object] | None:
    token = clean_text(token)
    if token == "MWheel":
        return {"type": "Modulation Wheel"}
    if token == "Data":
        return {"type": "Data"}
    if token == "Mpress":
        return {"type": "MPress"}
    if token == "SusPedal":
        return {"type": "SusPedal"}
    if token.startswith("CCPedal"):
        return {"type": token}

    midi_match = re.match(r"^MIDI ?(\d+)(?: ?\([^)]+\))?$", token)
    if midi_match:
        return {"type": "MIDI", "number": int(midi_match.group(1))}

    return None


def should_append_continuation(previous_text: str, continuation: str) -> bool:
    previous_text = previous_text.strip()
    continuation = continuation.strip()

    if not previous_text:
        return True

    if previous_text.endswith(("(", "-", "/", "+", ":", ",")):
        return True

    if continuation.startswith(("(", "“", "\"", "-", "/", "+")):
        return True

    if continuation and continuation[0].islower():
        return True

    if not re.search(r"[.!?][\"”']?$", previous_text):
        return True

    return False


def build_controls_from_cluster(cluster_rows: list[dict[str, str]]) -> list[dict[str, object]]:
    controls: list[dict[str, object]] = []

    for row in cluster_rows:
        control = row["control"]
        function = row["function"]
        parsed_control = None

        if control and CONTROL_TOKEN_RE.match(control):
            parsed_control = normalize_control_token(control)

        if parsed_control is not None:
            parsed_control["description"] = function
            controls.append(parsed_control)
            continue

        if not control and function and controls and should_append_continuation(str(controls[-1].get("description", "")), function):
            controls[-1]["description"] = clean_text(f"{controls[-1].get('description', '')} {function}")

    return controls


def extract_first_control_cluster(rows: list[dict[str, str]], start: int, end: int) -> list[dict[str, str]]:
    cluster: list[dict[str, str]] = []
    in_cluster = False
    control_rows_seen = 0

    for index in range(start, end):
        row = rows[index]
        control = row["control"]
        function = row["function"]
        is_control = bool(control and CONTROL_TOKEN_RE.match(control))
        is_continuation = bool(not control and function)

        if is_control:
            if in_cluster and control_rows_seen >= 3 and control in {"MWheel", "Data"}:
                break
            cluster.append(row)
            in_cluster = True
            control_rows_seen += 1
            continue

        if is_continuation and in_cluster:
            cluster.append(row)
            continue

        if in_cluster:
            break

    return cluster


def extract_last_control_cluster(rows: list[dict[str, str]], start: int, end: int) -> list[dict[str, str]]:
    cluster: list[dict[str, str]] = []
    in_cluster = False

    for index in range(end - 1, start - 1, -1):
        row = rows[index]
        control = row["control"]
        function = row["function"]
        is_control = bool(control and CONTROL_TOKEN_RE.match(control))
        is_continuation = bool(not control and function)

        if is_control:
            cluster.append(row)
            in_cluster = True
            continue

        if is_continuation and in_cluster:
            cluster.append(row)
            continue

        if in_cluster:
            break

    return list(reversed(cluster))


def parse_column(rows: list[dict[str, str]]) -> dict[str, dict[str, object]]:
    programs: dict[str, dict[str, object]] = {}
    relevant_rows = [
        row for row in rows
        if row["id"] != "ID" and row["name"] != "Vintage EP Programs"
    ]
    id_indices = [index for index, row in enumerate(relevant_rows) if PROGRAM_ID_RE.match(row["id"])]

    for position, index in enumerate(id_indices):
        row = relevant_rows[index]
        program_id = row["id"]
        previous_index = id_indices[position - 1] if position > 0 else -1
        next_index = id_indices[position + 1] if position + 1 < len(id_indices) else len(relevant_rows)

        prelude_cluster = extract_last_control_cluster(relevant_rows, previous_index + 1, index)
        postlude_cluster = extract_first_control_cluster(relevant_rows, index + 1, next_index)
        inline_cluster = [{"id": "", "name": "", "control": row["control"], "function": row["function"]}] if row["control"] else []

        controls = (
            build_controls_from_cluster(prelude_cluster)
            + build_controls_from_cluster(inline_cluster)
            + build_controls_from_cluster(postlude_cluster)
        )

        programs[program_id] = {
            "name": row["name"],
            "controls": controls,
            "categoryId": "vintage_electric_pianos",
            "categoryLabel": "Vintage Electric Pianos",
            "sourceLabel": "Vintage Electric Pianos",
        }

    return programs


def import_programs() -> tuple[dict[str, dict[str, object]], dict[str, dict[str, object]]]:
    root = load_bbox_xml()
    pages = root.findall(f".//{NS}page")
    imported: dict[str, dict[str, object]] = {}

    last_page_index = len(pages) - 1
    for index, page in enumerate(pages):
        page_programs = {}
        bounds_to_use = (FULL_PAGE_BOUNDS,) if index == last_page_index else (LEFT_BOUNDS, RIGHT_BOUNDS)
        for bounds in bounds_to_use:
            page_programs.update(parse_column(row_cells(page, bounds)))
        imported.update(page_programs)

    last_program = imported.get("699")
    if last_program:
        controls = list(last_program.get("controls", []))
        first_mod_wheel_index = next(
            (index for index, control in enumerate(controls) if control.get("type") == "Modulation Wheel"),
            None,
        )
        if first_mod_wheel_index not in (None, 0):
            last_program["controls"] = controls[first_mod_wheel_index:]

    existing = json.loads(PROGRAMS_PATH.read_text())
    merged = dict(existing)
    merged.update(imported)
    return imported, merged


def main() -> None:
    imported, merged = import_programs()
    PROGRAMS_PATH.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n")
    print(f"Imported Vintage Electric Pianos programs: {len(imported)}")
    sample_ids = ["600", "601", "603", "609", "650", "699"]
    for sample_id in sample_ids:
        entry = imported.get(sample_id)
        if not entry:
            print(f"{sample_id}: MISSING")
            continue
        print(f"{sample_id}: {entry['name']} ({len(entry['controls'])} controls)")


if __name__ == "__main__":
    main()
