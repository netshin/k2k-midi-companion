# K2500 KDFX Preset V1/V2 Collision Audit

Date: 2026-03-22

Scope:
- Base dataset: `Kurzweil/K2500/k2500_kdfx_presets.json`
- Validation sources:
  - `supporting materials/K2500/Extracted/K2500 KDFX Presets.pdf`
  - `supporting materials/K2500/Extracted/K2500 KDFXv2 additions.pdf`

Method:
- Group current preset objects by normalized name.
- Flag groups that contain at least one `v1` object and at least one `v2` object.
- Treat exact-name matches as strongest candidates.
- Do not infer missing V2 algorithm/size fields without a source that actually provides them.
- Mark only the exact-name pairs in data with a symmetric `possibleDuplicate` field.

Summary:
- Total K2500 presets: `446`
- V1 presets: `266`
- V2 presets: `180`
- V1/V2 collision groups requiring review: `6`
- Records marked with `possibleDuplicate`: `12`

## Exact-Name Collisions

### `Percussive Room`
- V1: `17` -> `MiniVerb` (`algorithmId: 1`, `size: 1`)
- V2: `851` -> `TBD` (`algorithmId: null`, `size: null`)
- Data marker: `possibleDuplicate` set on both records (`17 <-> 851`)
- Recommendation: Keep as separate records. This is a strong name-match candidate for later enrichment, but there is not enough source evidence yet to copy V1 algorithm metadata into the V2 record.

### `Predelay Hall`
- V1: `71` -> `Diffuse Verb` (`algorithmId: 9`, `size: 3`)
- V2: `845` -> `TBD` (`algorithmId: null`, `size: null`)
- Data marker: `possibleDuplicate` set on both records (`71 <-> 845`)
- Recommendation: Keep separate. Strong later-enrichment candidate only.

### `Gated Reverb`
- V1: `112` -> `Gated MiniVerb` (`algorithmId: 3`, `size: 2`)
- V2: `815` -> `TBD` (`algorithmId: null`, `size: null`)
- Data marker: `possibleDuplicate` set on both records (`112 <-> 815`)
- Recommendation: Keep separate. Strong later-enrichment candidate only.

### `Reverse Reverb`
- V1: `121` -> `Finite Verb` (`algorithmId: 15`, `size: 3`)
- V2: `816` -> `TBD` (`algorithmId: null`, `size: null`)
- Data marker: `possibleDuplicate` set on both records (`121 <-> 816`)
- Recommendation: Keep separate. Strong later-enrichment candidate only.

### `4-Tap Delay`
- V1: `133` -> `4-Tap Delay BPM` (`algorithmId: 132`, `size: 1`)
- V2: `833` -> `TBD` (`algorithmId: null`, `size: null`)
- Data marker: `possibleDuplicate` set on both records (`133 <-> 833`)
- Recommendation: Keep separate. Strong later-enrichment candidate only.

### `Chorus Delay`
- V1: `700` -> `Chorus+Delay` (`algorithmId: 700`, `size: 1`)
- V2: `834` -> `TBD` (`algorithmId: null`, `size: null`)
- Data marker: `possibleDuplicate` set on both records (`700 <-> 834`)
- Recommendation: Keep separate. Strong later-enrichment candidate only.

## Conclusions

- The current collision set is small and well-bounded.
- The V1 PDFs confirm the older records, but they do not supply enough evidence to fill the V2 `TBD` fields automatically.
- The two punctuation/spacing pairs previously flagged are no longer treated as collisions.
- The safest next enrichment policy is to copy only when a newer authoritative source or an explicit cross-reference confirms the match.

## Suggested Next Pass

- Review the `6` marked collision groups against any later KDFX preset source the user provides.
- If a trustworthy mapping source appears, enrich the V2 records field-by-field while preserving provenance.
- Consider adding a UI hint later for presets that carry `possibleDuplicate`.
