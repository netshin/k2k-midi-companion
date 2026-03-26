#!/usr/bin/env python3

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_LOOKUP_PATH = ROOT / "Kurzweil" / "K2600_1st_attempt" / "k2600_kdfx_lookup.json"
OUTPUT_LOOKUP_PATH = ROOT / "Kurzweil" / "K2600" / "k2600_kdfx_lookup.json"


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


SECTION_SPECS = [
    {
        "ids": [1, 2],
        "description": "Versatile, small stereo and dual mono reverbs",
        "allocationLabel": "1 for MiniVerb, 2 for Dual MiniVerb",
        "pauById": {1: 1, 2: 2},
    },
    {
        "ids": [3],
        "description": "A reverb and gate in series",
        "allocationLabel": "2",
        "pauById": {3: 2},
    },
    {
        "ids": [4, 5, 6, 7, 8, 9, 10, 11],
        "description": "More Complex Reverb algorithms",
        "allocationLabel": "\"Classic\" 2; others 3",
        "pauById": {
            4: 2,
            5: 2,
            6: 3,
            7: 3,
            8: 3,
            9: 3,
            10: 3,
            11: 3,
        },
    },
    {
        "ids": [12],
        "description": "Room reverberation algorithm",
        "allocationLabel": "3",
        "pauById": {12: 3},
    },
    {
        "ids": [13],
        "description": "A stereo hall reverberation algorithm",
        "allocationLabel": "3",
        "pauById": {13: 3},
    },
    {
        "ids": [14],
        "description": "A plate reverberation algorithm",
        "allocationLabel": "3",
        "pauById": {14: 3},
    },
    {
        "ids": [15],
        "description": "\"Enveloped\" reverberation algorithm",
        "allocationLabel": "3",
        "pauById": {15: 3},
    },
    {
        "ids": [130],
        "description": "Multitap delay line effect, consisting of 6 independent output taps and 4 independent feedback taps",
        "allocationLabel": "1",
        "pauById": {130: 1},
    },
    {
        "ids": [131, 132],
        "description": "A stereo four-tap delay with feedback",
        "allocationLabel": "1",
        "pauById": {131: 1, 132: 1},
    },
    {
        "ids": [133, 134],
        "description": "A stereo eight-tap delay with cross-coupled feedback",
        "allocationLabel": "2",
        "pauById": {133: 2, 134: 2},
    },
    {
        "ids": [135, 136],
        "description": "Tempo based 4- and 6-tap delays with added shapers and resonant comb filters on each tap",
        "allocationLabel": "2 for Spectral 4-Tap; 3 for Spectral 6-Tap",
        "pauById": {135: 2, 136: 3},
    },
    {
        "ids": [150, 151, 152, 153],
        "description": "One- and three-tap stereo and dual-mono choruses",
        "allocationLabel": "1 for Chorus 1 and Dual Chorus 1; 2 for Chorus 2 and Dual Chorus 2",
        "pauById": {150: 1, 151: 2, 152: 1, 153: 2},
    },
    {
        "ids": [154, 155],
        "description": "Multi-tap flangers",
        "allocationLabel": "1 for Flanger 1; 2 for Flanger 2",
        "pauById": {154: 1, 155: 2},
    },
    {
        "ids": [156, 157, 158, 159, 160],
        "description": "A variety of single notch/bandpass Phasers",
        "allocationLabel": "1 (each)",
        "pauById": {156: 1, 157: 1, 158: 1, 159: 1, 160: 1},
    },
    {
        "ids": [700, 701, 703, 706, 707, 709, 722, 723],
        "description": "A family of combination effect algorithms",
        "allocationLabel": "1 or 2",
        "pauById": {
            700: 1,
            701: 1,
            703: 2,
            706: 1,
            707: 1,
            709: 2,
            722: 2,
            723: 2,
        },
    },
    {
        "ids": [702, 704, 705, 708, 710, 711, 712, 713, 717, 718],
        "description": "A family of re-configurable combination effect algorithms",
        "allocationLabel": "2",
        "pauById": {
            702: 2,
            704: 2,
            705: 2,
            708: 2,
            710: 2,
            711: 2,
            712: 2,
            713: 2,
            717: 2,
            718: 2,
        },
    },
    {
        "ids": [714],
        "description": "Digital quantization followed by flanger.",
        "allocationLabel": "1",
        "pauById": {714: 1},
    },
    {
        "ids": [715, 716],
        "description": "Generic dual-mono moving delay lines",
        "allocationLabel": "Dual MovDelay 1; Quad MovDelay 2",
        "pauById": {715: 1, 716: 2},
    },
    {
        "ids": [720, 721],
        "description": "Mono pitcher (filter with harmonically related resonant peaks) algorithm with a chorus or flanger",
        "allocationLabel": "2 (each)",
        "pauById": {720: 2, 721: 2},
    },
    {
        "ids": [724, 725, 726, 728],
        "description": "Small distortion algorithms",
        "allocationLabel": "1 for Mono Distortion; 2 for MonoDistort + Cab; 2 for MonoDistort + EQ; 3 for StereoDistort + EQ",
        "pauById": {724: 1, 725: 2, 726: 2, 728: 3},
    },
    {
        "ids": [727],
        "description": "Eight-stage distortion followed by equalization",
        "allocationLabel": "2",
        "pauById": {727: 2},
    },
    {
        "ids": [729, 730, 731, 732],
        "description": "Mono distortion circuits in combination with moving delays, and a stereo chorus or stereo flange",
        "allocationLabel": "3 each",
        "pauById": {729: 3, 730: 3, 731: 3, 732: 3},
    },
    {
        "ids": [733, 737],
        "description": "Vibrato/chorus, through optional distortion, into rotating speaker",
        "allocationLabel": "2 for VibChor+Rotor 2; 4 for VibChor+Rotor 4",
        "pauById": {733: 2, 737: 4},
    },
    {
        "ids": [734],
        "description": "Small distortion followed by rotary speaker effect",
        "allocationLabel": "2",
        "pauById": {734: 2},
    },
    {
        "ids": [735, 736],
        "description": "Vibrato/chorus into distortion into rotating speaker into cabinet",
        "allocationLabel": "7 for full working effect (4 for KB3 FXBus, 3 for KB3 AuxFX)",
        "pauById": {735: 4, 736: 3},
    },
    {
        "ids": [900],
        "description": "Envelope-following stereo 2-pole resonant filter",
        "allocationLabel": "2",
        "pauById": {900: 2},
    },
    {
        "ids": [901],
        "description": "Triggered envelope-following stereo 2-pole resonant filter",
        "allocationLabel": "2",
        "pauById": {901: 2},
    },
    {
        "ids": [902],
        "description": "LFO-following stereo 2-pole resonant filter",
        "allocationLabel": "2",
        "pauById": {902: 2},
    },
    {
        "ids": [903, 904],
        "description": "Stereo and dual-mono 2-pole resonant filters",
        "allocationLabel": "1 (each)",
        "pauById": {903: 1, 904: 1},
    },
    {
        "ids": [905, 906],
        "description": "Parallel resonant bandpass filters with parameter morphing",
        "allocationLabel": "4 for EQ Morpher, 2 for Mono EQ Morpher",
        "pauById": {905: 4, 906: 2},
    },
    {
        "ids": [907],
        "description": "A configurable ring modulator",
        "allocationLabel": "1",
        "pauById": {907: 1},
    },
    {
        "ids": [908],
        "description": "Creates pitch from pitched or non-pitched signal",
        "allocationLabel": "1",
        "pauById": {908: 1},
    },
    {
        "ids": [909],
        "description": "Ridiculous shaper",
        "allocationLabel": "1",
        "pauById": {909: 1},
    },
    {
        "ids": [910],
        "description": "3-band shaper",
        "allocationLabel": "2",
        "pauById": {910: 2},
    },
    {
        "ids": [911, 912, 913],
        "description": "A bizarre reverb with a falling buzz",
        "allocationLabel": "1 for Mono LaserVerb; 2 for LaserVerb Lite; 3 for LaserVerb",
        "pauById": {911: 1, 912: 2, 913: 3},
    },
    {
        "ids": [950, 951],
        "description": "Stereo hard- and soft-knee signal-compression algorithms",
        "allocationLabel": "1",
        "pauById": {950: 1, 951: 1},
    },
    {
        "ids": [952],
        "description": "A stereo expansion algorithm",
        "allocationLabel": "1",
        "pauById": {952: 1},
    },
    {
        "ids": [953],
        "description": "Stereo soft-knee compression algorithm with filtering in the side chain",
        "allocationLabel": "2",
        "pauById": {953: 2},
    },
    {
        "ids": [954, 955],
        "description": "A stereo soft-knee compression and expansion algorithm with and without equalization",
        "allocationLabel": "2 for Compress/Expand; 3 for Cmp/Exp + EQ",
        "pauById": {954: 2, 955: 3},
    },
    {
        "ids": [956],
        "description": "Stereo soft-knee 3-frequency band compression algorithm",
        "allocationLabel": "4",
        "pauById": {956: 4},
    },
    {
        "ids": [957, 958],
        "description": "Signal gate algorithms",
        "allocationLabel": "1 for Gate; 2 for Super Gate",
        "pauById": {957: 1, 958: 2},
    },
    {
        "ids": [959],
        "description": "2-band spectral modifier",
        "allocationLabel": "1",
        "pauById": {959: 1},
    },
    {
        "ids": [960],
        "description": "3-band spectral modifier",
        "allocationLabel": "2",
        "pauById": {960: 2},
    },
    {
        "ids": [961, 962],
        "description": "A stereo tremolo or auto-balance effect.",
        "allocationLabel": "1",
        "pauById": {961: 1, 962: 1},
    },
    {
        "ids": [963],
        "description": "A stereo auto-panner",
        "allocationLabel": "1",
        "pauById": {963: 1},
    },
    {
        "ids": [964],
        "description": "A dual mono auto-panner",
        "allocationLabel": "2",
        "pauById": {964: 2},
    },
    {
        "ids": [965],
        "description": "Licensed \"Sound Retrieval System®\" or SRS™ effect",
        "allocationLabel": "1",
        "pauById": {965: 1},
    },
    {
        "ids": [966],
        "description": "Stereo enhancement with stereo channel correlation metering",
        "allocationLabel": "1",
        "pauById": {966: 1},
    },
    {
        "ids": [967],
        "description": "Stereo simulation from a mono input signal",
        "allocationLabel": "1",
        "pauById": {967: 1},
    },
    {
        "ids": [968, 969],
        "description": "Dual mono 10-band graphic equalizers",
        "allocationLabel": "3",
        "pauById": {968: 3, 969: 3},
    },
    {
        "ids": [970],
        "description": "Stereo bass and treble shelving filters and 3 parametric EQs",
        "allocationLabel": "3",
        "pauById": {970: 3},
    },
    {
        "ids": [998],
        "description": "FXMod source-metering utility algorithm",
        "allocationLabel": "1",
        "pauById": {998: 1},
    },
    {
        "ids": [999],
        "description": "Signal metering and channel summation utility algorithm",
        "allocationLabel": "1",
        "pauById": {999: 1},
    },
]


