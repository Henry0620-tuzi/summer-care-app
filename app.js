const initialPlans = {
  today: [
    { id: 1, title: '晨读《昆虫记》', meta: '语文 · 20分钟', points: 10, done: true },
    { id: 2, title: '数学口算练习', meta: '数学 · 30道', points: 15, done: true },
    { id: 3, title: '英语单词打卡', meta: '英语 · Unit 3', points: 10, done: true },
    { id: 4, title: '跳绳运动', meta: '运动 · 20分钟', points: 15, done: false },
    { id: 5, title: '整理自己的书桌', meta: '生活 · 10分钟', points: 10, done: false }
  ],
  tomorrow: [
    { id: 6, title: '练习硬笔字', meta: '语文 · 2页', points: 10, done: false },
    { id: 7, title: '科学小实验', meta: '科学 · 30分钟', points: 20, done: false },
    { id: 8, title: '骑自行车', meta: '运动 · 30分钟', points: 15, done: false }
  ],
  later: [
    { id: 9, title: '阅读英语绘本', meta: '英语 · 1本', points: 15, done: false },
    { id: 10, title: '帮忙准备午餐', meta: '生活 · 20分钟', points: 15, done: false }
  ]
};

const initialRewards = [
  { id: 1, icon: '🎨', name: '自由画画 30 分钟', cost: 50, desc: '尽情画出你的想象' },
  { id: 2, icon: '🍦', name: '冰淇淋一支', cost: 80, desc: '夏天的小小甜蜜' },
  { id: 3, icon: '🎮', name: '游戏时间 30 分钟', cost: 120, desc: '完成计划才能兑换' },
  { id: 4, icon: '📚', name: '想看的书一本', cost: 200, desc: '去发现新的世界' }
];

const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);
const clone = value => JSON.parse(JSON.stringify(value));

function freshState() {
  return {
    points: 280,
    totalEarned: 340,
    selectedDay: 'today',
    plans: clone(initialPlans),
    rewards: clone(initialRewards),
    history: [3, 2, 3, 3, 1, 2, 1],
    redeemed: 0,
    redemptions: [],
    transactions: [
      { id: 3, amount: 10, label: '完成「英语单词打卡」', time: '今天 09:20' },
      { id: 2, amount: 15, label: '完成「数学口算练习」', time: '今天 08:55' },
      { id: 1, amount: 10, label: '完成「晨读《昆虫记》」', time: '今天 08:20' }
    ]
  };
}

const GUEST_STATE_KEY = 'summerCareStateV2';
const { url: SUPABASE_URL, publishableKey: SUPABASE_KEY } = window.SUMMER_CARE_SUPABASE;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let authUser = null;
let profile = null;
let cloudSaveTimer = null;

function activeStateKey() {
  return authUser?.email ? `summerCareStateV2:${authUser.email}` : GUEST_STATE_KEY;
}

function loadState() {
  try {
    const current = JSON.parse(localStorage.getItem(activeStateKey()) || 'null');
    if (current) return current;
    const legacy = authUser ? null : JSON.parse(localStorage.getItem('summerCareState') || 'null');
    if (legacy?.tasks) {
      const migrated = freshState();
      migrated.points = Number(legacy.points) || migrated.points;
      migrated.plans.today = legacy.tasks;
      migrated.history[(new Date().getDay() + 6) % 7] = legacy.tasks.filter(task => task.done).length;
      return migrated;
    }
  } catch (error) {
    console.warn('本地数据读取失败，已使用默认数据。', error);
  }
  return freshState();
}

function normalizeState(value) {
  value.totalEarned ??= 340;
  value.redeemed ??= 0;
  value.redemptions = (value.redemptions || []).map((redemption, index) => ({
    ...redemption,
    id: redemption.id || index + 1,
    status: redemption.status || 'pending'
  }));
  value.rewards = (value.rewards || clone(initialRewards)).map((reward, index) => ({ id: reward.id || index + 1, ...reward }));
  value.transactions ??= [];
  value.history ??= [3, 2, 3, 3, 1, 2, 1];
  value.plans ??= clone(initialPlans);
  value.selectedDay ??= 'today';
  return value;
}

let state = normalizeState(loadState());

