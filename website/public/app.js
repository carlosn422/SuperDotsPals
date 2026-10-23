// Phone mockups: show a real screenshot from /img/screens/<name>.png when present, otherwise an HTML preview of that screen.
const scale = ['#EE6F86','#F2A56F','#8A9BEF','#4DBB7F'].map(c => `<i style="background:${c}"></i>`).join('');
const NAV_ICONS = {
  Today: '<path d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm-2 7h14v10H5V9zm2 2v3h3v-3H7z"/>',
  Actions: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/>',
  Trends: '<path d="M3 3h2v16h16v2H3V3zm4 8h3v7H7v-7zm5-5h3v12h-3V6zm5 3h3v9h-3V9z"/>',
  Health: '<path d="M12 21s-7.5-4.6-9.6-9.4C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 4.4 2.5.8-1.3 2.3-2.5 4.4-2.5 3.6 0 5.7 3.7 4.2 7.1C19.5 16.4 12 21 12 21z"/>',
  Settings: '<path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5-2.3-1.6zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/>'
};
const tabbar = on => `<div class="tabbar">${Object.keys(NAV_ICONS).map(t => `<span class="${t===on?'on':''}"><svg viewBox="0 0 24 24" aria-hidden="true">${NAV_ICONS[t]}</svg>${t}</span>`).join('')}</div>`;
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
  verse: () => `<div class="ui"><div class="top"><span>Spiritual Reading</span></div>
    <div class="card" style="display:flex;gap:8px;align-items:center"><img src="/img/mascots/fear.webp" alt="" style="width:42px;height:42px"><div><b>Feeling anxious</b><div class="muted">Work · Sleep</div></div></div>
    <div class="muted" style="font-weight:800;letter-spacing:.08em">A PASSAGE FOR YOU</div>
    <div class="verse"><q>In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God. And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.</q><div class="ref">Philippians 4:6-7 · WEB</div></div>
    <div class="card"><h5>A reflection for today</h5><div class="muted">Name one worry from today and hand it over in a short prayer, then take three slow breaths with your pal.</div></div>
    <div><span class="chip">Save to favorites</span><span class="chip">Read from source</span></div>${tabbar('Actions')}</div>`,
  circle: () => `<div class="ui"><div class="top"><span>My Circle</span><span class="muted">3 friends</span></div>
    <div class="card" style="display:flex;gap:8px;align-items:center"><img src="/img/mascots/disgust.webp" alt="" style="width:42px;height:42px"><div><b>You shared Calm</b><div class="muted">with Close Friends · disappears in 21h</div></div></div>
    <div class="card"><h5>Little Signals for you</h5>
      <div class="entry" style="border:0;margin:0;padding:0"><span class="av" style="background:#7BC6A4">J</span><div><b>Jamie</b> is here for you 🫶<div class="muted">2h ago</div></div></div>
      <div class="entry"><span class="av" style="background:#F2A65A">T</span><div><b>Taylor</b> sent you a hug 🤗<div class="muted">1h ago</div></div></div>
      <div class="entry"><span class="av" style="background:#B79CEB">M</span><div><b>Mom</b> sent you some sunshine ☀️<div class="muted">40m ago</div></div></div></div>
    <div class="card"><h5>Send a Little Signal</h5><div class="emojis"><span>❤️</span><span>🤗</span><span>🫶</span><span>☀️</span><span>💪</span><span>🎉</span></div></div>
    <div class="card muted">Only moods you choose to share. Never your health data.</div>${tabbar('Settings')}</div>`,
  duoAvery: () => `<div class="a-wrap"><div class="ui a-app"><div class="top"><span>Check in</span><span class="muted">Avery</span></div>
    <div class="card"><h5>How do you feel?</h5><div class="moodpick"><span><img src="/img/mascots/joy.webp" alt="">Joyful</span><span class="calm"><img src="/img/mascots/disgust.webp" alt="">Calm</span><span><img src="/img/mascots/tired.webp" alt="">Tired</span><span><img src="/img/mascots/fear.webp" alt="">Anxious</span></div></div>
    <div class="card"><h5>Share with</h5><div class="grp">👯 Close Friends <b>✓</b></div><div class="muted" style="margin-top:6px">Only your mood. Never your health data.</div></div>
    <div class="share-btn">Share Calm</div>
    <div class="toast">✓ Shared with Close Friends</div>${tabbar('Today')}</div>
    <div class="lock"><div class="lock-date">Thursday, October 23</div><div class="lock-time">9:41</div>
    <div class="lock-n new"><img src="/img/mascots/disgust.png" alt=""><div><div class="lock-h"><b>MoodPals</b><span>now</span></div><p>Jordan sent you some sunshine ☀️</p></div></div>
    <div class="lock-n react"><img src="/img/mascots/disgust.png" alt=""><div><div class="lock-h"><b>MoodPals</b><span>now</span></div><p>Jordan reacted 🌿</p></div></div>
    <div class="lock-foot">MoodPals is closed</div></div></div>`,
  duoJordan: () => `<div class="ui"><div class="top"><span>My Circle</span><span class="muted">Jordan</span></div>
    <div class="card"><h5>Friends' moods</h5><div class="j-empty muted">No new moods yet</div><div class="j-mood"><div style="display:flex;gap:8px;align-items:center"><img src="/img/mascots/disgust.webp" alt="" style="width:42px;height:42px"><div><b>Avery feels Calm</b><div class="muted">Close Friends · just now</div></div></div>
      <div class="emojis react"><span class="picked j-leaf">🌿</span><span>💚</span><span>☀️</span><span>🧘</span><span>✨</span></div></div></div>
    <div class="card"><h5>Send Avery a Little Signal</h5><div class="emojis"><span>❤️</span><span>🤗</span><span>🫶</span><span class="picked j-sun">☀️</span><span>💪</span><span>🎉</span></div></div>
    <div class="card sent">☀️ Sunshine sent to Avery</div>${tabbar('Settings')}</div>`,
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
  const slides = (phone.dataset.slides || '').split(',').filter(Boolean);
  if (slides.length) {
    screen.innerHTML = slides.map((s, i) => `<img class="slide${i ? '' : ' on'}" src="/img/screens/${s}.webp?v=6" alt="MoodPals ${s.replace('-', ' ')} screen">`).join('');
    let i = 0;
    const imgs = screen.querySelectorAll('.slide');
    setInterval(() => { imgs[i].classList.remove('on'); i = (i + 1) % imgs.length; imgs[i].classList.add('on'); }, 2800);
    return;
  }
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

