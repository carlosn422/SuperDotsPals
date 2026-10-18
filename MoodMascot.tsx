import React,{useEffect,useState} from 'react';
import {MASCOT_FRAMES,MASCOT_FPS} from './MascotAnimationAssets';
import {Image,AppState,AccessibilityInfo} from 'react-native';


export type Emotion='joy'|'sadness'|'anger'|'fear'|'disgust';
export const APP_THEME={primary:'#7861E8',primarySoft:'#EEE8FF',background:'#FAF8FF',surface:'#FFFFFF',ink:'#26165C',muted:'#77739A',mint:'#E1FAF1',border:'#EAE5F5'} as const;
export function moodToEmotion(value?:string|null):Emotion{
 const m=(value||'').trim().toLowerCase();
 // Direct mascot identifiers must resolve before human mood synonyms.
 if(m==='joy'||m==='sadness'||m==='anger'||m==='fear'||m==='disgust')return m;
 if(['happy','good','great','joyful','excited','proud','energized','positive'].some(w=>m.includes(w)))return 'joy';
 if(['angry','frustrated','irritated','mad','furious'].some(w=>m.includes(w)))return 'anger';
 if(['anxious','nervous','stressed','overwhelmed','worried','afraid','scared','panic'].some(w=>m.includes(w)))return 'fear';
 if(['sad','down','low','tired','exhausted','depressed','lonely'].some(w=>m.includes(w)))return 'sadness';
 return 'disgust'; // The green Calm artwork uses the legacy internal key 'disgust'.
}
export const EMOTION_COLORS:Record<Emotion,string>={joy:'#EAAF2C',sadness:'#448CCA',anger:'#DA4B31',fear:'#9B7BC8',disgust:'#57B56F'};
const imageData:Record<Emotion,string>={"joy":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAYFBMVEUAAADsrCY0gsjmzFvt+u8tfcbUsEux8u/M2qVdiZuOJRpRmMbR046emmj//2/yzTeoYym0tGpnHxqc0tI0fLd/f390scb//wDy9alksbHVZWj8iYs5JyvW0INpTS12//+3sT5KAAAAIHRSTlMA/v7yD/78F2P8//SZ/wL//wP/WP4CpQEHA////8v/Ag3ot18AAAMSSURBVHja3VfZsqowEBxISFgSBGRRj8v//+WdSQJBIIh1Hm7VaQtUcDo9KxHgT+J6/a/Lc3whXuZz94IrvLovKc5F3K+8+oKEF3ES90YGl2eC5N95UCTIUPQ99IVFlvVnbu4dyQBIJIhjOujNII6Lopd08zMkhWADSZyhW9cjCmCTgCgKeUhDHwdRnI8EcS0gSWYMLpJluTTkzoOziSEatdBawyTL2pGisHVGVTFsrt/xwtqAFkLoDOiLjvCTY+itTLgscyrlWIYJ2YvIQmQtEUREYbKLTmBV8odgytcX51LhhVfdmSpC+8hDt4aAuIwfPe9K+cDvLIWLI6ghZXhBOQFv9sgwydGtkdCZn0eRmjmgIkvJKYetiAIAFwVjjwS1Mx8sQcSk6QO9tnze7096p1Bm3NqvXKBr5IFV3Nzv1WTfPO2BcYhjtz4uNyse6S5C6yLQVBF4hru5ZMKQjBFCAR618wE1Ji15UDUnPD3XvggYI4wCfDHywfmFDFkwhPa+3hBgJIgxabNfV0CnKs99OPQkoORvLTRGIfICqiZvDPI8XwpBAfWbhHJMxHz93GNx66SmFHoGtWSomtG8qRa3HrJeDUifCZ/+vLrBz+2WN0sHOKzHfDeYFnlD/mOQw8p+CyU26bL28xsiXzqgoNxkuGwFErHuqQDqbk2wxImdiGAI+JCKQwQhFzAI4r2UFsYnOuGxLKJZOQrqWNDbBMw5KNJVFU2TlVHDxtmOAiKQ4cesMnNYh/0gEvYKpsHkUQgzP2E7hoxCUAYfa1NP6iQLKRAySDDvBy02V9+pw5kErbeTwFwj7O5UFMnffDKYGqJJUO6YY0syzEMWTgOT+wKmyaTbzSgyCBbRBMsQIIjUgT2fYwi4kH6UgD2119Xq8zapBKnYbwi8G/6JJsahfcAFC+ZtGahUjn4xOXwngaVu95SOA7k+ZF9OXZHaeWsJaBMDBwnGVAC/uO9MsHS3jrcfdW4ADsDTlMNw1J62DI+3qHPb79/885DYvycfdV7X3/xzMTM2Veob1SElv7C9DCWHv49/5z8j/wDgTzIAAAAASUVORK5CYII=","sadness":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAYFBMVEUAAABJhMdEfccvWqHz/fc9ecSGt8mgz9Jns7NDcrUuLFV///8AAP9/f3+w6uRhYbB2xu4vdLkA//9fk7ymq6uqqv+SxdJ5rMYAAH9/f/+CsL2CyfAyRnpVqv8Af38Af/8dKY85AAAAIHRSTlMA/f7+Dv2fYgP//wIBAiID/wQB9wMDkbACAo7//wMCAk71ze8AAANDSURBVHja3VfZduIwDLVkZYMQCFCg087M///lyJKXLDaEeaxPe5K00bWse7XEmJ+9zvt2PBrzt20/Dv9hvj/qlfTS0pvmDzalpr7f4V6bhti8fcMN+uTfGtxClAs09IYX/N5wF2NZ7spPNf/5usn+w9ANoPJb+4UVwI1Mu8G+ZQ/UHHEJQYz+al0N8csw31+Pw6jNS4Q92+PSOsajeolAun92KcJgnnJxZfYK9qCMAPX0LAANVAuzoIZAas3HLK3DmRb2PhwYF7gwtGUGFwdA1RBEQcmV+iIDw9wBNceZJoWJoQBA9xUFncUUwBiFY9b+N0dwfgDrVvQlugEFGj5pET4H0KUYMpbCXIZCBKcU6mbQJQAQNB+EtkQhzgHsbmcjhyAOuZtfOQChEOcEsv1uh4HErsMIMGaToMLlCRxAsOfbzt/fzKPgwOwEcPq6JCMbwFxxWvMoWQwRQm1Op1OoDAjdLsaDj7ACGEUDGApJAOBTMX3f346Lbtd9yTPmWOhJVGenAKiytDvLP+7+y3mkNC6r68HQpXK6CTxi0I5VOagePcCFVkXFiUiE6x2AwLsioHdP/wN3ynIAAcA3AtQ8EAF7sJhMq9UHAGcXDRyDCiD7d4qFuXTupZKgcyDu2IVzBJiAkEvGR9RxZ/1bQc0WYQLjeM6VAw/Au1oPkBJItJQiwST2a4BRhexemwGAREUAwjMyiYdCLfC7p/z1PmtxgqAtMud1MXBC8pFP+9tkD9EvDkF20qBYAjFVIDuRZUAotIUxSFHFnMp4eAy8lpqjpHMqwhMeJoQqQC4EUtNv4PzkF3HRVWaNiUOQb2xE2hblsKmrTv0Jmbg3T6o6QjrGEuBVbx74ENUMAGEdEOqLAL3L6SpkcdaBp62dw/DH+VAaj/QAROdnA1Ivp0DMI1Ru1nw+rNK4bNDv2fOEPy5nlElmNsa8Hpb3/WpKCm2OzIM2DbrBBdFh5UcKl8Ttpknb9zgBqCcqLM5FmdLg7Vh0/MmhrLADtPV7Y/BdkgGOPAXABgEtXeBpt9LE18FVCGz77d87ft7m0iW38rHSv/PNxWZNXTdONWSGGupNApjHMRqQ/PTmzUX8UfGhWfN5NMer+cnrH4exGrF3GB4MAAAAAElFTkSuQmCC","anger":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAYFBMVEUAAADXOyTgTCfq/PauIRLUbE4TCgnZjmbPqovOspXu7ev2nijRlHbTz67/AAD6enp/f39cIhqvERG5c3PeoI6zs2e4//vyp6Lm0GT2ql5aWVm6djLa4cV/AAD//wD//3827XwcAAAAIHRSTlMA/v4Q//X/35Ru//6oXQECAv8DA/EDEQvPA/8DSQIBAqqhodkAAAMjSURBVHja5Vdrl+IgDA0JDFD78NHReej4///lJqGtHXUKnf22m+NR2kMuSe4lIMD/YNvXX7l13d8t2+r3lYGAwi/8vyBG9oWWAGp/htNK/yuQ90RAHMnRYU1r83mHiI4g+kBw9OiOsF0LEJAjYNcA1PAQunYdc1vwkUEQXcNFbBgR2tWFbBwD8OqcxgliWJMFU+dPnICY612gC3lH7bVcBOzsQdw3KQjJJkCxIg/QyNLiv1GEQE5humIV1hq9+CtAHfS7VA1brgCq52aTILw+sxqorIRfAuAd+jc175vav60A4FrF0LCxEvgxhBBjw78RLlTIYVODwztzUJ+hJASSCqB5MMEIlEcg0YDOv/NWSfS0pWwCAXU+fvc3woPBmNMCx+gMT3wI3yRIT1kGIpqHCIYk+J3LVWGvGexeXnZWMfTDI2v5ndUcDosAF1axArwIBqA1xqJNzwoQ4DNTBC+rugo+BiebfqGqlJzAQeZqyAiuqir2+tjtEHcKVSUArmKmMykAIs9nv8qJHnrG+qiqXrWRqeI7dwJlUUKoKp8Y6GXcJyYdZVpJxFR543qPE3l97xKZxp3hmmMxzdRvrf/O3tSQ41F60TTXGHEWBcx0leOR/Ex91uKDJrFeOiCGnXATrzEPG3uxiic+TMwo4NsGmAewzKOSkOZZtRFnDnAuI8Eq63bEGTGUhqUDpk7LsWtyH6tpzYyG7udryVG1i8lnXHmGJFYvnihuitbe1JSQxhAWmpICiIfBCUd6yYSUtsnPNIwRsIBuVZ8epC7a3I9ZALSDAjR7nMYa2FIENAKYoWiSvZ3Gqi9cbMytNDTt4QMLSupMDKg0HhakrKfKJOJvW3to9nzryrXEJF58djpqBm3Rwfb8eNUAlpRMHaXet3kCoBTkbnucRHA3Gd1KkAYuZu+bzFHjny0vCL7khsI1Gir50FHY/1B20x47K9aRbWyT+cvBCNCOjQ2V89RkRMNf5dfsVDpHr93pcHZTNyy7bx/0ni/7LooHCS/6GMpKIESEmo3/JiTOqEnPVHjRvP/r9gujz/1+/3mY1jvt9xd+QfBv2h/YOR3aX0aXXAAAAABJRU5ErkJggg==","fear":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAYFBMVEUAAACdhdiVe9NwWabp+O/29PiDb7i3ydKqss6Ni7J9fX2ssLCqt8ioqfRzc7mSmbXL4OExIk2Tn7F/f/u32NMAAP9///9KOG/HvN9UO4V+tLa1w9IPCSRVR3J4hJa0/7Stm7+8AAAAIHRSTlMA/f79Ev/9WZ3uAghpBwOjUv9fAi4BAv///wmQ//9IAwx+CcwAAAOgSURBVHja3VfZduMgDAWhsNh4GWdt007//y9HYrHpCTjpvM3o9Dg2tS7iarUQ/7UgjuN4Po7j0OGPFC89X4exXOtfhzh2QZ0tmL0N4pHVGbbrnhh9FvQqLie6GCsLsTNBMwzZ9cSY0+QcCsNaABAu/COlYehlTx8FTr+9Ug6Rdgf5TejRonDKYBvhjE6j0ihOD+qMoKTEwekJ3YRVjJ7s9rOehN/MLkQpBfKEVjvpTGD08QT9dFfuZKJ+AUF3wACabBDOzW4SY4MD4g8jd1KrdXP9Fo6geB0nNy/vdR4G9M6LxLu6qo2IYH4UgVp5UQ+HUXi3zEENgr0FAW+KUGgZJKJTWEU4By9sXpOJBIg3AFoyrKVt5iqJFIXTgvw+vX47kMiMkB/YAmYBqwBBbNz7ECU+yOKBLri0Q2n8stFnCeDG9xntEA4DHNI7sRxeiSrOHQ4QDVAuA3BedceWBR0F8XaCj48V4OOzoMTWoygWAROoglthgSQAl44AEWBoA4QoIId/I/GWnoAjAfYtmLOzVv2VEnp6g6cAJhCl6E15uK2hDBQWMRr5vzsAiUSQOiUjJYRS16sOvtE6ghnx3gbAFDpx889fUa5QVibTjqMMkFCAdT+vdIWMGyJRHJ8CbFkcMlMXqwxweRVAbtu+BnCJgVRoPhbXXYCe62mxL6U/cG1TUCKe2rncC7ttxOqkS0RAUdGCF/p2OuYqSvUz1rTMIy+kKtUOJFw5zHtS9LAL4jmUzACtDnssnBBiCbIFW4HkX3ySzRsLwXSlChdAdENDvoITSj+yckjibzFhGgUBx7NfG9mmH0sxQPrbcwOKOyklumXUjwg6N+gA4ButFafehJfZBdzcFGwhsS20LCAGQ18LViqlit4GaSEHpOn6ahTSaICpiGW+yxxY/SgbM0qHkzrlvgrRblkTi33XGFD0YqL9khppAwDkPKmqDe9i0QblFnzV/WlR0BRWB/BEgkmBoHXVfM5mZID6aGxp+LlXB4wtP8zJad8ckfzCwRQZrDAQWrPVcysdybDJLTykgqwAsB8NWanbo2bXDxNXVlvmVHECciABe3wycVOqbWldjos0b/8m9f1ZPxzliI+VXco7BxsK0T3/ZCCPZmW/+LUjYfhieOXL47L2SEtPmUD6mHj6rbC1KBvHQ9MPaKMBvt3VaxInbkq8PPbsNaTGwBg+UlAgptuf6ZMN1prUyIvbv5JzpOWnMhyPuXIN5512+O/LH4P7ICaFVQO3AAAAAElFTkSuQmCC","disgust":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAYFBMVEUAAABZsl00jEYYaiVdqmFbpmf3+vl7e3vq8eua0KIYeRsA/wB9/H1ipm5nwWx7uoOFxYw4aEiMt5UgIDcugzh6tIat068vLUZPZ1x0wnh9wYUA//+kqKwfamoZoV1+yoTazL5rAAAAIHRSTlMA/f79Dp4DAvoiAwECZflYUv4d/v4u9v/+pWMB+QMEqS30K1kAAAKFSURBVHja3VfZgoMgDAwKKHjX3t3j//9yA4rSGsD2cacn1gyTkAQK8F/B9Y/WuvjYfPn2EYfEZyMQDcev3ytFhY99aFg2gYkDqqjtxUIb6h3zV0pkHoTxB+NheTnUSYJCPtkbis7MLE94XUidtIcm24BhQKxXApJuVBsBPrgUJioRaDiwsL0wP8bjUAOPCLDcDcRzo8sSiBMUcEoRqEQ6SauTWZBxSHigcRmPsz1FsSOXFPPxXgRMHlSSsTBF0h4rWbANFv1MVUXKvnM2jIKQdaIUJwdygyPFcPe6TUxAGDKVBYxywRt10RVcI7Bm08somkhuCdao+8N5FE1ll0TDMHguDJnv0B2FBgX00z1f42W8lmU5jc4Xf4Q+8DBBM5vAeClXgq9x/PIIZKSQXBaW5WrvRmc3BHgEF7H1bVa3z08jxetgR6cyZ3i90IcKWr9UsjG+DuOGABeS0yE8bW69DgMlqqMYCuAsY/vQEl5gNw2VMIV+o6EAkb1BgJ3l2f4x7UhpQ9cl1IsTNdbhPgV5yIdFQb6LQIGmYpDZbpa2b5uNAKml2EGQW5FtoKs0NhHwleVkNJA6n1sC1VPw9CKc3ZEydh60HfzQ7aAQNoyUC8eZIMOP4ElpTmY6COjU9AO+83BXlEq5QFEhyLEKpJKx4wVA31rFRALmeYbhn28LSpgba76d3ITvhk0nvT33tHpEs+ugfAAl6CB08L33sN+TW3t8Y/ZL88mNdm0B9U4CqDQ4q99fsQiQsBuY1e2ymYtQAUZPvHOHP1Scq2gzD6bUNC8UD7fdvOGAIajsJnHCWblV854H9p/XQdxONmsldLfbHd5TMCd84f7GfYK6XnZhrisO/xd/upIYcJ/J7qYAAAAASUVORK5CYII="};
// Never leave the mascot blank while the next animation frame is being decoded.
// The packaged first frame is rendered immediately and retained as the native fallback.
export function AnimatedMascotFrames({frames,size,label}:{frames:import('react-native').ImageSourcePropType[];size:number;label:string}){
 const [frame,setFrame]=useState(0);
 const [ready,setReady]=useState(false);
 const [active,setActive]=useState(AppState.currentState==='active');
 const [reduceMotion,setReduceMotion]=useState(false);
 useEffect(()=>{
  const a=AppState.addEventListener('change',s=>setActive(s==='active'));
  const m=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduceMotion);
  void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  return()=>{a.remove();m.remove()};
 },[]);
 useEffect(()=>{
  setFrame(0);
  setReady(false);
 },[frames]);
 useEffect(()=>{
  if(!ready||!active||reduceMotion||frames.length<2)return;
  const timer=setInterval(()=>setFrame(i=>(i+1)%frames.length),1000/MASCOT_FPS);
  return()=>clearInterval(timer);
 },[frames,ready,active,reduceMotion]);
 if(!frames.length)return null;
 const first=frames[0];
 return <Image source={frames[frame]} defaultSource={first}
  onLoad={()=>{if(!ready)setReady(true)}}
  fadeDuration={0}
  style={{width:size,height:size}} resizeMode="contain" accessibilityLabel={label}/>;
}
export default function MoodMascot({mood,size=102}:{mood?:string|null;size?:number}){
 const emotion=moodToEmotion(mood);
 const frames=MASCOT_FRAMES[emotion]||[];
 if(frames.length)return <AnimatedMascotFrames key={emotion} frames={frames} size={size} label={emotion+' mood mascot'}/>;
 return <Image source={{uri:imageData[emotion]}} style={{width:size,height:size}} resizeMode="contain" accessibilityLabel={emotion+' mood mascot'}/>;
}
