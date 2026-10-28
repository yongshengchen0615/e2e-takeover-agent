// Non-destructive presets grounded in MemberWebsocket-dev's published HTML.
// "structure" checks DOM scaffolding, not user authorization or API success.
const DEFAULT_BASE_URL = 'https://memberwebsocket-dev-netlify.netlify.app';
const profileSpecs = [
  { id: 'admin-structure', label: '管理端｜頁面結構', audience: 'admin', level: 'structure', path: '/admin/',
    note: '驗證管理端元件存在（可為隱藏狀態）；不代表管理員已登入。',
    checks: [['管理員主頁容器', '#adminView'], ['管理員登入載入區', '#loadingView'], ['會員管理分頁', '#membersTab'], ['QA 測試分頁', '#testModeTab']] },
  { id: 'client-structure', label: '用戶端｜會員頁面結構', audience: 'client', level: 'structure', path: '/member/',
    note: '驗證會員卡 DOM 結構；不代表 LINE LIFF 已登入。',
    checks: [['會員頁容器', '#memberView'], ['會員卡容器', '#memberPass'], ['會員階級區', '#membershipProgress'], ['會員登入載入區', '#loadingView']] },
  { id: 'admin-auth', label: '管理端｜人工登入後驗收', audience: 'admin', level: 'authenticated', path: '/admin/',
    note: '需本人操作原始 Chromium 完成 LINE／管理員驗證；只讀檢查管理員工作台。',
    view: '#adminView', checks: [['管理工作台可見', '#adminView'], ['會員管理可見', '#membersPanel'], ['會員名冊可見', '#memberDirectoryPanel']] },
  { id: 'client-member-auth', label: '用戶端｜會員卡登入後驗收', audience: 'client', level: 'authenticated', path: '/member/',
    note: '需在原始 Chromium 完成會員登入及必要的個人資料／條款流程。',
    view: '#memberView', checks: [['會員首頁可見', '#memberView'], ['會員卡可見', '#memberPass'], ['會員階級可見', '#membershipProgress']] },
  { id: 'client-points-auth', label: '用戶端｜集點卡登入後驗收', audience: 'client', level: 'authenticated', path: '/points/',
    note: '只讀驗證集點卡頁面；不點擊點數轉贈或票券兌換。',
    view: '#pointsView', checks: [['集點卡頁可見', '#pointsView'], ['會員階級資訊可見', '#membershipProgress']] },
  { id: 'client-booking-auth', label: '用戶端｜預約登入後驗收', audience: 'client', level: 'authenticated', path: '/booking/',
    note: '只讀驗證可預約畫面；不送出預約，不拍攝或上傳收據。',
    view: '#bookingView', checks: [['預約頁可見', '#bookingView'], ['預約日期日曆可見', '#calendarGrid']] },
  { id: 'client-event-auth', label: '用戶端｜活動票券登入後驗收', audience: 'client', level: 'authenticated', path: '/event/',
    note: '只讀驗證活動票券入口；不領取或使用票券。',
    view: '#eventView', checks: [['活動票券頁可見', '#eventView'], ['活動票券列表可見', '#eventList']] },
  { id: 'client-calendar-auth', label: '用戶端｜活動日曆登入後驗收', audience: 'client', level: 'authenticated', path: '/calendar/',
    note: '只讀驗證活動日曆；不建立或修改活動。',
    view: '#calendarView', checks: [['活動日曆頁可見', '#calendarView'], ['活動日曆內容可見', '#calendarGrid']] }
];

const assertSteps = spec => spec.checks.map(([title, selector]) => ({
  name: title, action: spec.level === 'structure' ? 'assertPresent' : 'assertVisible', selector
}));

export function listProfiles() {
  return profileSpecs.map(({id,label,audience,level,note}) => ({id,label,audience,level,note}));
}

export function createProfilePlan(id, { baseUrl = DEFAULT_BASE_URL } = {}) {
  const spec = profileSpecs.find(x => x.id === id);
  if (!spec) throw new Error('找不到指定的管理端／用戶端測試範本');
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) throw new Error('baseUrl 不合法');
  const steps = [
    { name: '進入測試頁', action: 'goto', path: spec.path },
    ...(spec.level === 'authenticated' ? [{ name: '人工確認登入', action: 'pauseForLogin' }] : []),
    ...assertSteps(spec)
  ];
  const acceptance = {
    method: 'QA / E2E',
    criteria: spec.checks.map(([title], index) => ({
      id: (spec.audience === 'admin' ? 'ADM' : 'USR') + '-' + String(index + 1).padStart(3,'0'),
      title: (spec.level === 'structure' ? '畫面結構：' : '已登入畫面：') + title,
      required: true, stepNames: [title]
    }))
  };
  return {
    baseUrl,
    profileId: id,
    audience: spec.audience,
    level: spec.level,
    ...(spec.level === 'authenticated' ? { resumeWhen: { path: spec.path, selector: spec.view } } : {}),
    steps, acceptance
  };
}
