import React,{useEffect,useState} from 'react';
import {Alert,Image,Modal,ScrollView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {APP_THEME as T} from './MoodMascot';
import {FEATURE_COPY,PLAN_FEATURES,PLUS_MOCKUP,PLUS_PRICES,PlusFeature,PlusPlan,usePlus} from './PlusStore';

const CALM=require('./assets/mascot-animations/disgust/preview400/frame_000.png');
const BENEFITS:{icon:React.ComponentProps<typeof Ionicons>['name'];text:string}[]=[
 {icon:'stats-chart',text:'Advanced wellness trends and full history'},
 {icon:'color-palette',text:'Extra customization for app and watch'},
 {icon:'people',text:'Expanded private circles'},
 {icon:'sparkles',text:'Up to 100 AI reflections each month'},
];
const TERMS='Payment is charged to your Apple Account when you confirm. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in your Apple Account settings.';

export function PlusPaywallSheet(){
 const {paywall,hidePaywall,purchase,restore,isPlus}=usePlus();
 const [plan,setPlan]=useState<PlusPlan>('annual');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{if(paywall)setPlan('annual')},[paywall]);
 const feature=FEATURE_COPY[paywall?.feature||'general'];
 async function buy(){
  setBusy(true);
  const ok=await purchase(plan);
  setBusy(false);
  if(ok){hidePaywall();Alert.alert('Welcome to Plus',PLUS_MOCKUP?'Preview only: no purchase was made.':'Your subscription is active.')}
 }
 async function onRestore(){
  setBusy(true);
  const ok=await restore();
  setBusy(false);
  Alert.alert(ok?'Purchases restored':'Nothing to restore',ok?'MoodPals Plus is active.':'We couldn\'t find a MoodPals Plus subscription for this Apple Account.');
  if(ok)hidePaywall();
 }
 return <Modal visible={!!paywall} animationType="slide" presentationStyle="pageSheet" onRequestClose={hidePaywall}>
  <ScrollView style={{flex:1,backgroundColor:T.background}} contentContainerStyle={s.sheet}>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={hidePaywall} style={s.close}><Ionicons name="close" size={24} color={T.muted}/></TouchableOpacity>
   <Image source={CALM} style={s.mascot} accessibilityIgnoresInvertColors/>
   <Text style={s.kicker}>MoodPals Plus</Text>
   <Text style={s.title}>{feature.title}</Text>
   <Text style={s.body}>{feature.body}</Text>
   <View style={s.card}>{BENEFITS.map(b=><View key={b.text} style={s.benefit}><View style={s.benefitIcon}><Ionicons name={b.icon} size={17} color={T.primary}/></View><Text style={s.benefitText}>{b.text}</Text></View>)}</View>
   <View style={{gap:10,alignSelf:'stretch'}}>{(['annual','monthly'] as PlusPlan[]).map(p=>{const x=PLUS_PRICES[p],on=plan===p;return <TouchableOpacity key={p} accessibilityRole="radio" accessibilityState={{checked:on}} onPress={()=>setPlan(p)} style={[s.plan,on&&s.planOn]}>
    <Ionicons name={on?'radio-button-on':'radio-button-off'} size={22} color={on?T.primary:'#B8C4BE'}/>
    <View style={{flex:1}}><Text style={s.planLabel}>{x.label}</Text><Text style={s.planSub}>{x.price} / {x.period}</Text></View>
    {x.note?<View style={s.badge}><Text style={s.badgeText}>{x.note}</Text></View>:null}
   </TouchableOpacity>})}</View>
   <TouchableOpacity accessibilityRole="button" disabled={busy||isPlus} onPress={()=>void buy()} style={[s.cta,(busy||isPlus)&&{opacity:0.6}]}><Text style={s.ctaText}>{isPlus?'You have Plus':`Continue · ${PLUS_PRICES[plan].price}/${PLUS_PRICES[plan].period}`}</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>void onRestore()}><Text style={s.restore}>Restore Purchases</Text></TouchableOpacity>
   <Text style={s.terms}>{TERMS}</Text>
   <View style={{flexDirection:'row',gap:18}}><Text style={s.link} onPress={()=>Alert.alert('Terms of Use','Link to the MoodPals Terms of Use.')}>Terms of Use</Text><Text style={s.link} onPress={()=>Alert.alert('Privacy Policy','Link to the MoodPals Privacy Policy.')}>Privacy Policy</Text></View>
   {PLUS_MOCKUP?<Text style={s.mock}>Preview: prices are proposed and no purchase is made.</Text>:null}
  </ScrollView>
 </Modal>;
}

const TRY:{feature:PlusFeature;label:string;icon:React.ComponentProps<typeof Ionicons>['name']}[]=[
 {feature:'trends',label:'Open 6-month trends',icon:'stats-chart-outline'},
 {feature:'customization',label:'Pick an extra watch colour',icon:'color-palette-outline'},
 {feature:'circles',label:'Create a second group',icon:'people-outline'},
 {feature:'reflections',label:'Get an AI reflection',icon:'sparkles-outline'},
];

