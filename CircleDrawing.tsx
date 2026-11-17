import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Modal,PanResponder,Text,TouchableOpacity,View,useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg,{Path,Rect} from 'react-native-svg';
import {Ionicons,MaterialCommunityIcons} from '@expo/vector-icons';
import {supabase} from './supabase';
import {usePlus} from './PlusStore';
import {PlusPaywallSheet} from './PlusPaywall';
import {timeAgo} from './LittleSignalsData';
import {Avatar,CCard,CHeading,CRow,CT,EmptyState,PrimaryButton,SoftButton,ToggleRow,cs} from './CircleComponents';
import {BACKGROUNDS,BRUSHES,Brush,CANVAS,CanvasData,CanvasDiff,CircleCanvas,EMPTY_DIFF,FREE_COLORS,FREE_PUBLISHES,FREE_WIDTH,PLUS_COLORS,Stroke,WIDTHS,
 applyDiffs,brushOpacity,clearCanvas,diffIsEmpty,leaveGroup,loadCanvas,newId,publishCanvas,refreshCircleDrawing,setCanvasEnabled,setWidgetCanvas,useCircleDrawing} from './CircleDrawingStore';

type Nav={push:(r:any)=>void;back:()=>void};
const initials=(n:string)=>n.trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()||'?';

export function strokePath(p:number[],k:number){
 const f=(v:number)=>(v*k).toFixed(1);
 if(p.length<4)return `M${f(p[0])} ${f(p[1])} L${f(p[0]+.1)} ${f(p[1])}`;
 let d=`M${f(p[0])} ${f(p[1])}`;
 for(let i=2;i<p.length-2;i+=2)d+=` Q${f(p[i])} ${f(p[i+1])} ${f((p[i]+p[i+2])/2)} ${f((p[i+1]+p[i+3])/2)}`;
 return d+` L${f(p[p.length-2])} ${f(p[p.length-1])}`;
}

// The artwork only: background color and strokes, nothing drawn on top.
export function DrawingArt({data,size,extra=[]}:{data?:CanvasData;size:number;extra?:Stroke[]}){
 const k=size/CANVAS;
 return <Svg width={size} height={size}>
  <Rect x={0} y={0} width={size} height={size} fill={data?.background||'#FFFFFF'}/>
  {[...(data?.strokes||[]),...extra].map(s=><Path key={s.id} d={strokePath(s.p,k)} stroke={s.c} strokeOpacity={brushOpacity(s.b)} strokeWidth={Math.max(1,s.w*k)} strokeLinecap="round" strokeLinejoin="round" fill="none"/>)}
 </Svg>;
}

// Splits every stroke the eraser touches into the pieces outside it.
function eraseAt(strokes:Stroke[],x:number,y:number,r:number){
 const hit:Stroke[]=[];const pieces:Stroke[]=[];
 for(const s of strokes){
  const rr=(r+s.w/2)**2;
  const inside=(i:number)=>(s.p[i]-x)**2+(s.p[i+1]-y)**2<=rr;
  let any=false;for(let i=0;i<s.p.length;i+=2)if(inside(i)){any=true;break;}
  if(!any)continue;
  hit.push(s);let run:number[]=[];
  const flush=()=>{if(run.length)pieces.push({...s,id:newId(),p:run});run=[];};
  for(let i=0;i<s.p.length;i+=2){if(inside(i))flush();else run.push(s.p[i],s.p[i+1]);}
  flush();
 }
 return {hit,pieces};
}
function eraseDiff(base:CanvasData|undefined,diff:CanvasDiff,x:number,y:number,r:number):CanvasDiff{
 const {hit,pieces}=eraseAt(applyDiffs(base,[diff]).strokes,x,y,r);
 if(!hit.length)return diff;
 const mine=new Set(diff.add.map(s=>s.id));const gone=new Set(hit.map(s=>s.id));
 return {...diff,remove:[...diff.remove,...hit.filter(s=>!mine.has(s.id)).map(s=>s.id)],add:[...diff.add.filter(s=>!gone.has(s.id)),...pieces]};
}

