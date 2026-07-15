const USERS_KEY = 'summerCareUsersV1';
const SESSION_KEY = 'summerCareSessionV1';
const ADMIN_KEY = 'summerCareAdminV1';
const ADMIN_SESSION_KEY = 'summerCareAdminSessionV1';
const USER_STATE_PREFIX = 'summerCareStateV2:';
const DEFAULT_ADMIN = { username: 'admin', passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918' };
const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);

let users = loadJson(USERS_KEY, {});
const storedAdmin = loadJson(ADMIN_KEY, null);
let admin = storedAdmin?.credentialVersion === 2
  ? storedAdmin
  : { ...DEFAULT_ADMIN, credentialVersion: 2, createdAt: storedAdmin?.createdAt || new Date().toISOString() };
localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
let editingEmail = '';
let passwordMode = 'user';

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch (error) { console.warn(`${key} 读取失败`, error); return fallback; }
}

function safe(text) {
  const element = document.createElement('div');
  element.textContent = String(text ?? '');
  return element.innerHTML;
}

async function hashPassword(password) {
  if (window.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return btoa(unescape(encodeURIComponent(password)));
}

function saveUsers() {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function isAdminLoggedIn() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'authenticated';
}

function userState(email) {
  return loadJson(`${USER_STATE_PREFIX}${email}`, { points: 280, totalEarned: 340, redeemed: 0, plans: { today: [], tomorrow: [], later: [] }, transactions: [] });
}

function saveUserState(email, value) {
  localStorage.setItem(`${USER_STATE_PREFIX}${email}`, JSON.stringify(value));
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

function freshUserState() {
  return {
    points: 280, totalEarned: 340, selectedDay: 'today', redeemed: 0,
    history: [3, 2, 3, 3, 1, 2, 1],
    plans: {
      today: [{ id: 1, title: '晨读《昆虫记》', meta: '语文 · 20分钟', points: 10, done: true }, { id: 2, title: '数学口算练习', meta: '数学 · 30道', points: 15, done: true }, { id: 3, title: '英语单词打卡', meta: '英语 · Unit 3', points: 10, done: true }, { id: 4, title: '跳绳运动', meta: '运动 · 20分钟', points: 15, done: false }, { id: 5, title: '整理自己的书桌', meta: '生活 · 10分钟', points: 10, done: false }],
      tomorrow: [{ id: 6, title: '练习硬笔字', meta: '语文 · 2页', points: 10, done: false }],
      later: [{ id: 7, title: '阅读英语绘本', meta: '英语 · 1本', points: 15, done: false }]
    },
    rewards: [{ id: 1, icon: '🎨', name: '自由画画 30 分钟', cost: 50, desc: '尽情画出你的想象' }, { id: 2, icon: '🍦', name: '冰淇淋一支', cost: 80, desc: '夏天的小小甜蜜' }],
    transactions: [{ id: 1, amount: 10, label: '完成「晨读《昆虫记》」', time: '今天 08:20' }]
  };
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function showAuth() {
  $('#adminAuthView').classList.remove('hidden');
  $('#adminDashboard').classList.add('hidden');
  $('#adminAuthTitle').textContent = '管理员登录';
  $('#adminAuthDescription').textContent = '使用管理员账户进入用户管理后台。';
  $('#adminAuthSubmit').textContent = '登录后台';
  $('#adminAuthMessage').textContent = '';
}

function showDashboard() {
  $('#adminAuthView').classList.add('hidden');
  $('#adminDashboard').classList.remove('hidden');
  renderUsers();
}

function renderUsers() {
  users = loadJson(USERS_KEY, {});
  Object.values(users).forEach(user => user.status ??= 'active');
  saveUsers();
  const query = $('#userSearchInput').value.trim().toLowerCase();
  const status = $('#statusFilter').value;
  const allEntries = Object.entries(users);
  const entries = allEntries.filter(([email, user]) => (!query || email.includes(query) || user.name.toLowerCase().includes(query)) && (status === 'all' || user.status === status));
  const states = allEntries.map(([email]) => userState(email));
  $('#totalUsersText').textContent = allEntries.length;
  $('#activeUsersText').textContent = allEntries.filter(([, user]) => user.status === 'active').length;
  $('#disabledUsersText').textContent = allEntries.filter(([, user]) => user.status === 'disabled').length;
  $('#totalPointsText').textContent = states.reduce((sum, value) => sum + (Number(value.points) || 0), 0);
  $('#userCountHint').textContent = `共 ${entries.length} 位用户`;
  $('#emptyUsers').classList.toggle('hidden', entries.length > 0);
  $('#userTableBody').innerHTML = entries.map(([email, user]) => {
    const data = userState(email);
    return `<tr><td><div class="user-cell"><div class="user-avatar">${safe(user.name.slice(-1))}</div><div><strong>${safe(user.name)}</strong><small>${safe(email)}</small></div></div></td><td><span class="status-pill ${user.status}">${user.status === 'active' ? '正常' : '已停用'}</span></td><td><span class="points-value">${Number(data.points) || 0}</span></td><td><span class="points-value">${Number(data.totalEarned) || 0}</span></td><td>${formatDate(user.createdAt)}</td><td>${formatDate(user.lastLoginAt)}</td><td><button class="edit-user-button" data-edit-user="${safe(email)}">管理</button></td></tr>`;
  }).join('');
  $$('[data-edit-user]').forEach(button => button.onclick = () => openUserModal(button.dataset.editUser));
}

function openUserModal(email) {
  const user = users[email];
  if (!user) return;
  const data = userState(email);
  editingEmail = email;
  $('#userModalTitle').textContent = `管理 ${user.name}`;
  $('#adminUserNameInput').value = user.name;
  $('#adminUserEmailInput').value = email;
  $('#adminUserStatusInput').value = user.status || 'active';
  $('#adminUserPointsInput').value = Number(data.points) || 0;
  $('#adminUserEarnedInput').value = Number(data.totalEarned) || 0;
  $('#userModal').classList.remove('hidden');
}

function closeUserModal() {
  editingEmail = '';
  $('#userModal').classList.add('hidden');
}

function openPasswordModal(mode) {
  passwordMode = mode;
  $('#passwordModalTitle').textContent = mode === 'admin' ? '修改管理员密码' : '重置用户密码';
  $('#newPasswordInput').minLength = mode === 'admin' ? 8 : 6;
  $('#confirmNewPasswordInput').minLength = mode === 'admin' ? 8 : 6;
  $('#passwordForm').reset();
  $('#passwordMessage').textContent = '';
  $('#passwordModal').classList.remove('hidden');
}

function closePasswordModal() {
  $('#passwordModal').classList.add('hidden');
}

function toast(message) {
  const element = $('#adminToast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(window.adminToastTimer);
  window.adminToastTimer = setTimeout(() => element.classList.remove('show'), 2200);
}

$('#adminAuthForm').onsubmit = async event => {
  event.preventDefault();
  const username = $('#adminUsernameInput').value.trim();
  const password = $('#adminPasswordInput').value;
  if (username !== admin.username || admin.passwordHash !== await hashPassword(password)) {
    $('#adminAuthMessage').textContent = '管理员用户名或密码不正确。';
    return;
  }
  sessionStorage.setItem(ADMIN_SESSION_KEY, 'authenticated');
  $('#adminAuthForm').reset();
  showDashboard();
};

$('#userSearchInput').oninput = renderUsers;
$('#statusFilter').onchange = renderUsers;
$('#exportUsersBtn').onclick = () => {
  users = loadJson(USERS_KEY, {});
  const exportedUsers = Object.entries(users).map(([email, user]) => ({
    profile: { name: user.name, email, status: user.status || 'active', createdAt: user.createdAt, lastLoginAt: user.lastLoginAt },
    state: userState(email)
  }));
  const date = new Date().toISOString().slice(0, 10);
  downloadJson(`小树暑托-用户数据-${date}.json`, { app: 'summer-care-admin', version: 1, exportedAt: new Date().toISOString(), users: exportedUsers });
  toast(`已导出 ${exportedUsers.length} 位用户的数据`);
};
$('#closeUserModalBtn').onclick = closeUserModal;
$('#userModal').onclick = event => { if (event.target === event.currentTarget) closeUserModal(); };
$('#userEditForm').onsubmit = event => {
  event.preventDefault();
  const user = users[editingEmail];
  if (!user) return;
  const data = userState(editingEmail);
  const oldPoints = Number(data.points) || 0;
  user.name = $('#adminUserNameInput').value.trim();
  user.status = $('#adminUserStatusInput').value;
  data.points = Number($('#adminUserPointsInput').value);
  data.totalEarned = Number($('#adminUserEarnedInput').value);
  const pointsDifference = data.points - oldPoints;
  if (pointsDifference) {
    data.transactions ??= [];
    data.transactions.unshift({ id: Date.now(), amount: pointsDifference, label: '管理员调整积分', time: '管理员后台' });
    data.transactions = data.transactions.slice(0, 30);
  }
  saveUsers();
  saveUserState(editingEmail, data);
  if (user.status === 'disabled' && localStorage.getItem(SESSION_KEY) === editingEmail) localStorage.removeItem(SESSION_KEY);
  closeUserModal();
  renderUsers();
  toast('用户信息已更新');
};

$('#resetUserDataBtn').onclick = () => {
  if (!editingEmail || !confirm('确定恢复该用户的示例数据吗？原有计划、积分和记录会被覆盖。')) return;
  saveUserState(editingEmail, freshUserState());
  openUserModal(editingEmail);
  renderUsers();
  toast('用户数据已恢复');
};

$('#deleteUserBtn').onclick = () => {
  if (!editingEmail || !confirm(`确定永久删除 ${editingEmail} 吗？此操作不可撤销。`)) return;
  delete users[editingEmail];
  saveUsers();
  localStorage.removeItem(`${USER_STATE_PREFIX}${editingEmail}`);
  if (localStorage.getItem(SESSION_KEY) === editingEmail) localStorage.removeItem(SESSION_KEY);
  closeUserModal();
  renderUsers();
  toast('用户已删除');
};

$('#resetUserPasswordBtn').onclick = () => openPasswordModal('user');
$('#changeAdminPasswordBtn').onclick = () => openPasswordModal('admin');
$('#closePasswordModalBtn').onclick = closePasswordModal;
$('#passwordModal').onclick = event => { if (event.target === event.currentTarget) closePasswordModal(); };
$('#passwordForm').onsubmit = async event => {
  event.preventDefault();
  const password = $('#newPasswordInput').value;
  const minimum = passwordMode === 'admin' ? 8 : 6;
  if (password.length < minimum) { $('#passwordMessage').textContent = `密码至少需要 ${minimum} 位。`; return; }
  if (password !== $('#confirmNewPasswordInput').value) { $('#passwordMessage').textContent = '两次输入的密码不一致。'; return; }
  const passwordHash = await hashPassword(password);
  if (passwordMode === 'admin') {
    admin.passwordHash = passwordHash;
    admin.username = 'admin';
    admin.credentialVersion = 2;
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  } else if (users[editingEmail]) {
    users[editingEmail].passwordHash = passwordHash;
    saveUsers();
  }
  closePasswordModal();
  toast(passwordMode === 'admin' ? '管理员密码已修改' : '用户密码已重置');
};

$('#adminLogoutBtn').onclick = () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  showAuth();
};

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  closeUserModal();
  closePasswordModal();
});

window.addEventListener('storage', event => { if (event.key === USERS_KEY || event.key?.startsWith(USER_STATE_PREFIX)) renderUsers(); });

if (admin && isAdminLoggedIn()) showDashboard();
else showAuth();
