// Phone mockups: show a real screenshot from /img/screens/<name>.png when present, otherwise an HTML preview of that screen.
const scale = ['#EE6F86','#F2A56F','#8A9BEF','#4DBB7F'].map(c => `<i style="background:${c}"></i>`).join('');
const tabbar = on => `<div class="tabbar">${['Today','Actions','Trends','Health','Settings'].map(t => `<span class="${t===on?'on':''}">${t}</span>`).join('')}</div>`;
const hrvDots = () => {
  const pts = [[8,40],[30,32],[52,36],[74,22],[96,26],[118,14],[140,18],[162,10],[184,16],[206,8],[228,12]];
  const col = ['#8A9BEF','#8A9BEF','#8A9BEF','#4DBB7F','#4DBB7F','#4DBB7F','#4DBB7F','#4DBB7F','#4DBB7F','#4DBB7F','#4DBB7F'];
  return `<svg class="chart" viewBox="0 0 236 58" width="100%"><polyline fill="none" stroke="#C9D2D6" stroke-width="1.5" points="${pts.map(p=>p.join(',')).join(' ')}"/>${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#fff" stroke="${col[i]}" stroke-width="2.5"/>`).join('')}</svg>`;
};
const ring = (pct, color, size = 44, label = '') => `<svg width="${size}" height="${size}" viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="none" stroke="${color}" stroke-opacity=".18" stroke-width="6"/><circle cx="22" cy="22" r="18" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${113*pct} 113" transform="rotate(-90 22 22)"/>${label?`<text x="22" y="26" text-anchor="middle" font-size="11" font-weight="800" fill="#1D2B33">${label}</text>`:''}</svg>`;
const SCREENS = {
  today: () => `<div class="ui"><div class="top"><span>Today</span><span class="muted">Tue, Oct 21</span></div>
    <div class="hero"><img src="/img/mascots/disgust.webp" alt=""><div class="muted">Hi Carlos, here's your daily score</div><div class="lvl">Great</div><div class="scale">${scale}<b></b></div><div class="muted">Your body signals look relaxed compared with your usual.</div></div>
    <div class="card" style="display:flex;gap:10px;align-items:center">${ring(.78,'#34B37E',44,'78')}<div><h5 style="margin:0">Energy 78</h5><div class="muted">Charged · slept 7h 40m</div></div></div>
    <div class="card"><h5>HRV Trend <span class="muted" style="float:right">HRV 58ms</span></h5>${hrvDots()}</div>${tabbar('Today')}</div>`,
  actions: () => `<div class="ui"><div class="top"><span>Actions</span></div>
    <div class="card" style="display:flex;justify-content:space-between;align-items:center"><div><h5>Sleep</h5><div class="big">7h 40m</div><div class="muted">Quality: Great · 54 bpm</div></div>${ring(.95,'#6C63E0')}</div>
    <div class="card" style="display:flex;justify-content:space-between;align-items:center"><div><h5>Fitness</h5><div class="muted"><b style="color:#F2685A">412 cal</b> · <b style="color:#5CC15A">32 m</b> · <b style="color:#3BB5D8">9 h</b></div></div>${ring(.82,'#F2685A')}</div>
    <div class="row"><div class="tile"><h5>Daylight</h5><div class="big">46m</div></div><div class="tile"><h5>Mindful</h5><div class="big">12m</div></div></div>
    <div class="row"><div class="tile"><h5>Steps</h5><div class="big">8,214</div></div><div class="tile"><h5>Noise</h5><div class="big">Normal</div></div></div>${tabbar('Actions')}</div>`,
  diary: () => `<div class="ui"><div class="top"><span>Stress diary</span></div>
    <div class="card" style="background:#E4F6EA"><h5>Your week</h5><div class="row"><div class="tile"><div class="muted">Calmest</div><b style="color:#4DBB7F">Sunday</b></div><div class="tile"><div class="muted">Hardest</div><b style="color:#F2A56F">Wednesday</b></div></div><div class="muted" style="margin-top:6px">Try a one-minute breathing break before your busiest meetings.</div></div>
    <div class="card"><h5>What drives your stress</h5><div class="muted">Work · <b style="color:#F2A56F">Elevated 71</b></div><div style="height:6px;background:#EEF3F0;border-radius:3px;margin:3px 0 6px"><div style="width:71%;height:6px;background:#F2A56F;border-radius:3px"></div></div><div class="muted">Exercise · <b style="color:#4DBB7F">Great 28</b></div><div style="height:6px;background:#EEF3F0;border-radius:3px;margin-top:3px"><div style="width:28%;height:6px;background:#4DBB7F;border-radius:3px"></div></div></div>
    <div class="card"><h5>Tuesday, Oct 21</h5><div class="entry"><i style="background:#4DBB7F"></i><div><b>Joyful · 8/10</b><div>Morning walk before work, felt clear-headed.</div><span class="chip">Stress Great · 24</span><span class="chip">Exercise</span></div></div></div>${tabbar('Actions')}</div>`,
  ask: () => `<div class="ui"><div class="top"><span>Ask MoodPal</span></div>
    <div><span class="chip">Elevated · 68</span><span class="chip">HRV 38 ms</span><span class="chip">Slept 5h 40m</span></div>
    <div class="bubble me">Why is my stress high today?</div>
    <div class="bubble ai">Your HRV is about 30% below your usual and you slept under 6 hours. Short sleep often shows up like this the next day. A short breathing break and an earlier bedtime tonight could help.</div>
    <div><span class="chip">Breathing break</span><span class="chip">Save to diary</span></div>
    <div class="bubble me">What helped last time?</div>
    <div class="bubble ai">On your last two Elevated days, a lunchtime walk was followed by a Normal evening score.</div>
    <div class="card muted" style="margin-top:auto">Ask MoodPal about your stress, sleep or mood…</div></div>`
};
document.querySelectorAll('.phone').forEach(phone => {
  const name = phone.dataset.screen;
  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.innerHTML = SCREENS[name]?.() || '';
  phone.appendChild(screen);
  const img = new Image();
  img.alt = `MoodPals ${name} screen`;
  img.onload = () => { screen.innerHTML = ''; screen.appendChild(img); };
  img.src = `/img/screens/${name}.png`;
});

const form = document.querySelector('.signup');
const msg = form.querySelector('.form-msg');
form.addEventListener('submit', async e => {
  e.preventDefault();
  const data = new FormData(form);
  const email = String(data.get('email') || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.className = 'form-msg err'; msg.textContent = 'Please enter a valid email address.'; return; }
  const button = form.querySelector('button');
  button.disabled = true; button.textContent = 'Saving…';
  try {
    const res = await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, firstName: data.get('firstName'), interests: data.getAll('interests'), company: data.get('company') }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Something went wrong.');
    form.reset();
    msg.className = 'form-msg ok';
    msg.textContent = "You're on the list! 🎉 We'll email you when the beta opens.";
  } catch (err) {
    msg.className = 'form-msg err'; msg.textContent = err.message;
  } finally { button.disabled = false; button.textContent = 'Get early access'; }
});
document.getElementById('yr').textContent = new Date().getFullYear();
