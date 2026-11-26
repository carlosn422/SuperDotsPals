import fs from 'fs';
const SR=24000,DUR=2.2,N=Math.floor(SR*DUR),out=new Float32Array(N);
const hz=m=>440*2**((m-69)/12);
// soft marimba: fundamental + 4x and 9.9x overtones, mallet attack, fast decay on overtones
function note(t0,midi,vel){const f=hz(midi),s=Math.floor(t0*SR);
 for(let i=0;i<SR*1.2&&s+i<N;i++){const t=i/SR,a=Math.min(1,t/0.004);
  const v=a*(Math.exp(-t*4.2)*Math.sin(2*Math.PI*f*t)+0.22*Math.exp(-t*14)*Math.sin(2*Math.PI*f*3.98*t)+0.06*Math.exp(-t*30)*Math.sin(2*Math.PI*f*9.9*t));
  out[s+i]+=vel*v}}
const seq=[[0,72],[0.16,76],[0.32,79],[0.48,84],[1.05,72],[1.21,76],[1.37,79],[1.53,84]];
seq.forEach(([t,m],k)=>note(t,m,k%4===3?0.75:0.9));
let peak=0;for(const v of out)peak=Math.max(peak,Math.abs(v));
const g=0.32/peak,fade=Math.floor(SR*0.25);
const pcm=Buffer.alloc(N*2);for(let i=0;i<N;i++){let v=out[i]*g;if(i>N-fade)v*=(N-i)/fade;pcm.writeInt16LE(Math.round(v*32767),i*2)}
const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(SR,24);h.writeUInt32LE(SR*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);
fs.writeFileSync('ring.wav',Buffer.concat([h,pcm]));
