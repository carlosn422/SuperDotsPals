import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {Alert,Platform} from 'react-native';
import Purchases,{CustomerInfo,PurchasesPackage} from 'react-native-purchases';
import {supabase} from './supabase';

const RC_KEY=Platform.OS==='ios'?process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY||'':'';
// Without a RevenueCat key the store runs as a local preview and no purchase is made.
export const PLUS_MOCKUP=!RC_KEY;
export const PLUS_ENTITLEMENT='plus';
// Free plans see the Day view for this many days of health data; Plus also gets Week/Month and 30 days.
export const FREE_HEALTH_DAYS=7;
export const PLUS_HEALTH_DAYS=30;

export type PlusPlan='weekly'|'monthly'|'annual';
// Extra call minutes, sold as consumables from their own RevenueCat offering.
export type MinutePackId='minutes_10'|'minutes_30'|'minutes_60';
export const MINUTES_OFFERING='voice_minutes';
export const MINUTE_PACKS:{id:MinutePackId;minutes:number;price:string}[]=[{id:'minutes_10',minutes:10,price:'$0.99'},{id:'minutes_30',minutes:30,price:'$2.99'},{id:'minutes_60',minutes:60,price:'$3.99'}];
const MINUTE_PRICES=Object.fromEntries(MINUTE_PACKS.map(p=>[p.id,p.price])) as Record<MinutePackId,string>;
// RevenueCat offering for this release's prices. Older app versions keep using the current (legacy) offering.
export const PLUS_OFFERING='plus_v2';
export type PlusFeature='general'|'trends'|'customization'|'circles'|'reflections'|'family'|'health'|'hydration'|'screenBreak'|'screenTime';
export type PlusPrice={price:string;period:string;label:string;note?:string;perMonth?:string;perDay?:string};