let editingTask = null;
let editingReward = null;
let passwordRecoveryMode = false;

function save() {
  localStorage.setItem(activeStateKey(), JSON.stringify(state));
  if (!authUser) return;
  const userId = authUser.id;
  const stateSnapshot = clone(state);
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(async () => {
    const { error } = await supabaseClient.from('app_states').upsert({ user_id: userId, state: stateSnapshot, updated_at: new Date().toISOString() });
    if (error) console.warn('云端保存失败，将保留本地副本。', error);
  }, 350);
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function currentUser() {
  return profile;
}

async function loadCloudAccount(user) {
  authUser = user;
  const { data: profileData, error: profileError } = await supabaseClient.from('profiles').select('id,email,name,role,status,created_at,last_login_at').eq('id', user.id).single();
  if (profileError) throw profileError;
  if (profileData.status === 'disabled') {
    await supabaseClient.auth.signOut();
    throw new Error('该账户已被管理员停用。');
  }
  profile = profileData;
  const { data: stateData, error: stateError } = await supabaseClient.from('app_states').select('state').eq('user_id', user.id).maybeSingle();
  if (stateError) throw stateError;
  const cloudState = stateData?.state;
  const localState = loadState();
  state = normalizeState(cloudState && Object.keys(cloudState).length ? cloudState : localState);
  state.history[todayHistoryIndex()] = (state.plans.today || []).filter(task => task.done).length;
  localStorage.setItem(activeStateKey(), JSON.stringify(state));
  await Promise.all([
    supabaseClient.from('app_states').upsert({ user_id: user.id, state, updated_at: new Date().toISOString() }),
    supabaseClient.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', user.id)
  ]);
  render();
}

async function clearCloudAccount() {
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = null;
  authUser = null;
  profile = null;
  state = normalizeState(loadState());
  render();
}

function safe(text) {
  const element = document.createElement('div');
  element.textContent = String(text);
  return element.innerHTML;
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function closeAccountModals() {
  $('#profileEditModal').classList.add('hidden');
  $('#userPasswordModal').classList.add('hidden');
  $('#userPasswordMessage').textContent = '';
  passwordRecoveryMode = false;
  $('#currentPasswordRow').classList.remove('hidden');
  $('#currentPasswordInput').required = true;
}

function weeklyReportText() {
  const user = currentUser();
  const completed = state.history.reduce((sum, value) => sum + value, 0);
  const todayDone = (state.plans.today || []).filter(task => task.done).length;
  const todayTotal = (state.plans.today || []).length;
  return `🌱 ${user?.name || '小满'}的暑假成长周报\n本周完成 ${completed} 项计划\n今天进度 ${todayDone}/${todayTotal}\n当前成长积分 ${state.points}\n累计获得 ${state.totalEarned} 分\n一步一步，把暑假过成自己的作品。`;
}

function getDayInfo(day) {
  const offsets = { today: 0, tomorrow: 1, later: 2 };
  const names = { today: '今天', tomorrow: '明天', later: '后天' };
  const date = new Date();
  date.setDate(date.getDate() + offsets[day]);
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const english = `${month} ${date.getDate()} · ${weekday}`;
  return { name: names[day], date, english };
}

function todayHistoryIndex() {
  return (new Date().getDay() + 6) % 7;
}

state.history[todayHistoryIndex()] = (state.plans.today || []).filter(task => task.done).length;

function formatGreetingDate() {
  const date = new Date();
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${weekdays[date.getDay()]} · ${date.getMonth() + 1}月${date.getDate()}日`;
}

function currentPlans() {
  return state.plans[state.selectedDay] || [];
}

function totalTasks() {
  return Object.values(state.plans).flat();
}

function findTask(id) {
  for (const [day, tasks] of Object.entries(state.plans)) {
    const task = tasks.find(item => item.id === id);
    if (task) return { task, day };
  }
}

function findReward(id) {
  return state.rewards.find(reward => reward.id === id);
}

function addTransaction(amount, label) {
  const now = new Date();
  state.transactions.unshift({
    id: Date.now(),
    amount,
    label,
    time: `今天 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  });
  state.transactions = state.transactions.slice(0, 30);
}

