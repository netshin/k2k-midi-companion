#!/usr/bin/env python3

from __future__ import annotations

import json
import re
from collections import OrderedDict
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "K2600 DSP Algs.pdf"
OUTPUT_PATH = ROOT / "Kurzweil" / "K2600" / "k2600_dsp_algorithms.json"

PANEL_MIN_WIDTH = 200
PANEL_MIN_HEIGHT = 60
BOX_MIN_WIDTH = 20
BOX_MIN_HEIGHT = 8
STAGE_X_TOLERANCE = 6
LINE_Y_TOLERANCE = 3


def normalize_label(text: str) -> str:
    label = re.sub(r"\s+", " ", text.replace("\n", " ")).strip()
    return label.replace("ALPASS", "ALLPASS")


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


def rect_center(rect: fitz.Rect) -> tuple[float, float]:
    return ((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2)


def point_in_rect(x: float, y: float, rect: fitz.Rect) -> bool:
    return rect.x0 <= x <= rect.x1 and rect.y0 <= y <= rect.y1


def words_in_rect(words: list[tuple], rect: fitz.Rect) -> list[tuple]:
    selected = []
    for word in words:
        x0, y0, x1, y1, text, *_ = word
        cx = (x0 + x1) / 2
        cy = (y0 + y1) / 2
        if point_in_rect(cx, cy, rect):
            selected.append(word)
    return selected


def join_words_as_lines(words: list[tuple]) -> str:
    if not words:
        return ""

    ordered = sorted(words, key=lambda item: (item[1], item[0]))
    lines: list[list[tuple]] = []

    for word in ordered:
        if not lines:
            lines.append([word])
            continue

        current_line = lines[-1]
        if abs(word[1] - current_line[-1][1]) <= LINE_Y_TOLERANCE:
            current_line.append(word)
        else:
            lines.append([word])

    rendered_lines = []

    for line_words in lines:
        line_words.sort(key=lambda item: item[0])
        rendered_lines.append(" ".join(word[4] for word in line_words))

    return normalize_label("\n".join(rendered_lines))


def extract_page_label(page: fitz.Page) -> str | None:
    for block in page.get_text("blocks"):
        x0, y0, x1, y1, text, *_ = block
        label = normalize_label(text)
        if y0 > page.rect.height - 110 and re.fullmatch(r"\d+-\d+", label):
            return label
    return None


def extract_algorithm_id(page: fitz.Page, panel_rect: fitz.Rect) -> int:
    clip = fitz.Rect(panel_rect.x0, panel_rect.y0, panel_rect.x1, min(panel_rect.y1, panel_rect.y0 + 72))
    text = normalize_label(page.get_text("text", clip=clip))
    match = re.search(r"Algorithm\|(\d+)", text)
    if not match:
        raise ValueError(f"Could not find algorithm id in panel {panel_rect}")
    return int(match.group(1))


def cluster_stage_rects(rects: list[fitz.Rect]) -> list[list[fitz.Rect]]:
    groups: list[list[fitz.Rect]] = []

    for rect in sorted(rects, key=lambda item: (item.x0, item.y0)):
        if not groups:
            groups.append([rect])
            continue

        last_group = groups[-1]
        if abs(rect.x0 - last_group[-1].x0) <= STAGE_X_TOLERANCE:
            last_group.append(rect)
        else:
            groups.append([rect])

    return [sorted(group, key=lambda item: item.y0) for group in groups]


def get_panel_rects(page: fitz.Page) -> list[fitz.Rect]:
    panels = []

    for drawing in page.get_drawings():
        if drawing["type"] != "f":
            continue

        rect = drawing["rect"]
        if rect.width < PANEL_MIN_WIDTH or rect.height < PANEL_MIN_HEIGHT:
            continue

        panels.append(rect)

    return sorted(panels, key=lambda item: (item.y0, item.x0))


def get_box_rects(page: fitz.Page, panel_rect: fitz.Rect) -> list[fitz.Rect]:
    rects = []

    for drawing in page.get_drawings():
        if drawing["type"] != "s":
            continue

        for item in drawing["items"]:
            if item[0] != "re":
                continue

            rect = item[1]
            if rect.width < BOX_MIN_WIDTH or rect.height < BOX_MIN_HEIGHT:
                continue

            cx, cy = rect_center(rect)
            if point_in_rect(cx, cy, panel_rect):
                rects.append(rect)

    rects.sort(key=lambda item: (item.x0, item.y0))
    deduped: list[fitz.Rect] = []

    for rect in rects:
        if deduped and rect == deduped[-1]:
            continue
        deduped.append(rect)

    return deduped


def ensure_unique_slug(base_slug: str, used_slugs: set[str]) -> str:
    if base_slug not in used_slugs:
        used_slugs.add(base_slug)
        return base_slug

    counter = 2
    while f"{base_slug}_{counter}" in used_slugs:
        counter += 1
    slug = f"{base_slug}_{counter}"
    used_slugs.add(slug)
    return slug


def build_dataset() -> dict:
    pdf = fitz.open(PDF_PATH)
    blocks_by_id: OrderedDict[str, dict] = OrderedDict()
    option_sets_by_key: OrderedDict[tuple[str, ...], str] = OrderedDict()
    algorithms_by_id: OrderedDict[str, dict] = OrderedDict()
    used_option_ids: set[str] = set()

    for page_index in range(pdf.page_count):
        page = pdf[page_index]
        page_label = extract_page_label(page) or f"page-{page_index + 1}"
        words = page.get_text("words")

        for panel_rect in get_panel_rects(page):
            algorithm_id = extract_algorithm_id(page, panel_rect)
            box_rects = get_box_rects(page, panel_rect)
            stage_groups = cluster_stage_rects(box_rects)
            stages = []

            for stage_index, stage_rects in enumerate(stage_groups, 1):
                block_ids = []

                for box_rect in stage_rects:
                    label = join_words_as_lines(words_in_rect(words, box_rect))
                    if not label:
                        continue

                    block_id = slugify_label(label)
                    if block_id not in blocks_by_id:
                        blocks_by_id[block_id] = {
                            "label": label,
                        }
                    block_ids.append(block_id)

                if not block_ids:
                    continue

                option_key = tuple(block_ids)
                option_set_id = option_sets_by_key.get(option_key)

                if option_set_id is None:
                    base_slug = "then".join(block_ids[:2]) if len(block_ids) > 1 else block_ids[0]
                    option_set_id = ensure_unique_slug(base_slug, used_option_ids)
                    option_sets_by_key[option_key] = option_set_id

                stages.append({
                    "stageId": f"stage_{stage_index}",
                    "x": round(stage_rects[0].x0, 1),
                    "kind": "fixed" if len(block_ids) == 1 else "choice",
                    "optionSetId": option_set_id,
                })

            algorithms_by_id[str(algorithm_id)] = {
                "algorithmId": algorithm_id,
                "sourcePage": page_label,
                "panelRect": {
                    "x0": round(panel_rect.x0, 1),
                    "y0": round(panel_rect.y0, 1),
                    "x1": round(panel_rect.x1, 1),
                    "y1": round(panel_rect.y1, 1),
                },
                "stages": stages,
            }

    option_sets_by_id = OrderedDict(
        (
            option_set_id,
            {
                "blockIds": list(option_key),
            },
        )
        for option_key, option_set_id in option_sets_by_key.items()
    )

    return {
        "source": {
            "pdf": PDF_PATH.name,
            "pageCount": pdf.page_count,
            "algorithmCount": len(algorithms_by_id),
        },
        "blocksById": blocks_by_id,
        "optionSetsById": option_sets_by_id,
        "algorithmsById": algorithms_by_id,
    }


def main() -> None:
    dataset = build_dataset()
    OUTPUT_PATH.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)}")
    print(f"Algorithms: {dataset['source']['algorithmCount']}")
    print(f"Blocks: {len(dataset['blocksById'])}")
    print(f"Option sets: {len(dataset['optionSetsById'])}")


if __name__ == "__main__":
    main()
