import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {Alert,Platform} from 'react-native';
import Purchases,{CustomerInfo,PurchasesPackage} from 'react-native-purchases';
import {supabase} from './supabase';

const RC_KEY=Platform.OS==='ios'?process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY||'':'';
// Without a RevenueCat key the store runs as a local preview and no purchase is made.
export const PLUS_MOCKUP=!RC_KEY;
export const PLUS_ENTITLEMENT='plus';

export type PlusPlan='monthly'|'annual';
export type PlusFeature='general'|'trends'|'customization'|'circles'|'reflections';
export type PlusPrice={price:string;period:string;label:string;note?:string};

export const PLUS_PRICES:Record<PlusPlan,PlusPrice>={
 monthly:{price:'$1.99',period:'month',label:'Monthly'},
 annual:{price:'$19.99',period:'year',label:'Yearly',note:'Save 16%'},
};

export const FEATURE_COPY:Record<PlusFeature,{title:string;body:string}>={
 general:{title:'MoodPals Plus',body:'A little more care, every day.'},
 trends:{title:'Advanced trends',body:'See your mood and stress history over months, not just this week.'},
 customization:{title:'More customization',body:'Unlock extra watch colours and ways to make MoodPals yours.'},
 circles:{title:'Bigger circles',body:'Create more private groups for the people closest to you.'},
 reflections:{title:'AI reflections',body:'Get gentle reflections on your check-ins, up to 100 a month.'},
};

export const PLAN_FEATURES:{label:string;free:string|boolean;plus:string|boolean}[]=[
 {label:'Six MoodPal characters',free:true,plus:true},
 {label:'Mood check-ins and basic history',free:true,plus:true},
 {label:'Apple Watch app and complications',free:true,plus:true},
 {label:'Advanced trends and full history',free:false,plus:true},
 {label:'Extra customization',free:false,plus:true},
 {label:'Private circles',free:'1 group',plus:'Expanded'},
 {label:'AI reflections',free:false,plus:'100 / month'},
];

type PlusState={
 isPlus:boolean;plan:PlusPlan|null;prices:Record<PlusPlan,PlusPrice>;
 paywall:{feature:PlusFeature}|null;
 showPaywall:(feature?:PlusFeature)=>void;hidePaywall:()=>void;
 purchase:(plan:PlusPlan)=>Promise<boolean>;restore:()=>Promise<boolean>;resetToFree:()=>void;
};
const Ctx=createContext<PlusState|null>(null);

let configured=false;
const planFor=(productId:string):PlusPlan=>/annual|year/i.test(productId)?'annual':'monthly';
const activePlan=(info:CustomerInfo):PlusPlan|null=>{
 const e=info.entitlements.active[PLUS_ENTITLEMENT];
 return e?planFor(e.productIdentifier):null;
};

export function PlusProvider({children}:{children:React.ReactNode}){
 const [plan,setPlan]=useState<PlusPlan|null>(null);
 const [prices,setPrices]=useState(PLUS_PRICES);
 const [packages,setPackages]=useState<Partial<Record<PlusPlan,PurchasesPackage>>>({});
 const [paywall,setPaywall]=useState<{feature:PlusFeature}|null>(null);
 const userRef=useRef<string|null>(null);

 useEffect(()=>{
  if(PLUS_MOCKUP)return;
  let active=true;
  const apply=(info:CustomerInfo)=>{if(active)setPlan(activePlan(info))};
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
    const current=(await Purchases.getOfferings()).current;
    if(!current||!active)return;
    const monthly=current.monthly,annual=current.annual;
    setPackages({...(monthly?{monthly}:{}),...(annual?{annual}:{})});
    const save=monthly&&annual&&monthly.product.price>0?Math.round((1-annual.product.price/(monthly.product.price*12))*100):0;
    setPrices({
     monthly:{...PLUS_PRICES.monthly,price:monthly?.product.priceString??PLUS_PRICES.monthly.price},
     annual:{...PLUS_PRICES.annual,price:annual?.product.priceString??PLUS_PRICES.annual.price,note:save>0?`Save ${save}%`:undefined},
    });
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
 const resetToFree=useCallback(()=>{if(PLUS_MOCKUP)setPlan(null)},[]);
 const value=useMemo(()=>({isPlus:plan!==null,plan,prices,paywall,showPaywall,hidePaywall,purchase,restore,resetToFree}),[plan,prices,paywall,showPaywall,hidePaywall,purchase,restore,resetToFree]);
 return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlus(){
 const v=useContext(Ctx);
 if(!v)throw new Error('usePlus must be used inside PlusProvider');
 return v;
}
