#!/usr/bin/env python3
"""Compile KDFX source JSON files into a single optimized lookup file."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, List


BUS_FIELDS = [
    ("bus1", "Bus 1 FX Preset"),
    ("bus2", "Bus 2 FX Preset"),
    ("bus3", "Bus 3 FX Preset"),
    ("aux", "Aux FX Preset"),
]


def normalize_name(value: str) -> str:
    return " ".join(value.strip().lower().split())


def slug_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def parse_id(raw: Any) -> int:
    if isinstance(raw, int):
        return raw
    if isinstance(raw, float):
        return int(raw)
    return int(str(raw).strip())


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def build_lookup(base_dir: Path) -> Dict[str, Any]:
    algorithms_path = base_dir / "k2600_kdfx_algorithems.json"
    presets_path = base_dir / "k2600_kdfx presets.json"
    studios_path = base_dir / "k2600_kdfx_studios.json"

    algorithms = load_json(algorithms_path)
    presets = load_json(presets_path)
    studios = load_json(studios_path)

    algorithms_by_id: Dict[str, Dict[str, Any]] = {}
    algorithm_ids_by_normalized_name: Dict[str, List[int]] = {}

    for row in algorithms:
        alg_id = parse_id(row["ID"])
        name = str(row.get("Name", "")).strip()
        normalized = normalize_name(name)

        algorithms_by_id[str(alg_id)] = {
            "id": alg_id,
            "name": name,
            "normalizedName": normalized,
        }
        algorithm_ids_by_normalized_name.setdefault(normalized, []).append(alg_id)

    presets_by_id: Dict[str, Dict[str, Any]] = {}
    preset_ids_by_normalized_name: Dict[str, List[int]] = {}
    preset_ids_by_slug: Dict[str, List[int]] = {}

    for row in presets:
        preset_id = parse_id(row["ID"])
        name = str(row.get("Preset Name", "")).strip()
        normalized = normalize_name(name)
        slug = slug_name(name)
        algorithm_id = parse_id(row["KDFX Alg"])
        algorithm = algorithms_by_id.get(str(algorithm_id))

        extra_columns = {}
        for key, value in row.items():
            if key.startswith("Column ") and str(value).strip():
                extra_columns[key] = str(value).strip()

        presets_by_id[str(preset_id)] = {
            "id": preset_id,
            "name": name,
            "normalizedName": normalized,
            "algorithmId": algorithm_id,
            "algorithmName": algorithm["name"] if algorithm else None,
            "extraColumns": extra_columns,
        }
        preset_ids_by_normalized_name.setdefault(normalized, []).append(preset_id)
        preset_ids_by_slug.setdefault(slug, []).append(preset_id)

    unresolved: List[Dict[str, Any]] = []
    studios_by_id: Dict[str, Dict[str, Any]] = {}

    for row in studios:
        studio_id = parse_id(row["ID"])
        studio_name = str(row.get("Name", "")).strip()

        bus_entries: Dict[str, Dict[str, Any]] = {}

        for bus_key, column_name in BUS_FIELDS:
            preset_name = str(row.get(column_name, "")).strip()
            if not preset_name:
                continue

            normalized = normalize_name(preset_name)
            slug = slug_name(preset_name)

            matched_ids = preset_ids_by_normalized_name.get(normalized, [])
            if not matched_ids:
                matched_ids = preset_ids_by_slug.get(slug, [])

            preset_id = matched_ids[0] if len(matched_ids) == 1 else None

            if preset_id is None:
                unresolved.append(
                    {
                        "studioId": studio_id,
                        "studioName": studio_name,
                        "bus": bus_key,
                        "presetName": preset_name,
                        "reason": (
                            "ambiguous-match"
                            if len(matched_ids) > 1
                            else "not-found"
                        ),
                        "matchedPresetIds": matched_ids,
                    }
                )

            bus_entries[bus_key] = {
                "presetName": preset_name,
                "presetId": preset_id,
                "algorithmId": (
                    presets_by_id[str(preset_id)]["algorithmId"]
                    if preset_id is not None
                    else None
                ),
            }

        studios_by_id[str(studio_id)] = {
            "id": studio_id,
            "name": studio_name,
            "normalizedName": normalize_name(studio_name),
            "buses": bus_entries,
        }

    return {
        "meta": {
            "sourceFiles": {
                "algorithms": algorithms_path.name,
                "presets": presets_path.name,
                "studios": studios_path.name,
            },
            "counts": {
                "algorithms": len(algorithms_by_id),
                "presets": len(presets_by_id),
                "studios": len(studios_by_id),
                "unresolvedStudioPresetRefs": len(unresolved),
            },
        },
        "algorithmsById": algorithms_by_id,
        "algorithmIdsByNormalizedName": algorithm_ids_by_normalized_name,
        "presetsById": presets_by_id,
        "presetIdsByNormalizedName": preset_ids_by_normalized_name,
        "studiosById": studios_by_id,
        "unresolvedStudioPresetRefs": unresolved,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-dir",
        default="Kurzweil/K2600",
        help="Directory containing KDFX source JSON files.",
    )
    parser.add_argument(
        "--output",
        default="Kurzweil/K2600/k2600_kdfx_lookup.json",
        help="Output file for compiled lookup JSON.",
    )
    args = parser.parse_args()

    base_dir = Path(args.base_dir)
    output_path = Path(args.output)

    data = build_lookup(base_dir)
    output_path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    counts = data["meta"]["counts"]
    print(
        "Built lookup:",
        f"algorithms={counts['algorithms']}",
        f"presets={counts['presets']}",
        f"studios={counts['studios']}",
        f"unresolved={counts['unresolvedStudioPresetRefs']}",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
