#!/usr/bin/env python3

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOOKUP_PATH = ROOT / "Kurzweil" / "K2600" / "k2600_kdfx_lookup.json"


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


V2_SPECS = [
    {
        "ids": [138],
        "names": {138: "Degen Regen BPM"},
        "description": "Long delay allowing loop instability",
        "allocationLabel": "4 each",
        "pauById": {138: 4},
    },
    {
        "ids": [139],
        "names": {139: "Switch Loops"},
        "description": "Looped delay lines with input switching",
        "allocationLabel": "2",
        "pauById": {139: 2},
    },
    {
        "ids": [140],
        "names": {140: "Moving Delay"},
        "description": "Generic stereo moving delay lines",
        "allocationLabel": "1",
        "pauById": {140: 1},
    },
    {
        "ids": [161],
        "names": {161: "Allpass Phaser 3"},
        "description": "Allpass filter phasers",
        "allocationLabel": "3",
        "pauById": {161: 3},
    },
    {
        "ids": [738, 739, 740, 741, 742],
        "names": {
            738: "VC+Dist+1Rotor 2",
            739: "VC+Dist+HiLoRotr",
            740: "VC+Tube+Rotor 4",
            741: "Rotor 1",
            742: "VC+Dist+HiLoRot2",
        },
        "description": "Rotating speaker algorithms",
        "allocationLabel": "1 for Rotor 1; 2 each for VC+Dist+1Rotor 2, VC+Dist+HiLoRotr, and VC+Dist+HiLoRot2; 4 for VC+Tube+Rotor 4",
        "pauById": {738: 2, 739: 2, 740: 4, 741: 1, 742: 2},
    },
    {
        "ids": [743],
        "names": {743: "Subtle Distort"},
        "description": "Adds small amount of distortion to signal.",
        "allocationLabel": "1",
        "pauById": {743: 1},
    },
    {
        "ids": [744],
        "names": {744: "Quantize+Alias"},
        "description": "Digital quantization followed by simulated aliasing.",
        "allocationLabel": "1",
        "pauById": {744: 1},
    },
    {
        "ids": [745],
        "names": {745: "Pitcher+MiniVerb"},
        "description": "Combination algorithm of Pitcher followed by MiniVerb",
        "allocationLabel": "2",
        "pauById": {745: 2},
    },
    {
        "ids": [746],
        "names": {746: "Reverb+Compress"},
        "description": "A reverb and compressor in series.",
        "allocationLabel": "2",
        "pauById": {746: 2},
    },
    {
        "ids": [781, 784],
        "names": {781: "St Chorus+Delay", 784: "St Flange+Delay"},
        "description": "Combination effect algorithms using time/frequency units instead of tempo",
        "allocationLabel": "1 or 2",
        "pauById": {781: 1, 784: 2},
    },
    {
        "ids": [790],
        "names": {790: "Gate+Cmp[EQ]+Vrb"},
        "description": "Combination algorithm designed for vocal processing.",
        "allocationLabel": "4 each",
        "pauById": {790: 4},
    },
    {
        "ids": [792],
        "names": {792: "Gate+TubeAmp"},
        "description": "Combination algorithm designed for guitar processing.",
        "allocationLabel": "3",
        "pauById": {792: 3},
    },
    {
        "ids": [914],
        "names": {914: "Revrse LaserVerb"},
        "description": "A bizarre reverb which runs backwards in time.",
        "allocationLabel": "4",
        "pauById": {914: 4},
    },
    {
        "ids": [915],
        "names": {915: "Gated LaserVerb"},
        "description": "The LaserVerb algorithm with a gate on the output.",
        "allocationLabel": "3",
        "pauById": {915: 3},
    },
    {
        "ids": [916],
        "names": {916: "Poly Pitcher"},
        "description": "Creates pitch from pitched or non-pitched signal, twice.",
        "allocationLabel": "2",
        "pauById": {916: 2},
    },
    {
        "ids": [917, 918],
        "names": {917: "Frequency Offset", 918: "MutualFreqOffset"},
        "description": "Single Side Band Modulation",
        "allocationLabel": "2",
        "pauById": {917: 2, 918: 2},
    },
    {
        "ids": [919],
        "names": {919: "WackedPitchLFO"},
        "description": "An LFO based pitch shifter.",
        "allocationLabel": "3",
        "pauById": {919: 3},
    },
    {
        "ids": [920],
        "names": {920: "Chaos!"},
        "description": "Fun with chaos and instability",
        "allocationLabel": "2",
        "pauById": {920: 2},
    },
    {
        "ids": [948],
        "names": {948: "Band Compress"},
        "description": "Stereo algorithm to compress a single frequency band",
        "allocationLabel": "3",
        "pauById": {948: 3},
    },
    {
        "ids": [949],
        "names": {949: "CompressDualTime"},
        "description": "Compression with 2 release time constants",
        "allocationLabel": "2",
        "pauById": {949: 2},
    },
    {
        "ids": [971],
        "names": {971: "3 Band EQ"},
        "description": "Bass and treble shelving filter and parametric EQs",
        "allocationLabel": "1",
        "pauById": {971: 1},
    },
    {
        "ids": [972],
        "names": {972: "HF Stimulate 1"},
        "description": "High-frequency stimulator",
        "allocationLabel": "1",
        "pauById": {972: 1},
    },
    {
        "ids": [975],
        "names": {975: "HarmonicSuppress"},
        "description": "Stereo algorithm to expand a single frequency band or harmonic bands.",
        "allocationLabel": "2",
        "pauById": {975: 2},
    },
]


def main() -> None:
    dataset = json.loads(LOOKUP_PATH.read_text(encoding="utf-8"))
    algorithms = dataset["algorithmsById"]
    normalized = dataset["algorithmIdsByNormalizedName"]

    for spec in V2_SPECS:
        for algorithm_id in spec["ids"]:
            key = str(algorithm_id)
            name = spec["names"][algorithm_id]
            algorithms[key] = {
                "id": algorithm_id,
                "name": name,
                "normalizedName": normalize_name(name),
                "description": spec["description"],
                "pau": spec["pauById"][algorithm_id],
                "allocationLabel": spec["allocationLabel"],
                "sourceLabel": "KDFX v2",
            }
            normalized[normalize_name(name)] = algorithm_id

    unresolved = set(dataset.get("meta", {}).get("unresolvedAlgorithmIds", []))
    meta = dataset.setdefault("meta", {})
    meta["sourcePdfs"] = [
        "K2600 KDFX Algorithms - Base ROM v1.pdf",
        "K2600 KDFX Algorithms - Base ROM v2.pdf",
    ]
    meta["algorithmCount"] = len(algorithms)
    meta["unresolvedAlgorithmIds"] = sorted(unresolved)

    dataset["algorithmsById"] = dict(sorted(algorithms.items(), key=lambda item: int(item[0])))
    dataset["algorithmIdsByNormalizedName"] = dict(sorted(normalized.items()))

    LOOKUP_PATH.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {LOOKUP_PATH}")
    print(f"Algorithms: {meta['algorithmCount']}")
    print(f"Unresolved: {meta['unresolvedAlgorithmIds']}")


if __name__ == "__main__":
    main()
