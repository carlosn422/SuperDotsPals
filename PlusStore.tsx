import React,{createContext,useCallback,useContext,useMemo,useState} from 'react';

// Mockup stage: prices are proposals pending owner approval and no StoreKit/RevenueCat call is made.
export const PLUS_MOCKUP=true;

export type PlusPlan='monthly'|'annual';
export type PlusFeature='general'|'trends'|'customization'|'circles'|'reflections';

export const PLUS_PRICES:Record<PlusPlan,{price:string;period:string;label:string;note?:string}>={
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
 isPlus:boolean;plan:PlusPlan|null;
 paywall:{feature:PlusFeature}|null;
 showPaywall:(feature?:PlusFeature)=>void;hidePaywall:()=>void;
 purchase:(plan:PlusPlan)=>Promise<boolean>;restore:()=>Promise<boolean>;resetToFree:()=>void;
};
const Ctx=createContext<PlusState|null>(null);

export function PlusProvider({children}:{children:React.ReactNode}){
 const [plan,setPlan]=useState<PlusPlan|null>(null);
 const [paywall,setPaywall]=useState<{feature:PlusFeature}|null>(null);
 const showPaywall=useCallback((feature:PlusFeature='general')=>setPaywall({feature}),[]);
 const hidePaywall=useCallback(()=>setPaywall(null),[]);
 const purchase=useCallback(async(p:PlusPlan)=>{setPlan(p);return true},[]);
 const restore=useCallback(async()=>plan!==null,[plan]);
 const resetToFree=useCallback(()=>setPlan(null),[]);
 const value=useMemo(()=>({isPlus:plan!==null,plan,paywall,showPaywall,hidePaywall,purchase,restore,resetToFree}),[plan,paywall,showPaywall,hidePaywall,purchase,restore,resetToFree]);
 return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlus(){
 const v=useContext(Ctx);
 if(!v)throw new Error('usePlus must be used inside PlusProvider');
 return v;
}