def build_algorithms() -> dict:
    source_lookup = json.loads(SOURCE_LOOKUP_PATH.read_text(encoding="utf-8"))
    source_algorithms = source_lookup["algorithmsById"]
    imported: dict[str, dict] = {}
    unresolved_ids = set(source_algorithms.keys())

    for spec in SECTION_SPECS:
        for algorithm_id in spec["ids"]:
            key = str(algorithm_id)
            base = source_algorithms.get(key)
            if not base:
                continue

            imported[key] = {
                "id": algorithm_id,
                "name": base["name"],
                "normalizedName": normalize_name(base["name"]),
                "description": spec["description"],
                "pau": spec["pauById"][algorithm_id],
                "allocationLabel": spec["allocationLabel"],
                "sourceLabel": "KDFX v1",
            }
            unresolved_ids.discard(key)

    for key in sorted(unresolved_ids, key=int):
        base = source_algorithms[key]
        imported[key] = {
            "id": int(key),
            "name": base["name"],
            "normalizedName": normalize_name(base["name"]),
            "description": "",
            "allocationLabel": "",
            "sourceLabel": "KDFX v1",
            "sourceStatus": "unresolved",
        }

    normalized_index = {}
    for key, value in imported.items():
        normalized_index[value["normalizedName"]] = int(key)

    return {
        "meta": {
            "sourcePdf": "K2600 KDFX Algorithms - Base ROM v1.pdf",
            "algorithmCount": len(imported),
            "unresolvedAlgorithmIds": sorted(int(key) for key in unresolved_ids),
        },
        "algorithmsById": dict(sorted(imported.items(), key=lambda item: int(item[0]))),
        "algorithmIdsByNormalizedName": dict(sorted(normalized_index.items())),
    }


def main() -> None:
    dataset = build_algorithms()
    OUTPUT_LOOKUP_PATH.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {OUTPUT_LOOKUP_PATH}")
    print(f"Algorithms: {dataset['meta']['algorithmCount']}")
    print(f"Unresolved: {dataset['meta']['unresolvedAlgorithmIds']}")


if __name__ == "__main__":
    main()
