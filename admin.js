const { url: SUPABASE_URL, publishableKey: SUPABASE_KEY } = window.SUMMER_CARE_SUPABASE;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);
let adminProfile = null;
let cloudUsers = [];
let editingUserId = '';

function safe(text) {
  const element = document.createElement('div');
  element.textContent = String(text ?? '');
  return element.innerHTML;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function pendingRedemptions(user) {
  return (user.state?.redemptions || []).filter(item => item.status !== 'received');
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
    points: 280, totalEarned: 340, selectedDay: 'today', redeemed: 0, planDate: window.SummerCareDaily.dateKey(), dailyRecords: [],
    history: [3, 2, 3, 3, 1, 2, 1],
    plans: {
      today: [{ id: 1, title: '晨读《昆虫记》', meta: '语文 · 20分钟', points: 10, done: true }, { id: 2, title: '数学口算练习', meta: '数学 · 30道', points: 15, done: true }, { id: 3, title: '英语单词打卡', meta: '英语 · Unit 3', points: 10, done: true }, { id: 4, title: '跳绳运动', meta: '运动 · 20分钟', points: 15, done: false }],
      tomorrow: [{ id: 5, title: '练习硬笔字', meta: '语文 · 2页', points: 10, done: false }],
      later: [{ id: 6, title: '阅读英语绘本', meta: '英语 · 1本', points: 15, done: false }]
    },
    rewards: [{ id: 1, icon: '🎨', name: '自由画画 30 分钟', cost: 50, desc: '尽情画出你的想象' }, { id: 2, icon: '🍦', name: '冰淇淋一支', cost: 80, desc: '夏天的小小甜蜜' }],
    redemptions: [],
    transactions: [{ id: 1, amount: 10, label: '完成「晨读《昆虫记》」', time: '今天 08:20' }]
  };
}

function showAuth(message = '') {
  $('#adminAuthView').classList.remove('hidden');
  $('#adminDashboard').classList.add('hidden');
  $('#adminAuthForm').classList.remove('hidden');
  $('#adminClaimView').classList.add('hidden');
  $('#adminAuthTitle').textContent = '管理员登录';
  $('#adminAuthDescription').textContent = '使用已注册的小树暑托邮箱账户登录。';
  $('#adminSecurityNote').textContent = '管理员权限由 Supabase 数据库控制。普通账户无法查看或修改其他用户的数据。';
  showAuthMessage(message);
}

function showClaim(profileData, message = '') {
  $('#adminAuthView').classList.remove('hidden');
  $('#adminDashboard').classList.add('hidden');
  $('#adminAuthForm').classList.add('hidden');
  $('#adminClaimView').classList.remove('hidden');
  $('#adminAuthTitle').textContent = '领取管理员权限';
  $('#adminAuthDescription').textContent = '当前还没有管理员，请输入一次性绑定码完成初始化。';
  $('#claimAccountName').textContent = profileData.name;
  $('#claimAccountEmail').textContent = profileData.email;
  $('#adminSecurityNote').textContent = '绑定码仅能成功使用一次。管理员创建后，其他普通账户无法再次领取。';
  showAuthMessage(message);
}

function showAuthMessage(message = '', type = 'error') {
  const element = $('#adminAuthMessage');
  element.textContent = message;
  element.className = `form-message ${message ? type : ''}`;
}

function showDashboard() {
  $('#adminAuthView').classList.add('hidden');
  $('#adminDashboard').classList.remove('hidden');
  renderUsers();
}

async function loadAdminSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session?.user) return { status: 'signed-out' };
  const { data, error } = await supabaseClient.from('profiles').select('id,email,name,role,status').eq('id', session.user.id).single();
  if (error) throw error;
  if (data.status !== 'active') {
    await supabaseClient.auth.signOut();
    return { status: 'disabled' };
  }
  if (data.role !== 'admin') {
    adminProfile = null;
    return { status: 'claim', profile: data };
  }
  adminProfile = data;
  return { status: 'admin', profile: data };
}

async function fetchUsers() {
  const { data, error } = await supabaseClient.rpc('admin_list_users');
  if (error) throw error;
  cloudUsers = data || [];
}

