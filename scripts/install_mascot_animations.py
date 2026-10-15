#!/usr/bin/env python3
"""Install the five user-supplied Superdots frame ZIPs into Expo + watchOS.
Run: python3 scripts/install_mascot_animations.py /path/to/animation-zips
"""
from pathlib import Path
import json,sys,zipfile,shutil
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT
NAMES={'joy':'joy','sadness':'sadness','anger':'anger','fear':'fear','disgust':'calm'}
dest=ROOT/'assets'/'mascot-animations'
dest.mkdir(parents=True,exist_ok=True)
source_map={}
for mood,archive_name in NAMES.items():
    candidates=list(SOURCE.glob(f'{archive_name}_mascot_animation_frames*.zip'))
    if not candidates:raise SystemExit(f'Missing {archive_name} animation ZIP in {SOURCE}')
    archive=candidates[-1]
    with zipfile.ZipFile(archive) as zipf:
        manifest=json.loads(zipf.read('manifest.json'))
        fps=manifest['animation']['fps']
        frames=manifest['frame_sequence']
        if fps!=12 or len(frames)!=36:raise SystemExit(f'Unexpected frames/fps in {archive}')
        output=dest/mood
        (output/'ios').mkdir(parents=True,exist_ok=True)
        watch=ROOT/'watchos'/'SuperdotsWatch'/'AnimationFrames'/mood
        watch.mkdir(parents=True,exist_ok=True)
        for frame in frames:
            ios=zipf.read('ios_512/'+frame)
            smaller=zipf.read('watchos_256/'+frame)
            (output/'ios'/frame).write_bytes(ios)
            (watch/frame).write_bytes(smaller)
    source_map[mood]=[f"require('./assets/mascot-animations/{mood}/ios/{frame}')" for frame in frames]
    print('Installed',mood,len(frames),'frames')
js="import type {ImageSourcePropType} from 'react-native';\n"
js+="export const MASCOT_FPS=12;\n"
js+="export const MASCOT_FRAMES:Record<'joy'|'sadness'|'anger'|'fear'|'disgust',ImageSourcePropType[]>={\n"
for mood,frames in source_map.items():
    js+=" "+mood+":[\n  "+",\n  ".join(frames)+"\n ],\n"
js+="};\n"
(ROOT/'MascotAnimationAssets.ts').write_text(js)
print('Generated',ROOT/'MascotAnimationAssets.ts')
print('Next: run npm run typecheck and regenerate watch project with xcodegen from watchos/project.yml')