type Tool='pen'|'eraser';type Panel=null|'pen'|'color';
export function DrawingCanvasModal({canvas,visible,onClose}:{canvas:CircleCanvas;visible:boolean;onClose:()=>void}){
 const {isPlus,showPaywall}=usePlus();
 const st=useCircleDrawing();const base=st.data[canvas.groupId];
 const {width,height}=useWindowDimensions();
 const size=Math.max(200,Math.min(width-32,height-300));
 const [diff,setDiff]=useState<CanvasDiff>(EMPTY_DIFF);
 const [undo,setUndo]=useState<CanvasDiff[]>([]);
 const [tool,setTool]=useState<Tool>('pen');
 const [panel,setPanel]=useState<Panel>(null);
 const [brush,setBrush]=useState<Brush>('pen');
 const [color,setColor]=useState(FREE_COLORS[0]);
 const [strokeWidth,setStrokeWidth]=useState(FREE_WIDTH);
 const [current,setCurrent]=useState<Stroke|null>(null);
 const [others,setOthers]=useState<Record<string,{name:string;diff:CanvasDiff;at:number}>>({});
 const [saving,setSaving]=useState(false);
 const ref=useRef({diff,tool,brush,color,strokeWidth,base,current:null as Stroke|null,last:null as null|[number,number],sentAt:0,timer:undefined as any});
 ref.current={...ref.current,diff,tool,brush,color,strokeWidth,base};
 const channel=useRef<ReturnType<typeof supabase.channel>|null>(null);
 const me=st.me||'';const myName=canvas.members.find(m=>m.id===me)?.name||'Friend';

 useEffect(()=>{
  if(!visible)return;
  setDiff(EMPTY_DIFF);setUndo([]);setPanel(null);setOthers({});setCurrent(null);
  void loadCanvas(canvas.groupId);
  const ch=supabase.channel('drawing:'+canvas.groupId,{config:{private:true,broadcast:{self:false}}})
   .on('broadcast',{event:'canvas'},()=>void loadCanvas(canvas.groupId))
   .on('broadcast',{event:'draft'},({payload})=>{if(payload?.u&&payload.u!==me)setOthers(o=>({...o,[payload.u]:{name:payload.name||'Friend',diff:payload.diff,at:Date.now()}}))})
   .on('broadcast',{event:'leave'},({payload})=>setOthers(o=>{const n={...o};delete n[payload?.u];return n}))
   .subscribe();
  channel.current=ch;
  const prune=setInterval(()=>setOthers(o=>Object.fromEntries(Object.entries(o).filter(([,v])=>Date.now()-v.at<90000))),15000);
  return()=>{clearInterval(prune);clearTimeout(ref.current.timer);void ch.send({type:'broadcast',event:'leave',payload:{u:me}});void supabase.removeChannel(ch);channel.current=null;};
 },[visible,canvas.groupId]);

 // Share my in-progress drawing so everyone in the canvas sees it live.
 const sendDraft=()=>{
  const r=ref.current;clearTimeout(r.timer);
  const wait=80-(Date.now()-r.sentAt);
  if(wait>0){r.timer=setTimeout(sendDraft,wait);return;}
  r.sentAt=Date.now();
  const d=r.current?{...r.diff,add:[...r.diff.add,r.current]}:r.diff;
  void channel.current?.send({type:'broadcast',event:'draft',payload:{u:me,name:myName,diff:d}});
 };
 useEffect(()=>{if(visible)sendDraft()},[diff]);

 const change=(next:CanvasDiff)=>{setUndo(u=>[...u.slice(-49),ref.current.diff]);setDiff(next);};
 const point=(e:any):[number,number]=>{
  const k=CANVAS/size;
  return [Math.round(Math.min(CANVAS,Math.max(0,e.nativeEvent.locationX*k))),Math.round(Math.min(CANVAS,Math.max(0,e.nativeEvent.locationY*k)))];
 };
 const erase=(x:number,y:number)=>{
  const r=ref.current;const [lx,ly]=r.last||[x,y];const steps=Math.max(1,Math.ceil(Math.hypot(x-lx,y-ly)/10));
  let d=r.diff;for(let i=1;i<=steps;i++)d=eraseDiff(r.base,d,lx+(x-lx)*i/steps,ly+(y-ly)*i/steps,22);
  r.last=[x,y];if(d!==r.diff){r.diff=d;setDiff(d);}
 };
 const responder=useMemo(()=>PanResponder.create({
  onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,onPanResponderTerminationRequest:()=>false,
  onPanResponderGrant:e=>{
   setPanel(null);const r=ref.current;const [x,y]=point(e);r.last=[x,y];
   setUndo(u=>[...u.slice(-49),r.diff]);
   if(r.tool==='eraser'){erase(x,y);return;}
   r.current={id:newId(),b:r.brush,c:r.color,w:r.strokeWidth,p:[x,y]};setCurrent(r.current);sendDraft();
  },
  onPanResponderMove:(e,g)=>{
   if(g.numberActiveTouches>1)return;
   const r=ref.current;const [x,y]=point(e);
   if(r.tool==='eraser'){erase(x,y);return;}
   if(!r.current||r.current.p.length>=3998)return;
   const [lx,ly]=r.last||[x,y];if(Math.hypot(x-lx,y-ly)<2)return;
   r.last=[x,y];r.current={...r.current,p:[...r.current.p,x,y]};setCurrent(r.current);sendDraft();
  },
  onPanResponderRelease:()=>{
   const r=ref.current;r.last=null;
   if(r.tool==='pen'&&r.current){const s=r.current;r.current=null;setCurrent(null);r.diff={...r.diff,add:[...r.diff.add,s]};setDiff(r.diff);}
  },
  onPanResponderTerminate:()=>{const r=ref.current;r.last=null;r.current=null;setCurrent(null);},
 }),[size]);

 const shown=useMemo(()=>applyDiffs(base,[...Object.values(others).map(o=>o.diff),diff]),[base,others,diff]);
 const drawingNow=Object.values(others).filter(o=>!diffIsEmpty(o.diff));
 const locked=()=>{setPanel(null);showPaywall('drawing');};
 const done=async()=>{
  if(saving)return;
  if(diffIsEmpty(diff)){onClose();return;}
  if(!isPlus&&st.publishesLeft===0){
   Alert.alert('You’ve shared '+FREE_PUBLISHES+' drawings today','Free includes '+FREE_PUBLISHES+' shares a day. MoodPals Plus includes unlimited drawing.',[
    {text:'Keep Drawing',style:'cancel'},{text:'Discard',style:'destructive',onPress:onClose},{text:'See Plus',onPress:()=>showPaywall('drawing')}]);
   return;
  }
  setSaving(true);
  const err=await publishCanvas(canvas.groupId,diff);
  setSaving(false);
  if(!err){onClose();return;}
  if(/Plus/.test(err))Alert.alert('MoodPals Plus',err,[{text:'Not Now',style:'cancel'},{text:'See Plus',onPress:()=>showPaywall('drawing')}]);
  else Alert.alert('Couldn’t share your drawing',err);
 };

 const toolButton=(label:string,icon:any,on:boolean,onPress:()=>void,disabled?:boolean,dot?:string)=><TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:on,disabled}} disabled={disabled} onPress={onPress}
  style={{flex:1,alignItems:'center',gap:3,paddingVertical:8,borderRadius:16,backgroundColor:on?CT.primarySoft:'transparent',opacity:disabled?.35:1}}>
  {dot?<View style={{width:24,height:24,borderRadius:12,backgroundColor:dot,borderWidth:2,borderColor:dot.toUpperCase()==='#FFFFFF'?CT.border:'#fff',shadowColor:'#000',shadowOpacity:.15,shadowRadius:2,shadowOffset:{width:0,height:1}}}/>
   :<MaterialCommunityIcons name={icon} size={24} color={on?CT.primary:CT.ink}/>}
  <Text style={{fontSize:11,fontWeight:'800',color:on?CT.primary:CT.ink}}>{label}</Text>
 </TouchableOpacity>;
 const swatch=(c:string,on:boolean,lockedSwatch:boolean,onPress:()=>void,label:string)=><TouchableOpacity key={label+c} accessibilityRole="button" accessibilityLabel={label+(lockedSwatch?', MoodPals Plus':'')} accessibilityState={{selected:on}} onPress={lockedSwatch?locked:onPress}
  style={{width:34,height:34,borderRadius:17,backgroundColor:c,borderWidth:on?3:1.5,borderColor:on?CT.primary:c.toUpperCase()==='#FFFFFF'?CT.border:'#fff',alignItems:'center',justifyContent:'center'}}>
  {lockedSwatch?<Ionicons name="lock-closed" size={12} color={['#FFFFFF','#FFF7E6','#FDECEF','#E4F6EA','#E6F0FF','#F1EAFE','#FFF3C4','#FACC15','#A3E635'].includes(c.toUpperCase())?CT.muted:'#fff'}/>:null}
 </TouchableOpacity>;

 return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={done}>
  <SafeAreaView style={{flex:1,backgroundColor:CT.background}}>
   <View style={{paddingHorizontal:16,paddingTop:8,paddingBottom:12,alignItems:'center',gap:2}}>
    <Text style={[cs.heading,{fontSize:18}]} accessibilityRole="header" numberOfLines={1}>{canvas.name}</Text>
    <Text style={cs.muted}>{drawingNow.length?drawingNow.map(o=>o.name).join(', ')+(drawingNow.length===1?' is drawing':' are drawing'):isPlus?'Draw together':(st.publishesLeft??FREE_PUBLISHES)+' of '+FREE_PUBLISHES+' shares left today'}</Text>
   </View>
   <View style={{alignItems:'center'}}>
    <View {...responder.panHandlers} accessibilityLabel="Drawing canvas" style={{width:size,height:size,borderRadius:23,overflow:'hidden',backgroundColor:shown.background,shadowColor:'#4A268A',shadowOpacity:.06,shadowRadius:12,shadowOffset:{width:0,height:4}}}>
     <View pointerEvents="none"><DrawingArt data={shown} size={size} extra={current?[current]:[]}/></View>
     {!base?<View pointerEvents="none" style={{position:'absolute',top:0,left:0,right:0,bottom:0,alignItems:'center',justifyContent:'center'}}><ActivityIndicator color={CT.primary}/></View>:null}
    </View>
   </View>
   <View style={{flex:1}}/>
   {panel==='pen'?<CCard style={{marginHorizontal:16,marginBottom:8,gap:12}}>
    <View style={{flexDirection:'row',gap:8}}>{BRUSHES.map(b=>{const lock=!isPlus&&b.id!=='pen';return <TouchableOpacity key={b.id} accessibilityRole="button" accessibilityLabel={b.label+(lock?', MoodPals Plus':'')} accessibilityState={{selected:brush===b.id}}
     onPress={lock?locked:()=>{setBrush(b.id);setStrokeWidth(b.width);setTool('pen');}} style={{flex:1,alignItems:'center',gap:3,paddingVertical:8,borderRadius:14,backgroundColor:brush===b.id?CT.primarySoft:CT.background}}>
     <MaterialCommunityIcons name={b.icon as any} size={22} color={brush===b.id?CT.primary:CT.ink}/><Text style={{fontSize:11,fontWeight:'800',color:CT.ink}}>{b.label}</Text>
     {lock?<Ionicons name="lock-closed" size={10} color={CT.muted} style={{position:'absolute',top:6,right:8}}/>:null}
    </TouchableOpacity>})}</View>
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>{WIDTHS.map(w=>{const lock=!isPlus&&w!==FREE_WIDTH;const on=strokeWidth===w;return <TouchableOpacity key={w} accessibilityRole="button" accessibilityLabel={'Brush size '+w+(lock?', MoodPals Plus':'')} accessibilityState={{selected:on}}
     onPress={lock?locked:()=>{setStrokeWidth(w);setTool('pen');}} style={{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:on?CT.primarySoft:'transparent',opacity:lock?.45:1}}>
     <View style={{width:Math.max(4,w*.75),height:Math.max(4,w*.75),borderRadius:20,backgroundColor:color.toUpperCase()==='#FFFFFF'?CT.muted:color}}/>
    </TouchableOpacity>})}</View>
    {!isPlus?<Text style={[cs.muted,{textAlign:'center'}]}>More brushes and sizes come with MoodPals Plus.</Text>:null}
   </CCard>:null}
   {panel==='color'?<CCard style={{marginHorizontal:16,marginBottom:8,gap:10}}>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
     {FREE_COLORS.map(c=>swatch(c,color===c,false,()=>{setColor(c);setTool('pen');},'Color'))}
     {PLUS_COLORS.map(c=>swatch(c,color===c,!isPlus,()=>{setColor(c);setTool('pen');},'Color'))}
    </View>
    <Text style={cs.rowTitle}>Background</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{BACKGROUNDS.map(c=>swatch(c,shown.background.toUpperCase()===c,!isPlus&&c!=='#FFFFFF',()=>{if(shown.background.toUpperCase()!==c)change({...diff,background:c});},'Background'))}</View>
    {!isPlus?<Text style={[cs.muted,{textAlign:'center'}]}>More colors and backgrounds come with MoodPals Plus.</Text>:null}
   </CCard>:null}
   <View style={[cs.card,{marginHorizontal:16,marginBottom:12,paddingVertical:6,paddingHorizontal:6,flexDirection:'row',gap:4}]}>
    {toolButton(BRUSHES.find(b=>b.id===brush)?.label||'Pen',BRUSHES.find(b=>b.id===brush)?.icon||'pen',tool==='pen',()=>{if(tool==='pen')setPanel(p=>p==='pen'?null:'pen');else{setTool('pen');setPanel(null);}})}
    {toolButton('Color','',panel==='color',()=>setPanel(p=>p==='color'?null:'color'),false,color)}
    {toolButton('Eraser','eraser',tool==='eraser',()=>{setTool('eraser');setPanel(null);})}
    {toolButton('Undo','undo',false,()=>{setPanel(null);setUndo(u=>{if(!u.length)return u;setDiff(u[u.length-1]);return u.slice(0,-1);});},!undo.length)}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Done" onPress={done} style={{flex:1.2,alignItems:'center',justifyContent:'center',borderRadius:16,backgroundColor:CT.primary}}>
     {saving?<ActivityIndicator color="#fff"/>:<><Ionicons name="checkmark" size={24} color="#fff"/><Text style={{fontSize:11,fontWeight:'900',color:'#fff'}}>Done</Text></>}
    </TouchableOpacity>
   </View>
  </SafeAreaView>
  {visible?<PlusPaywallSheet nested/>:null}
 </Modal>;
}

