#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF_PATH = ROOT / "supporting materials" / "K2600" / "Extracted" / "DSP Algorithms" / "K2600 DSP Algorithms - Base ROM v2.pdf"
DEFAULT_DATA_PATH = ROOT / "Kurzweil" / "K2600" / "k2600_dsp_algorithms.json"

ROW_TOLERANCE = 3
PHRASE_GAP = 12
COLUMN_TOLERANCE = 18
BOTTOM_MARGIN = 60

LABEL_REPLACEMENTS = {
    "ALPASS": "ALLPASS",
    "LFSIN": "LF SIN",
    "SYNCM": "SYNC M",
    "SYNCS": "SYNC S",
    "xGAIN": "x GAIN",
    "+GAIN": "+ GAIN",
    "!GAIN": "! GAIN",
}


def normalize_label(text: str) -> str:
    compact = re.sub(r"\s+", " ", text.replace("\n", " ")).strip()
    return LABEL_REPLACEMENTS.get(compact, compact)


def slugify_label(label: str) -> str:
    slug = label.lower()
    replacements = {
        "+": " plus ",
        "!": " bang ",
        "&": " and ",
        "/": " ",
    }
    for old, new in replacements.items():
        slug = slug.replace(old, new)
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    slug = re.sub(r"_+", "_", slug).strip("_")
    return slug or "unnamed"


def extract_page_label(page: fitz.Page) -> str | None:
    for block in page.get_text("blocks"):
        x0, y0, x1, y1, text, *_ = block
        label = normalize_label(text)
        if y0 > page.rect.height - 110 and re.fullmatch(r"\d+-\d+", label):
            return label
    return None


def group_rows(words: list[tuple]) -> list[list[tuple]]:
    rows: list[list[tuple]] = []

    for word in sorted(words, key=lambda item: (item[1], item[0])):
        if not rows or abs(word[1] - rows[-1][-1][1]) > ROW_TOLERANCE:
            rows.append([word])
        else:
            rows[-1].append(word)

    return rows


def group_phrases(row_words: list[tuple]) -> list[tuple[float, str]]:
    ordered = sorted(row_words, key=lambda item: item[0])
    groups: list[list[tuple]] = []

    for word in ordered:
        if not groups:
            groups.append([word])
            continue

        last_group = groups[-1]
        if word[0] - last_group[-1][2] <= PHRASE_GAP:
            last_group.append(word)
        else:
            groups.append([word])

    phrases = []
    for group in groups:
        x0 = group[0][0]
        label = normalize_label(" ".join(word[4] for word in group))
        if label:
            phrases.append((x0, label))

    return phrases


def cluster_columns(x_positions: list[float]) -> list[float]:
    clusters: list[dict] = []

    for x in sorted(x_positions):
        for cluster in clusters:
            if abs(x - cluster["center"]) <= COLUMN_TOLERANCE:
                cluster["values"].append(x)
                cluster["center"] = sum(cluster["values"]) / len(cluster["values"])
                break
        else:
            clusters.append({"center": x, "values": [x]})

    return [cluster["center"] for cluster in clusters]


def infer_layer_role(algorithm_id: int) -> str:
    if 33 <= algorithm_id <= 62:
        return "layer_1"
    if 63 <= algorithm_id <= 100:
        return "layer_2"
    if 101 <= algorithm_id <= 126:
        return "layer_3"
    raise ValueError(f"Unexpected triple-layer algorithm id: {algorithm_id}")


def ensure_block_id(label: str, blocks_by_id: dict, labels_to_ids: dict[str, str]) -> str:
    normalized = normalize_label(label)

    if normalized in labels_to_ids:
        return labels_to_ids[normalized]

    block_id = slugify_label(normalized)
    blocks_by_id.setdefault(block_id, {"label": normalized})
    labels_to_ids[normalized] = block_id
    return block_id


def ensure_option_set_id(block_ids: list[str], option_sets_by_id: dict, option_set_keys: dict[tuple[str, ...], str], used_option_ids: set[str]) -> str:
    option_key = tuple(block_ids)
    existing = option_set_keys.get(option_key)

    if existing:
        return existing

    base_slug = "then".join(block_ids[:2]) if len(block_ids) > 1 else block_ids[0]
    option_set_id = base_slug

    if option_set_id in used_option_ids:
        counter = 2
        while f"{base_slug}_{counter}" in used_option_ids:
            counter += 1
        option_set_id = f"{base_slug}_{counter}"

    used_option_ids.add(option_set_id)
    option_set_keys[option_key] = option_set_id
    option_sets_by_id[option_set_id] = {"blockIds": block_ids}
    return option_set_id


def extract_algorithm_panels(page: fitz.Page) -> list[dict]:
    panels = []

    for block in page.get_text("blocks"):
        x0, y0, x1, y1, text, *_ = block
        if not text.startswith("Algorithm:"):
            continue

        match = re.search(r"Algorithm:(\d+)", text)
        if not match:
            continue

        panels.append(
            {
                "algorithmId": int(match.group(1)),
                "panelRect": {"x0": x0, "y0": y0, "x1": x1, "y1": y1},
            }
        )

    return panels