export function PlusSettingsScreen({onBack,accent}:{onBack:()=>void;accent:string}){
 const {isPlus,plan,showPaywall,restore,resetToFree}=usePlus();
 return <View style={{gap:14}}>
  <TouchableOpacity style={s.back} onPress={onBack}><Ionicons name="chevron-back" size={18} color={accent}/><Text style={{color:accent,fontWeight:'800'}}>Settings</Text></TouchableOpacity>
  <View style={[s.card,{flexDirection:'row',alignItems:'center',gap:14}]}>
   <Image source={CALM} style={{width:64,height:64}}/>
   <View style={{flex:1,gap:3}}><Text style={s.planLabel}>{isPlus?'MoodPals Plus':'MoodPals Free'}</Text><Text style={s.planSub}>{isPlus&&plan?`${PLUS_PRICES[plan].label} · ${PLUS_PRICES[plan].price}/${PLUS_PRICES[plan].period}`:'No account needed to upgrade'}</Text></View>
  </View>
  <View style={s.card}>
   <View style={s.row}><Text style={[s.cell,{flex:1.6}]}/><Text style={s.head}>Free</Text><Text style={[s.head,{color:T.primary}]}>Plus</Text></View>
   {PLAN_FEATURES.map(f=><View key={f.label} style={s.row}><Text style={[s.cell,{flex:1.6}]}>{f.label}</Text><Cell v={f.free}/><Cell v={f.plus} plus/></View>)}
  </View>
  {isPlus?null:<TouchableOpacity accessibilityRole="button" onPress={()=>showPaywall('general')} style={s.cta}><Text style={s.ctaText}>Upgrade to Plus</Text></TouchableOpacity>}
  <TouchableOpacity accessibilityRole="button" onPress={()=>void restore().then(ok=>Alert.alert(ok?'Purchases restored':'Nothing to restore',ok?'MoodPals Plus is active.':'We couldn\'t find a MoodPals Plus subscription for this Apple Account.'))}><Text style={s.restore}>Restore Purchases</Text></TouchableOpacity>
  <Text style={s.terms}>Plus works without an account. You only need to sign in to sync across devices or use My Circle, and your subscription moves with you when you do.</Text>
  {PLUS_MOCKUP?<View style={[s.card,{gap:4}]}>
   <Text style={s.planLabel}>Preview premium moments</Text>
   <Text style={s.planSub}>Each opens the Plus sheet the way a Free user would see it.</Text>
   {TRY.map(t=><TouchableOpacity key={t.feature} onPress={()=>showPaywall(t.feature)} style={s.tryRow}><Ionicons name={t.icon} size={19} color={accent}/><Text style={[s.cell,{flex:1}]}>{t.label}</Text><Ionicons name="lock-closed" size={14} color={T.muted}/></TouchableOpacity>)}
   {isPlus?<TouchableOpacity onPress={resetToFree} style={s.tryRow}><Ionicons name="refresh" size={19} color="#D65B79"/><Text style={[s.cell,{color:'#D65B79'}]}>Switch back to Free (preview)</Text></TouchableOpacity>:null}
  </View>:null}
 </View>;
}

function Cell({v,plus}:{v:string|boolean;plus?:boolean}){
 if(typeof v==='string')return <Text style={[s.head,{fontWeight:'700',color:plus?T.primary:T.muted,fontSize:11}]}>{v}</Text>;
 return <View style={{flex:1,alignItems:'center'}}><Ionicons name={v?'checkmark-circle':'remove'} size={18} color={v?(plus?T.primary:'#8FCBAE'):'#C3CDC8'}/></View>;
}

const s=StyleSheet.create({
 sheet:{padding:22,paddingBottom:44,alignItems:'center',gap:14},
 close:{alignSelf:'flex-end',padding:4},
 mascot:{width:132,height:132,marginTop:-18},
 kicker:{fontSize:12,fontWeight:'900',color:T.primary,letterSpacing:1,textTransform:'uppercase'},
 title:{fontSize:26,fontWeight:'900',color:T.ink,textAlign:'center'},
 body:{fontSize:15,color:T.muted,textAlign:'center',lineHeight:21,paddingHorizontal:10},
 card:{backgroundColor:T.surface,borderRadius:20,padding:16,gap:12,alignSelf:'stretch',borderWidth:1,borderColor:T.border},
 benefit:{flexDirection:'row',alignItems:'center',gap:12},
 benefitIcon:{width:32,height:32,borderRadius:11,backgroundColor:T.primarySoft,alignItems:'center',justifyContent:'center'},
 benefitText:{flex:1,fontSize:14,fontWeight:'700',color:T.ink},
 plan:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:T.surface,borderRadius:18,padding:15,borderWidth:2,borderColor:T.border},
 planOn:{borderColor:T.primary,backgroundColor:'#F7FDF9'},
 planLabel:{fontSize:16,fontWeight:'900',color:T.ink},
 planSub:{fontSize:13,color:T.muted,marginTop:2},
 badge:{backgroundColor:T.primary,borderRadius:10,paddingHorizontal:9,paddingVertical:4},
 badgeText:{color:'#fff',fontSize:11,fontWeight:'900'},
 cta:{alignSelf:'stretch',backgroundColor:T.primary,borderRadius:28,paddingVertical:16,alignItems:'center'},
 ctaText:{color:'#fff',fontSize:16,fontWeight:'900'},
 restore:{color:T.primary,fontWeight:'800',fontSize:14,textAlign:'center',padding:4},
 terms:{fontSize:11,color:T.muted,textAlign:'center',lineHeight:16},
 link:{fontSize:12,color:T.ink,fontWeight:'700',textDecorationLine:'underline'},
 mock:{fontSize:11,color:'#B07A9B',fontWeight:'700',textAlign:'center'},
 back:{flexDirection:'row',alignItems:'center',gap:4,marginBottom:4},
 row:{flexDirection:'row',alignItems:'center',gap:6},
 head:{flex:1,textAlign:'center',fontSize:13,fontWeight:'900',color:T.muted},
 cell:{fontSize:13,color:T.ink,fontWeight:'600'},
 tryRow:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10,borderTopWidth:1,borderTopColor:T.border},
});