function Thumb({c,size=52}:{c:CircleCanvas;size?:number}){
 const st=useCircleDrawing();const data=st.data[c.groupId];
 useEffect(()=>{if(!data||data.version<c.version)void loadCanvas(c.groupId)},[c.groupId,c.version]);
 return <View style={{width:size,height:size,borderRadius:14,overflow:'hidden',borderWidth:1,borderColor:CT.border}}><DrawingArt data={data} size={size}/></View>;
}
const updatedLine=(c:CircleCanvas)=>c.updatedAt?'Updated '+timeAgo(c.updatedAt)+(c.updatedBy?' by '+(c.members.find(m=>m.id===c.updatedBy)?.name||'a friend'):''):'Nothing drawn yet';

// Circle → Drawing: every group with its canvas turned on.
export function CircleDrawingList({nav}:{nav:Nav}){
 const st=useCircleDrawing();
 useEffect(()=>{void refreshCircleDrawing()},[]);
 if(!st.loaded)return <ActivityIndicator color={CT.primary} style={{marginTop:30}}/>;
 return <>
  <Text style={[cs.muted,{fontSize:14,textAlign:'center'}]}>Draw and write together on a shared canvas.</Text>
  {st.canvases.length?<CCard style={{paddingVertical:4}}>{st.canvases.map((c,i)=><CRow key={c.groupId} last={i===st.canvases.length-1} leading={<Thumb c={c}/>} title={c.name+(c.isOwner?'':' · '+(c.members.find(m=>m.owner)?.name||'Friend'))}
   subtitle={updatedLine(c)} onPress={()=>nav.push({name:'drawing',id:c.groupId})} right={c.isWidget?<View style={{flexDirection:'row',alignItems:'center',gap:3}}><Ionicons name="apps" size={13} color={CT.primary}/><Text style={{fontSize:11,fontWeight:'800',color:CT.primary}}>Widget</Text></View>:<Ionicons name="chevron-forward" size={18} color={CT.muted}/>}/>)}</CCard>
  :<EmptyState mood="Calm" title="No shared canvases yet" detail="Turn on Shared Canvas in one of your groups to start drawing together. Canvases friends share with you show up here too." action="Choose a Group" onAction={()=>nav.push({name:'groups'})}/>}
  {st.canvases.length?<SoftButton label="Add a Canvas to a Group" icon="add" onPress={()=>nav.push({name:'groups'})}/>:null}
 </>;
}

