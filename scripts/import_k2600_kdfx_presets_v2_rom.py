#!/usr/bin/env python3

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOOKUP_PATH = ROOT / "Kurzweil" / "K2600" / "k2600_kdfx_lookup.json"
SOURCE_PATH = Path(
    "/Volumes/Logic Library/Users/shayrak/Sync/Documents/Code/K2600-Midi-Companion/"
    "supporting materials/K2600/Extracted/KDFX Presets/K2600 KDFX Presets - v2 ROM.txt"
)


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def add_preset_index(preset_index: dict[str, int | list[int]], normalized_name: str, preset_id: int) -> None:
    existing = preset_index.get(normalized_name)
    if existing is None:
        preset_index[normalized_name] = [preset_id]
        return
    if isinstance(existing, list):
        if preset_id not in existing:
            existing.append(preset_id)
            existing.sort()
        return
    if existing != preset_id:
        preset_index[normalized_name] = sorted([existing, preset_id])


def parse_source_lines(text: str) -> list[dict[str, int | str]]:
    presets: list[dict[str, int | str]] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("----"):
            continue
        match = re.match(r"^(\d+)\s+(.+?)\s*$", line)
        if not match:
            raise ValueError(f"Could not parse preset line: {raw_line!r}")
        preset_id = int(match.group(1))
        name = match.group(2).strip()
        presets.append(
            {
                "id": preset_id,
                "name": name,
                "normalizedName": normalize_name(name),
                "algorithmId": None,
                "algorithmName": "",
                "sourceLabel": "KDFX v2",
            }
        )
    return presets


def main() -> None:
    dataset = json.loads(LOOKUP_PATH.read_text(encoding="utf-8"))
    presets_by_id = dataset.setdefault("presetsById", {})
    preset_index = dataset.setdefault("presetIdsByNormalizedName", {})

    parsed_presets = parse_source_lines(SOURCE_PATH.read_text(encoding="utf-8"))
    for preset in parsed_presets:
        preset_id = int(preset["id"])
        presets_by_id[str(preset_id)] = preset
        add_preset_index(preset_index, str(preset["normalizedName"]), preset_id)

    meta = dataset.setdefault("meta", {})
    preset_source_files = list(meta.get("presetSourceFiles", []))
    source_file = SOURCE_PATH.name
    if source_file not in preset_source_files:
        preset_source_files.append(source_file)
    meta["presetSourceFiles"] = preset_source_files
    meta["presetCount"] = len(presets_by_id)

    dataset["presetsById"] = dict(sorted(presets_by_id.items(), key=lambda item: int(item[0])))
    dataset["presetIdsByNormalizedName"] = dict(sorted(preset_index.items()))

    LOOKUP_PATH.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8")

    duplicate_names = {
        name: ids
        for name, ids in dataset["presetIdsByNormalizedName"].items()
        if isinstance(ids, list) and len(ids) > 1
    }
    print(f"Wrote {LOOKUP_PATH}")
    print(f"Imported v2 ROM presets: {len(parsed_presets)}")
    print(f"Total presets: {meta['presetCount']}")
    print(f"Duplicate normalized names: {len(duplicate_names)}")


if __name__ == "__main__":
    main()
