// /giveaway: free entry form.
const form = document.getElementById('gw-form');
const section = document.getElementById('enter');
if (form && section.dataset.state === 'open') {
  const msg = form.querySelector('.form-msg');
  const button = form.querySelector('button');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const body = {
      firstName: d.get('firstName'), lastName: d.get('lastName'), email: d.get('email'), region: d.get('region'),
      company: d.get('company'), ageConfirmed: d.get('ageConfirmed') === 'on', rulesAccepted: d.get('rulesAccepted') === 'on',
    };
    msg.className = 'form-msg'; msg.textContent = '';
    button.disabled = true;
    try {
      const res = await fetch('/api/giveaway/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'We could not save your entry right now. Please try again.');
      msg.className = 'form-msg ok'; msg.textContent = out.message;
      if (out.status === 'entered') form.reset();
    } catch (err) {
      msg.className = 'form-msg err'; msg.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
}