export function CircleDrawingScreen({id,nav}:{id:string;nav:Nav}){
 const st=useCircleDrawing();const c=st.canvases.find(x=>x.groupId===id);
 const {width}=useWindowDimensions();
 const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);
 useEffect(()=>{void refreshCircleDrawing();void loadCanvas(id)},[id]);
 if(!c)return st.loaded?<EmptyState mood="Sad" title="This canvas isn’t available" detail="The owner may have turned it off, or you’re no longer in this group."/>:<ActivityIndicator color={CT.primary} style={{marginTop:30}}/>;
 const run=(f:()=>Promise<unknown>,after?:()=>void)=>{setBusy(true);f().then(()=>after?.()).catch(e=>Alert.alert('Something went wrong',String(e?.message||e))).finally(()=>setBusy(false));};
 const size=Math.min(width-64,420);
 return <>
  <CCard style={{alignItems:'center',gap:12}}>
   <Text style={[cs.heading,{fontSize:18}]}>{c.name}</Text>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Open '+c.name+' canvas'} onPress={()=>setOpen(true)} style={{borderRadius:20,overflow:'hidden',borderWidth:1,borderColor:CT.border}}>
    <DrawingArt data={st.data[id]} size={size}/>
   </TouchableOpacity>
   <Text style={cs.muted}>{updatedLine(c)}</Text>
   <View style={{alignSelf:'stretch'}}><PrimaryButton label="Draw Together" icon="brush-outline" onPress={()=>setOpen(true)}/></View>
  </CCard>
  <CCard style={{paddingVertical:4}}>
   <ToggleRow title="Show on my widget" subtitle="Your Home Screen and Lock Screen drawing widgets use one Circle. This doesn’t change anyone else’s widget." value={c.isWidget} onChange={v=>run(()=>setWidgetCanvas(v?id:null))} last/>
  </CCard>
  <CHeading title={'Members ('+c.members.length+')'}/>
  <CCard style={{paddingVertical:4}}>{c.members.map((m,i)=><CRow key={m.id} last={i===c.members.length-1} leading={<Avatar initials={initials(m.name)} color={m.color} size={34}/>} title={m.name+(m.id===st.me?' (you)':'')} subtitle={m.owner?'Owner':undefined}/>)}</CCard>
  {c.isOwner?<>
   <SoftButton label="Manage Members" icon="people-outline" onPress={()=>nav.push({name:'group',id})}/>
   <SoftButton label="Clear Canvas" icon="refresh-outline" disabled={busy} onPress={()=>Alert.alert('Clear the canvas?','This erases the drawing for everyone in '+c.name+'.',[{text:'Cancel',style:'cancel'},{text:'Clear',style:'destructive',onPress:()=>run(()=>clearCanvas(id))}])}/>
   <SoftButton danger label="Turn Off Canvas" icon="close-circle-outline" disabled={busy} onPress={()=>Alert.alert('Turn off the canvas?','The drawing is removed for everyone. The group itself stays.',[{text:'Cancel',style:'cancel'},{text:'Turn Off',style:'destructive',onPress:()=>run(()=>setCanvasEnabled(id,false),nav.back)}])}/>
  </>:<SoftButton danger label="Leave Group" icon="exit-outline" disabled={busy} onPress={()=>Alert.alert('Leave '+c.name+'?','Your drawings stay on the canvas. You’ll stay friends with everyone.',[{text:'Cancel',style:'cancel'},{text:'Leave',style:'destructive',onPress:()=>run(()=>leaveGroup(id),nav.back)}])}/>}
  <DrawingCanvasModal canvas={c} visible={open} onClose={()=>setOpen(false)}/>
 </>;
}

