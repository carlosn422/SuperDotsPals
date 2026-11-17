// Packs a canvas into the Live Activity content state, which must fit in a ~4 KB ActivityKit push.
// Per stroke: r, g, b, width, brush, point count (2 bytes), then x, y per point on a 0–255 grid of the 1000 canvas.
// Decoded by decodeLiveStrokes() in targets/stress-widget/CircleDrawingLiveActivity.swift.
export type PackStroke={b?:string;c:string;w:number;p:number[]};
export type LiveState={v:number;bg:string;d:string};
const BRUSHES=['pen','marker','pencil','highlighter'];
const MAX_CHARS=3000;

function simplify(pts:[number,number][],tol:number):[number,number][]{
 if(pts.length<3||tol<=0)return pts;
 const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;
 const stack:[number,number][]=[[0,pts.length-1]];
 while(stack.length){
  const [a,b]=stack.pop()!;const [ax,ay]=pts[a],[bx,by]=pts[b];const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1;
  let far=-1,dist=tol;
  for(let i=a+1;i<b;i++){const d=Math.abs(dy*(pts[i][0]-ax)-dx*(pts[i][1]-ay))/len;if(d>dist){dist=d;far=i;}}
  if(far>0){keep[far]=1;stack.push([a,far],[far,b]);}
 }
 return pts.filter((_,i)=>keep[i]);
}

function bytesFor(strokes:PackStroke[],tol:number):number[]{
 const out:number[]=[];
 for(const s of strokes){
  const raw:[number,number][]=[];
  for(let i=0;i+1<s.p.length;i+=2)raw.push([s.p[i],s.p[i+1]]);
  const q=(v:number)=>Math.max(0,Math.min(255,Math.round(v*255/1000)));
  const pts:[number,number][]=[];
  for(const [x,y] of simplify(raw,tol)){const p:[number,number]=[q(x),q(y)];const l=pts[pts.length-1];if(!l||l[0]!==p[0]||l[1]!==p[1])pts.push(p);}
  if(!pts.length)continue;
  const hex=/^#?([0-9a-f]{6})$/i.exec(s.c)?.[1]??'1C2B33';const n=Math.min(pts.length,65535);
  out.push(parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),
   Math.max(1,Math.min(255,Math.round(s.w))),Math.max(0,BRUSHES.indexOf(s.b??'pen')),n>>8,n&255);
  for(let i=0;i<n;i++)out.push(pts[i][0],pts[i][1]);
 }
 return out;
}

const b64=(bytes:number[])=>{let s='';for(const x of bytes)s+=String.fromCharCode(x);return btoa(s);};

// Simplifies harder until it fits; if a huge canvas still doesn't, the newest strokes win.
export function packCanvas(strokes:PackStroke[],background:string,version:number):LiveState{
 let list=strokes;
 for(;;){
  for(const tol of [1,3,6,10,16,24]){
   const d=b64(bytesFor(list,tol));
   if(d.length<=MAX_CHARS)return {v:version,bg:background,d};
  }
  if(!list.length)return {v:version,bg:background,d:''};
  list=list.slice(Math.ceil(list.length/5));
 }
}
