const $ = id => document.getElementById(id);
const token = $('config').dataset.token;
const labels = { idle:'尚未開始', running:'自動測試中', manual:'人工登入中', starting:'啟動中', completed:'已完成', failed:'測試失敗', stopped:'已停止' };
let lastState = '';
let screenshotObjectUrl;
function notify(msg = '') { $('error').textContent = msg; }
async function post(route, body) {
  const res = await fetch('/api/' + route, { method:'POST', headers:{ 'Content-Type':'application/json','x-e2e-token':token }, body:JSON.stringify(body || {}) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '請求失敗');
  return data;
}
$('start').onclick = async () => {
  try {
    notify();
    await post('quick-start', { adminUrl: $('admin').value.trim(), clientUrls: $('clients').value, mobile: $('mobile').checked, login: $('login').checked });
    await refresh();
  } catch(e) { notify(e.message); }
};
$('live').onclick = async () => {
  try {
    const res = await fetch('/api/cloud/live', { cache:'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '即時畫面尚未就緒');
    const a = document.createElement('a');
    a.href = data.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = '開啟互動瀏覽器（網址為短效授權連結，勿轉傳）';
    $('live-link').replaceChildren(a);
    a.click();
  } catch(e) { notify(e.message); }
};
$('takeover').onclick = async () => { try { await post('takeover'); await refresh(); } catch(e) { notify(e.message); } };
$('resume').onclick = async () => { try { await post('resume'); await refresh(); } catch(e) { notify(e.message); } };
$('stop').onclick = async () => { try { await post('stop'); await refresh(); } catch(e) { notify(e.message); } };
async function refresh() {
  try {
    const response = await fetch('/api/status', { cache:'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const active = ['running','manual','starting'].includes(data.state);
    $('status').textContent = labels[data.state] || data.state;
    $('start').disabled = active;
    $('stop').disabled = !active;
    $('takeover').disabled = data.state !== 'running';
    $('resume').disabled = data.state !== 'manual';
    $('live').disabled = !active;
    $('events').replaceChildren(...data.events.slice(-100).reverse().map(e => {
      const li = document.createElement('li'); li.className = e.type; li.textContent = new Date(e.at).toLocaleTimeString() + ' · ' + e.message; return li;
    }));
    $('results').replaceChildren(...data.results.map(e => {
      const li = document.createElement('li'); li.className = e.status === 'passed' ? 'pass':'fail';
      li.textContent = e.target + ' · ' + e.name + ' · ' + (e.status === 'passed' ? '通過':'失敗'); return li;
    }));
    if (data.state !== lastState) {
      $('live-link').replaceChildren();
      lastState = data.state;
    }
    const running = data.state === 'running';
    $('preview').style.display = running ? 'block' : 'none';
    $('overlay').style.display = running ? 'none' : 'block';
    $('overlay').textContent = data.state === 'manual' ? '人工接管中：雲端互動瀏覽器登入後，回此頁按「登入完成，繼續」' : '目前狀態：' + (labels[data.state] || data.state);
    $('notice').textContent = data.state === 'manual'
      ? '登入期間停止擷取畫面與自動操作。請在已開啟的雲端瀏覽器完成 LINE／OTP／測試帳號登入，切回此控制台繼續。'
      : '目前測試：' + (data.currentTarget || '待開始') + '。需要操作登入頁時可隨時人工接管。';
    if (!running) {
      $('preview').removeAttribute('src');
      if (screenshotObjectUrl) { URL.revokeObjectURL(screenshotObjectUrl); screenshotObjectUrl = null; }
      return;
    }
    const preview = await fetch('/api/preview', { cache:'no-store' });
    if (preview.status !== 200) return;
    const blob = await preview.blob();
    const refreshed = await (await fetch('/api/status', { cache:'no-store' })).json();
    if (refreshed.state !== 'running') return;
    const newUrl = URL.createObjectURL(blob);
    $('preview').onload = () => { if (screenshotObjectUrl) URL.revokeObjectURL(screenshotObjectUrl); screenshotObjectUrl = newUrl; };
    $('preview').src = newUrl;
  } catch { /* reconnect on next refresh */ }
}
setInterval(refresh, 1500); refresh();
