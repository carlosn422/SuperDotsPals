
import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { TimelineMood } from './FamilyTimeline';

const DAY_MS = 86400000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function useMoodCalendar() {
  const [moods, setMoods] = useState<TimelineMood[]>([]);
  const [days, setDays] = useState<Date[]>([]);

  useEffect(() => {
    const fetchAnchorDate = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: firstMood, error: moodError } = await supabase
        .from('wellness_journal')
        .select('occurred_at')
        .eq('user_id', user.id)
        .not('mood', 'is', null)
        .order('occurred_at', { ascending: true })
        .limit(1)
        .single();

      const accountCreationDate = user.created_at ? new Date(user.created_at) : new Date();
      const firstMoodDate = firstMood ? new Date(firstMood.occurred_at) : null;

      let anchorDate = startOfDay(accountCreationDate);
      if (firstMoodDate && firstMoodDate < anchorDate) {
        anchorDate = startOfDay(firstMoodDate);
      }

      const today = startOfDay(new Date());
      const diffDays = Math.round((today.getTime() - anchorDate.getTime()) / DAY_MS);

      let startDate: Date;
      if (diffDays < 7) {
        startDate = anchorDate;
      } else {
        startDate = new Date(today.getTime() - 6 * DAY_MS);
      }

      const dateList = Array.from({ length: 7 }, (_, i) => {
        return new Date(startDate.getTime() + i * DAY_MS);
      });

      setDays(dateList);

      const { data, error } = await supabase
        .from('wellness_journal')
        .select('mood,occurred_at')
        .eq('user_id', user.id)
        .not('mood', 'is', null)
        .gte('occurred_at', dateList[0].toISOString())
        .lt('occurred_at', new Date(dateList[6].getTime() + DAY_MS).toISOString())
        .order('occurred_at', { ascending: false });

      if (!error) {
        setMoods(data || []);
      }
    };

    fetchAnchorDate();
  }, []);

  return { moods, days };
}
