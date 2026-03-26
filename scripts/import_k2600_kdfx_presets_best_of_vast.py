#!/usr/bin/env python3

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOOKUP_PATH = ROOT / "Kurzweil" / "K2600" / "k2600_kdfx_lookup.json"


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


PRESETS = [
    {
        "id": 881,
        "name": "Chorus PanDelay",
        "algorithmId": 700,
        "algorithmName": "Chorus+Delay",
    },
    {
        "id": 882,
        "name": "Flange + Delay",
        "algorithmId": 706,
        "algorithmName": "Flange+Delay",
    },
    {
        "id": 883,
        "name": "TubeAmp DlyChor",
        "algorithmId": 729,
        "algorithmName": "TubeAmp<>MD>Chor",
    },
    {
        "id": 884,
        "name": "StChor+3vs2Delay",
        "algorithmId": None,
        "algorithmName": "",
        "sourceStatus": "unresolved",
    },
    {
        "id": 885,
        "name": "TubeAmp DlyChor2",
        "algorithmId": 729,
        "algorithmName": "TubeAmp<>MD>Chor",
    },
    {
        "id": 886,
        "name": "Drum Crusher",
        "algorithmId": None,
        "algorithmName": "",
        "sourceStatus": "unresolved",
    },
    {
        "id": 887,
        "name": "Bass Env Filt 2",
        "algorithmId": None,
        "algorithmName": "",
        "sourceStatus": "unresolved",
    },
]


def main() -> None:
    dataset = json.loads(LOOKUP_PATH.read_text(encoding="utf-8"))
    presets = dataset.setdefault("presetsById", {})
    preset_index = dataset.setdefault("presetIdsByNormalizedName", {})

    for preset in PRESETS:
        normalized_name = normalize_name(preset["name"])
        entry = {
            "id": preset["id"],
            "name": preset["name"],
            "normalizedName": normalized_name,
            "algorithmId": preset["algorithmId"],
            "algorithmName": preset["algorithmName"],
            "sourceLabel": "Best Of VAST",
        }
        if preset.get("sourceStatus"):
            entry["sourceStatus"] = preset["sourceStatus"]

        presets[str(preset["id"])] = entry
        add_preset_index(preset_index, normalized_name, preset["id"])

    meta = dataset.setdefault("meta", {})
    preset_source_files = list(meta.get("presetSourceFiles", []))
    source_file = "K2600 KDFX Presets - Best of VAST.txt"
    if source_file not in preset_source_files:
        preset_source_files.append(source_file)
    meta["presetSourceFiles"] = preset_source_files
    meta["presetCount"] = len(presets)

    dataset["presetsById"] = dict(sorted(presets.items(), key=lambda item: int(item[0])))
    dataset["presetIdsByNormalizedName"] = dict(sorted(preset_index.items()))

    LOOKUP_PATH.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {LOOKUP_PATH}")
    print(f"Presets: {meta['presetCount']}")


if __name__ == "__main__":
    main()
