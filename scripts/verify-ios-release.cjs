#!/usr/bin/env node
// Runs after Expo prebuild (locally or through EAS build post-install).
// Patch the physical generated Info.plist files so the release archive cannot
// silently drop keys from Expo config or the apple-targets watch target.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const ios=path.join(root,'ios');
if(!fs.existsSync(ios)){console.log('Skipping plist validation: native iOS project not generated yet.');process.exit(0)}
const exec=(args)=>cp.execFileSync('/usr/libexec/PlistBuddy',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const get=(p,key)=>{try{return exec(['-c','Print '+key,p]).trim()}catch{return ''}};
const set=(p,key,type,value)=>{
 try{exec(['-c','Set '+key+' '+value,p])}
 catch{exec(['-c','Add '+key+' '+type+' '+value,p])}
};
const app=path.join(ios,'Superdots','Info.plist');
if(!fs.existsSync(app))throw new Error('Missing generated iOS Info.plist: '+app);
set(app,'NSHealthShareUsageDescription','string','Superdots reads heart rate variability, resting heart rate, steps, and sleep for personal wellness insights.');
set(app,'NSHealthUpdateUsageDescription','string','Superdots integrates with Apple Health for personal wellness features. It currently reads health data and does not write or modify health records.');
if(!get(app,'NSHealthUpdateUsageDescription'))throw new Error('iOS health purpose string absent after patch');
console.log('Verified iPhone HealthKit purpose descriptions.');
const watchPlists=[
 path.join(root,'targets','superdots-watch','Info.plist'),
 path.join(ios,'expo-targets','superdots-watch','Info.plist'),
];
for(const p of watchPlists.filter(fs.existsSync)){
 set(p,'CFBundleIconName','string','AppIcon');
 // Replace the array atomically instead of trying to Add an existing key.
 try { exec(['-c','Delete :CFBundleIconFiles',p]); } catch {}
 exec(['-c','Add :CFBundleIconFiles array',p]);
 exec(['-c','Add :CFBundleIconFiles:0 string AppIcon',p]);
 console.log('Verified watch icon metadata:',path.relative(root,p));
}
// The Expo watch target generates Info.plist during compilation. Patch the watch
// target's Xcode build settings, not only source plist files that may be ignored.
const projectPath=path.join(ios,'Superdots.xcodeproj','project.pbxproj');
if(!fs.existsSync(projectPath))throw new Error('Missing generated Xcode project');
let pbx=fs.readFileSync(projectPath,'utf8');
const updated=pbx.replace(/buildSettings = \{[^}]*PRODUCT_BUNDLE_IDENTIFIER = "?com\.superdotspals\.wellnest\.watchkitapp"?;[^}]*\};/g,block=>{
  if(!block.includes('ASSETCATALOG_COMPILER_APPICON_NAME'))block=block.replace('buildSettings = {','buildSettings = {\n                ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;');
  if(!block.includes('INFOPLIST_KEY_CFBundleIconName'))block=block.replace('buildSettings = {','buildSettings = {\n                INFOPLIST_KEY_CFBundleIconName = AppIcon;');
  return block;
});
if(updated===pbx)console.warn('Watch build settings already set or target structure differs; inspect Xcode Build Settings.');
else{fs.writeFileSync(projectPath,updated);console.log('Added watch icon settings to generated Xcode project.')}
const assetDir=path.join(root,'targets','superdots-watch','Assets.xcassets','AppIcon.appiconset');
if(!fs.existsSync(assetDir))throw new Error('Missing watch AppIcon.appiconset source directory');
const manifest=JSON.parse(fs.readFileSync(path.join(assetDir,'Contents.json'),'utf8'));
const icons=(manifest.images||[]).filter(i=>i.platform==='watchos'&&i.filename&&fs.existsSync(path.join(assetDir,i.filename)));
if(!icons.length)throw new Error('Watch AppIcon has no watchOS image referenced by Contents.json');
console.log('Verified watch icon image:',icons.map(i=>i.filename).join(', '));
