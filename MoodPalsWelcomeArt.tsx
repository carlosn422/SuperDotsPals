import React from 'react';
import Svg,{Defs,LinearGradient,Stop,Ellipse,Path,G,Circle} from 'react-native-svg';
export default function MoodPalsWelcomeArt({width=340}:{width?:number}){
 return <Svg width={width} height={width*0.76} viewBox="0 0 360 274" accessibilityLabel="Purple and mint MoodPals smiling together">
  <Defs>
   <LinearGradient id="purple" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#F0D8FF"/><Stop offset=".57" stopColor="#B58BFA"/><Stop offset="1" stopColor="#7956DD"/></LinearGradient>
   <LinearGradient id="mint" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#D0FFE8"/><Stop offset=".55" stopColor="#72E9C8"/><Stop offset="1" stopColor="#25BDB9"/></LinearGradient>
   <LinearGradient id="purpleFoot" x1="0" y1="0" x2="0.8" y2="1"><Stop offset="0" stopColor="#D1B3FF"/><Stop offset="1" stopColor="#9372ED"/></LinearGradient>
   <LinearGradient id="mintFoot" x1="0" y1="0" x2="0.8" y2="1"><Stop offset="0" stopColor="#ACF7D8"/><Stop offset="1" stopColor="#39CFCE"/></LinearGradient>
  </Defs>
  <Circle cx="70" cy="67" r="61" fill="#F5E9FF" opacity=".47"/>
  <Circle cx="291" cy="155" r="80" fill="#E5FCF7" opacity=".55"/>
  <Ellipse cx="179" cy="247" rx="155" ry="13" fill="#7267A8" opacity=".11"/>
  <G fill="#FFCC68"><Path d="M 285 31 Q 282 8 292 6 Q 302 9 298 32 Z"/><Path d="M 325 72 Q 341 57 347 66 Q 349 73 333 84 Z"/></G>
  <G fill="#F5A4B8"><Path d="M 319 42 Q 326 21 336 29 Q 342 38 328 51 Z"/></G>
  <G fill="#8EDCF6"><Path d="M 340 108 Q 353 99 355 108 Q 355 115 341 116 Z"/><Path d="M 35 92 Q 24 77 17 85 Q 15 93 29 101 Z"/></G>
  <Path d="M 31 179 C 8 149 15 94 43 61 C 66 29 114 23 149 44 C 184 67 192 110 185 145 C 182 181 155 222 120 228 C 80 235 47 216 31 179 Z" fill="url(#purple)"/>
  <Ellipse cx="60" cy="202" rx="44" ry="29" fill="url(#purpleFoot)"/>
  <Ellipse cx="150" cy="208" rx="46" ry="30" fill="url(#purpleFoot)"/>
  <Path d="M 132 48 C 157 52 162 72 152 87 C 142 103 116 97 100 87" fill="#D1AEFF" opacity=".42"/>
  <G stroke="#39236A" strokeWidth="5" fill="none" strokeLinecap="round"><Path d="M 69 119 Q 79 106 89 119"/><Path d="M 117 117 Q 127 104 138 116"/><Path d="M 92 139 Q 105 153 118 139"/></G>
  <Ellipse cx="62" cy="141" rx="10" ry="7" fill="#FFB4DF" opacity=".8"/><Ellipse cx="145" cy="139" rx="10" ry="7" fill="#FFB4DF" opacity=".8"/>
  <Path d="M 164 211 C 151 186 156 141 171 118 C 191 91 236 81 268 101 C 302 122 318 158 310 191 C 303 225 273 241 237 243 C 199 246 175 235 164 211 Z" fill="url(#mint)"/>
  <Path d="M 222 107 C 222 83 247 75 270 82 C 288 86 301 94 301 110 C 299 125 285 133 272 124 C 254 113 234 113 222 107 Z" fill="url(#purple)"/>
  <Ellipse cx="206" cy="220" rx="34" ry="27" fill="url(#mintFoot)"/><Ellipse cx="274" cy="220" rx="34" ry="27" fill="url(#mintFoot)"/>
  <G stroke="#2A435A" strokeWidth="4.5" fill="none" strokeLinecap="round"><Path d="M 200 157 Q 210 145 221 157"/><Path d="M 251 157 Q 262 145 273 157"/><Path d="M 224 177 Q 237 189 250 177"/></G>
  <Ellipse cx="199" cy="177" rx="8" ry="6" fill="#F6A9C9" opacity=".65"/><Ellipse cx="274" cy="177" rx="8" ry="6" fill="#F6A9C9" opacity=".65"/>
 </Svg>
}