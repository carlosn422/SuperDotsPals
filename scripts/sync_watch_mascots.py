#!/usr/bin/env python3
"""Generate matching watchOS mascot frames from the iPhone's canonical PNGs.

Run before building the watch app: python3 scripts/sync_watch_mascots.py
macOS sips preserves transparency while resizing to the watch's 256px budget.
"""
from pathlib import Path
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "mascot-animations"
DESTINATIONS = [
    ROOT / "watchos" / "SuperdotsWatch" / "AnimationFrames.xcassets",
    ROOT / "targets" / "superdots-watch" / "Assets.xcassets" / "AnimationFrames.xcassets",
]
MOODS = ("joy", "disgust", "sadness", "anger", "fear", "tired")
FRAME_COUNT = 36

def main():
    for mood in MOODS:
        frames = sorted((SOURCE / mood / "ios").glob("frame_*.png"))
        if len(frames) < FRAME_COUNT:
            raise RuntimeError(f"{mood}: expected {FRAME_COUNT} iOS frames, found {len(frames)}")
        for index, source in enumerate(frames[:FRAME_COUNT]):
            if source.name != f"frame_{index:03d}.png":
                raise RuntimeError(f"{mood}: non-contiguous source frame {source.name} at {index}")
            for destination in DESTINATIONS:
                imageset = destination / f"{mood}_frame_{index:03d}.imageset"
                imageset.mkdir(parents=True, exist_ok=True)
                output = imageset / source.name
                subprocess.run(
                    ["sips", "-s", "format", "png", "-Z", "256", str(source), "--out", str(output)],
                    check=True, stdout=subprocess.DEVNULL,
                )
                (imageset / "Contents.json").write_text(json.dumps({
                    "images": [{"filename": source.name, "idiom": "universal"}],
                    "info": {"author": "xcode", "version": 1},
                }))
        print(f"[WatchMascot] {mood}: synced {FRAME_COUNT} frames from the iOS artwork")
    print("[WatchMascot] Synced to standalone and embedded watch target asset catalogs")

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, FileNotFoundError) as exc:
        sys.exit(f"[WatchMascot] ERROR: {exc}")
