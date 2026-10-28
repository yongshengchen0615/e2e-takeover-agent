const $ = id => document.getElementById(id);
const token = $('config').dataset.token;
let previousState = '';
let loadedProfileId = null;
const defaultSite = 'https://memberwebsocket-dev-netlify.netlify.app';
async function initProfiles() {
  try {
    const response = await fetch('/api/profiles', {cache:'no-store'});
    if (!response.ok) throw new Error('無法載入方案清單');
    const data = await response.json();
    for (const item of data.profiles) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.label;
      option.dataset.note = item.note;
      $('preset').append(option);
    }
  } catch (err) { $('presetInfo').textContent = '預設方案讀取失敗；仍可貼入自訂 JSON。'; }
}
$('preset').onchange = () => {
  const option = $('preset').selectedOptions[0];
  $('presetInfo').textContent = option?.dataset.note || '請選擇管理端或用戶端測試方案，或保留自訂 JSON。';
};
$('loadPreset').onclick = async () => {
  message();
  const id = $('preset').value;
  if (!id) { message('請先選取管理端或用戶端測試方案'); return; }
  try {
    const response = await fetch('/api/profile?id='+encodeURIComponent(id), {cache:'no-store'});
    const selectedDevice = $('device').value;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '無法載入測試設定');
    const plan = data.plan;
    plan.device = selectedDevice;
    if (selectedDevice !== 'desktop') {
      plan.steps.push({ name:'手機版無橫向溢出', action:'assertNoHorizontalOverflow' });
      plan.acceptance.criteria.push({
        id:'RWD-001',title:'手機畫面無橫向溢出',required:true,stepNames:['手機版無橫向溢出']
      });
    }
    const inputBase = $('base').value.trim();
    // Preserve a consciously chosen localhost/custom staging URL when loading a preset.
    if (inputBase && inputBase !== 'http://localhost:3000' && inputBase !== defaultSite) plan.baseUrl = inputBase;
    $('base').value = plan.baseUrl;
    $('steps').value = JSON.stringify(plan, null, 2);
    loadedProfileId = id;
    $('presetInfo').textContent = $('preset').selectedOptions[0].dataset.note +
      ' 測試計畫已載入；可檢視 JSON 後執行。';
  } catch (err) { message(err.message); }
};
initProfiles();
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
    if (loadedProfileId && plan.profileId === loadedProfileId && plan.device !== $('device').value) {
      throw new Error('畫面尺寸已修改，請按「載入選取的測試方案」重新產生相應 QA 檢查');
    }
    if (loadedProfileId && plan.profileId === loadedProfileId) {
      plan.baseUrl = $('base').value.trim();
    }
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
    $('loadPreset').disabled = ['starting','running','manual'].includes(data.state);
    $('device').disabled = ['starting','running','manual'].includes(data.state);
    $('preset').disabled = ['starting','running','manual'].includes(data.state);
    $('takeover').disabled = data.state !== 'running';
    $('resume').disabled = data.state !== 'manual';
    $('stop').disabled = ['idle','stopped'].includes(data.state);
    const qa = data.acceptance;
    const qaLabels = { passed: '通過', failed: '失敗', blocked: '阻塞', in_progress: '進行中', not_run: '未執行', incomplete: '未完成' };
    $('qaGate').textContent = qa
      ? `QA / E2E 驗收：${qaLabels[qa.gate] || qa.gate}（${qa.summary.passed}/${qa.criteria.length} 項已通過）`
      : '未設定 QA / E2E 驗收條件（不可視為已驗收）';
    $('qaGate').dataset.gate = qa?.gate || 'not_configured';
    $('qaCriteria').replaceChildren(...(qa?.criteria || []).map(item => {
      const li = document.createElement('li');
      li.dataset.status = item.status;
      li.textContent = `${item.id} · ${item.title}｜${qaLabels[item.status] || item.status}${item.required ? '（必要）' : '（選用）'}`;
      return li;
    }));
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
