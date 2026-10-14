import React from 'react';
import Svg,{Circle,Ellipse,Path,Polygon,Defs,RadialGradient,LinearGradient,Stop,G} from 'react-native-svg';

export default function SuperdotMascot({id,color,size=102,mood='happy'}:{id:string;color:string;size?:number;mood?:'happy'|'calm'|'sleepy'|'excited'}){
 const asleep=mood==='calm'||mood==='sleepy';
 const eye=(x:number,y=43)=>asleep?
  <Path d={`M${x-7} ${y} Q${x} ${y+6} ${x+7} ${y}`} fill="none" stroke="#2C185C" strokeWidth="3.2" strokeLinecap="round"/>:
  <><Ellipse cx={x} cy={y} rx="5.6" ry="7.8" fill="#261447"/><Circle cx={x-2} cy={y-3} r="2.3" fill="#fff"/></>;
 const cheeks=(left=29,right=60,y=55)=><><Ellipse cx={left} cy={y} rx="5" ry="3.5" fill="#FFA5C4" opacity=".7"/><Ellipse cx={right} cy={y} rx="5" ry="3.5" fill="#FFA5C4" opacity=".7"/></>;
 const grin=<><Path d="M36 57 Q44 72 54 57 Q45 61 36 57" fill="#351764" stroke="#351764" strokeWidth="1.4"/><Ellipse cx="45" cy="65" rx="5" ry="2.3" fill="#FF7DB7"/></>;
 return <Svg width={size} height={size} viewBox="0 0 88 88">
 <Defs>
  <RadialGradient id="skin" cx="33%" cy="20%" r="75%"><Stop offset="0%" stopColor="#FFF" stopOpacity=".80"/><Stop offset="34%" stopColor={color}/><Stop offset="78%" stopColor={color}/><Stop offset="100%" stopColor="#25145C" stopOpacity=".35"/></RadialGradient>
  <RadialGradient id="shine" cx="38%" cy="25%" r="70%"><Stop offset="0%" stopColor="#FFF" stopOpacity=".96"/><Stop offset="68%" stopColor="#FFF"/><Stop offset="100%" stopColor="#D6D6F1"/></RadialGradient>
  <RadialGradient id="pupil" cx="30%" cy="25%" r="70%"><Stop offset="0%" stopColor="#4D3C8B"/><Stop offset="100%" stopColor="#170D35"/></RadialGradient>
  <LinearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><Stop offset="0%" stopColor="#98ECC6"/><Stop offset="100%" stopColor="#2E9B6E"/></LinearGradient>
 </Defs>
 <Ellipse cx="44" cy="80" rx="28" ry="5" fill="#352360" opacity=".11"/>
 {id==='bloop'?<G>
  {[[17,26,7],[29,15,7],[46,12,8],[63,19,7],[73,36,7],[73,55,6],[59,71,7],[30,73,7],[16,55,7],[13,39,6]].map(([x,y,r],i)=><Circle key={i} cx={x} cy={y} r={r} fill="url(#skin)"/>)}
  <Circle cx="44" cy="45" r="29" fill="url(#skin)"/>
  <Ellipse cx="36" cy="25" rx="13" ry="6" fill="#FFF" opacity=".20" transform="rotate(-21 36 25)"/>
  {asleep?<Path d="M24 42 Q43 58 63 41" fill="none" stroke="#31164D" strokeWidth="5" strokeLinecap="round"/>:
    <><Circle cx="44" cy="42" r="21" fill="#3C2375" opacity=".28"/><Circle cx="44" cy="41" r="19.5" fill="url(#shine)"/><Circle cx="47" cy="42" r="11.8" fill="url(#pupil)"/><Circle cx="51" cy="37" r="4.7" fill="#fff"/><Circle cx="42" cy="49" r="2" fill="#fff" opacity=".72"/></>}
  <Ellipse cx="24" cy="55" rx="5" ry="3" fill="#FFABD0" opacity=".46"/>
  {asleep?<Path d="M52 62 Q59 67 65 61" stroke="#33165F" strokeWidth="3" fill="none" strokeLinecap="round"/>:<Path d="M57 61 Q62 70 68 62 Q63 66 57 61" fill="#33165F"/>}
  <Circle cx="25" cy="27" r="3" fill="#fff" opacity=".45"/>
 </G>:null}
 {id==='poppy'?<G>
  {[[44,20],[64,30],[67,52],[54,70],[32,70],[21,52],[24,31]].map(([x,y],i)=><Circle key={i} cx={x} cy={y} r="17" fill="url(#skin)"/>)}
  <Circle cx="44" cy="45" r="24" fill="#FFE1D9"/><Ellipse cx="36" cy="31" rx="11" ry="5" fill="#fff" opacity=".50"/>
  {eye(35,44)}{eye(54,44)}{cheeks(26,63,54)}{grin}
  <Ellipse cx="27" cy="70" rx="11" ry="7" fill={color}/><Ellipse cx="62" cy="70" rx="11" ry="7" fill={color}/>
 </G>:null}
 {id==='mochi'?<G>
  <Path d="M13 41 C9 30 21 19 32 21 C38 11 54 10 63 21 C76 20 82 31 76 42 C83 53 73 69 61 70 L27 70 C13 70 7 56 13 41 Z" fill="url(#skin)"/>
  <Ellipse cx="32" cy="24" rx="10" ry="5" fill="#FFF" opacity=".37"/>
  <Ellipse cx="28" cy="67" rx="12" ry="8" fill="#78BBF2"/><Ellipse cx="60" cy="67" rx="12" ry="8" fill="#78BBF2"/>
  {asleep?<><Path d="M28 46 Q35 52 42 45 M47 45 Q55 52 62 45" fill="none" stroke="#2C185C" strokeWidth="3" strokeLinecap="round"/></>:<>{eye(34,43)}{eye(55,43)}</>}
  {cheeks(23,66,52)}<Path d="M38 58 Q44 64 51 58" fill="none" stroke="#31164D" strokeWidth="3" strokeLinecap="round"/>
 </G>:null}
 {id==='zuzu'?<G>
  <Polygon points="44,4 54,22 76,13 67,35 86,44 67,53 75,76 53,65 44,86 34,65 12,76 21,53 2,44 21,35 12,13 34,22" fill="url(#skin)"/>
  <Circle cx="44" cy="44" r="25" fill="#FFE18A"/><Ellipse cx="36" cy="28" rx="10" ry="5" fill="#fff" opacity=".38"/>
  {eye(35,42)}{eye(54,42)}{cheeks(24,64,53)}{grin}
 </G>:null}
 {id==='nori'?<G>
  <Path d="M43 6 C56 19 75 34 76 53 C78 68 62 80 44 80 C24 80 13 65 17 48 C20 30 33 17 43 6 Z" fill="url(#skin)"/>
  <Path d="M52 20 C60 8 75 8 83 15 C77 34 62 36 52 33 Z" fill="url(#leaf)"/>
  <Path d="M55 30 Q68 19 76 17" stroke="#D1FAE6" strokeWidth="2" fill="none"/>
  <Ellipse cx="35" cy="32" rx="10" ry="5" fill="#fff" opacity=".25"/>
  {eye(35,47)}{eye(56,47)}{cheeks(25,66,56)}
  <Path d="M38 61 Q45 69 53 61" fill="none" stroke="#31164D" strokeWidth="3" strokeLinecap="round"/>
  <Ellipse cx="28" cy="69" rx="11" ry="7" fill="#6DCFA6"/><Ellipse cx="61" cy="69" rx="11" ry="7" fill="#6DCFA6"/>
 </G>:null}
 </Svg>;
}
