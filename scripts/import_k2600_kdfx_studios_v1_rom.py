#!/usr/bin/env python3

from __future__ import annotations

import csv
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOOKUP_PATH = ROOT / "Kurzweil" / "K2600" / "k2600_kdfx_lookup.json"
SOURCE_PATH = Path(
    "/Volumes/Logic Library/Users/shayrak/Sync/Documents/Code/K2600-Midi-Companion/"
    "supporting materials/K2600/Extracted/KDFX Studios/K2600 KDFX Studios - v1 ROM.csv"
)

BUS_COLUMNS = [
    ("Bus 1 FX Preset", "bus1"),
    ("Bus 2 FX Preset", "bus2"),
    ("Bus 3 FX Preset", "bus3"),
    ("Bus 4 FX Preset", "bus4"),
    ("Aux FX Preset", "aux"),
]


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def add_index(index: dict[str, int | list[int]], normalized_name: str, entry_id: int) -> None:
    existing = index.get(normalized_name)
    if existing is None:
        index[normalized_name] = [entry_id]
        return
    if isinstance(existing, list):
        if entry_id not in existing:
            existing.append(entry_id)
            existing.sort()
        return
    if existing != entry_id:
        index[normalized_name] = sorted([existing, entry_id])


def resolve_preset(name: str, dataset: dict) -> tuple[int | None, str, str]:
    normalized_name = normalize_name(name)
    preset_ids = dataset.get("presetIdsByNormalizedName", {}).get(normalized_name)
    if preset_ids is None:
        return None, "", "missing"
    if isinstance(preset_ids, list):
        matching_ids = []
        for candidate_id in preset_ids:
            preset = dataset.get("presetsById", {}).get(str(candidate_id), {})
            if preset.get("sourceLabel") == "KDFX v1":
                matching_ids.append(candidate_id)

        if len(matching_ids) == 1:
            preset_id = matching_ids[0]
        elif len(preset_ids) == 1:
            preset_id = preset_ids[0]
        else:
            return None, "", "duplicate"
    else:
        preset_id = preset_ids

    preset = dataset.get("presetsById", {}).get(str(preset_id))
    if not preset:
        return None, "", "missing"

    algorithm_name = preset.get("algorithmName") or ""
    return int(preset_id), algorithm_name, "resolved"


def build_studio_entry(row: dict[str, str], dataset: dict) -> dict[str, object]:
    buses: dict[str, dict[str, object]] = {}
    unresolved_count = 0

    for column_name, bus_key in BUS_COLUMNS:
        preset_name = (row.get(column_name) or "").strip()
        if not preset_name or preset_name == "#N/A":
            continue

        bus_entry: dict[str, object] = {"presetName": preset_name}
        preset_id, algorithm_name, status = resolve_preset(preset_name, dataset)

        if preset_id is not None:
            preset = dataset["presetsById"].get(str(preset_id), {})
            algorithm_id = preset.get("algorithmId")
            bus_entry["presetId"] = preset_id
            if algorithm_id is not None:
                bus_entry["algorithmId"] = algorithm_id
            if algorithm_name:
                bus_entry["algorithmName"] = algorithm_name
        else:
            bus_entry["sourceStatus"] = status
            unresolved_count += 1

        buses[bus_key] = bus_entry

    studio_id = int((row.get("ID") or "0").strip())
    name = (row.get("Name") or "").strip()
    entry: dict[str, object] = {
        "id": studio_id,
        "name": name,
        "normalizedName": normalize_name(name),
        "buses": buses,
        "v1": True,
        "v2": False,
        "sourceLabel": "KDFX v1",
    }

    if unresolved_count > 0:
        entry["sourceStatus"] = "partially-resolved"
        entry["unresolvedBusCount"] = unresolved_count
    else:
        entry["sourceStatus"] = "resolved"

    return entry


def main() -> None:
    dataset = json.loads(LOOKUP_PATH.read_text(encoding="utf-8"))
    studios_by_id = dataset.setdefault("studiosById", {})
    studio_index = dataset.setdefault("studioIdsByNormalizedName", {})

    parsed_rows = list(csv.DictReader(SOURCE_PATH.read_text(encoding="utf-8").splitlines()))
    partially_resolved = 0

    for row in parsed_rows:
        studio = build_studio_entry(row, dataset)
        studios_by_id[str(studio["id"])] = studio
        add_index(studio_index, str(studio["normalizedName"]), int(studio["id"]))
        if studio.get("sourceStatus") == "partially-resolved":
            partially_resolved += 1

    meta = dataset.setdefault("meta", {})
    studio_source_files = list(meta.get("studioSourceFiles", []))
    source_file = SOURCE_PATH.name
    if source_file not in studio_source_files:
        studio_source_files.append(source_file)
    meta["studioSourceFiles"] = studio_source_files
    meta["studioCount"] = len(studios_by_id)

    dataset["studiosById"] = dict(sorted(studios_by_id.items(), key=lambda item: int(item[0])))
    dataset["studioIdsByNormalizedName"] = dict(sorted(studio_index.items()))

    LOOKUP_PATH.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {LOOKUP_PATH}")
    print(f"Imported v1 ROM studios: {len(parsed_rows)}")
    print(f"Total studios: {meta['studioCount']}")
    print(f"Partially resolved studios: {partially_resolved}")


if __name__ == "__main__":
    main()
