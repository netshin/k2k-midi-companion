#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT.parent / "supporting materials/K2600/Extracted/Setups/K2600 Setup Control - Best Of VAST.pdf"
SETUPS_PATH = ROOT / "Kurzweil/K2600/k2600_setups.json"

SPLIT_AT = 62
ENTRY_RE = re.compile(r"^\s*(\d{1,2})\s+(.+?)\s{2,}(.+?)\s*$")


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
    return text.strip()


def parse_half(text: str) -> dict[str, dict[str, object]]:
    setups: dict[str, dict[str, object]] = {}

    for raw_line in text.splitlines():
      line = normalize_text(raw_line)
      match = ENTRY_RE.match(line)
      if not match:
          continue

      setup_id, name, ribbon = (normalize_text(part) for part in match.groups())
      if name.lower() == "setup" or name.lower() == "name":
          continue

      setups[str(int(setup_id))] = {
          "name": name,
          "longRibbonFunction": ribbon,
          "controls": [
              {
                  "label": "Long Ribbon",
                  "description": ribbon,
              }
          ],
          "categoryId": "best_of_vast",
          "categoryLabel": "Best Of VAST",
          "sourceLabel": "Best Of VAST",
      }

    return setups


def main() -> None:
    text = subprocess.check_output(["pdftotext", "-layout", str(PDF_PATH), "-"], text=True)
    left = "\n".join(line[:SPLIT_AT] for line in text.splitlines())
    right = "\n".join(line[SPLIT_AT:] for line in text.splitlines())

    imported = {}
    imported.update(parse_half(left))
    imported.update(parse_half(right))

    existing = json.loads(SETUPS_PATH.read_text())
    existing.update(imported)
    SETUPS_PATH.write_text(json.dumps(existing, indent=2, ensure_ascii=False) + "\n")

    print(f"Imported Best Of VAST setups: {len(imported)}")
    for key in ["1", "31", "39", "67", "86", "98", "99"]:
        entry = imported.get(key)
        if entry:
            print(f"{key}: {entry['name']} | {entry['longRibbonFunction']}")
        else:
            print(f"{key}: MISSING")


if __name__ == "__main__":
    main()
