#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path


ENTRY_RE = re.compile(r"^(\d+)\t(.+)$")


def parse_keymaps(text: str) -> dict:
    lines = [line.rstrip() for line in text.splitlines()]
    keymaps = []
    in_section = False

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        if line == "--keympas":
            in_section = True
            continue

        if not in_section:
            continue

        match = ENTRY_RE.match(raw)
        if not match:
            break

        keymaps.append({
            "number": int(match.group(1)),
            "name": match.group(2).strip(),
            "categoryId": "base_rom",
            "categoryLabel": "Base ROM",
        })

    return {
        "source": {
            "sourceFile": "temp",
            "categories": [
                {
                    "id": "base_rom",
                    "label": "Base ROM",
                }
            ],
            "count": len(keymaps),
        },
        "keymaps": keymaps,
    }


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    input_path = root / "temp"
    output_path = root / "Kurzweil" / "Forte" / "forte_keymaps.json"

    payload = parse_keymaps(input_path.read_text(encoding="utf-8"))
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {payload['source']['count']} keymaps to {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
