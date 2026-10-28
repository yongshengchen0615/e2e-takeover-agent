const $ = id => document.getElementById(id);
const token = $('config').dataset.token;
let previousState = '';
const states = { idle: '尚未開始', starting: '啟動中', running: 'AI 自動測試', manual: '人工接管中', completed: '已完成', failed: '測試失敗', stopped: '已停止' };
function message(text='') { $('error').textContent = text; }
async function post(route, value) {
  message();
  try {
    const response = await fetch(`/api/${route}`, { method:'POST', headers: { 'Content-Type':'application/json', 'X-E2E-Token':token }, body:JSON.stringify(value??{}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '請求失敗');
    return data;
  } catch(err) { message(err.message); }
}
$('start').onclick = async () => {
  try {
    const input = JSON.parse($('steps').value);
    const plan = Array.isArray(input) ? { baseUrl: $('base').value, steps: input } : input;
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('請填寫步驟陣列或完整測試計畫物件');
    if (typeof plan.baseUrl === 'string') $('base').value = plan.baseUrl;
    await post('start', plan);
    await refresh();
  } catch(err) { message(`JSON 格式錯誤：${err.message}`); }
};
$('takeover').onclick = async () => { await post('takeover'); await refresh(); };
$('resume').onclick = async () => { await post('resume'); await refresh(); };
$('stop').onclick = async () => { await post('stop'); await refresh(); };
async function refresh() {
  try {
    const response = await fetch('/api/status', { cache:'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    $('status').textContent = states[data.state] ?? data.state;
    $('start').disabled = ['starting','running','manual'].includes(data.state);
    $('takeover').disabled = data.state !== 'running';
    $('resume').disabled = data.state !== 'manual';
    $('stop').disabled = ['idle','stopped'].includes(data.state);
    $('events').replaceChildren(...data.events.slice(-100).reverse().map(event => {
      const li = document.createElement('li');
      li.className = event.type;
      li.textContent = `${new Date(event.at).toLocaleTimeString()} — ${event.message}`;
      return li;
    }));
    const show = data.state === 'running';
    $('preview').style.display = show ? 'block' : 'none';
    $('overlay').style.display = show ? 'none' : 'block';
    if (!show) $('preview').removeAttribute('src');
    $('overlay').textContent = data.state === 'manual'
      ? '✋ 人工接管中：直接操作彈出的 Chromium 視窗登入。完成後回到此面板按「登入完成，繼續」。此時不擷取畫面。'
      : `目前狀態：${states[data.state] || data.state}`;
    $('notice').textContent = data.state === 'manual'
      ? `已暫停：${data.pauseReason || '等待人工操作'}。密碼和 OTP 請只在 Chromium 視窗輸入，不要貼到面板或聊天。`
      : '登入、OTP 或第三方驗證時，請直接操作開啟的 Chromium 視窗；面板在人工接管期間不擷取畫面。';
    if (data.state !== previousState) { previousState = data.state; message(); }
    if (show) {
      // 不保存圖片、不使用 object URL，瀏覽器頁面切換為 manual 時將隱藏預覽。
      const previewResponse = await fetch('/api/preview', { cache: 'no-store' });
      if (previewResponse.ok && previewResponse.status === 200) {
        const image = await previewResponse.blob();
        if (previousState === 'running') {
          const localUrl = URL.createObjectURL(image);
          $('preview').onload = () => URL.revokeObjectURL(localUrl);
          $('preview').src = localUrl;
        }
      }
    }
  } catch { /* dashboard will reconnect on next refresh */ }
}
setInterval(refresh, 1200);
refresh();
