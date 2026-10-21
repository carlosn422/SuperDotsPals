#!/usr/bin/env python3
"""Generate matching watchOS mascot frames from the iPhone's canonical PNGs.

Run before building the watch app: python3 scripts/sync_watch_mascots.py
Samples FRAME_COUNT frames evenly across each full iOS animation and resizes them to the
watch's 256px budget (macOS sips, or Pillow when sips is unavailable). Transparency is kept.
"""
from pathlib import Path
import json
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "mascot-animations"
DESTINATIONS = [
    ROOT / "watchos" / "SuperdotsWatch" / "AnimationFrames.xcassets",
    ROOT / "targets" / "superdots-watch" / "AnimationFrames.xcassets",
]
MOODS = ("joy", "disgust", "sadness", "anger", "fear", "tired")
FRAME_COUNT = 36

def resize(source, output):
    if shutil.which("sips"):
        subprocess.run(["sips", "-s", "format", "png", "-Z", "256", str(source), "--out", str(output)],
                       check=True, stdout=subprocess.DEVNULL)
        return
    from PIL import Image
    image = Image.open(source).convert("RGBA")
    image.thumbnail((256, 256), Image.LANCZOS)
    image.save(output, optimize=True)

def main():
    for mood in MOODS:
        frames = sorted((SOURCE / mood / "ios").glob("frame_*.png"))
        if len(frames) < FRAME_COUNT:
            raise RuntimeError(f"{mood}: expected at least {FRAME_COUNT} iOS frames, found {len(frames)}")
        picks = [frames[round(i * (len(frames) - 1) / (FRAME_COUNT - 1))] for i in range(FRAME_COUNT)]
        for index, source in enumerate(picks):
            name = f"frame_{index:03d}.png"
            for destination in DESTINATIONS:
                imageset = destination / f"{mood}_frame_{index:03d}.imageset"
                imageset.mkdir(parents=True, exist_ok=True)
                for old in imageset.glob("*.png"):
                    old.unlink()
                resize(source, imageset / name)
                (imageset / "Contents.json").write_text(json.dumps({
                    "images": [{"filename": name, "idiom": "universal"}],
                    "info": {"author": "xcode", "version": 1},
                }))
        print(f"[WatchMascot] {mood}: synced {FRAME_COUNT} frames from the iOS artwork")
    print("[WatchMascot] Synced to standalone and embedded watch target asset catalogs")

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, FileNotFoundError, ImportError) as exc:
        sys.exit(f"[WatchMascot] ERROR: {exc}")
