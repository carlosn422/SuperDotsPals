#!/usr/bin/env node
// Stage the existing standalone SwiftUI watchOS app as an Expo Apple target.
// Run after installing @bacons/apple-targets; this never modifies the original watchos/ app.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=path.join(root,'watchos','SuperdotsWatch');
const dest=path.join(root,'targets','superdots-watch');
if(!fs.existsSync(src))throw new Error('Missing existing watchOS source: '+src);
fs.mkdirSync(dest,{recursive:true});
for(const item of fs.readdirSync(src,{withFileTypes:true})){
 if(item.name.startsWith('.')||item.name.endsWith('.xcodeproj'))continue;
 fs.cpSync(path.join(src,item.name),path.join(dest,item.name),{recursive:true,force:true});
}
fs.writeFileSync(path.join(dest,'expo-target.config.js'),`module.exports = {
  type: 'watch',
  name: 'SuperdotsWatch',
  displayName: 'Superdots',
  bundleIdentifier: '.watchkitapp',
  deploymentTarget: '10.0',
  frameworks: ['SwiftUI', 'Security'],
  infoPlist: { CFBundleIconName: 'AppIcon' },
};\n`);
const appPath=path.join(root,'app.json');
const app=JSON.parse(fs.readFileSync(appPath,'utf8'));
app.expo.plugins??=[];
if(!app.expo.plugins.some(p=>(typeof p==='string'?p:p[0])==='@bacons/apple-targets')){
 app.expo.plugins.push('@bacons/apple-targets');
}
fs.writeFileSync(appPath,JSON.stringify(app,null,2)+'\n');
console.log('Copied SwiftUI watch app and mascot assets to targets/superdots-watch.');
console.log('Registered @bacons/apple-targets in app.json.');
console.log('NEXT: npx expo prebuild --platform ios --clean');
console.log('Then open ios/*.xcworkspace in Xcode and validate the watch target, signing and embedding.');
