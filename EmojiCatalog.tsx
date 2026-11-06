import React from 'react';
import {Image,Text} from 'react-native';
import data from './EmojiCatalog.json';

// Plus reaction emoji. 3D art is Microsoft Fluent Emoji (MIT), served from jsDelivr at a pinned commit
// and cached by the OS image cache. Regenerate the catalog with scripts/build-emoji-catalog.py.
export type EmojiStyle='standard'|'3d';
export type EmojiItem={e:string;name:string;path:string};
export type EmojiGroup={id:string;title:string;items:EmojiItem[]};

export const EMOJI_GROUPS:EmojiGroup[]=data.groups.map(g=>({id:g.id,title:g.title,items:g.items.map(([e,name,path])=>({e,name,path}))}));
const strip=(e:string)=>e.replace(/\uFE0F/g,'');
const BY_GLYPH=new Map<string,EmojiItem>();
EMOJI_GROUPS.forEach(g=>g.items.forEach(i=>{BY_GLYPH.set(i.e,i);BY_GLYPH.set(strip(i.e),i)}));
const CDN='https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@'+data.sha+'/assets/';

export const emojiItem=(e:string)=>BY_GLYPH.get(e)||BY_GLYPH.get(strip(e));
export const emojiName=(e:string)=>emojiItem(e)?.name;
export const fluentUrl=(e:string)=>{const i=emojiItem(e);return i?CDN+i.path.split('/').map(encodeURIComponent).join('/')+'.png':undefined};

// Renders a reaction in the sender's chosen art; 3D falls back to the Apple glyph when there's no Fluent image.
export function Emoji({e,style,size}:{e:string;style?:EmojiStyle|null;size:number}){
 const uri=style==='3d'?fluentUrl(e):undefined;
 if(uri)return <Image source={{uri,cache:'force-cache'}} style={{width:size*1.2,height:size*1.2}} accessibilityIgnoresInvertColors/>;
 return <Text style={{fontSize:size}}>{e}</Text>;
}
