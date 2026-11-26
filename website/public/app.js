// Phone mockups: show a real screenshot from /img/screens/<name>.png when present, otherwise an HTML preview of that screen.
const scale = ['#EE6F86','#F2A56F','#8A9BEF','#4DBB7F'].map(c => `<i style="background:${c}"></i>`).join('');
const NAV_ICONS = {
  Today: '<path d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm-2 7h14v10H5V9zm2 2v3h3v-3H7z"/>',
  Actions: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/>',
  Circle: '<path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7.5 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5H2zm15.5 0c0-2.1-.8-4-2.2-5.4.7-.2 1.4-.3 2.2-.3 2.9 0 4.5 2.3 4.5 5.7h-4.5z"/>',
  Family: '<path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 19c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5H2zm12.5 0c0-1.9-.7-3.6-1.9-4.9.7-.3 1.6-.6 3.4-.6 3 0 6 2 6 5.5h-7.5z"/>',
  Watches: '<path d="M9 1.5h6l.8 3.2A3.5 3.5 0 0 1 18.5 8v8a3.5 3.5 0 0 1-2.7 3.3L15 22.5H9l-.8-3.2A3.5 3.5 0 0 1 5.5 16V8a3.5 3.5 0 0 1 2.7-3.3L9 1.5z"/>',
  More: '<path d="M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>'
};
const tabbar = on => `<div class="tabbar">${Object.keys(NAV_ICONS).map(t => `<span class="${t===on?'on':''}"><svg viewBox="0 0 24 24" aria-hidden="true">${NAV_ICONS[t]}</svg>${t}</span>`).join('')}</div>`;
const hrvDots = () => {
  const pts = [[8,40],[30,32],[52,36],[74,22],[96,26],[118,14],[140,18],[162,10],[184,16],[206,8],[228,12]];
  const col = ['#8A9BEF','#8A9BEF','#8A9BEF','#4DBB7F','#4DBB7F','#4DBB7F','#4DBB7F','#4DBB7F','#4DBB7F','#4DBB7F','#4DBB7F'];
  return `<svg class="chart" viewBox="0 0 236 58" width="100%"><polyline fill="none" stroke="#C9D2D6" stroke-width="1.5" points="${pts.map(p=>p.join(',')).join(' ')}"/>${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#fff" stroke="${col[i]}" stroke-width="2.5"/>`).join('')}</svg>`;
};
const ring = (pct, color, size = 44, label = '') => `<svg width="${size}" height="${size}" viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="none" stroke="${color}" stroke-opacity=".18" stroke-width="6"/><circle cx="22" cy="22" r="18" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${113*pct} 113" transform="rotate(-90 22 22)"/>${label?`<text x="22" y="26" text-anchor="middle" font-size="11" font-weight="800" fill="#1D2B33">${label}</text>`:''}</svg>`;
const duoFrames = frames => frames.map(([file, t, alt, tap]) =>
  (tap ? `<i class="tap" style="--t:${t - 0.5}s;left:${tap[0]}%;top:${tap[1]}%"></i>` : '') +
  `<img class="frame" src="/img/duo/${file}.webp?v=2" alt="${alt}" decoding="async" style="--t:${t}s">`).join('');
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
    <div class="card muted">Only moods you choose to share. Never your health data.</div>${tabbar('Circle')}</div>`,
  screentime: () => `<div class="ui"><div class="top"><span>Screen Time &amp; Stress</span></div>
    <div class="card" style="display:flex;justify-content:space-between;align-items:center"><div><h5>Daily limit <span class="chip">total</span></h5><div class="big">15 min</div><div class="muted">Shared by 5 apps</div></div>${ring(.4,'#4DBB7F',58,'30')}</div>
    <div class="row"><div class="tile"><h5>Edit Apps</h5><div class="muted">5 apps</div></div><div class="tile"><h5>Set Limit</h5><div class="muted">15 min</div></div><div class="tile"><h5>Tracking</h5><div class="muted">On</div></div></div>
    <div class="card"><h5>This Week <span class="muted" style="float:right">Time · Stress</span></h5><div class="bars">${[20,45,30,75,60,35,30].map((h,i)=>`<i style="height:${h}%;${i===3?'background:#2E8F64':''}"></i>`).join('')}</div><div class="muted">Thu · 1h 15m in tracked apps · stress 62</div></div>
    <div class="card"><h5>Top Apps · Last 30 Days</h5><div class="entry" style="border:0;margin:0;padding:0"><span class="av" style="background:#F2685A">▶</span><div><b>Video app</b> · 30 min today<div class="muted">Stress after use: higher than your usual</div></div></div><div class="entry"><span class="av" style="background:#B79CEB">♪</span><div><b>Social app</b> · 15 min today<div class="muted">Still learning your pattern</div></div></div></div>${tabbar('Actions')}</div>`,
  limit: () => `<div class="ui" style="background:#F6F7F7;text-align:center;justify-content:center;gap:6px"><img src="/img/mascots/joy.webp" alt="" style="width:84px;height:84px;margin:0 auto"><h5 style="font-size:16px;margin:0">Daily limit reached</h5><div style="font-size:11px">Hey! How about a little screen break?</div><div class="muted">You've reached your screen time limit for today. Give yourself a moment away from the screen.</div><div style="margin-top:60px;background:#4DBB7F;color:#fff;font-weight:800;border-radius:14px;padding:9px">Take a break</div><div class="muted" style="font-weight:700">I need it today</div></div>`,
  screenbreak: () => `<div class="ui"><div class="top"><span>Tristan</span><span class="chip">Screen Break</span></div>
    <div class="card" style="text-align:center"><h5>Screen time left</h5><div class="lvl" style="color:#4DBB7F">12:48</div><div class="muted">Apps lock when time is up</div></div>
    <div class="row"><div class="tile" style="text-align:center"><b>+15 min</b></div><div class="tile" style="text-align:center"><b>End Now</b></div><div class="tile" style="text-align:center"><b>Cancel</b></div></div>
    <div class="card"><h5>How long can Tristan use the phone?</h5><div><span class="chip">15 min</span><span class="chip">30 min</span><span class="chip">45 min</span><span class="chip">60 min</span><span class="chip">Custom</span></div></div>
    <div class="card"><h5>Screen Time Insights</h5><div class="muted">Day · Week · Month · Year</div><div class="muted">This week: 3h 10m on the phone · 2h 40m granted</div></div>
    <div class="card muted">Control it from your Apple Watch, even with MoodPals closed.</div>${tabbar('Family')}</div>`,
  // How it works: real MoodPals screens captured on the two review accounts. [file, seconds into the sequence, alt, tap point (% of screen) that leads to it]
  duoAvery: () => duoFrames([
    ['a1-checkin', 0, 'Avery\'s check-in: How are you feeling today?'],
    ['a2-calm', 1.2, 'Avery picks Calm', [70, 38]],
    ['a3-complete', 2.2, 'Check-in complete. Share this mood?'],
    ['a4-audience', 3.4, 'Choose Audience: Close friends, Jordan will see it', [69, 67]],
    ['a5-shared', 4.6, 'Shared with Close friends', [50, 65]],
    ['a6-lock-react', 6.8, 'Avery\'s lock screen: Jordan reacted 🌿'],
    ['a7-lock-sun', 10.6, 'Avery\'s lock screen: Jordan sent you some sunshine ☀️']
  ]),
  duoJordan: () => duoFrames([
    ['j0-circle', 0, 'Jordan\'s My Circle'],
    ['j1-signals', 5.2, 'Today\'s Signals: Avery shared Calm with you', [50, 80]],
    ['j2-mood', 6, 'Avery is feeling calm', [30, 69]],
    ['j3-react', 6.6, 'Jordan reacts with 🌿', [15.5, 62.6]],
    ['j4-send', 8, 'Send a Little Signal to Avery', [50, 75]],
    ['j5-sunshine', 8.8, 'Jordan picks Sending sunshine', [73, 57.7]],
    ['j6-sent', 9.6, 'Signal Sent: Sending sunshine to Avery', [50, 72.7]]
  ]),
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
    screen.innerHTML = slides.map((s, i) => `<img class="slide${i ? '' : ' on'}" src="/img/screens/${s}.webp?v=16" alt="MoodPals ${s.replace('-', ' ')} screen">`).join('');
    let i = 0, hold = false;
    const imgs = screen.querySelectorAll('.slide');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slide-toggle';
    const setPaused = p => { phone.classList.toggle('paused', p); btn.setAttribute('aria-pressed', String(p)); btn.setAttribute('aria-label', p ? 'Play screenshots' : 'Pause screenshots'); };
    setPaused(matchMedia('(prefers-reduced-motion: reduce)').matches);
    btn.addEventListener('click', () => setPaused(!phone.classList.contains('paused')));
    phone.appendChild(btn);
    phone.addEventListener('mouseenter', () => { hold = true; });
    phone.addEventListener('mouseleave', () => { hold = false; });
    setInterval(() => {
      if (hold || phone.classList.contains('paused')) return;
      imgs[i].classList.remove('on'); i = (i + 1) % imgs.length; imgs[i].classList.add('on');
    }, 4000);
    return;
  }
  const img = new Image();
  img.alt = `MoodPals ${name} screen`;
  img.onload = () => { screen.innerHTML = ''; screen.appendChild(img); };
  img.src = `/img/screens/${name}.png`;
});

