// My Circle & Little Signals — shared constants plus the sample data used in prototype mode.
// The MOCK_* data is fictional and never read from or written to Supabase.
// Set to true to review the screens with local sample data instead of the live backend.
export const CIRCLE_PROTOTYPE=false;

export const CIRCLE_MOODS=['Joyful','Calm','Sad','Angry','Anxious','Tired'] as const;
export type CircleMood=typeof CIRCLE_MOODS[number];

export const MOOD_TINTS:Record<CircleMood,{color:string;tint:string}>={
 Joyful:{color:'#8A5BE0',tint:'#F1EAFF'},
 Calm:{color:'#2FA67A',tint:'#E4F6EA'},
 Sad:{color:'#3E86D6',tint:'#E5F1FF'},
 Angry:{color:'#D94B45',tint:'#FFE9E6'},
 Anxious:{color:'#C99A12',tint:'#FFF6D6'},
 Tired:{color:'#7D7A9C',tint:'#EEEDF5'},
};

export const MOOD_REACTIONS:Record<CircleMood,string[]>={
 Joyful:['🎉','🥳','🙌','✨','❤️'],
 Calm:['🌿','💚','☀️','🧘','✨'],
 Sad:['❤️','🫂','🫶','🌷','💙'],
 Angry:['🫂','❤️','💪','🌿','🫶'],
 Anxious:['🫶','🤗','🌿','💛','☀️'],
 Tired:['🌙','💤','🫂','☕','💜'],
};

export const LITTLE_SIGNALS=[
 {id:'thinking',emoji:'❤️',label:'Thinking of you',notify:(n:string)=>n+' is thinking of you 💚'},
 {id:'hug',emoji:'🤗',label:'Sending a hug',notify:(n:string)=>n+' sent you a hug 🤗'},
 {id:'here',emoji:'🫶',label:'Here for you',notify:(n:string)=>n+' is here for you 🫶'},
 {id:'sunshine',emoji:'☀️',label:'Sending sunshine',notify:(n:string)=>n+' sent you some sunshine ☀️'},
 {id:'gotthis',emoji:'💪',label:"You've got this",notify:(n:string)=>n+' says you’ve got this 💪'},
 {id:'cheer',emoji:'🎉',label:'Cheering you on',notify:(n:string)=>n+' is cheering you on 🎉'},
] as const;
export type SignalId=typeof LITTLE_SIGNALS[number]['id'];
export const signalById=(id:SignalId)=>LITTLE_SIGNALS.find(x=>x.id===id)!;

export type Friend={id:string;name:string;initials:string;color:string;since:string;muted:boolean;hideMyMoods:boolean};
export type CircleGroup={id:string;name:string;icon:string;color:string;memberIds:string[];moods:CircleMood[]};
export type FriendRequest={id:string;direction:'incoming'|'outgoing';name:string;initials:string;color:string;sentAt:string;status:'pending'|'declined'};
export type Reaction={friendId:string;emoji:string;at:string};
export type MySharedMood={id:string;mood:CircleMood;sharedAt:string;expiresAt:string;groupIds:string[];reactions:Reaction[];active:boolean};
export type FriendSharedMood={id:string;friendId:string;mood:CircleMood;sharedAt:string;expiresAt:string;myReaction?:string};
export type ReceivedSignal={id:string;friendId:string;signal:SignalId;at:string;seen:boolean};
export type NotificationPrefs={invites:boolean;approvals:boolean;signals:boolean;reactions:boolean;showMoodOnLockScreen:boolean;showNamesInPreview:boolean;quietHours:boolean};

const minutesAgo=(m:number)=>new Date(Date.now()-m*60000).toISOString();
const hoursFromNow=(h:number)=>new Date(Date.now()+h*3600000).toISOString();