// Group owner's switch, shown on the existing group screen.
export function CanvasToggleCard({groupId,onOpen}:{groupId:string;onOpen:()=>void}){
 const st=useCircleDrawing();const on=st.canvases.some(c=>c.groupId===groupId&&c.isOwner);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{if(!st.loaded)void refreshCircleDrawing()},[]);
 const set=(v:boolean)=>{
  const go=()=>{setBusy(true);setCanvasEnabled(groupId,v).catch(e=>Alert.alert('Something went wrong',String(e?.message||e))).finally(()=>setBusy(false));};
  if(v)Alert.alert('Turn on Shared Canvas?','Members will see this group’s name and who’s in it, and can draw together.',[{text:'Cancel',style:'cancel'},{text:'Turn On',onPress:go}]);
  else Alert.alert('Turn off Shared Canvas?','The drawing is removed for everyone.',[{text:'Cancel',style:'cancel'},{text:'Turn Off',style:'destructive',onPress:go}]);
 };
 return <CCard style={{paddingVertical:4}}>
  <ToggleRow title="Shared Canvas" subtitle="An optional canvas for drawing and handwritten notes together." value={on} onChange={v=>!busy&&set(v)} last={!on}/>
  {on?<CRow icon="brush-outline" title="Open Canvas" subtitle="Draw, then set it as your widget" onPress={onOpen} last/>:null}
 </CCard>;
}