const form = document.querySelector('.signup');
if (form) {
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
    msg.textContent = "You're on the list! 🎉 We'll email you about new features.";
  } catch (err) {
    msg.className = 'form-msg err'; msg.textContent = err.message;
  } finally { button.disabled = false; button.textContent = 'Get updates'; }
});
}
document.getElementById('yr').textContent = new Date().getFullYear();

// [data-join] links: scroll to the very top so the whole signup form is visible, then focus the email field.
document.querySelectorAll('[data-join]').forEach(link => link.addEventListener('click', e => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  history.replaceState(null, '', '#top');
  setTimeout(() => form.querySelector('input[name=email]').focus({ preventScroll: true }), 600);
}));

// Apple Watch mockups: Calm pal, matching the watch app's default screen, or real watch screens when data-watch-slides is set.
document.querySelectorAll('[data-watch]').forEach(watch => {
  const slides = (watch.dataset.watchSlides || '').split(',').filter(Boolean);
  if (slides.length) {
    watch.innerHTML = `<div class="band top"></div><div class="case"><div class="face">${slides.map((s, i) => `<img class="wslide${i ? '' : ' on'}" src="/img/watch/${s}.webp?v=4" alt="MoodPals Apple Watch ${s} screen">`).join('')}</div></div><div class="band bottom"></div>`;
    let i = 0;
    const imgs = watch.querySelectorAll('.wslide');
    setInterval(() => { imgs[i].classList.remove('on'); i = (i + 1) % imgs.length; imgs[i].classList.add('on'); }, 2800);
    return;
  }
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


// Loop animations: pause/play button on each; stay still for people who prefer reduced motion.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('.loop video').forEach(v => {
  const fig = v.closest('.loop'), btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'slide-toggle';
  const sync = () => { fig.classList.toggle('paused', v.paused); btn.setAttribute('aria-pressed', String(v.paused)); btn.setAttribute('aria-label', v.paused ? 'Play animation' : 'Pause animation'); };
  btn.addEventListener('click', () => { if (v.paused) v.play(); else v.pause(); });
  v.addEventListener('play', sync); v.addEventListener('pause', sync);
  if (reduceMotion) { v.removeAttribute('autoplay'); v.pause(); }
  fig.append(btn); sync();
});
document.querySelectorAll('.t-show').forEach(show => {
  const devs = [...show.querySelectorAll('.t-devs .t-dev')], pans = show.querySelectorAll('.t-panel'), ptr = show.querySelector('.t-pointer');
  let cur = 0, paused = false;
  const narrow = matchMedia('(max-width: 600px)'), car = show.querySelector('.t-carousel');
  const place = () => {
    const d = devs[cur], box = show.getBoundingClientRect(), r = d.getBoundingClientRect();
    ptr.style.transform = `translate(${r.left - box.left + r.width * .62}px, ${r.bottom - box.top - 16}px)`;
  };
  const pick = i => {
    cur = i;
    devs.forEach((d, n) => d.setAttribute('aria-pressed', String(n === i)));
    pans.forEach((p, n) => p.classList.toggle('on', n === i));
    place();
  };
  devs.forEach((d, n) => { d.addEventListener('click', () => { if (narrow.matches) { const r = show.getBoundingClientRect(), span = show.offsetHeight - innerHeight; scrollTo({ top: scrollY + r.top + span * (n + .5) / devs.length, behavior: 'smooth' }); } else pick(n); }); d.addEventListener('mouseenter', () => pick(n)); });
  show.addEventListener('focusin', () => paused = true);
  show.addEventListener('focusout', () => paused = false);
  show.addEventListener('mouseenter', () => paused = true);
  show.addEventListener('mouseleave', () => paused = false);
  addEventListener('resize', place);
  setTimeout(place, 600);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(() => { if (!paused && !narrow.matches && !document.hidden) pick((cur + 1) % devs.length); }, 3500);
  let mi = 0;
  const slides = car ? [...car.children] : [];
  const onScroll = () => {
    show.style.setProperty('--vh', innerHeight + 'px');
    if (!narrow.matches || !car) return;
    const nav = document.querySelector('.nav');
    show.style.setProperty('--navh', (nav ? nav.offsetHeight : 64) + 'px');
    const span = show.offsetHeight - innerHeight, p = span > 0 ? -show.getBoundingClientRect().top / span : 0;
    const i = Math.max(0, Math.min(slides.length - 1, Math.floor(p * slides.length)));
    if (i === mi && slides[i].classList.contains('on')) return;
    car.dataset.dir = i >= mi ? 'down' : 'up';
    slides.forEach((s, n) => { s.classList.toggle('on', n === i); s.classList.toggle('out', n === mi && n !== i); });
    mi = i; pick(i);
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  pick(0); onScroll();
});