function formatRedemptionTime(value) {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderTasks() {
  const tasks = currentPlans();
  const done = tasks.filter(task => task.done).length;
  const dayInfo = getDayInfo(state.selectedDay);
  $('#taskList').innerHTML = tasks.length
    ? tasks.map(task => `<div class="task-item ${task.done ? 'done' : ''}">
        <button class="check-button" data-task="${task.id}" aria-label="${task.done ? '取消' : '完成'}任务">✓</button>
        <button class="task-main" data-edit="${task.id}" aria-label="编辑 ${safe(task.title)}"><strong>${safe(task.title)}</strong><small>${safe(task.meta)}</small></button>
        <span class="task-points">+${task.points}</span>
      </div>`).join('')
    : '<div class="empty-state">这一天还没有计划，点击“新增”安排一下吧。</div>';

  $('#progressText').textContent = `${done}/${tasks.length}`;
  $('#progressBar').style.width = `${tasks.length ? done / tasks.length * 100 : 0}%`;
  $('#progressHint').textContent = !tasks.length ? '先添加一项小计划吧' : done === tasks.length ? '太棒了，这天的计划全部完成！' : `还剩 ${tasks.length - done} 项，加油！`;
  $('#heroCaption').textContent = done === tasks.length && tasks.length ? '计划已全部点亮，去领取你的奖励吧！' : '完成计划，就能点亮一颗星星';
  $('#planDateLabel').textContent = dayInfo.english;
  $('#planTitle').textContent = `${dayInfo.name}的计划`;
  $('#growthLabel').textContent = `${dayInfo.name}成长`;
  $('#progressLabel').textContent = `${dayInfo.name}进度`;
  $('#completeDayBtn').disabled = !tasks.some(task => !task.done);
  $('#completeDayBtn').textContent = tasks.length && tasks.every(task => task.done) ? '已完成' : '全部完成';
  $$('.day-button').forEach(button => button.classList.toggle('active', button.dataset.day === state.selectedDay));
  $$('[data-task]').forEach(button => button.onclick = () => toggleTask(Number(button.dataset.task)));
  $$('[data-edit]').forEach(button => button.onclick = () => openTaskModal(Number(button.dataset.edit)));
}

function toggleTask(id) {
  const found = findTask(id);
  if (!found) return;
  const { task, day } = found;
  if (task.done && state.points < task.points) {
    toast('这项积分已经使用，暂时不能取消打卡');
    return;
  }
  task.done = !task.done;
  const change = task.done ? task.points : -task.points;
  state.points += change;
  state.totalEarned += change;
  const todayIndex = todayHistoryIndex();
  if (day === 'today') state.history[todayIndex] = Math.max(0, (state.history[todayIndex] || 0) + (task.done ? 1 : -1));
  addTransaction(change, `${task.done ? '完成' : '取消'}「${task.title}」`);
  save();
  render();
  toast(task.done ? `完成「${task.title}」 +${task.points} 积分` : '已取消这项打卡');
}

function renderRewards() {
  $('#rewardStrip').innerHTML = state.rewards.slice(0, 3).map(reward => `<div class="reward-chip"><div class="reward-art">${safe(reward.icon)}</div><strong>${safe(reward.name)}</strong><small>${reward.cost} 积分</small></div>`).join('');
  $('#rewardGrid').innerHTML = state.rewards.length
    ? state.rewards.map(reward => `<div class="reward-card">
        <button class="reward-edit" data-reward-edit="${reward.id}" aria-label="编辑 ${safe(reward.name)}">···</button>
        <div class="reward-art">${safe(reward.icon)}</div><strong>${safe(reward.name)}</strong><p>${safe(reward.desc)}</p>
        <button data-reward="${reward.id}" ${state.points < reward.cost ? 'disabled' : ''}>${state.points < reward.cost ? `还差 ${reward.cost - state.points} 分` : `兑换 · ${reward.cost} 分`}</button>
      </div>`).join('')
    : '<div class="empty-state reward-empty">还没有奖励，先新增一个期待吧。</div>';
  $('#balanceText').textContent = state.points;
  $('#pointsText').textContent = state.points;
  $('#earnedText').textContent = `本月已获得 ${state.totalEarned}`;
  $('#weekPoints').textContent = `本周 +${Math.max(0, state.history.reduce((sum, value) => sum + value, 0) * 10)}`;
  renderRedemptions();
  $$('[data-reward]').forEach(button => button.onclick = () => redeem(Number(button.dataset.reward)));
  $$('[data-reward-edit]').forEach(button => button.onclick = () => openRewardModal(Number(button.dataset.rewardEdit)));
}

function renderRedemptions() {
  const pending = state.redemptions.filter(item => item.status === 'pending');
  const entries = [...state.redemptions].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 8);
  $('#redemptionCount').textContent = `${pending.length} 个待领取`;
  $('#redemptionList').innerHTML = entries.length
    ? entries.map(item => `<article class="redemption-item ${item.status}">
        <div class="redemption-icon">${safe(item.icon || '🎁')}</div>
        <div><strong>${safe(item.name)}</strong><small>${formatRedemptionTime(item.redeemedAt)} · ${Number(item.cost) || 0} 积分</small></div>
        <span>${item.status === 'received' ? '已领取' : '待家长确认'}</span>
      </article>`).join('')
    : '<div class="empty-state">兑换奖励后，会在这里等待家长确认领取。</div>';
}

