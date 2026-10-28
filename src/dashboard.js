const $ = id => document.getElementById(id);
const token = $('config').dataset.token;
const states = { idle:'尚未開始', starting:'啟動中', running:'自動測試中', manual:'人工接管中', completed:'已完成', failed:'測試失敗', stopped:'已停止' };
let workspace = null;
let targetId = '';
let accountId = '';
let previousState = '';
function message(text = '') { $('error').textContent = text; }
async function post(route, value) {
  const response = await fetch('/api/' + route, {
    method:'POST', headers:{'Content-Type':'application/json','X-E2E-Token':token},
    body:JSON.stringify(value ?? {})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作失敗');
  return data;
}
function option(value, label) {
  const el = document.createElement('option');
  el.value = value; el.textContent = label;
  return el;
}
function currentTarget() { return workspace?.targets.find(t => t.id === targetId); }
function currentAccount() { return workspace?.accounts.find(a => a.id === accountId); }
function rememberTarget() {
  const t = currentTarget(); if (!t) return;
  t.name = $('target-name').value.trim();
  t.baseUrl = $('target-url').value.trim();
  t.startPath = $('target-path').value.trim();
  t.kind = $('target-kind').value;
  t.device = $('target-device').value;
}
function rememberAccount() {
  const a = currentAccount(); if (!a) return;
  a.name = $('account-name').value.trim();
  a.method = $('account-method').value;
  a.username = $('account-username').value.trim();
  a.targetIds = [...$('account-targets').selectedOptions].map(o => o.value);
}
function drawAccount() {
  $('account').replaceChildren(option('', '不指定身分（免登入／自行接管）'),
    ...workspace.accounts.filter(a => a.targetIds.includes(targetId)).map(a => option(a.id, a.name)));
  if (!workspace.accounts.some(a => a.id === accountId && a.targetIds.includes(targetId))) accountId = '';
  $('account').value = accountId;
  const a = currentAccount();
  $('account-fields').hidden = !a;
  $('remove-account').disabled = !a;
  if (!a) return;
  $('account-name').value = a.name;
  $('account-method').value = a.method;
  $('account-username').value = a.username;
  $('account-targets').replaceChildren(...workspace.targets.map(t => option(t.id, t.name)));
  for (const o of $('account-targets').options) o.selected = a.targetIds.includes(o.value);
}
function draw() {
  $('target').replaceChildren(...workspace.targets.map(t => option(t.id, t.name + ' · ' + t.kind)));
  if (!currentTarget()) targetId = workspace.targets[0].id;
  $('target').value = targetId;
  const t = currentTarget();
  $('target-name').value = t.name;
  $('target-url').value = t.baseUrl;
  $('target-path').value = t.startPath;
  $('target-kind').value = t.kind;
  $('target-device').value = t.device;
  $('remove-target').disabled = workspace.targets.length < 2;
  drawAccount();
}
function freshId(prefix, existing) {
  let i = 1;
  while (existing.some(x => x.id === prefix + '-' + i)) i++;
  return prefix + '-' + i;
}
$('target').onchange = () => {
  rememberAccount(); rememberTarget();
  targetId = $('target').value; accountId = ''; draw();
};
$('account').onchange = () => {
  rememberAccount(); accountId = $('account').value; drawAccount();
};
$('add-target').onclick = () => {
  if (workspace.targets.length >= 20) return message('最多 20 個受測端');
  rememberAccount(); rememberTarget();
  const id = freshId('client', workspace.targets);
  const number = workspace.targets.length + 1;
  workspace.targets.push({id, name:'新用戶端 ' + number, kind:'client', baseUrl:'http://localhost:' + (3000 + number), startPath:'/', device:'desktop'});
  targetId = id; accountId = ''; draw();
  message('請填寫新用戶端的實際測試網址，再儲存設定');
};
$('remove-target').onclick = () => {
  if (workspace.targets.length < 2) return;
  const removed = targetId;
  workspace.targets = workspace.targets.filter(t => t.id !== removed);
  for (const a of workspace.accounts) a.targetIds = a.targetIds.filter(id => id !== removed);
  workspace.accounts = workspace.accounts.filter(a => a.targetIds.length);
  targetId = workspace.targets[0].id; accountId = ''; draw();
};
$('add-account').onclick = () => {
  rememberAccount(); rememberTarget();
  if (workspace.accounts.length >= 50) return message('最多 50 個測試身分');
  const id = freshId('qa', workspace.accounts);
  workspace.accounts.push({id, name:'新測試用戶', method:'test_account', username:id+'@example.test', targetIds:[targetId]});
  accountId = id; drawAccount(); message('請改成真實測試帳號名稱，密碼僅在瀏覽器登入畫面輸入');
};
$('remove-account').onclick = () => {
  if (!accountId) return;
  workspace.accounts = workspace.accounts.filter(a => a.id !== accountId);
  accountId = ''; drawAccount();
};
async function save() {
  rememberAccount(); rememberTarget();
  workspace = await post('workspace', workspace);
  return workspace;
}
$('save').onclick = async () => {
  try { await save(); draw(); message('設定已保存在本機（未儲存密碼）'); }
  catch (err) { message(err.message); }
};
$('start').onclick = async () => {
  try {
    await save();
    const raw = $('steps').value.trim();
    const params = { targetId, ...(accountId ? { accountId } : {}) };
    if (raw) params.steps = JSON.parse(raw);
    await post('start', params);
    message(); await refresh();
  } catch (err) { message(err.message); }
};
$('takeover').onclick = async () => { try { await post('takeover'); await refresh(); } catch(err) { message(err.message); } };
$('resume').onclick = async () => { try { await post('resume'); await refresh(); } catch(err) { message(err.message); } };
$('stop').onclick = async () => { try { await post('stop'); await refresh(); } catch(err) { message(err.message); } };
async function refresh() {
  try {
    const response = await fetch('/api/status', {cache:'no-store'});
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
      li.textContent = new Date(event.at).toLocaleTimeString() + ' — ' + event.message;
      return li;
    }));
    const show = data.state === 'running';
    $('preview').style.display = show ? 'block' : 'none';
    $('overlay').style.display = show ? 'none' : 'block';
    if (!show) $('preview').removeAttribute('src');
    $('overlay').textContent = data.state === 'manual'
      ? '人工接管中：請操作彈出的 Chromium，完成 LINE 或測試帳號登入後按「登入完成，繼續」。'
      : '目前狀態：' + (states[data.state] || data.state);
    $('notice').textContent = data.state === 'manual'
      ? '已暫停：' + (data.pauseReason || '等待人工操作') + '。密碼、OTP、LINE 驗證只在 Chromium 視窗輸入，不會擷取登入畫面。'
      : '選取的站點以獨立瀏覽器工作階段測試。手機模式採用 390 × 844 視窗模擬。';
    if (show) {
      const previewResponse = await fetch('/api/preview', {cache:'no-store'});
      if (previewResponse.ok && previewResponse.status === 200) {
        const blob = await previewResponse.blob();
        if (data.state === 'running') {
          const url = URL.createObjectURL(blob);
          $('preview').onload = () => URL.revokeObjectURL(url);
          $('preview').src = url;
        }
      }
    }
    previousState = data.state;
  } catch { /* transient server failure */ }
}
async function initialize() {
  try {
    const response = await fetch('/api/workspace', {cache:'no-store'});
    if (!response.ok) throw new Error('無法載入測試設定');
    workspace = await response.json();
    targetId = workspace.targets[0].id;
    draw(); await refresh();
  } catch(err) { message(err.message); }
}
setInterval(refresh, 1200);
initialize();