async function renderUsers() {
  try {
    await fetchUsers();
  } catch (error) {
    toast('云端用户加载失败');
    return;
  }
  const query = $('#userSearchInput').value.trim().toLowerCase();
  const status = $('#statusFilter').value;
  const entries = cloudUsers.filter(user => (!query || user.email.toLowerCase().includes(query) || user.name.toLowerCase().includes(query)) && (status === 'all' || user.status === status));
  $('#totalUsersText').textContent = cloudUsers.length;
  $('#activeUsersText').textContent = cloudUsers.filter(user => user.status === 'active').length;
  $('#disabledUsersText').textContent = cloudUsers.filter(user => user.status === 'disabled').length;
  $('#totalPointsText').textContent = cloudUsers.reduce((sum, user) => sum + (Number(user.state?.points) || 0), 0);
  $('#pendingRewardsText').textContent = cloudUsers.reduce((sum, user) => sum + pendingRedemptions(user).length, 0);
  $('#userCountHint').textContent = `共 ${entries.length} 位用户`;
  $('#emptyUsers').classList.toggle('hidden', entries.length > 0);
  $('#userTableBody').innerHTML = entries.map(user => `<tr><td><div class="user-cell"><div class="user-avatar">${safe(user.name.slice(-1))}</div><div><strong>${safe(user.name)}</strong><small>${safe(user.email)}${user.role === 'admin' ? ' · 管理员' : ''}</small></div></div></td><td><span class="status-pill ${user.status}">${user.status === 'active' ? '正常' : '已停用'}</span></td><td><span class="points-value">${Number(user.state?.points) || 0}</span></td><td><span class="reward-count ${pendingRedemptions(user).length ? 'has-pending' : ''}">${pendingRedemptions(user).length}</span></td><td><span class="points-value">${Number(user.state?.totalEarned) || 0}</span></td><td>${formatDate(user.created_at)}</td><td>${formatDate(user.last_login_at)}</td><td><button class="edit-user-button" data-edit-user="${user.id}">管理</button></td></tr>`).join('');
  $$('[data-edit-user]').forEach(button => button.onclick = () => openUserModal(button.dataset.editUser));
}

function openUserModal(id) {
  const user = cloudUsers.find(item => item.id === id);
  if (!user) return;
  editingUserId = id;
  $('#userModalTitle').textContent = `管理 ${user.name}`;
  $('#adminUserNameInput').value = user.name;
  $('#adminUserEmailInput').value = user.email;
  $('#adminUserStatusInput').value = user.status;
  $('#adminUserStatusInput').disabled = user.id === adminProfile.id;
  $('#adminUserPointsInput').value = Number(user.state?.points) || 0;
  $('#adminUserEarnedInput').value = Number(user.state?.totalEarned) || 0;
  renderUserRewards(user);
  $('#deleteUserBtn').classList.toggle('hidden', user.id === adminProfile.id);
  $('#userModal').classList.remove('hidden');
}

function renderUserRewards(user) {
  const pending = pendingRedemptions(user);
  $('#pendingRewardHint').textContent = `${pending.length} 个`;
  $('#adminRewardList').innerHTML = pending.length
    ? pending.map(item => `<article class="fulfillment-item"><span>${safe(item.icon || '🎁')}</span><div><strong>${safe(item.name)}</strong><small>${Number(item.cost) || 0} 积分 · ${formatDate(item.redeemedAt)}</small></div><button type="button" data-fulfill-reward="${item.id}">确认已领取</button></article>`).join('')
    : '<p class="fulfillment-empty">该用户暂无待领取奖励。</p>';
  $$('[data-fulfill-reward]').forEach(button => button.onclick = () => fulfillReward(Number(button.dataset.fulfillReward)));
}

async function fulfillReward(redemptionId) {
  const user = cloudUsers.find(item => item.id === editingUserId);
  if (!user) return;
  const nextState = { ...(user.state || freshUserState()) };
  nextState.redemptions = (nextState.redemptions || []).map(item => Number(item.id) === redemptionId
    ? { ...item, status: 'received', receivedAt: new Date().toISOString() }
    : item);
  const { error } = await supabaseClient.rpc('admin_update_user', { target_id: user.id, target_name: user.name, target_status: user.status, target_state: nextState });
  if (error) { toast(`确认失败：${error.message}`); return; }
  await renderUsers();
  openUserModal(user.id);
  toast('奖励已确认领取');
}

function closeUserModal() {
  editingUserId = '';
  $('#userModal').classList.add('hidden');
}

function openPasswordModal() {
  $('#passwordModalTitle').textContent = '修改我的密码';
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
  const email = $('#adminUsernameInput').value.trim().toLowerCase();
  const password = $('#adminPasswordInput').value;
  showAuthMessage('正在验证账户…', 'success');
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    showAuthMessage('登录失败：邮箱未验证、账户不存在或密码错误。');
    return;
  }
  try {
    const result = await loadAdminSession();
    if (result.status === 'admin') {
      $('#adminAuthForm').reset();
      showDashboard();
      return;
    }
    if (result.status === 'claim') {
      showClaim(result.profile);
      return;
    }
    showAuth('该账户已被管理员停用。');
  } catch (sessionError) {
    showAuthMessage(`账户加载失败：${sessionError.message}`);
  }
};