export const MOCK_FRIENDS:Friend[]=[
 {id:'jamie',name:'Jamie',initials:'J',color:'#7BC6A4',since:'Aug 2026',muted:false,hideMyMoods:false},
 {id:'taylor',name:'Taylor',initials:'T',color:'#F2A65A',since:'Sep 2026',muted:false,hideMyMoods:false},
 {id:'riley',name:'Riley',initials:'R',color:'#8FA7F5',since:'Sep 2026',muted:false,hideMyMoods:false},
 {id:'casey',name:'Casey',initials:'C',color:'#E58BB0',since:'Oct 2026',muted:false,hideMyMoods:false},
 {id:'mom',name:'Mom',initials:'M',color:'#B79CEB',since:'Jul 2026',muted:false,hideMyMoods:false},
 {id:'alex',name:'Alex',initials:'A',color:'#6CB7D9',since:'Oct 2026',muted:true,hideMyMoods:false},
];
export const MOCK_GROUPS:CircleGroup[]=[
 {id:'close',name:'Close Friends',icon:'heart',color:'#E76B8A',memberIds:['jamie','taylor','riley','casey'],moods:[...CIRCLE_MOODS]},
 {id:'family',name:'Family',icon:'home',color:'#488CD9',memberIds:['mom','jamie'],moods:['Joyful','Calm','Sad','Tired']},
 {id:'support',name:'Support Team',icon:'leaf',color:'#3BA986',memberIds:['riley','alex'],moods:['Sad','Angry','Anxious','Tired']},
];
export const MOCK_REQUESTS:FriendRequest[]=[
 {id:'rq1',direction:'incoming',name:'Morgan',initials:'M',color:'#F0B95B',sentAt:minutesAgo(90),status:'pending'},
 {id:'rq2',direction:'incoming',name:'Sam',initials:'S',color:'#9BD08A',sentAt:minutesAgo(60*26),status:'pending'},
 {id:'rq3',direction:'outgoing',name:'Jordan',initials:'J',color:'#A49BEB',sentAt:minutesAgo(60*5),status:'pending'},
 {id:'rq4',direction:'outgoing',name:'Drew',initials:'D',color:'#D9A08C',sentAt:minutesAgo(60*50),status:'declined'},
];
export const MOCK_MY_MOODS:MySharedMood[]=[
 {id:'m1',mood:'Anxious',sharedAt:minutesAgo(140),expiresAt:hoursFromNow(21.6),groupIds:['close','support'],active:true,reactions:[
  {friendId:'jamie',emoji:'🫶',at:minutesAgo(120)},{friendId:'taylor',emoji:'🤗',at:minutesAgo(95)},{friendId:'riley',emoji:'💛',at:minutesAgo(40)}]},
 {id:'m2',mood:'Calm',sharedAt:minutesAgo(60*7),expiresAt:hoursFromNow(17),groupIds:['close'],active:true,reactions:[
  {friendId:'jamie',emoji:'🌿',at:minutesAgo(60*6)},{friendId:'casey',emoji:'☀️',at:minutesAgo(60*5)}]},
 {id:'m3',mood:'Tired',sharedAt:minutesAgo(60*30),expiresAt:minutesAgo(60*6),groupIds:['family'],active:false,reactions:[
  {friendId:'mom',emoji:'☕',at:minutesAgo(60*29)},{friendId:'jamie',emoji:'🌙',at:minutesAgo(60*28)}]},
 {id:'m4',mood:'Joyful',sharedAt:minutesAgo(60*52),expiresAt:minutesAgo(60*28),groupIds:['close','family'],active:false,reactions:[]},
];
export const MOCK_FRIEND_MOODS:FriendSharedMood[]=[
 {id:'f1',friendId:'taylor',mood:'Sad',sharedAt:minutesAgo(35),expiresAt:hoursFromNow(23.4)},
 {id:'f2',friendId:'mom',mood:'Joyful',sharedAt:minutesAgo(60*3),expiresAt:hoursFromNow(21),myReaction:'🥳'},
 {id:'f3',friendId:'riley',mood:'Tired',sharedAt:minutesAgo(60*9),expiresAt:hoursFromNow(15)},
];
export const MOCK_SIGNALS:ReceivedSignal[]=[
 {id:'s1',friendId:'jamie',signal:'hug',at:minutesAgo(25),seen:false},
 {id:'s2',friendId:'taylor',signal:'thinking',at:minutesAgo(80),seen:false},
 {id:'s3',friendId:'mom',signal:'sunshine',at:minutesAgo(60*4),seen:true},
 {id:'s4',friendId:'casey',signal:'gotthis',at:minutesAgo(60*27),seen:true},
];
export const MOCK_INVITE={code:'MP-7K3D9',expiresAt:hoursFromNow(24*6+5)};
// Codes the Enter Invite Code screen recognises, to demonstrate each state.
export const MOCK_CODE_LOOKUP:Record<string,{state:'valid'|'expired'|'revoked';name:string;initials:string;color:string;mutual?:string}>={
 'MP-4QW8N':{state:'valid',name:'Priya',initials:'P',color:'#F29E7A',mutual:'Jamie'},
 'MP-2EXP1':{state:'expired',name:'Chris',initials:'C',color:'#9DB4C9'},
 'MP-9RVK0':{state:'revoked',name:'Lee',initials:'L',color:'#C3A6E0'},
};
export const DEFAULT_PREFS:NotificationPrefs={invites:true,approvals:true,signals:true,reactions:true,showMoodOnLockScreen:false,showNamesInPreview:true,quietHours:true};

export function timeAgo(iso:string){
 const m=Math.max(0,Math.round((Date.now()-new Date(iso).getTime())/60000));
 if(m<1)return 'just now';if(m<60)return m+'m ago';const h=Math.round(m/60);if(h<24)return h+'h ago';const d=Math.round(h/24);return d===1?'yesterday':d+'d ago';
}
export function timeLeft(iso:string){
 const m=Math.round((new Date(iso).getTime()-Date.now())/60000);
 if(m<=0)return 'expired';if(m<60)return m+'m left';return Math.round(m/60)+'h left';
}
export const isToday=(iso:string)=>new Date(iso).toDateString()===new Date().toDateString();
