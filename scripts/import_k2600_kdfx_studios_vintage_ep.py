#!/usr/bin/env python3

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOOKUP_PATH = ROOT / "Kurzweil" / "K2600" / "k2600_kdfx_lookup.json"
SOURCE_PATH = Path(
    "/Volumes/Logic Library/Users/shayrak/Sync/Documents/Code/K2600-Midi-Companion/"
    "supporting materials/K2600/Extracted/KDFX Studios/K2600 KDFX Studios - Vintage Electric Pianos ROM.txt"
)


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


def parse_source_lines(text: str) -> list[dict[str, object]]:
    studios: list[dict[str, object]] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("----"):
            continue
        match = re.match(r"^(\d+)\s+(.+?)\s*$", line)
        if not match:
            raise ValueError(f"Could not parse studio line: {raw_line!r}")
        studio_id = int(match.group(1))
        name = match.group(2).strip()
        studios.append(
            {
                "id": studio_id,
                "name": name,
                "normalizedName": normalize_name(name),
                "buses": {},
                "sourceLabel": "Vintage Electric Pianos",
                "sourceStatus": "name-only",
            }
        )
    return studios


def main() -> None:
    dataset = json.loads(LOOKUP_PATH.read_text(encoding="utf-8"))
    studios_by_id = dataset.setdefault("studiosById", {})
    studio_index = dataset.setdefault("studioIdsByNormalizedName", {})

    parsed_studios = parse_source_lines(SOURCE_PATH.read_text(encoding="utf-8"))
    for studio in parsed_studios:
        studio_id = int(studio["id"])
        studios_by_id[str(studio_id)] = studio
        add_index(studio_index, str(studio["normalizedName"]), studio_id)

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
    print(f"Imported Vintage Electric Pianos studios: {len(parsed_studios)}")
    print(f"Total studios: {meta['studioCount']}")


if __name__ == "__main__":
    main()