function redeem(id) {
  const reward = findReward(id);
  if (!reward || state.points < reward.cost) return;
  state.points -= reward.cost;
  state.redeemed += reward.cost;
  state.redemptions.unshift({
    id: Date.now(),
    rewardId: reward.id,
    icon: reward.icon,
    name: reward.name,
    cost: reward.cost,
    status: 'pending',
    redeemedAt: new Date().toISOString()
  });
  addTransaction(-reward.cost, `兑换「${reward.name}」`);
  save();
  render();
  toast(`已兑换「${reward.name}」，等待家长确认领取`);
}

function renderHistory() {
  $('#pointsHistory').innerHTML = state.transactions.length
    ? state.transactions.slice(0, 8).map(item => `<div class="history-item"><div><strong>${safe(item.label)}</strong><small>${safe(item.time)}</small></div><span class="${item.amount >= 0 ? 'income' : 'expense'}">${item.amount >= 0 ? '+' : ''}${item.amount}</span></div>`).join('')
    : '<div class="empty-state">完成计划或兑换奖励后，这里会出现积分记录。</div>';
}

function renderChart() {
  const values = state.history;
  const completed = values.reduce((sum, value) => sum + value, 0);
  const planned = Math.max(completed + 6, 22);
  const max = Math.max(...values, 4);
  $('#barChart').innerHTML = values.map((value, index) => `<div class="bar ${index === todayHistoryIndex() ? 'today' : ''}" style="height:${Math.max(8, value / max * 100)}%" data-value="${value}"></div>`).join('');
  $('#weekTotal').textContent = `${completed} / ${planned} 项`;
  $('#completedTotal').innerHTML = `${completed}<span>项</span>`;
  $('#studyTime').innerHTML = `${(completed * 0.55).toFixed(1)}<span>h</span>`;
  $('#streakText').innerHTML = `${Math.max(1, Math.min(14, completed ? 7 : 1))} <em>天</em>`;
}

function render() {
  $('#greetingDate').textContent = formatGreetingDate();
  renderAccount();
  renderTasks();
  renderRewards();
  renderHistory();
  renderChart();
  renderNotifications();
}

function renderNotifications() {
  const pendingTasks = (state.plans.today || []).filter(task => !task.done);
  const pendingRewards = state.redemptions.filter(item => item.status === 'pending');
  const noticeCount = pendingTasks.length + pendingRewards.length;
  const badge = $('#notifyBadge');
  badge.textContent = noticeCount > 9 ? '9+' : String(noticeCount);
  badge.classList.toggle('hidden', noticeCount === 0);
  $('#notifyBtn').setAttribute('aria-label', noticeCount ? `通知，${noticeCount} 条待处理` : '通知，无待处理事项');

  const notices = [];
  if (pendingTasks.length) notices.push({ icon: '✓', title: `今天还有 ${pendingTasks.length} 项计划`, text: pendingTasks.slice(0, 2).map(task => task.title).join('、'), screen: 'homeScreen', action: '去完成' });
  if (pendingRewards.length) notices.push({ icon: '🎁', title: `${pendingRewards.length} 个奖励等待领取`, text: pendingRewards.slice(0, 2).map(item => item.name).join('、'), screen: 'rewardsScreen', action: '去查看' });
  $('#notificationList').innerHTML = notices.length
    ? notices.map(notice => `<article class="notification-item"><span>${notice.icon}</span><div><strong>${safe(notice.title)}</strong><small>${safe(notice.text)}</small></div><button type="button" data-notice-screen="${notice.screen}">${notice.action}</button></article>`).join('')
    : '<div class="notification-empty"><span>🌿</span><strong>今天都处理好啦</strong><p>计划已完成，奖励也都领取了。</p></div>';
  $$('[data-notice-screen]').forEach(button => button.onclick = () => {
    closeNotifications();
    showScreen(button.dataset.noticeScreen);
  });
}

