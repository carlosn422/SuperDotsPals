#!/usr/bin/env python3
"""Install the five user-supplied Superdots frame ZIPs into Expo + watchOS.
Run: python3 scripts/install_mascot_animations.py /path/to/animation-zips
"""
from pathlib import Path
import json,sys,zipfile,shutil,hashlib
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT
NAMES={'joy':'joy','sadness':'sadness','anger':'anger','fear':'fear','disgust':'calm'}
dest=ROOT/'assets'/'mascot-animations'
dest.mkdir(parents=True,exist_ok=True)
source_map={}
first_frames={}
for mood,archive_name in NAMES.items():
    candidates=list(SOURCE.glob(f'{archive_name}_mascot_animation_frames*.zip'))
    if not candidates:raise SystemExit(f'Missing {archive_name} animation ZIP in {SOURCE}')
    archive=max(candidates,key=lambda p:p.stat().st_mtime) # use newest supplied revision, including (1).zip
    with zipfile.ZipFile(archive) as zipf:
        manifest=json.loads(zipf.read('manifest.json'))
        actual_name=str(manifest.get('character_name','')).strip().lower()
        if actual_name not in {archive_name,mood,'anxiety' if archive_name=='fear' else archive_name}:
            raise SystemExit(f'Wrong character in {archive}: expected {archive_name}, got {actual_name}')
        fps=manifest['animation']['fps']
        frames=manifest['frame_sequence']
        if fps!=12 or len(frames)!=36:raise SystemExit(f'Unexpected frames/fps in {archive}')
        output=dest/mood
        (output/'ios').mkdir(parents=True,exist_ok=True)
        watch=ROOT/'watchos'/'SuperdotsWatch'/'AnimationFrames.xcassets'
        watch.mkdir(parents=True,exist_ok=True)
        for index,frame in enumerate(frames):
            ios=zipf.read('ios_512/'+frame)
            smaller=zipf.read('watchos_256/'+frame)
            (output/'ios'/frame).write_bytes(ios)
            if index==0:first_frames[mood]=hashlib.sha256(ios).hexdigest()
            imageset=watch/(f'{mood}_frame_{index:03d}.imageset')
            imageset.mkdir(parents=True,exist_ok=True)
            (imageset/frame).write_bytes(smaller)
            (imageset/'Contents.json').write_text(json.dumps({'images':[{'filename':frame,'idiom':'universal'}],'info':{'author':'xcode','version':1}}))
    source_map[mood]=[f"require('./assets/mascot-animations/{mood}/ios/{frame}')" for frame in frames]
    print(f'Installed {mood} from {archive.name}: {len(frames)} frames; SHA256 {first_frames[mood][:12]}')
if len(set(first_frames.values())) != len(NAMES):
    raise SystemExit('Two mascot packs contain identical first frames. Check that Joy is yellow, Anger red, and Calm green.')
js="import type {ImageSourcePropType} from 'react-native';\n"
js+="export const MASCOT_FPS=12;\n"
js+="export const MASCOT_FRAMES:Record<'joy'|'sadness'|'anger'|'fear'|'disgust',ImageSourcePropType[]>={\n"
for mood,frames in source_map.items():
    js+=" "+mood+":[\n  "+",\n  ".join(frames)+"\n ],\n"
js+="};\n"
(ROOT/'MascotAnimationAssets.ts').write_text(js)
print('Generated',ROOT/'MascotAnimationAssets.ts')
print('Next: run npm run typecheck and regenerate watch project with xcodegen from watchos/project.yml')
