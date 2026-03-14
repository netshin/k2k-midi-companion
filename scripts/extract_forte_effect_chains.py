#!/usr/bin/env python3

import json
import re
import subprocess
import sys
from pathlib import Path


def extract_text(pdf_path: Path) -> str:
    return subprocess.check_output(
        ["pdftotext", str(pdf_path), "-"],
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def parse_effect_chains(text: str) -> dict:
    lines = [line.strip().replace("\x0c", "") for line in text.splitlines()]
    entries = []
    ids = []
    names = []
    mode = None

    def flush_block() -> None:
        nonlocal ids, names
        if not ids and not names:
            return
        if ids and not names:
            return
        if len(ids) != len(names):
            raise ValueError(f"Effects chain block mismatch: {len(ids)} ids vs {len(names)} names")
        entries.extend(zip(ids, names))
        ids = []
        names = []

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        if line in {"Effects Chains", "Appendix F"}:
            continue

        if line.startswith("Object Version"):
            continue

        if re.fullmatch(r"F-\d+", line):
            mode = None
            continue

        if line == "ID":
            if mode == "names":
                flush_block()
            mode = "ids"
            continue

        if line == "Chain":
            mode = "names"
            continue

        if mode == "ids" and re.fullmatch(r"\d+", line):
            ids.append(int(line))
            continue

        if mode == "names":
            if re.fullmatch(r"\d+", line):
                flush_block()
                ids.append(int(line))
                mode = "ids"
                continue

            names.append(line)

    flush_block()

    studios_by_id = {
        str(effect_id): {
            "id": effect_id,
            "name": name,
            "buses": {},
        }
        for effect_id, name in entries
    }

    return {
        "source": {
            "pdf": "Forte-Musicians_Guide_revH-FX_only.pdf",
            "count": len(entries),
        },
        "studiosById": studios_by_id,
        "presetsById": {},
        "algorithmsById": {},
    }


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    pdf_path = root / "Forte-Musicians_Guide_revH-FX_only.pdf"
    output_path = root / "Kurzweil" / "Forte" / "forte_effect_chains.json"

    text = extract_text(pdf_path)
    payload = parse_effect_chains(text)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print(f"Extracted {payload['source']['count']} effect chains to {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
