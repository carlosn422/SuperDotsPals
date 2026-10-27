import React,{useCallback,useMemo,useState,useEffect} from 'react';
import {Modal,ScrollView,Text,TouchableOpacity,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {supabase} from './supabase';
import {friendName,useCircle} from './CircleStore';
import FamilyTimeline,{TimelineMood,TimelineReaction} from './FamilyTimeline';

const ink='#251C45',muted='#807694';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

import MonthlyCalendar, { localDayKey } from './MonthlyCalendar';

// The signed-in user's own day: their journal moods plus reactions on their Circle shares. No retention limit.
export default function YourDay({onClose,top,bottom,date:initialDate}:{onClose:()=>void;top:number;bottom:number;date?:Date|null}){
  const store=useCircle();
  const [openKey,setOpenKey]=useState<string|null>(null);
  const [moods,setMoods]=useState<TimelineMood[]>([]);
  const [monthlyMoods, setMonthlyMoods] = useState<{ [key: string]: string }>({});
  const [selectedDate, setSelectedDate] = useState(initialDate || new Date());

  const reactions=useMemo<TimelineReaction[]>(()=>store.myMoods.flatMap(m=>m.reactions.map(r=>({share_id:m.id,id:m.id+r.friendId,mood:m.mood,shared_at:m.sharedAt,reactor_name:friendName(store,r.friendId),emoji:r.emoji,reacted_at:r.at}))),[store]);
  
  useEffect(() => {
    const firstDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const lastDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);

    const fetchMoods = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('wellness_journal')
        .select('mood,occurred_at')
        .eq('user_id', user.id)
        .not('mood', 'is', null)
        .gte('occurred_at', firstDay.toISOString())
        .lt('occurred_at', lastDay.toISOString())
        .order('occurred_at', { ascending: false });

      if (!error && data) {
        const moodsByDay: { [key: string]: string } = {};
        for (const mood of data) {
          const dayString = localDayKey(new Date(mood.occurred_at));
          if (!moodsByDay[dayString]) {
            moodsByDay[dayString] = mood.mood;
          }
        }
        setMonthlyMoods(moodsByDay);
        setMoods(data.filter(m => startOfDay(new Date(m.occurred_at)).getTime() === startOfDay(selectedDate).getTime()));
      }
    };

    fetchMoods();
  }, [selectedDate]);

  return (
    <View style={{flex:1,backgroundColor:'#F7F5FB',paddingTop:top,paddingBottom:bottom}}>
      <View style={{width: 40, height: 5, backgroundColor: '#E5E0F0', borderRadius: 2.5, alignSelf: 'center', marginVertical: 8}} />
      <ScrollView contentContainerStyle={{padding:16, paddingTop: 20}}>
        <MonthlyCalendar date={selectedDate} onDateChange={setSelectedDate} moods={monthlyMoods} />
        {openKey && (
            <TouchableOpacity 
                accessibilityRole="button" 
                accessibilityLabel="Back" 
                onPress={()=>setOpenKey(null)} 
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 16, marginBottom: 1 }}
            >
                <Ionicons name="chevron-back" size={22} color={ink}/>
                <Text style={{fontWeight:'800',color:ink}}>Back</Text>
            </TouchableOpacity>
        )}
        <FamilyTimeline 
            name="You" 
            moods={moods} 
            reactions={reactions} 
            openKey={openKey} 
            onOpenKey={setOpenKey} 
            initialDate={selectedDate}
        />
      </ScrollView>
    </View>
  );
}


