# K2600 KDFX Studios Temp Diff

Date: 2026-03-22

Compared:
- Source list: `supporting materials/temp`
- Current data: `Kurzweil/K2600/k2600_kdfx_studios.json`

Summary:
- Source rows: `270`
- Current JSON rows: `164`
- Missing studio IDs in JSON: `106`
- Same-ID name mismatches: `56`

## Missing Studio IDs

The following IDs appear in `supporting materials/temp` but are missing from `k2600_kdfx_studios.json`:

```text
163 10Band StIm Hall
164 3BndCmp PtFl
165 AuxDst+Lsr Plt
166 AuxRsFltEnvSwFlt
167 AuxChorEnvF Hall
168 AuxChRvEncr Chor
169 AuxChrDstEQ Room
170 Aux ChDlSRS Hall
171 Aux EQFlng DstEQ
172 AuxFlngPhsr Lasr
173 AuxFlShQFlg Hall
174 AuxFlgDist+ Room
175 Aux GtVbFl4T Bth
176 AuxRvRvQFlg Hall
177 AuxRvRbShapeChmb
178 AuxSpinMDelay Room
179 Aux SweepEchoBth
180 AuxRoto&DsFDRPlt
181 AuxRot&Ds2FDRPlt
182 AuxFlgChDl Hall
183 AuxDstLsr CDR
184 CPDlEnFltCmpGtRv
185 RotoOrgFX2 Hall
186 ChDlFlPtLzVb Plt
187 CDFlDelayPhRm Hall
188 CDR FlgRvb Hall
189 DstPhsPnLzVb CDR
190 DistRoom GrphEQ
191 Enh Ch 4T Hall
192 FiltCmpExpFl CDR
193 LzVbFlDstEQ Room
194 PhseDist Room
195 ChDelayRvFlRv Hall
196 RmRotr&DstChrPlt
197 Clear Studio
800 Sweet Hall
801 Small Hall
802 Medium Hall
803 Large Hall
804 Big Gym
805 Bright Plate 1
806 Opera House
807 Live Chamber
808 Bathroom
809 Med Large Room
810 Real Room
811 Drum Room
812 Small Dark Room
813 Small Closet
814 Add Ambience
815 Gated Reverb
816 Reverse Reverb
817 Non-Linear
818 Slapverb
819 Full Bass
820 Room + Delay
821 Delay Big Hall
822 Chorus Room
823 Chorus Smallhall
824 Chorus Med Hall
825 Chorus Big Hall
826 Chor-Delay Room
827 Chor-Delay Hall
828 Flange-Delay Room
829 Flange-Delay Hall
830 Stereo Chorus
831 Stereo Flanger
832 Stereo Delay
833 4-Tap Delay
834 Chorus Delay
835 Flange Delay
836 Chorus 4-Tap
837 Flange 4 Tap
838 Chorus Echo
839 Chorus Echoverb
840 Fast Flange
841 Wash
842 Into The Abyss
843 Space Flanger
844 Flange Room
845 Predelay Hall
846 Flange Echo
847 Rotary Club
848 Rotary Hall
849 Chorus
850 Soundbrd/rvb
851 Percussive Room
852 Brt Empty Room
853 Mosque Room
854 New Gated
855 Chorus Slap Room
856 Chorus Bass Room
857 New Chorus Hall
858 Spacious
859 Wash Lead
860 New Hall Wet/Dryelay
861 Rich Delay
862 Glass Delay
863 Real Plate
864 Real Niceverb
865 ClassicalChamber
866 Empty Stage
867 Long & Narrow
868 Far Bloom
869 Floyd Hall
870 With A Mic
```

## Same-ID Name Mismatches

These IDs exist in both sources but the names differ:

```text
1   source: RoomChorDelay Hall        json: RoomChorDly Hall
9   source: RmFlgChDelay Room         json: RmFlgChDly Room
21  source: RmEQmph4Tp Room           json: RmEQmph4Tp Space
26  source: RoomSRSCDR Hall           json: RoomSrsCDR Hall
29  source: RoomSRSCDR CDR            json: RoomSrsCDR CDR
46  source: Room Room Hall3           json: Room Room Hall2
47  source: Room Room Hall4           json: Room Room Hall2
52  source: AuxChrMDelay Room         json: auxChrMDly Room
53  source: AuxFlngChRv Room          json: auxFlngChRv Room
54  source: AuxShp4MDelay Hall        json: auxShp4MDly Hall
55  source: AuxDistLasr Room          json: auxDistLasr Room
56  source: AuxEnhSp4T Class          json: auxEnhSp4T Class
57  source: AuxDistLasr Acid          json: auxDistLasr Acid
59  source: EnhcFlg8Tap Room          json: EnhrFlg8Tap Room
69  source: AuxPtchDst+ Chmb          json: auxPtchDst+ Chmb
70  source: AuxChorFlRv Cmbr          json: auxChorFlRv Cmbr
71  source: AuxChorFlRv Cmb2          json: auxChorFlRv Cmb2
72  source: AuxChorFlRv Cmb3          json: auxChorFlRv Cmb3
73  source: AuxChorFlRv Cmb4          json: auxChorFlRv Cmb4
83  source: Hall ChDelay Hall         json: Hall ChDly Hall
88  source: HallFlng Hall             json: Hall Flng Hall
90  source: AuxPhsrFDR Hall           json: auxPhsrFDR Hall
91  source: AuxChrDist+ Hall          json: auxChrDist+ Hall
92  source: AuxFlgDist+ Hall          json: auxFlgDist+ Hall
93  source: AuxChrDist+ Hall          json: auxChrDst+ Hall
94  source: AuxChorMDelay Hall        json: auxChorMDly Hall
95  source: AuxChorSp6T Hall          json: auxChorSp6T Hall
96  source: AuxChorChDl Hall          json: auxChorChDl Hall
97  source: AuxPhasStIm Hall          json: auxPhasStIm Hall
98  source: AuxFlngCDR Hall           json: auxFlngCDR Hall
99  source: AuxPhsFlDbl Hall          json: auxPhsrFldbl Hall
100 source: AuxSRSRoom Hall           json: auxSRSRoom Hall
101 source: AuxFlngLasr Hall          json: auxFlLsr SwHall
102 source: AuxEnh4Tap Hall           json: auxEnh4Tap Hall
116 source: AuxDist+Echo Plt          json: auxDist+Echo Plt
117 source: AuxEnvSp4T Plate          json: auxEnvSp4T Plate
118 source: AuxShap4MD Plate          json: auxShap4MD Plate
119 source: AuxChorDist+ Plt          json: auxChorDist+ Plt
120 source: AuxShFlgChDl Plt          json: auxShFlgChDl Plt
121 source: AuxMPFlgLasr Plt          json: auxMPFlgLasr Plt
122 source: AuxShap4MD Plate          json: auxShap4MD Plate
125 source: AuxRingPFD Plate          json: auxRingPFD Plate
130 source: AuxEnvSp4T GtVrb          json: auxEnvSp4T GtVrb
132 source: GtRbSwpFlt FlDelay        json: GtRbSwpFlt FlDly
136 source: AuxDPanCDR ChPlt          json: auxDPanCDR ChPlt
138 source: AuxEnhcSp4T CDR           json: auxEnhcSp4T CDR
139 source: AuxPtchDst+ ChRv          json: auxPtchDst+ ChRv
141 source: AuxPoly FDR               json: auxPoly FDR
144 source: AuxRotoSp4T FlRv          json: auxRotoSp4T FlRv
145 source: AuxRotaryFDR Plt          json: auxRotaryFDR Plt
148 source: AuxEnhSp4T RvCm           json: auxEnhSp4T CmpRv
149 source: AuxPtchRoom RvCm          json: auxPtchRoom RvCm
152 source: AuxFlgDst+ ChLsD          json: auxFlgDst+ ChLsD
153 source: AuxFlgDst+ ChLs2          json: auxFlgDst+ ChLs2
162 source: Aux5BeqStIm Hall          json: aux5BeqStIm Hall
198 source: Pre-KDFX Studio           json: Digitech Studio
```

## Notes

- The missing IDs are not only a tail after `164`; the source list is interleaved and includes additional entries in the `800`-`870` range.
- Many mismatches are probably cosmetic or normalization-only:
  - capitalization differences like `Aux...` vs `aux...`
  - abbreviations like `Delay` vs `Dly`
- A few mismatches look more substantive and should be reviewed before import:
  - `21`, `46`, `47`, `101`, `148`, `198`