def parse_triple_algorithms(pdf_path: Path, dataset: dict) -> dict[int, dict]:
    pdf = fitz.open(pdf_path)
    blocks_by_id = dataset["blocksById"]
    option_sets_by_id = dataset["optionSetsById"]
    labels_to_ids = {value["label"]: key for key, value in blocks_by_id.items()}
    option_set_keys = {
        tuple(value["blockIds"]): key for key, value in option_sets_by_id.items()
    }
    used_option_ids = set(option_sets_by_id.keys())
    algorithms: dict[int, dict] = {}

    for page in pdf:
        page_label = extract_page_label(page) or f"page-{page.number + 1}"
        page_words = page.get_text("words")
        page_midpoint = page.rect.width / 2

        panels = extract_algorithm_panels(page)
        left_panels = sorted(
            [panel for panel in panels if panel["panelRect"]["x0"] < page_midpoint],
            key=lambda panel: panel["panelRect"]["y0"],
        )
        right_panels = sorted(
            [panel for panel in panels if panel["panelRect"]["x0"] >= page_midpoint],
            key=lambda panel: panel["panelRect"]["y0"],
        )

        for column_panels in (left_panels, right_panels):
            for index, panel in enumerate(column_panels):
                algorithm_id = panel["algorithmId"]
                rect = panel["panelRect"]
                next_y = (
                    column_panels[index + 1]["panelRect"]["y0"]
                    if index + 1 < len(column_panels)
                    else page.rect.height - BOTTOM_MARGIN
                )
                max_y = min(next_y - 2, page.rect.height - BOTTOM_MARGIN)
                region_words = [
                    word
                    for word in page_words
                    if rect["x0"] - 2 <= word[0] <= rect["x1"] + 2
                    and rect["y1"] + 2 <= word[1] < max_y
                ]

                if not region_words:
                    continue

                rows = group_rows(region_words)
                row_phrases = [group_phrases(row) for row in rows]
                column_anchors = cluster_columns(
                    [x0 for phrases in row_phrases for x0, _ in phrases]
                )
                columns = [[] for _ in column_anchors]

                for phrases in row_phrases:
                    for x0, label in phrases:
                        anchor_index = min(
                            range(len(column_anchors)),
                            key=lambda i: abs(column_anchors[i] - x0),
                        )
                        if abs(column_anchors[anchor_index] - x0) <= COLUMN_TOLERANCE:
                            columns[anchor_index].append(label)

                stages = []
                for anchor, labels in zip(column_anchors, columns):
                    if not labels:
                        continue

                    block_ids = [
                        ensure_block_id(label, blocks_by_id, labels_to_ids)
                        for label in labels
                    ]
                    option_set_id = ensure_option_set_id(
                        block_ids,
                        option_sets_by_id,
                        option_set_keys,
                        used_option_ids,
                    )
                    stages.append(
                        {
                            "stageId": f"stage_{len(stages) + 1}",
                            "x": round(anchor, 1),
                            "kind": "fixed" if len(block_ids) == 1 else "choice",
                            "optionSetId": option_set_id,
                        }
                    )

                algorithms[algorithm_id] = {
                    "algorithmId": algorithm_id,
                    "sourcePage": page_label,
                    "panelRect": {
                        "x0": round(rect["x0"], 1),
                        "y0": round(rect["y0"], 1),
                        "x1": round(rect["x1"], 1),
                        "y1": round(rect["y1"], 1),
                    },
                    "algorithmType": "triple",
                    "layerRole": infer_layer_role(algorithm_id),
                    "stages": stages,
                }

    return algorithms


def annotate_standard_algorithms(dataset: dict) -> None:
    for algorithm in dataset.get("algorithmsById", {}).values():
        algorithm.setdefault("algorithmType", "standard")
        algorithm.setdefault("layerRole", "standard")


def main() -> None:
    pdf_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_PDF_PATH
    data_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else DEFAULT_DATA_PATH

    dataset = json.loads(data_path.read_text(encoding="utf-8"))
    annotate_standard_algorithms(dataset)

    triple_algorithms = parse_triple_algorithms(pdf_path, dataset)

    if len(triple_algorithms) != 94:
        raise RuntimeError(f"Expected 94 triple algorithms, found {len(triple_algorithms)}")

    missing = [algorithm_id for algorithm_id in range(33, 127) if algorithm_id not in triple_algorithms]
    if missing:
        raise RuntimeError(f"Missing triple algorithms: {missing}")

    for algorithm_id, algorithm in sorted(triple_algorithms.items()):
        dataset["algorithmsById"][str(algorithm_id)] = algorithm

    dataset["source"] = {
        "description": "Merged K2600 DSP algorithm dataset",
        "files": [
            "K2600 DSP Algorithms - Base ROM v1.pdf",
            pdf_path.name,
        ],
        "algorithmCount": len(dataset["algorithmsById"]),
        "blockCount": len(dataset["blocksById"]),
        "optionSetCount": len(dataset["optionSetsById"]),
    }

    data_path.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {data_path}")
    print(f"Algorithms: {len(dataset['algorithmsById'])}")
    print(f"Blocks: {len(dataset['blocksById'])}")
    print(f"Option sets: {len(dataset['optionSetsById'])}")


if __name__ == "__main__":
    main()