export const PLUS_PRICES:Record<PlusPlan,PlusPrice>={
 weekly:{price:'$6.99',period:'week',label:'Weekly',perDay:'$1'},
 monthly:{price:'$12.99',period:'month',label:'Monthly',perDay:'$0.43'},
 annual:{price:'$29.99',period:'year',label:'Annual',perDay:'$0.08'},
};
const PLAN_DAYS:Record<PlusPlan,number>={weekly:7,monthly:30,annual:365};
const perDay=(price:number,currency:string,days:number)=>{
 try{return new Intl.NumberFormat(undefined,{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(price/days).replace(/[.,]00(?=\D*$)/,'')}catch{return undefined}
};

export const FEATURE_COPY:Record<PlusFeature,{title:string;body:string}>={
 general:{title:'MoodPals Plus',body:'A little more care, every day.'},
 trends:{title:'Advanced trends',body:'See 30 days of your mood, stress, sleep and fitness, with week and month views.'},
 customization:{title:'More customization',body:'Unlock extra watch colours and ways to make MoodPals yours.'},
 circles:{title:'Bigger circles',body:'Create more private groups for the people closest to you.'},
 reflections:{title:'AI reflections',body:'Get gentle reflections on your check-ins, up to 100 a month.'},
 health:{title:'Sleep & fitness history',body:'See your body and recovery from Apple Health, with up to 30 days of sleep and fitness. Free shows each day for the last 7 days.'},
 hydration:{title:'Hydration goal & reminders',body:'Set your own daily water goal and caffeine limit, and get gentle water reminders through the day. Logging stays free.'},
 screenBreak:{title:'Family Screen Break',body:'Control your child\'s screen time from your Apple Watch, and understand screen-time patterns by day, week, month and year. Try it free for 14 days.'},
 screenTime:{title:'Screen Time & Stress',body:'Track your social media time next to your stress, with a daily limit per app. Uses the same 14-day free trial as Screen Break.'},
 family:{title:'More family watches',body:'Link up to 4 family watches, each with its own mood-only profile. Free includes 1.'},
};

export const PLAN_FEATURES:{label:string;free:string|boolean;plus:string|boolean}[]=[
 {label:'Six MoodPal characters',free:true,plus:true},
 {label:'Talk time with your pal',free:false,plus:'20 min / month'},
 {label:'Mood check-ins and basic history',free:true,plus:true},
 {label:'Apple Watch app and complications',free:true,plus:true},
 {label:'Family watches (mood-only)',free:'1',plus:'Up to 4'},
 {label:'Screen Time & Stress with daily limits',free:'14 days free',plus:true},
 {label:'Family Screen Break and Screen Time Insights',free:'14 days free',plus:true},
 {label:'Advanced trends and 30-day history',free:false,plus:true},
 {label:'Sleep and fitness history',free:'7 days',plus:'30 days'},
 {label:'Hydration goal and water reminders',free:false,plus:true},
 {label:'Extra customization',free:false,plus:true},
 {label:'Private circles',free:'Friends group',plus:'Unlimited groups'},
 {label:'AI reflections',free:false,plus:'100 / month'},
];

type PlusState={
 isPlus:boolean;plusKnown:boolean;plan:PlusPlan|null;prices:Record<PlusPlan,PlusPrice>;available:PlusPlan[];plansLoaded:boolean;
 paywall:{feature:PlusFeature}|null;
 showPaywall:(feature?:PlusFeature)=>void;hidePaywall:()=>void;nestedPaywalls:number;setNestedPaywalls:React.Dispatch<React.SetStateAction<number>>;
 purchase:(plan:PlusPlan)=>Promise<boolean>;restore:()=>Promise<boolean>;resetToFree:()=>void;
 minutePrices:Record<MinutePackId,string>;buyMinutes:(id:MinutePackId)=>Promise<boolean>};
const Ctx=createContext<PlusState|null>(null);

let configured=false;
const planFor=(productId:string):PlusPlan=>/annual|year/i.test(productId)?'annual':/week/i.test(productId)?'weekly':'monthly';
const activePlan=(info:CustomerInfo):PlusPlan|null=>{
 const e=info.entitlements.active[PLUS_ENTITLEMENT];
 return e?planFor(e.productIdentifier):null;
};

export function PlusProvider({children}:{children:React.ReactNode}){
 const [plan,setPlan]=useState<PlusPlan|null>(null);
 // False until RevenueCat has reported the user's entitlement.
 const [plusKnown,setPlusKnown]=useState(PLUS_MOCKUP);
 const [prices,setPrices]=useState(PLUS_PRICES);
 const [packages,setPackages]=useState<Partial<Record<PlusPlan,PurchasesPackage>>>({});
 const [paywall,setPaywall]=useState<{feature:PlusFeature}|null>(null);
 const [minutePkgs,setMinutePkgs]=useState<Partial<Record<MinutePackId,PurchasesPackage>>>({}),[minutePrices,setMinutePrices]=useState(MINUTE_PRICES);
 const [nestedPaywalls,setNestedPaywalls]=useState(0);
 const userRef=useRef<string|null>(null);

 useEffect(()=>{
  if(PLUS_MOCKUP)return;
  let active=true;
  const apply=(info:CustomerInfo)=>{if(active){setPlan(activePlan(info));setPlusKnown(true)}};
  const sync=async(userId:string|undefined)=>{
   if(!userId||userId===userRef.current)return;
   userRef.current=userId;
   try{
    if(!configured){
     Purchases.configure({apiKey:RC_KEY,appUserID:userId});
     configured=true;
    }else{
     const {customerInfo}=await Purchases.logIn(userId);
     apply(customerInfo);
    }
    Purchases.addCustomerInfoUpdateListener(apply);
    apply(await Purchases.getCustomerInfo());
    const offerings=await Purchases.getOfferings();
    const mo=offerings.all[MINUTES_OFFERING];
    if(mo&&active){const mp:Partial<Record<MinutePackId,PurchasesPackage>>={};for(const p of mo.availablePackages)if(MINUTE_PACKS.some(x=>x.id===p.identifier))mp[p.identifier as MinutePackId]=p;setMinutePkgs(mp);setMinutePrices({...MINUTE_PRICES,...Object.fromEntries(Object.entries(mp).map(([k,v])=>[k,v!.product.priceString]))})}
    const offer=offerings.all[PLUS_OFFERING]??offerings.current;
    if(!offer||!active)return;
    const pkgs:Partial<Record<PlusPlan,PurchasesPackage>>={};
    if(offer.weekly)pkgs.weekly=offer.weekly;if(offer.monthly)pkgs.monthly=offer.monthly;if(offer.annual)pkgs.annual=offer.annual;
    setPackages(pkgs);
    const next={...PLUS_PRICES};
    (Object.keys(pkgs) as PlusPlan[]).forEach(k=>{const pr=pkgs[k]!.product;next[k]={...PLUS_PRICES[k],price:pr.priceString,perDay:perDay(pr.price,pr.currencyCode,PLAN_DAYS[k])??PLUS_PRICES[k].perDay}});
    setPrices(next);
   }catch(e:any){
    console.warn('RevenueCat sync failed:',e?.message||e);
   }
  };
  supabase.auth.getSession().then(({data})=>sync(data.session?.user.id)).catch(()=>{});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{void sync(s?.user.id)});
  return()=>{active=false;subscription.unsubscribe();if(configured)Purchases.removeCustomerInfoUpdateListener(apply)};
 },[]);

 const showPaywall=useCallback((feature:PlusFeature='general')=>setPaywall({feature}),[]);
 const hidePaywall=useCallback(()=>setPaywall(null),[]);
 const purchase=useCallback(async(p:PlusPlan)=>{
  if(PLUS_MOCKUP){setPlan(p);return true}
  const pkg=packages[p];
  if(!pkg){Alert.alert('Plans unavailable','MoodPals Plus can\'t be bought right now. Please try again later.');return false}
  try{
   const {customerInfo}=await Purchases.purchasePackage(pkg);
   const next=activePlan(customerInfo);
   setPlan(next);
   return next!==null;
  }catch(e:any){
   if(!e?.userCancelled)Alert.alert('Purchase didn\'t go through',e?.message||'Please try again.');
   return false;
  }
 },[packages]);
 const restore=useCallback(async()=>{
  if(PLUS_MOCKUP)return plan!==null;
  try{
   const next=activePlan(await Purchases.restorePurchases());
   setPlan(next);
   return next!==null;
  }catch(e:any){
   Alert.alert('Restore failed',e?.message||'Please try again.');
   return false;
  }
 },[plan]);
 const buyMinutes=useCallback(async(id:MinutePackId)=>{
  if(PLUS_MOCKUP){Alert.alert('Preview','No purchase is made in preview mode.');return false}
  const pkg=minutePkgs[id];
  if(!pkg){Alert.alert('Minutes unavailable','Extra minutes can\'t be bought right now. Please try again later.');return false}
  try{await Purchases.purchasePackage(pkg);return true}
  catch(e:any){if(!e?.userCancelled)Alert.alert('Purchase didn\'t go through',e?.message||'Please try again.');return false}
 },[minutePkgs]);
 const resetToFree=useCallback(()=>{if(PLUS_MOCKUP)setPlan(null)},[]);
 const available=useMemo(()=>Object.keys(packages) as PlusPlan[],[packages]),plansLoaded=available.length>0;
 const value=useMemo(()=>({isPlus:plan!==null,plusKnown,plan,prices,available,plansLoaded,paywall,showPaywall,hidePaywall,nestedPaywalls,setNestedPaywalls,purchase,restore,resetToFree,minutePrices,buyMinutes}),[minutePrices,buyMinutes,plan,plusKnown,prices,available,plansLoaded,paywall,showPaywall,hidePaywall,nestedPaywalls,purchase,restore,resetToFree]);
 return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlus(){
 const v=useContext(Ctx);
 if(!v)throw new Error('usePlus must be used inside PlusProvider');
 return v;
}
