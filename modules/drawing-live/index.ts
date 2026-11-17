import {requireOptionalNativeModule} from 'expo-modules-core';

// ActivityKit push tokens for the Circle drawing Live Activity (iOS 17.2+). kind "start" lets the server start it;
// kind "update" belongs to one running activity and replaces its drawing.
export type LiveToken={kind:'start'|'update';token:string;activity?:string;group?:string};
type DrawingLiveModule={
 getTokens():LiveToken[];
 isEnabled():boolean;
 endAll():Promise<void>;
 show(group:string,v:number,bg:string,d:string):Promise<void>;
 addListener(event:'onToken',listener:(t:LiveToken)=>void):{remove():void};
};
const native=requireOptionalNativeModule<DrawingLiveModule>('DrawingLive');

export const liveActivitiesSupported=()=>!!native;
export const liveActivitiesEnabled=()=>native?.isEnabled()??false;
export const endDrawingLiveActivities=()=>native?.endAll()??Promise.resolve();
export function onLiveToken(listener:(t:LiveToken)=>void){
 native?.getTokens().forEach(listener);
 return native?native.addListener('onToken',listener):{remove(){}};
}
// While MoodPals runs, keeps the Lock Screen card on the latest drawing without waiting for a push.
export function showDrawingLiveActivity(group:string,s:{v:number;bg:string;d:string}){void native?.show(group,s.v,s.bg,s.d).catch(()=>{});}
