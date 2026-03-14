#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path


ENTRY_RE = re.compile(r"^(\d+)\t(.+)$")


def parse_fx_presets(text: str) -> dict:
    lines = [line.rstrip() for line in text.splitlines()]
    entries = []
    in_section = False

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        if line == "FX Presets":
            in_section = True
            continue

        if not in_section:
            continue

        if line.lower().startswith("parameter controls"):
            break

        match = ENTRY_RE.match(raw)
        if not match:
            continue

        entries.append({
            "id": int(match.group(1)),
            "name": match.group(2).strip(),
        })

    return {
        "source": {
            "input": "temp",
            "count": len(entries),
        },
        "presets": entries,
    }


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    input_path = root / "temp"
    output_path = root / "Kurzweil" / "Forte" / "forte_fx_presets.json"

    payload = parse_fx_presets(input_path.read_text(encoding="utf-8"))
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {payload['source']['count']} FX presets to {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