// "Join early access" buttons: scroll to the very top so the whole signup form is visible, then focus the email field.
document.querySelectorAll('[data-join]').forEach(link => link.addEventListener('click', e => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  history.replaceState(null, '', '#top');
  setTimeout(() => form.querySelector('input[name=email]').focus({ preventScroll: true }), 600);
}));

// Apple Watch mockups: Calm pal, matching the watch app's default screen.
document.querySelectorAll('[data-watch]').forEach(watch => {
  watch.innerHTML = '<div class="band top"></div><div class="case"><div class="face"><span class="time"></span><img src="/img/mascots/disgust.webp" alt="Calm pal on Apple Watch"><div class="mood">Calm</div><div class="hint">Tap to change mood</div></div></div><div class="band bottom"></div>';
  const t = () => { const d = new Date(); watch.querySelector('.time').textContent = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`; };
  t(); setInterval(t, 30000);
});

// How it works: play the two-account story live while it is on screen, reset when it leaves
const duo = document.querySelector('.duo');
if (duo && 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  duo.classList.add('anim');
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) duo.classList.remove('live');
    else if (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= innerHeight * 0.5) duo.classList.add('live');
  }, { threshold: [0, 0.25, 0.5, 0.75] }).observe(duo.querySelector('.duo-row'));
}