$('#adminClaimForm').onsubmit = async event => {
  event.preventDefault();
  const claimCode = $('#adminClaimCodeInput').value.trim();
  if (!claimCode) return;
  showAuthMessage('正在验证绑定码…', 'success');
  const { data, error } = await supabaseClient.rpc('claim_admin', { claim_code: claimCode });
  if (error) {
    showAuthMessage(`领取失败：${error.message}`);
    return;
  }
  if (!data) {
    showAuthMessage('绑定码无效，或管理员权限已经被其他账户领取。');
    return;
  }
  $('#adminClaimForm').reset();
  try {
    const result = await loadAdminSession();
    if (result.status !== 'admin') throw new Error('管理员角色刷新失败');
    showDashboard();
    toast('管理员权限已领取');
  } catch (claimError) {
    showAuthMessage(`领取成功，但账户刷新失败：${claimError.message}`);
  }
};

$('#claimLogoutBtn').onclick = async () => {
  await supabaseClient.auth.signOut();
  adminProfile = null;
  $('#adminClaimForm').reset();
  showAuth();
};

$('#userSearchInput').oninput = renderUsers;
$('#statusFilter').onchange = renderUsers;
$('#exportUsersBtn').onclick = () => {
  const date = new Date().toISOString().slice(0, 10);
  downloadJson(`小树暑托-云端用户-${date}.json`, { app: 'summer-care-admin', version: 2, exportedAt: new Date().toISOString(), users: cloudUsers });
  toast(`已导出 ${cloudUsers.length} 位用户的数据`);
};
$('#closeUserModalBtn').onclick = closeUserModal;
$('#userModal').onclick = event => { if (event.target === event.currentTarget) closeUserModal(); };
$('#userEditForm').onsubmit = async event => {
  event.preventDefault();
  const user = cloudUsers.find(item => item.id === editingUserId);
  if (!user) return;
  const nextState = { ...(user.state || freshUserState()), points: Number($('#adminUserPointsInput').value), totalEarned: Number($('#adminUserEarnedInput').value) };
  const difference = nextState.points - (Number(user.state?.points) || 0);
  if (difference) {
    nextState.transactions ??= [];
    nextState.transactions.unshift({ id: Date.now(), amount: difference, label: '管理员调整积分', time: '云端管理员后台' });
  }
  const { error } = await supabaseClient.rpc('admin_update_user', { target_id: editingUserId, target_name: $('#adminUserNameInput').value.trim(), target_status: $('#adminUserStatusInput').value, target_state: nextState });
  if (error) { toast(`保存失败：${error.message}`); return; }
  closeUserModal();
  await renderUsers();
  toast('云端用户信息已更新');
};

$('#resetUserDataBtn').onclick = async () => {
  const user = cloudUsers.find(item => item.id === editingUserId);
  if (!user || !confirm('确定恢复该用户的示例数据吗？原有计划、积分和记录会被覆盖。')) return;
  const { error } = await supabaseClient.rpc('admin_update_user', { target_id: user.id, target_name: user.name, target_status: user.status, target_state: freshUserState() });
  if (error) { toast(`恢复失败：${error.message}`); return; }
  await renderUsers();
  openUserModal(user.id);
  toast('用户云端数据已恢复');
};

$('#deleteUserBtn').onclick = async () => {
  const user = cloudUsers.find(item => item.id === editingUserId);
  if (!user || !confirm(`确定永久删除 ${user.email} 吗？此操作不可撤销。`)) return;
  const { error } = await supabaseClient.rpc('admin_delete_user', { target_id: user.id });
  if (error) { toast(`删除失败：${error.message}`); return; }
  closeUserModal();
  await renderUsers();
  toast('云端用户已删除');
};

$('#changeAdminPasswordBtn').onclick = openPasswordModal;
$('#closePasswordModalBtn').onclick = closePasswordModal;
$('#passwordModal').onclick = event => { if (event.target === event.currentTarget) closePasswordModal(); };
$('#passwordForm').onsubmit = async event => {
  event.preventDefault();
  const password = $('#newPasswordInput').value;
  if (password.length < 6) { $('#passwordMessage').textContent = '密码至少需要 6 位。'; return; }
  if (password !== $('#confirmNewPasswordInput').value) { $('#passwordMessage').textContent = '两次输入的密码不一致。'; return; }
  const { error } = await supabaseClient.auth.updateUser({ password });
  if (error) { $('#passwordMessage').textContent = `修改失败：${error.message}`; return; }
  closePasswordModal();
  toast('管理员登录密码已修改');
};

$('#adminLogoutBtn').onclick = async () => {
  await supabaseClient.auth.signOut();
  adminProfile = null;
  $('#adminAuthForm').reset();
  showAuth();
};

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  closeUserModal();
  closePasswordModal();
});

(async () => {
  try {
    const result = await loadAdminSession();
    if (result.status === 'admin') showDashboard();
    else if (result.status === 'claim') showClaim(result.profile);
    else showAuth(result.status === 'disabled' ? '该账户已被管理员停用。' : '');
  } catch (error) {
    showAuth(`账户加载失败：${error.message}`);
  }
})();