function openNotifications() {
  renderNotifications();
  $('#notificationModal').classList.remove('hidden');
}

function closeNotifications() {
  $('#notificationModal').classList.add('hidden');
}

function renderAccount() {
  const user = currentUser();
  const displayName = user?.name || '小满';
  const initial = displayName.slice(-1);
  $('#childNameText').textContent = displayName;
  $('#avatarText').textContent = initial;
  $('#authGuestView').classList.toggle('hidden', Boolean(user));
  $('#authUserView').classList.toggle('hidden', !user);
  $('#adminEntry').classList.toggle('hidden', user?.role !== 'admin');
  $('#accountSubtitle').textContent = user ? '查看账户状态与成长数据。' : '登录后，每个孩子都拥有独立的计划和积分。';
  if (!user) return;
  $('#accountAvatar').textContent = initial;
  $('#accountName').textContent = user.name;
  $('#accountEmail').textContent = user.email;
  $('#accountPoints').textContent = state.points;
  $('#accountEarned').textContent = state.totalEarned;
  $('#accountRedeemed').textContent = state.redeemed;
}

function showScreen(id) {
  $$('.screen').forEach(screen => screen.classList.toggle('hidden', screen.id !== id));
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.screen === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setAuthTab(tab) {
  const isLogin = tab === 'login';
  $('#loginForm').classList.toggle('hidden', !isLogin);
  $('#registerForm').classList.toggle('hidden', isLogin);
  $$('.auth-tab').forEach(button => button.classList.toggle('active', button.dataset.authTab === tab));
  $('#authMessage').textContent = '';
}

function showAuthMessage(message, type = 'error') {
  const element = $('#authMessage');
  element.textContent = message;
  element.className = `auth-message ${type}`;
}

function openTaskModal(id) {
  const found = id ? findTask(id) : null;
  editingTask = found ? { id, day: found.day } : null;
  const task = found?.task;
  $('#modalTitle').textContent = task ? '编辑计划' : '新增计划';
  $('#taskNameInput').value = task?.title || '';
  $('#taskMetaInput').value = task?.meta || '';
  $('#taskPointsInput').value = task?.points || 10;
  $('#taskDayInput').value = found?.day || state.selectedDay;
  $('#deleteTaskBtn').classList.toggle('hidden', !task);
  $('#taskModal').classList.remove('hidden');
  $('#taskNameInput').focus();
}

function closeTaskModal() {
  $('#taskModal').classList.add('hidden');
  editingTask = null;
}

function nextTaskId() {
  return Math.max(0, ...totalTasks().map(task => task.id)) + 1;
}

function completeSelectedDay() {
  const pending = currentPlans().filter(task => !task.done);
  if (!pending.length) return;
  const gained = pending.reduce((sum, task) => sum + task.points, 0);
  pending.forEach(task => task.done = true);
  state.points += gained;
  state.totalEarned += gained;
  const todayIndex = todayHistoryIndex();
  if (state.selectedDay === 'today') state.history[todayIndex] = (state.history[todayIndex] || 0) + pending.length;
  addTransaction(gained, `完成${getDayInfo(state.selectedDay).name}全部计划`);
  save();
  render();
  toast(`全部完成！获得 ${gained} 积分`);
}

function openRewardModal(id) {
  const reward = id ? findReward(id) : null;
  editingReward = reward ? id : null;
  $('#rewardModalTitle').textContent = reward ? '编辑奖励' : '新增奖励';
  $('#rewardIconInput').value = reward?.icon || '';
  $('#rewardNameInput').value = reward?.name || '';
  $('#rewardDescInput').value = reward?.desc || '';
  $('#rewardCostInput').value = reward?.cost || 50;
  $('#deleteRewardBtn').classList.toggle('hidden', !reward);
  $('#rewardModal').classList.remove('hidden');
  $('#rewardIconInput').focus();
}

function closeRewardModal() {
  $('#rewardModal').classList.add('hidden');
  editingReward = null;
}

function nextRewardId() {
  return Math.max(0, ...state.rewards.map(reward => reward.id)) + 1;
}

$('#taskForm').onsubmit = event => {
  event.preventDefault();
  const title = $('#taskNameInput').value.trim();
  const meta = $('#taskMetaInput').value.trim();
  const points = Number($('#taskPointsInput').value);
  const day = $('#taskDayInput').value;
  const wasEditing = Boolean(editingTask);
  if (!title || !meta || !points) return;

  if (editingTask) {
    const found = findTask(editingTask.id);
    const oldPoints = found.task.points;
    const oldDay = found.day;
    if (found.task.done && oldPoints !== points) {
      const difference = points - oldPoints;
      if (state.points + difference < 0) {
        toast('积分已经使用，不能把这项积分调得更低');
        return;
      }
      state.points += difference;
      state.totalEarned += difference;
      addTransaction(difference, `调整「${title}」积分`);
    }
    Object.assign(found.task, { title, meta, points });
    if (oldDay !== day) {
      state.plans[oldDay] = state.plans[oldDay].filter(task => task.id !== found.task.id);
      state.plans[day].push(found.task);
      if (found.task.done) {
        const todayIndex = todayHistoryIndex();
        if (oldDay === 'today') state.history[todayIndex] = Math.max(0, state.history[todayIndex] - 1);
        if (day === 'today') state.history[todayIndex] += 1;
      }
    }
  } else {
    state.plans[day].push({ id: nextTaskId(), title, meta, points, done: false });
  }
  state.selectedDay = day;
  save();
  closeTaskModal();
  render();
  toast(wasEditing ? '计划已更新' : '已添加新的计划');
};

$('#deleteTaskBtn').onclick = () => {
  if (!editingTask) return;
  const found = findTask(editingTask.id);
  if (found.task.done) {
    if (state.points < found.task.points) {
      toast('积分已经使用，暂时不能删除这项计划');
      return;
    }
    state.points -= found.task.points;
    state.totalEarned -= found.task.points;
    const todayIndex = todayHistoryIndex();
    if (found.day === 'today') state.history[todayIndex] = Math.max(0, state.history[todayIndex] - 1);
    addTransaction(-found.task.points, `删除已完成计划「${found.task.title}」`);
  }
  state.plans[found.day] = state.plans[found.day].filter(task => task.id !== editingTask.id);
  save();
  closeTaskModal();
  render();
  toast('计划已删除');
};

$('#rewardForm').onsubmit = event => {
  event.preventDefault();
  const icon = $('#rewardIconInput').value.trim();
  const name = $('#rewardNameInput').value.trim();
  const desc = $('#rewardDescInput').value.trim();
  const cost = Number($('#rewardCostInput').value);
  const wasEditing = Boolean(editingReward);
  if (!icon || !name || !desc || !cost) return;
  if (editingReward) Object.assign(findReward(editingReward), { icon, name, desc, cost });
  else state.rewards.push({ id: nextRewardId(), icon, name, desc, cost });
  save();
  closeRewardModal();
  render();
  toast(wasEditing ? '奖励已更新' : '已添加新的奖励');
};

$('#deleteRewardBtn').onclick = () => {
  if (!editingReward) return;
  state.rewards = state.rewards.filter(reward => reward.id !== editingReward);
  save();
  closeRewardModal();
  render();
  toast('奖励已删除');
};

$$('.day-button').forEach(button => button.onclick = () => {
  state.selectedDay = button.dataset.day;
  save();
  renderTasks();
});
$$('.nav-item[data-screen]').forEach(item => item.onclick = () => showScreen(item.dataset.screen));
$('#viewAllRewardsBtn').onclick = () => showScreen('rewardsScreen');
$('#addTaskBtn').onclick = () => openTaskModal();
$('#completeDayBtn').onclick = completeSelectedDay;
$('#closeModalBtn').onclick = closeTaskModal;
$('#taskModal').onclick = event => { if (event.target === event.currentTarget) closeTaskModal(); };
$('#addRewardBtn').onclick = () => openRewardModal();
$('#closeRewardModalBtn').onclick = closeRewardModal;
$('#rewardModal').onclick = event => { if (event.target === event.currentTarget) closeRewardModal(); };
$('#notifyBtn').onclick = openNotifications;
$('#closeNotificationBtn').onclick = closeNotifications;
$('#notificationModal').onclick = event => { if (event.target === event.currentTarget) closeNotifications(); };
$$('.auth-tab').forEach(button => button.onclick = () => setAuthTab(button.dataset.authTab));
$('#loginForm').onsubmit = async event => {
  event.preventDefault();
  const email = normalizeEmail($('#loginEmailInput').value);
  const password = $('#loginPasswordInput').value;
  showAuthMessage('正在登录…', 'success');
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    showAuthMessage(error.message.includes('Email not confirmed') ? '请先打开注册邮件完成邮箱验证。' : '邮箱或密码不正确，请重新输入。');
    return;
  }
  try {
    await loadCloudAccount(data.user);
    $('#loginForm').reset();
    showAuthMessage('');
    toast(`欢迎回来，${profile.name}`);
  } catch (accountError) {
    showAuthMessage(accountError.message || '账户加载失败，请稍后再试。');
  }
};
$('#forgotPasswordBtn').onclick = async () => {
  const email = normalizeEmail($('#loginEmailInput').value);
  if (!email) {
    showAuthMessage('请先输入需要找回密码的邮箱。');
    return;
  }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: 'https://henry0620-tuzi.github.io/summer-care-app/' });
  showAuthMessage(error ? `发送失败：${error.message}` : '密码重置邮件已发送，请检查邮箱。', error ? 'error' : 'success');
};
$('#registerForm').onsubmit = async event => {
  event.preventDefault();
  const name = $('#registerNameInput').value.trim();
  const email = normalizeEmail($('#registerEmailInput').value);
  const password = $('#registerPasswordInput').value;
  const confirmPassword = $('#registerConfirmInput').value;
  if (password.length < 6) {
    showAuthMessage('密码至少需要 6 位。');
    return;
  }
  if (password !== confirmPassword) {
    showAuthMessage('两次输入的密码不一致。');
    return;
  }
  showAuthMessage('正在创建云端账户…', 'success');
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { name }, emailRedirectTo: 'https://henry0620-tuzi.github.io/summer-care-app/' }
  });
  if (error) {
    showAuthMessage(error.message.includes('already registered') ? '该邮箱已经注册，请直接登录。' : `注册失败：${error.message}`);
    return;
  }
  $('#registerForm').reset();
  if (data.session) {
    await loadCloudAccount(data.user);
    toast(`账户创建成功，欢迎你，${name}`);
  } else {
    setAuthTab('login');
    showAuthMessage('注册成功！请打开验证邮件，完成后再登录。', 'success');
  }
};
$('#logoutBtn').onclick = async () => {
  const name = currentUser()?.name || '';
  await supabaseClient.auth.signOut();
  await clearCloudAccount();
  setAuthTab('login');
  toast(`${name}已退出登录`);
};
$('#editProfileBtn').onclick = () => {
  const user = currentUser();
  if (!user) return;
  $('#profileNameInput').value = user.name;
  $('#profileEmailInput').value = user.email;
  $('#profileEditModal').classList.remove('hidden');
};
$('#closeProfileEditBtn').onclick = closeAccountModals;
$('#profileEditModal').onclick = event => { if (event.target === event.currentTarget) closeAccountModals(); };
$('#profileEditForm').onsubmit = async event => {
  event.preventDefault();
  const user = currentUser();
  const name = $('#profileNameInput').value.trim();
  if (!user || !name) return;
  const { error } = await supabaseClient.from('profiles').update({ name }).eq('id', authUser.id);
  if (error) {
    toast('资料更新失败，请稍后再试');
    return;
  }
  profile.name = name;
  closeAccountModals();
  render();
  toast('个人资料已更新');
};
$('#changePasswordBtn').onclick = () => {
  passwordRecoveryMode = false;
  $('#currentPasswordRow').classList.remove('hidden');
  $('#currentPasswordInput').required = true;
  $('#userPasswordForm').reset();
  $('#userPasswordMessage').textContent = '';
  $('#userPasswordModal').classList.remove('hidden');
};
$('#closeUserPasswordBtn').onclick = closeAccountModals;
$('#userPasswordModal').onclick = event => { if (event.target === event.currentTarget) closeAccountModals(); };
$('#userPasswordForm').onsubmit = async event => {
  event.preventDefault();
  const user = currentUser();
  const currentPassword = $('#currentPasswordInput').value;
  const newPassword = $('#newUserPasswordInput').value;
  const confirmPassword = $('#confirmUserPasswordInput').value;
  const verifyResult = passwordRecoveryMode ? { error: null } : await supabaseClient.auth.signInWithPassword({ email: user?.email || '', password: currentPassword });
  if (!user || verifyResult.error) {
    $('#userPasswordMessage').textContent = '当前密码不正确。';
    return;
  }
  if (newPassword.length < 6) {
    $('#userPasswordMessage').textContent = '新密码至少需要 6 位。';
    return;
  }
  if (newPassword !== confirmPassword) {
    $('#userPasswordMessage').textContent = '两次输入的新密码不一致。';
    return;
  }
  const { error: updateError } = await supabaseClient.auth.updateUser({ password: newPassword });
  if (updateError) {
    $('#userPasswordMessage').textContent = `修改失败：${updateError.message}`;
    return;
  }
  passwordRecoveryMode = false;
  $('#currentPasswordRow').classList.remove('hidden');
  $('#currentPasswordInput').required = true;
  closeAccountModals();
  toast('登录密码已修改');
};
$('#shareReportBtn').onclick = async () => {
  const text = weeklyReportText();
  try {
    if (navigator.share) await navigator.share({ title: '小树暑托成长周报', text });
    else {
      await navigator.clipboard.writeText(text);
      toast('成长周报已复制，可以发送给家人');
    }
  } catch (error) {
    if (error.name !== 'AbortError') toast('分享未完成，请稍后再试');
  }
};
$('#exportDataBtn').onclick = () => {
  const user = currentUser();
  if (!user) return;
  const date = new Date().toISOString().slice(0, 10);
  downloadJson(`小树暑托-${user.name}-${date}.json`, { app: 'summer-care-app', version: 1, exportedAt: new Date().toISOString(), user: { name: user.name, email: user.email }, state });
  toast('备份文件已导出');
};
$('#importDataBtn').onclick = () => $('#importDataInput').click();
$('#importDataInput').onchange = async event => {
  const file = event.target.files?.[0];
  const user = currentUser();
  if (!file || !user) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup.app !== 'summer-care-app' || backup.user?.email !== user.email || !backup.state?.plans || !Array.isArray(backup.state?.history)) throw new Error('invalid');
    state = normalizeState(backup.state);
    save();
    render();
    toast('备份数据已恢复');
  } catch (error) {
    toast('备份文件无效，或不属于当前账户');
  } finally {
    event.target.value = '';
  }
};
$('#resetDataBtn').onclick = () => {
  state = freshState();
  save();
  render();
  toast('已恢复示例数据');
};

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  closeTaskModal();
  closeRewardModal();
  closeAccountModals();
  closeNotifications();
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(error => console.warn('离线功能注册失败。', error));
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => element.classList.remove('show'), 2200);
}

async function initializeApp() {
  render();
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session?.user) return;
  try {
    await loadCloudAccount(session.user);
  } catch (error) {
    showScreen('profileScreen');
    showAuthMessage(error.message || '云端账户加载失败，请重新登录。');
  }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' && !session) clearCloudAccount();
  if (event === 'PASSWORD_RECOVERY') {
    passwordRecoveryMode = true;
    showScreen('profileScreen');
    $('#userPasswordModal').classList.remove('hidden');
    $('#currentPasswordRow').classList.add('hidden');
    $('#currentPasswordInput').required = false;
  }
});

initializeApp();
