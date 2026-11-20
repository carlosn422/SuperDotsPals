import {requireOptionalNativeModule,requireNativeView} from 'expo';
import type {ComponentType} from 'react';
import type {ViewProps} from 'react-native';

// Family Screen Break native bridge. The timer and restrictions run natively (DeviceActivity + ManagedSettings);
// JavaScript only sends commands and shows the state the iPhone confirms.
export type BreakStatus='active'|'restricted'|'released'|'canceled';
export type BreakSession={id:string;childId:string;childName:string;status:BreakStatus;startedAt:number;deadline:number;grantedSeconds:number;version:number;updatedAt:number;endedAt?:number;endReason?:'deadline'|'end_now'|'canceled'};
export type BreakState={deviceId:string;authorized:boolean;selectionCount:number;entitlementKnown:boolean;allowed:boolean;hasPlus:boolean;trialAvailable:boolean;trialEndsAt?:number;children:{id:string;name:string}[];addTimeOptions:number[];updatedAt:number;manualLock?:boolean;session?:BreakSession};
export type BreakAction='start'|'addTime'|'endNow'|'cancel'|'release';
export type BreakReply={ok:boolean;error?:string;code?:string;commandId:string;state:BreakState};
export type BreakSyncRow={id:string;child_id:string;device_id:string;started_at:string;deadline_at:string;ended_at?:string;granted_seconds:number;status:BreakStatus;end_reason?:string;version:number};
export type ReportRequest={period:'day'|'week'|'month'|'year';start:number;end:number;prevStart:number;windows:[number,number][];childName:string};

type Native={
 getState():BreakState;
 command(command:Record<string,unknown>):BreakReply;
 setChildren(children:{id:string;name:string}[]):void;
 setEntitlement(e:{hasPlus:boolean;trialAvailable:boolean;trialStartedAt?:number;trialEndsAt?:number}):void;
 pendingSync():BreakSyncRow[];
 ackSync(saved:Record<string,number>):void;
 requestAuthorization():Promise<boolean>;
 pickApps():Promise<number|null>;
 addListener(event:'onState',listener:(state:BreakState)=>void):{remove():void};
};

const native=requireOptionalNativeModule<Native>('ScreenBreak');
export const screenBreakSupported=!!native;
export const getBreakState=():BreakState|null=>native?native.getState():null;
export function onBreakState(listener:(state:BreakState)=>void){return native?native.addListener('onState',listener):{remove(){}}}
const newId=()=>'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16)});

// Every tap gets a fresh command id; commands on a session carry the version the parent saw.
export function sendBreakCommand(action:BreakAction,opts:{childId?:string;minutes?:number;session?:BreakSession}={}):BreakReply{
 if(!native)return {ok:false,error:'Screen Break needs the latest MoodPals build.',code:'unsupported',commandId:'',state:null as unknown as BreakState};
 const cmd:Record<string,unknown>={action,commandId:newId()};
 if(opts.childId)cmd.childId=opts.childId;
 if(opts.minutes)cmd.minutes=opts.minutes;
 if(opts.session){cmd.sessionId=opts.session.id;cmd.expectedVersion=opts.session.version}
 return native.command(cmd);
}
export const setBreakChildren=(children:{id:string;name:string}[])=>native?.setChildren(children);
export const setBreakEntitlement=(e:{hasPlus:boolean;trialAvailable:boolean;trialStartedAt?:number;trialEndsAt?:number})=>native?.setEntitlement(e);
export const pendingBreakSync=():BreakSyncRow[]=>native?.pendingSync()??[];
export const ackBreakSync=(saved:Record<string,number>)=>native?.ackSync(saved);
export const requestScreenTimeAccess=async()=>native?native.requestAuthorization():false;
export const pickBreakApps=async()=>native?native.pickApps():null;

// Apple's DeviceActivityReport, drawn by the MoodPals report extension.
export const ScreenTimeReport:ComponentType<ViewProps&{request:ReportRequest}>|null=native?requireNativeView('ScreenBreak'):null;
