"""Read-only pixel inspection. Writes layout metadata, never modifies bitmap assets."""
from pathlib import Path
import json
from PIL import Image

root = Path(__file__).resolve().parents[1]
folder = root / "public/assets/pets"
layouts = {}
for file in sorted(folder.glob("*.png")):
    image = Image.open(file)
    if image.mode != "RGBA":
        raise SystemExit(f"{file.name}: missing alpha channel")
    width, height = image.size
    alpha = image.getchannel("A")
    pixels = alpha.load()
    counts = [sum(pixels[x, y] > 64 for x in range(width)) for y in range(height)]
    cuts = [0]
    for boundary in range(1, 4):
        ideal = height * boundary / 4
        low, high = max(cuts[-1] + 10, int(ideal - height * .11)), min(height - 1, int(ideal + height * .11))
        runs, start = [], None
        for y in range(low, high):
            if counts[y] <= 2:
                if start is None:
                    start = y
            elif start is not None:
                if y - start >= 3:
                    runs.append((start, y - 1))
                start = None
        if start is not None and high - start >= 3:
            runs.append((start, high - 1))
        if runs:
            a, b = min(runs, key=lambda r: abs((r[0] + r[1]) / 2 - ideal))
            cut = (a + b) // 2
        else:
            cut = min(range(low, high), key=lambda y: counts[y] * 10 + abs(y - ideal) * .05)
        cuts.append(cut)
    cuts.append(height)
    rows = []
    for i in range(4):
        top, bottom = cuts[i], cuts[i + 1]
        occupied = [y for y in range(top, bottom) if counts[y] > 6]
        rows.append({"top": top, "bottom": bottom, "baseline": max(occupied) if occupied else bottom - 1})
    layouts[file.stem] = {"width": width, "height": height, "columns": 6, "rows": rows}
    print(file.name, f"{width}x{height}", "alpha", alpha.getextrema(), "row cuts", cuts, "baselines", [r["baseline"] for r in rows])
(folder / "atlas-layout.json").write_text(json.dumps(layouts, ensure_ascii=False, indent=2), encoding="utf-8")
