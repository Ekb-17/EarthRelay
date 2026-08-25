# EarthRelay photo eval

Drop real incident photos into the folders. The scoring script uses the **folder name** as the true class, then pretends the reporter picked the wrong dropdown (`bait_type`) — the same miss that filed a flood as wildfire.

## Max size

| | Photos |
|---|---|
| Useful start | 8–15 per folder |
| Recommended max | **150 total** |
| Script default cap | 150 (`--limit 0` to lift it) |
| Hard disk limit | none — more photos just take longer |

150 is the working max because each Gemini call is ~10–20s and the free quota is limited. Local-only scoring (`--local`) can go higher.

Do not put personal photos on GitHub. Image files in `photos/` are gitignored.

## Folders

| Folder | Put in it | True class |
|---|---|---|
| `photos/flood/` | muddy water, flooded streets, dirty river, foam, canal | flood |
| `photos/fire/` | flames or a smoke plume — not brown water | fire |
| `photos/collapse/` | rubble, downed walls, leaning buildings | collapse |
| `photos/waste/` | dumps, plastic, tires on dry ground | waste |
| `photos/indoor/` | rooms, laptops, fruit | indoor |
| `photos/sewage/` | open sewer, sewage outflow into a drain or ditch | sewage |
| `photos/erosion/` | mudslide, washed-out slope, collapsing riverbank | erosion |
| `photos/deforestation/` | cleared forest, stumps, logs, scraped land, habitat loss | deforestation |
| `photos/wildlife/` | injured, trapped, or dead wild animal in the field | wildlife |
| `photos/hard/` | fakes, watermarks, cartoons — set `truth_kind` in `labels.csv` if needed | from CSV |

Copy in the flood photo that was called wildfire. Those mismatches matter more than a public dataset.

## Run

From the project root:

```text
python backend/eval/score.py
python backend/eval/score.py --index
python backend/eval/score.py --gemini
```

`--index` writes a `labels.csv` row for every photo it finds. `--gemini` calls Flash (needs `GEMINI_API_KEY`). Default is on-device review only.
