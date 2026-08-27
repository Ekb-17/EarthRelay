# Eval gold set

`photos/` holds labeled images (209+). Folder name is the true class.
`hard/` uses names like `fire-NONE-1.png` (looks like fire, true label is none).

The `photos/` folder is **not** committed to GitHub (too large). Keep a local copy for
eval scoring and reference matching. Labels and fingerprints stay in the repo.

These photos do **not** train YOLO. They are a gold set for:

1. **Live reference matching** — citizen uploads are compared to the gold set when Flash is weak or flood/sewage is unclear (`eval.reference`).
2. **Scorecard** — `python -m eval.score --index` then `python -m eval.score` (add `--gemini` to include Flash/Pro).

Fingerprints cache: `fingerprints.json` (auto-built on first match).
