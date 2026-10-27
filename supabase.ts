import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppState} from 'react-native';
import {createClient} from '@supabase/supabase-js';
export const supabase=createClient('https://hzoauxxpvrgahlavxmvp.supabase.co','sb_publishable_pPPqosRo1SqwrbW-8MWURA_UxTED6Vs',{auth:{storage:AsyncStorage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});

// Token refresh timers don't run while iOS suspends the app; restart them in the foreground.
AppState.addEventListener('change',state=>{
 if(state==='active')supabase.auth.startAutoRefresh();
 else supabase.auth.stopAutoRefresh();
});
