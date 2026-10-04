// 全局状态
let token = localStorage.getItem('itls_token');
let currentUser = null; // 包含 id, username, role, school, real_name, phone
let authMode = 'login'; // 'login' | 'register'
let pollTimer = null;
let uploadedImages = []; // 存储上传的图片列表: { id, name, size, type, data }
window.uploadedImages = uploadedImages;

// 页面加载就绪
document.addEventListener('DOMContentLoaded', () => {
  initUser();
  initGradeAndLessons();
  initUploadListeners();
  refreshIcons();
});

// 挂载到 window 供 HTML 内联事件和全局调试调用
window.onGradeChange = onGradeChange;
window.onLessonChange = onLessonChange;
window.onMaterialsTextInput = onMaterialsTextInput;
window.clearMaterialsText = clearMaterialsText;
window.triggerImageFileInput = triggerImageFileInput;
window.handleImageFileSelect = handleImageFileSelect;
window.removeUploadedImage = removeUploadedImage;
window.renderImagePreviews = renderImagePreviews;
window.handleCreateTask = handleCreateTask;
window.toggleHistoryDrawer = toggleHistoryDrawer;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.toggleAuthMode = toggleAuthMode;
window.handleAuthSubmit = handleAuthSubmit;
window.logout = logout;

// 个人资料与管理员窗口
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.handleSaveProfile = handleSaveProfile;
window.openAdminModal = openAdminModal;
window.closeAdminModal = closeAdminModal;
window.switchAdminTab = switchAdminTab;
window.handleSaveAdminSettings = handleSaveAdminSettings;
window.toggleUserRole = toggleUserRole;
window.resetUserPassword = resetUserPassword;
window.deleteUser = deleteUser;

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ======================== 用户信息与导航栏 ========================

async function initUser() {
  const userProfileBtn = document.getElementById('userProfileBtn');
  const userRoleIcon = document.getElementById('userRoleIcon');
  const userNameDisplay = document.getElementById('userNameDisplay');
  const btnAdminModal = document.getElementById('btnAdminModal');
  const btnHistory = document.getElementById('btnHistory');
  const btnLogout = document.getElementById('btnLogout');
  const btnLoginModal = document.getElementById('btnLoginModal');

  if (!token) {
    currentUser = null;
    userProfileBtn.classList.add('hidden');
    btnAdminModal.classList.add('hidden');
    btnHistory.classList.add('hidden');
    btnLogout.classList.add('hidden');
    btnLoginModal.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      // token 失效
      logout();
      return;
    }

    currentUser = await res.json();

    // 根据是否录入真实姓名与角色精确定制展示
    const displayName = currentUser.real_name ? currentUser.real_name : currentUser.username;
    const isAdmin = currentUser.role === 'admin';

    if (isAdmin) {
      userRoleIcon.textContent = '🛡️';
      userNameDisplay.textContent = `${displayName} (管理员)`;
      userProfileBtn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:border-amber-400 text-xs font-semibold transition cursor-pointer';
      btnAdminModal.classList.remove('hidden');
    } else {
      userRoleIcon.textContent = '👤';
      userNameDisplay.textContent = `${displayName} 老师`;
      userProfileBtn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-500/15 text-brand-300 border border-brand-500/30 hover:border-brand-500/60 text-xs font-medium transition cursor-pointer';
      btnAdminModal.classList.add('hidden');
    }

    userProfileBtn.classList.remove('hidden');
    btnHistory.classList.remove('hidden');
    btnLogout.classList.remove('hidden');
    btnLoginModal.classList.add('hidden');
    refreshIcons();
  } catch (err) {
    console.error('获取用户信息失败:', err);
  }
}

// ======================== 个人资料弹窗 ========================

function openProfileModal() {
  if (!currentUser) return;

  document.getElementById('profileUsername').textContent = currentUser.username;
  const roleBadge = document.getElementById('profileRoleBadge');
  if (currentUser.role === 'admin') {
    roleBadge.textContent = '超级管理员';
    roleBadge.className = 'font-bold text-amber-400 ml-1';
  } else {
    roleBadge.textContent = '普通教师';
    roleBadge.className = 'font-bold text-emerald-400 ml-1';
  }

  document.getElementById('profileRealName').value = currentUser.real_name || '';
  document.getElementById('profileSchool').value = currentUser.school || '';
  document.getElementById('profilePhone').value = currentUser.phone || '';

  const modal = document.getElementById('profileModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  refreshIcons();
}

function closeProfileModal() {
  const modal = document.getElementById('profileModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function handleSaveProfile(e) {
  e.preventDefault();
  const real_name = document.getElementById('profileRealName').value.trim();
  const school = document.getElementById('profileSchool').value.trim();
  const phone = document.getElementById('profilePhone').value.trim();

  try {
    const res = await fetch('/api/me', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ real_name, school, phone })
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || '保存资料失败');
      return;
    }

    currentUser = await res.json();
    initUser(); // 立即刷新右上角名字显示
    closeProfileModal();
    alert('个人资料已保存！');
  } catch (err) {
    alert('请求失败：' + err.message);
  }
}

// ======================== 管理员后台控制台 ========================

function openAdminModal() {
  const modal = document.getElementById('adminModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  switchAdminTab('users');
  refreshIcons();
}

function closeAdminModal() {
  const modal = document.getElementById('adminModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function switchAdminTab(tab) {
  const tabs = ['users', 'api'];
  tabs.forEach(t => {
    const panel = document.getElementById(`adminTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (t === tab) {
      panel.classList.remove('hidden');
      btn.className = 'px-4 py-2 rounded-xl font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30 transition';
    } else {
      panel.classList.add('hidden');
      btn.className = 'px-4 py-2 rounded-xl font-medium text-slate-400 hover:text-slate-200 transition';
    }
  });

  if (tab === 'users') loadAdminUsers();
  if (tab === 'api') loadAdminSettings();
  refreshIcons();
}

// 1. 加载教师成员
async function loadAdminUsers() {
  const tbody = document.getElementById('adminUserTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-500">正在读取成员列表...</td></tr>';

  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const users = await res.json();
    if (!res.ok) throw new Error(users.error || '获取失败');

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-500">暂无成员</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-dark-surface/50 transition';
      const isSelf = currentUser && currentUser.id === u.id;
      const isAdmin = u.role === 'admin';

      const roleBadge = isAdmin
        ? '<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px]">管理员</span>'
        : '<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px]">教师</span>';

      const roleBtn = isSelf ? '' : (isAdmin
        ? `<button onclick="toggleUserRole(${u.id}, 'teacher')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition">降为教师</button>`
        : `<button onclick="toggleUserRole(${u.id}, 'admin')" class="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] transition font-bold">提权为管理员</button>`);

      const resetBtn = `<button onclick="resetUserPassword(${u.id}, '${u.username}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition">重置密码</button>`;
      const deleteBtn = isSelf ? '' : `<button onclick="deleteUser(${u.id}, '${u.username}')" class="px-2 py-1 rounded bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/30 text-[11px] transition">删除</button>`;

      tr.innerHTML = `
        <td class="p-3 font-mono font-bold text-slate-200">${u.username}</td>
        <td class="p-3 text-slate-200">${u.real_name || '<span class="text-slate-500">未填写</span>'}</td>
        <td class="p-3 text-slate-300">${u.school || '<span class="text-slate-500">未填写</span>'}</td>
        <td class="p-3 font-mono text-slate-400">${u.phone || '<span class="text-slate-500">-</span>'}</td>
        <td class="p-3">${roleBadge}</td>
        <td class="p-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            ${roleBtn}
            ${resetBtn}
            ${deleteBtn}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-red-400">${err.message}</td></tr>`;
  }
}

async function toggleUserRole(id, newRole) {
  const roleName = newRole === 'admin' ? '管理员' : '普通教师';
  if (!confirm(`确认要将此成员角色调整为【${roleName}】吗？`)) return;

  try {
    const res = await fetch(`/api/admin/users/${id}/role`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ role: newRole })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '操作失败');
    }
    loadAdminUsers();
  } catch (err) {
    alert(err.message);
  }
}

async function resetUserPassword(id, username) {
  const newPassword = prompt(`请输入为账号【${username}】重置的新密码 (至少6位):`);
  if (!newPassword) return;
  if (newPassword.length < 6) {
    alert('密码长度不能少于 6 位');
    return;
  }

  try {
    const res = await fetch(`/api/admin/users/${id}/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ newPassword })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '重置失败');
    }
    alert(`账号【${username}】的密码已成功重置！`);
  } catch (err) {
    alert(err.message);
  }
}

async function deleteUser(id, username) {
  if (!confirm(`⚠️ 警告：确定要彻底删除教师账号【${username}】吗？此操作无法撤销。`)) return;

  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '删除失败');
    }
    loadAdminUsers();
  } catch (err) {
    alert(err.message);
  }
}

// 2. 加载与保存 AI 接口与邀请码
async function loadAdminSettings() {
  try {
    const res = await fetch('/api/admin/settings', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById('settingApiBase').value = data.ai_api_base || '';
    document.getElementById('settingApiKey').value = data.ai_api_key || '';
    document.getElementById('settingModel').value = data.ai_model || '';
    document.getElementById('settingInviteCode').value = data.invite_code || '';
  } catch (err) {
    alert('加载配置失败: ' + err.message);
  }
}

async function handleSaveAdminSettings(e) {
  e.preventDefault();
  const ai_api_base = document.getElementById('settingApiBase').value.trim();
  const ai_api_key = document.getElementById('settingApiKey').value.trim();
  const ai_model = document.getElementById('settingModel').value.trim();
  const invite_code = document.getElementById('settingInviteCode').value.trim();

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ ai_api_base, ai_api_key, ai_model, invite_code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert('✅ AI 接口与系统配置已保存，全系统即刻生效！');
  } catch (err) {
    alert('保存失败: ' + err.message);
  }
}
// ======================== 年级与课题联动 ========================

function initGradeAndLessons() {
  const selectGrade = document.getElementById('selectGrade');
  if (!selectGrade.value) {
    selectGrade.value = '三年级上册';
  }
  onGradeChange();
}

function onGradeChange() {
  const grade = document.getElementById('selectGrade').value;
  const selectLesson = document.getElementById('selectLesson');
  selectLesson.innerHTML = '';

  const catalog = window.TEXTBOOK_CATALOG || {};
  const gradeUnits = catalog[grade] || {};
  const unitNames = Object.keys(gradeUnits);

  if (unitNames.length === 0) {
    const opt = document.createElement('option');
    opt.value = '第01课 感受智能生活';
    opt.textContent = '第01课 感受智能生活';
    selectLesson.appendChild(opt);
  } else {
    unitNames.forEach(unitName => {
      const optGroup = document.createElement('optgroup');
      optGroup.label = unitName;
      const lessons = gradeUnits[unitName] || [];
      lessons.forEach(lessonTitle => {
        const opt = document.createElement('option');
        opt.value = lessonTitle;
        opt.textContent = lessonTitle;
        optGroup.appendChild(opt);
      });
      selectLesson.appendChild(optGroup);
    });
  }

  const customOpt = document.createElement('option');
  customOpt.value = '__CUSTOM__';
  customOpt.textContent = '✍️ 自定义其他课时 / 跨学科主题...';
  selectLesson.appendChild(customOpt);

  selectLesson.selectedIndex = 0;
  onLessonChange();
}

function onLessonChange() {
  const selectLesson = document.getElementById('selectLesson');
  const customWrapper = document.getElementById('customLessonWrapper');
  const inputCustom = document.getElementById('inputCustomLesson');

  if (selectLesson.value === '__CUSTOM__') {
    customWrapper.classList.remove('hidden');
    inputCustom.focus();
  } else {
    customWrapper.classList.add('hidden');
    inputCustom.value = '';
  }
}

// ======================== 自主上传教材与参考资料 ========================

function onMaterialsTextInput() {
  const textarea = document.getElementById('materialsText');
  const charCount = document.getElementById('charCount');
  const len = textarea.value.length;
  charCount.textContent = len;
  if (len >= 5000) {
    charCount.classList.add('text-red-400');
  } else {
    charCount.classList.remove('text-red-400');
  }
}

function clearMaterialsText() {
  const textarea = document.getElementById('materialsText');
  textarea.value = '';
  onMaterialsTextInput();
}

function triggerImageFileInput() {
  const fileInput = document.getElementById('imageFileInput');
  if (uploadedImages.length >= 5) {
    showImageError('已达到上限：最多仅支持上传 5 张教材插图/照片');
    return;
  }
  fileInput.click();
}

function handleImageFileSelect(e) {
  const files = Array.from(e.target.files || []);
  processImageFiles(files);
  e.target.value = '';
}

function initUploadListeners() {
  const dropzone = document.getElementById('imageDropzone');

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || []);
    processImageFiles(files);
  });

  window.addEventListener('paste', (e) => {
    if (document.activeElement === document.getElementById('materialsText') ||
        document.activeElement === document.getElementById('inputRequirements') ||
        document.activeElement === document.getElementById('inputCustomLesson')) {
      if (!e.clipboardData.files || e.clipboardData.files.length === 0) {
        return;
      }
    }

    const files = Array.from(e.clipboardData.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      e.preventDefault();
      processImageFiles(files);
    }
  });
}

function processImageFiles(files) {
  hideImageError();
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSizeBytes = 5 * 1024 * 1024;

  for (const file of files) {
    if (uploadedImages.length >= 5) {
      showImageError('已达到上限：最多仅支持上传 5 张教材插图/照片');
      break;
    }

    if (!validTypes.includes(file.type)) {
      showImageError(`【${file.name}】格式不支持，仅限 JPG、PNG、WEBP 格式`);
      continue;
    }

    if (file.size > maxSizeBytes) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      showImageError(`【${file.name}】体积过大 (${sizeMB}MB)，单张图片不能超过 5MB`);
      continue;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      uploadedImages.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        size: formatFileSize(file.size),
        type: file.type,
        data: event.target.result
      });
      renderImagePreviews();
    };
    reader.readAsDataURL(file);
  }
}

function showImageError(msg) {
  const errBox = document.getElementById('imageUploadError');
  const errText = document.getElementById('imageUploadErrorText');
  errText.textContent = msg;
  errBox.classList.remove('hidden');
  refreshIcons();
}

function hideImageError() {
  const errBox = document.getElementById('imageUploadError');
  errBox.classList.add('hidden');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function removeUploadedImage(id) {
  uploadedImages = uploadedImages.filter(img => img.id !== id);
  window.uploadedImages = uploadedImages;
  renderImagePreviews();
  hideImageError();
}

function renderImagePreviews() {
  const grid = document.getElementById('imagePreviewGrid');
  const counter = document.getElementById('imageCounter');
  counter.textContent = uploadedImages.length;

  grid.innerHTML = '';
  uploadedImages.forEach((img, idx) => {
    const card = document.createElement('div');
    card.className = 'relative group rounded-xl overflow-hidden border border-dark-borderLight bg-dark-surface/90 flex flex-col p-1';
    card.innerHTML = `
      <div class="w-full h-16 rounded-lg bg-dark-bg/60 overflow-hidden flex items-center justify-center relative">
        <img src="${img.data}" alt="${img.name}" class="w-full h-full object-cover">
        <button type="button" onclick="removeUploadedImage('${img.id}')"
          class="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600/90 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition shadow">
          ✕
        </button>
      </div>
      <div class="px-1 pt-1 flex items-center justify-between text-[10px] text-slate-400">
        <span class="truncate max-w-[55px]" title="${img.name}">图${idx + 1}</span>
        <span class="font-mono text-[9px] text-slate-500">${img.size}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ======================== 任务创建与状态机 ========================

async function handleCreateTask(e) {
  e.preventDefault();

  if (!token) {
    openAuthModal('login');
    return;
  }

  const grade = document.getElementById('selectGrade').value;
  const selectLesson = document.getElementById('selectLesson');
  let lessonTitle = selectLesson.value;

  if (lessonTitle === '__CUSTOM__') {
    lessonTitle = document.getElementById('inputCustomLesson').value.trim();
    if (!lessonTitle) {
      alert('请在下方输入自定义课题名称');
      document.getElementById('inputCustomLesson').focus();
      return;
    }
  }

  const requirements = document.getElementById('inputRequirements').value.trim();
  const materialsText = document.getElementById('materialsText').value.trim();

  const btnSubmit = document.getElementById('btnSubmit');
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i><span>正在提交生成任务...</span>`;
  refreshIcons();

  try {
    const payload = {
      grade,
      lessonTitle,
      requirements,
      materialsText,
      images: uploadedImages.map(img => ({
        name: img.name,
        type: img.type,
        data: img.data
      }))
    };

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || '任务启动失败');
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<i data-lucide="wand-2" class="w-5 h-5"></i><span>立即合成全套四位一体教学资料</span>`;
      refreshIcons();
      return;
    }

    currentTaskId = data.taskId;
    showProgressCard(lessonTitle);
    startPolling(data.taskId);
  } catch (err) {
    alert('创建任务失败: ' + err.message);
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `<i data-lucide="wand-2" class="w-5 h-5"></i><span>立即合成全套四位一体教学资料</span>`;
    refreshIcons();
  }
}

let currentTaskId = null;
let progressStartTime = 0;
let progressDurationTimer = null;
let smoothProgressTimer = null;
let currentDisplayPercent = 0;
let targetBackendPercent = 0;

function resetTaskProgressUI() {
  if (pollTimer) clearInterval(pollTimer);
  if (progressDurationTimer) clearInterval(progressDurationTimer);
  if (smoothProgressTimer) clearInterval(smoothProgressTimer);
  currentTaskId = null;

  document.getElementById('progressCard').classList.add('hidden');
  const btnSubmit = document.getElementById('btnSubmit');
  btnSubmit.disabled = false;
  btnSubmit.innerHTML = `<i data-lucide="wand-2" class="w-5 h-5"></i><span>立即合成全套四位一体教学资料</span>`;

  document.getElementById('btnCancelTask').classList.remove('hidden');
  document.getElementById('btnRetryTask').classList.add('hidden');
  document.getElementById('btnBackEdit').classList.add('hidden');
  document.getElementById('progressText').className = 'text-xs sm:text-sm text-brand-300/90 mt-0.5';
  refreshIcons();
}

function resetToGeneratingState() {
  currentDisplayPercent = 10;
  targetBackendPercent = 10;
  document.getElementById('progressPercent').textContent = '10%';
  document.getElementById('progressBarFill').style.width = '10%';
  document.getElementById('progressTitle').textContent = '正在重新启动生成流水线...';
  document.getElementById('progressText').textContent = '正在调度 AI 教学引擎与代码生成...';
  document.getElementById('progressText').className = 'text-xs sm:text-sm text-brand-300/90 mt-0.5';

  const runningDot = document.getElementById('taskRunningDot');
  if (runningDot) {
    runningDot.className = 'inline-block w-2 h-2 rounded-full bg-brand-400 animate-ping';
  }
  document.getElementById('taskControlHint').textContent = '任务正在后台流水线处理中，请稍候...';

  document.getElementById('btnCancelTask').classList.remove('hidden');
  document.getElementById('btnRetryTask').classList.add('hidden');
  document.getElementById('btnBackEdit').classList.add('hidden');

  updateStepState('stepPlan', 'running', '备课教案', '≤4页公文精排');
  updateStepState('stepWorksheet', 'waiting', '探究导学单', '严格单面防溢出');
  updateStepState('stepSlides', 'waiting', '大屏演示课件', 'Marp 16:9纯净卡片');
  updateStepState('stepClasswork', 'waiting', '随堂互动作业', '单文件微型仿真台');

  progressStartTime = Date.now();
  if (progressDurationTimer) clearInterval(progressDurationTimer);
  progressDurationTimer = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - progressStartTime) / 1000);
    const m = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const s = String(elapsedSec % 60).padStart(2, '0');
    document.getElementById('progressTimer').textContent = `${m}:${s}`;
  }, 1000);

  startSmoothProgressTimer();
  refreshIcons();
}

function startSmoothProgressTimer() {
  if (smoothProgressTimer) clearInterval(smoothProgressTimer);
  smoothProgressTimer = setInterval(() => {
    // 缓动算法：逐步逼近 targetBackendPercent，但在未完成前平缓递增至 94%
    if (currentDisplayPercent < targetBackendPercent) {
      const step = Math.max(0.5, (targetBackendPercent - currentDisplayPercent) * 0.15);
      currentDisplayPercent = Math.min(targetBackendPercent, currentDisplayPercent + step);
    } else if (targetBackendPercent < 100 && currentDisplayPercent < 94) {
      // 在后端计算等待期间，保持极微小平滑前进，绝不给人卡死的感觉 (每秒约 1%)
      currentDisplayPercent += 0.1;
    }

    applyProgressVisuals(currentDisplayPercent);
  }, 100);
}

function showProgressCard(title) {
  document.getElementById('deliveryCard').classList.add('hidden');
  const progressCard = document.getElementById('progressCard');
  progressCard.classList.remove('hidden');
  document.getElementById('progressTitle').textContent = `正在生成《${title}》全套教学资料...`;

  // 重置状态
  currentDisplayPercent = 0;
  targetBackendPercent = 5;
  document.getElementById('progressPercent').textContent = '0%';
  document.getElementById('progressBarFill').style.width = '0%';
  document.getElementById('progressText').textContent = '正在启动 AI 教学闭环引擎...';
  document.getElementById('progressText').className = 'text-xs sm:text-sm text-brand-300/90 mt-0.5';
  document.getElementById('progressSubDetail').textContent = '正在准备浙教版知识图谱锚点';
  document.getElementById('progressTimer').textContent = '00:00';

  const runningDot = document.getElementById('taskRunningDot');
  if (runningDot) {
    runningDot.className = 'inline-block w-2 h-2 rounded-full bg-brand-400 animate-ping';
  }
  document.getElementById('taskControlHint').textContent = '任务正在后台流水线处理中，请稍候...';

  document.getElementById('btnCancelTask').classList.remove('hidden');
  document.getElementById('btnRetryTask').classList.add('hidden');
  document.getElementById('btnBackEdit').classList.add('hidden');

  // 重置 4 个打卡步骤
  updateStepState('stepPlan', 'running', '备课教案', '≤4页公文精排');
  updateStepState('stepWorksheet', 'waiting', '探究导学单', '严格单面防溢出');
  updateStepState('stepSlides', 'waiting', '大屏演示课件', 'Marp 16:9纯净卡片');
  updateStepState('stepClasswork', 'waiting', '随堂互动作业', '单文件微型仿真台');

  // 启动计时器
  progressStartTime = Date.now();
  if (progressDurationTimer) clearInterval(progressDurationTimer);
  progressDurationTimer = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - progressStartTime) / 1000);
    const m = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const s = String(elapsedSec % 60).padStart(2, '0');
    document.getElementById('progressTimer').textContent = `${m}:${s}`;
  }, 1000);

  // 启动统一平滑微步递增定时器
  startSmoothProgressTimer();

  progressCard.scrollIntoView({ behavior: 'smooth' });
  refreshIcons();
}

function updateStepState(stepId, state, name, desc) {
  const el = document.getElementById(stepId);
  if (!el) return;

  const iconEl = el.querySelector('.step-icon');
  const nameEl = el.querySelector('.step-name');
  const descEl = el.querySelector('.step-desc');
  const statusEl = el.querySelector('.step-status');

  nameEl.textContent = name;
  descEl.textContent = desc;

  if (state === 'waiting') {
    el.className = 'p-3.5 rounded-2xl bg-dark-surface/50 border border-dark-borderLight transition-all duration-300 flex items-center gap-3 opacity-60';
    iconEl.className = 'step-icon w-8 h-8 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center shrink-0 text-xs font-bold border border-slate-700';
    iconEl.innerHTML = stepId === 'stepPlan' ? '1' : (stepId === 'stepWorksheet' ? '2' : (stepId === 'stepSlides' ? '3' : '4'));
    statusEl.className = 'step-status text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-500';
    statusEl.textContent = '等待中';
  } else if (state === 'running') {
    el.className = 'p-3.5 rounded-2xl bg-brand-500/10 border border-brand-500/50 shadow-lg shadow-brand-500/15 transition-all duration-300 flex items-center gap-3 opacity-100';
    iconEl.className = 'step-icon w-8 h-8 rounded-xl bg-brand-500/20 text-brand-300 border border-brand-500/40 flex items-center justify-center shrink-0 text-xs font-bold animate-pulse';
    iconEl.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-brand-400"></i>`;
    statusEl.className = 'step-status text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 animate-pulse';
    statusEl.textContent = '构建中...';
    refreshIcons();
  } else if (state === 'done') {
    el.className = 'p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/40 transition-all duration-300 flex items-center gap-3 opacity-100';
    iconEl.className = 'step-icon w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0 text-xs font-bold';
    iconEl.innerHTML = '✓';
    statusEl.className = 'step-status text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    statusEl.textContent = '已就绪';
  } else if (state === 'stopped') {
    el.className = 'p-3.5 rounded-2xl bg-dark-surface/60 border border-slate-700/60 transition-all duration-300 flex items-center gap-3 opacity-60';
    iconEl.className = 'step-icon w-8 h-8 rounded-xl bg-slate-800 text-slate-500 border border-slate-700 flex items-center justify-center shrink-0 text-xs font-bold';
    iconEl.innerHTML = '⏹';
    statusEl.className = 'step-status text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400';
    statusEl.textContent = '已中止';
  }
}

function applyProgressVisuals(percentVal) {
  const pInt = Math.floor(percentVal);
  document.getElementById('progressPercent').textContent = `${pInt}%`;
  document.getElementById('progressBarFill').style.width = `${percentVal}%`;

  const textEl = document.getElementById('progressText');
  const subDetailEl = document.getElementById('progressSubDetail');

  // 根据当前动态百分比推进四大环节打卡灯与文案
  if (pInt < 25) {
    textEl.textContent = '正在精细构建 4 页公文备课教案...';
    subDetailEl.textContent = '首行缩进两格 · 取消板书 · 注入通俗生活比喻';
    updateStepState('stepPlan', 'running', '备课教案', '≤4页公文精排');
    updateStepState('stepWorksheet', 'waiting', '探究导学单', '严格单面防溢出');
    updateStepState('stepSlides', 'waiting', '大屏演示课件', 'Marp 16:9纯净卡片');
    updateStepState('stepClasswork', 'waiting', '随堂互动作业', '单文件微型仿真台');
  } else if (pInt < 50) {
    textEl.textContent = '正在编排探究导学单与学生上机脚手架...';
    subDetailEl.textContent = '严格单面A4防溢出 · 显式□槽位 · 剥离机房座号';
    updateStepState('stepPlan', 'done', '备课教案', '≤4页公文精排');
    updateStepState('stepWorksheet', 'running', '探究导学单', '严格单面防溢出');
    updateStepState('stepSlides', 'waiting', '大屏演示课件', 'Marp 16:9纯净卡片');
    updateStepState('stepClasswork', 'waiting', '随堂互动作业', '单文件微型仿真台');
  } else if (pInt < 75) {
    textEl.textContent = '正在转译 Marp 16:9 现代大屏演示课件...';
    subDetailEl.textContent = '纯净第一人称视角 · 双栏卡片网格 · 清除后台台词';
    updateStepState('stepPlan', 'done', '备课教案', '≤4页公文精排');
    updateStepState('stepWorksheet', 'done', '探究导学单', '严格单面防溢出');
    updateStepState('stepSlides', 'running', '大屏演示课件', 'Marp 16:9纯净卡片');
    updateStepState('stepClasswork', 'waiting', '随堂互动作业', '单文件微型仿真台');
  } else if (pInt < 95) {
    textEl.textContent = '正在构建单文件轻量 HTML 随堂互动作业...';
    subDetailEl.textContent = '零依赖秒开 · 微型仿真台 · 标准txt凭单与电子通关奖状';
    updateStepState('stepPlan', 'done', '备课教案', '≤4页公文精排');
    updateStepState('stepWorksheet', 'done', '探究导学单', '严格单面防溢出');
    updateStepState('stepSlides', 'done', '大屏演示课件', 'Marp 16:9纯净卡片');
    updateStepState('stepClasswork', 'running', '随堂互动作业', '单文件微型仿真台');
  } else if (pInt < 100) {
    textEl.textContent = '正在执行 OpenXML 公文精排与全套资源打包...';
    subDetailEl.textContent = 'Pandoc 转译 · beautify_docx 精排 · ZIP 打包';
    updateStepState('stepPlan', 'done', '备课教案', '≤4页公文精排');
    updateStepState('stepWorksheet', 'done', '探究导学单', '严格单面防溢出');
    updateStepState('stepSlides', 'done', '大屏演示课件', 'Marp 16:9纯净卡片');
    updateStepState('stepClasswork', 'done', '随堂互动作业', '单文件微型仿真台');
  }
}

function startPolling(taskId) {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;

      const task = await res.json();
      targetBackendPercent = Math.max(targetBackendPercent, task.progress || 0);

      if (task.status === 'completed') {
        clearInterval(pollTimer);
        if (smoothProgressTimer) clearInterval(smoothProgressTimer);
        targetBackendPercent = 100;
        currentDisplayPercent = 100;
        applyProgressVisuals(100);
        document.getElementById('progressText').textContent = '🎉 四位一体全套教学资料已全部就绪！';
        document.getElementById('progressSubDetail').textContent = '100% 同源咬合交付';
        updateStepState('stepPlan', 'done', '备课教案', '≤4页公文精排');
        updateStepState('stepWorksheet', 'done', '探究导学单', '严格单面防溢出');
        updateStepState('stepSlides', 'done', '大屏演示课件', 'Marp 16:9纯净卡片');
        updateStepState('stepClasswork', 'done', '随堂互动作业', '单文件微型仿真台');

        setTimeout(() => {
          finishTask(task);
        }, 600);
      } else if (task.status === 'failed') {
        clearInterval(pollTimer);
        failTask(task);
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 1500);
}

function finishTask(task) {
  if (progressDurationTimer) clearInterval(progressDurationTimer);
  if (smoothProgressTimer) clearInterval(smoothProgressTimer);

  const btnSubmit = document.getElementById('btnSubmit');
  btnSubmit.disabled = false;
  btnSubmit.innerHTML = `<i data-lucide="wand-2" class="w-5 h-5"></i><span>立即合成全套四位一体教学资料</span>`;

  document.getElementById('progressCard').classList.add('hidden');
  const deliveryCard = document.getElementById('deliveryCard');
  deliveryCard.classList.remove('hidden');
  document.getElementById('deliveryTitle').textContent = `🎉 《${task.grade} · ${task.lesson_title}》教学资料已就绪！`;

  const dl = (type) => `/api/download/${task.id}/${type}`;

  document.getElementById('btnDownloadZip').onclick = () => triggerDownload(dl('zip'));
  document.getElementById('btnPlan').onclick = () => triggerDownload(dl('docx_plan'));
  document.getElementById('btnWorksheet').onclick = () => triggerDownload(dl('docx_worksheet'));
  document.getElementById('btnPptx').onclick = () => triggerDownload(dl('pptx'));
  document.getElementById('btnPdf').onclick = () => triggerDownload(dl('pdf'));
  document.getElementById('btnHtml').onclick = () => triggerDownload(dl('html'));

  const previewToken = token ? `?token=${encodeURIComponent(token)}` : '';
  document.getElementById('btnPlayHtml').href = `/api/preview/${task.id}/html${previewToken}`;

  refreshIcons();
  deliveryCard.scrollIntoView({ behavior: 'smooth' });
}

function failTask(task) {
  if (progressDurationTimer) clearInterval(progressDurationTimer);
  if (smoothProgressTimer) clearInterval(smoothProgressTimer);

  const btnSubmit = document.getElementById('btnSubmit');
  btnSubmit.disabled = false;
  btnSubmit.innerHTML = `<i data-lucide="wand-2" class="w-5 h-5"></i><span>立即合成全套四位一体教学资料</span>`;

  // 保持 progressCard 展开，切换为直观的异常态
  const progressCard = document.getElementById('progressCard');
  progressCard.classList.remove('hidden');

  document.getElementById('progressTitle').innerHTML = `<span class="text-rose-400 flex items-center gap-2">⚠️ 生成遇到异常或中断</span>`;
  document.getElementById('progressText').textContent = task.error_msg || task.error_message || '任务中断，您可以点击右侧重新生成或返回修改要求';
  document.getElementById('progressText').className = 'text-xs sm:text-sm text-rose-300 font-semibold mt-0.5';

  const runningDot = document.getElementById('taskRunningDot');
  if (runningDot) {
    runningDot.className = 'inline-block w-2 h-2 rounded-full bg-rose-400';
  }
  document.getElementById('taskControlHint').textContent = '流水线已终止';

  // 停止未就绪卡片的旋转菊花，避免用户误以为仍在构建
  const names = ['备课教案', '探究导学单', '大屏演示课件', '随堂互动作业'];
  const descs = ['≤4页公文精排', '严格单面防溢出', 'Marp 16:9纯净卡片', '单文件微型仿真台'];
  ['stepPlan', 'stepWorksheet', 'stepSlides', 'stepClasswork'].forEach((id, idx) => {
    const el = document.getElementById(id);
    if (!el) return;
    const statusEl = el.querySelector('.step-status');
    const isDone = statusEl && statusEl.textContent === '已就绪';
    if (!isDone) {
      updateStepState(id, 'stopped', names[idx], descs[idx]);
    }
  });

  // 按钮切换
  document.getElementById('btnCancelTask').classList.add('hidden');
  document.getElementById('btnRetryTask').classList.remove('hidden');
  document.getElementById('btnBackEdit').classList.remove('hidden');

  refreshIcons();
}

// 绑定任务控制按钮
document.getElementById('btnCancelTask').addEventListener('click', async () => {
  if (!currentTaskId) return;
  if (!confirm('确定要取消当前的备课生成任务吗？')) return;
  try {
    await fetch(`/api/tasks/${currentTaskId}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    resetTaskProgressUI();
  } catch (err) {
    alert('取消失败: ' + err.message);
  }
});

document.getElementById('btnRetryTask').addEventListener('click', async () => {
  if (!currentTaskId) return;
  try {
    document.getElementById('btnRetryTask').disabled = true;
    const res = await fetch(`/api/tasks/${currentTaskId}/retry`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '重试失败');
    resetToGeneratingState();
    startPolling(currentTaskId);
  } catch (err) {
    alert('重新生成失败: ' + err.message);
  } finally {
    document.getElementById('btnRetryTask').disabled = false;
  }
});

document.getElementById('btnBackEdit').addEventListener('click', () => {
  resetTaskProgressUI();
});

// 全局历史任务重试与取消
window.retryHistoryTask = async function(taskId) {
  try {
    toggleHistoryDrawer();
    currentTaskId = taskId;

    // 禁用主界面的大紫按钮，同步展示正在生成状态
    const btnSubmit = document.getElementById('btnSubmit');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i><span>正在生成四位一体资料中...</span>`;

    document.getElementById('deliveryCard').classList.add('hidden');
    const progressCard = document.getElementById('progressCard');
    progressCard.classList.remove('hidden');
    resetToGeneratingState();

    const res = await fetch(`/api/tasks/${taskId}/retry`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '重新生成失败');

    startPolling(taskId);
    progressCard.scrollIntoView({ behavior: 'smooth' });
    refreshIcons();
  } catch (err) {
    alert('启动重新生成失败: ' + err.message);
    const btnSubmit = document.getElementById('btnSubmit');
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `<i data-lucide="wand-2" class="w-5 h-5"></i><span>立即合成全套四位一体教学资料</span>`;
    refreshIcons();
  }
};

window.cancelHistoryTask = async function(taskId) {
  if (!confirm('确定要取消该任务吗？')) return;
  try {
    const res = await fetch(`/api/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || '取消失败');
    }
    loadHistoryList();
    if (currentTaskId === taskId) {
      resetTaskProgressUI();
    }
  } catch (err) {
    alert('取消失败: ' + err.message);
  }
};

function parseFilenameFromDisposition(disposition) {
  if (!disposition) return 'download';
  // 1. 优先提取 RFC 5987: filename*=UTF-8''...
  const utf8Match = disposition.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^["']|["']$/g, ''));
    } catch { }
  }
  // 2. 匹配普通 filename="..." 或 filename=...（只取到第一个分号前）
  const match = disposition.match(/filename="?([^";]+)"?/i);
  if (match && match[1]) {
    try {
      return decodeURIComponent(match[1].trim());
    } catch {
      return match[1].trim();
    }
  }
  return 'download';
}

function triggerDownload(url) {
  fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => {
    if (!res.ok) throw new Error('下载文件失败');
    const disposition = res.headers.get('Content-Disposition');
    const filename = parseFilenameFromDisposition(disposition);
    return res.blob().then(blob => ({ blob, filename }));
  })
  .then(({ blob, filename }) => {
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  })
  .catch(err => alert(err.message));
}

// ======================== 历史抽屉 ========================

function toggleHistoryDrawer() {
  const drawer = document.getElementById('historyDrawer');
  const overlay = document.getElementById('drawerOverlay');

  if (drawer.classList.contains('translate-x-full')) {
    drawer.classList.remove('translate-x-full');
    overlay.classList.remove('hidden');
    loadHistoryList();
  } else {
    drawer.classList.add('translate-x-full');
    overlay.classList.add('hidden');
  }
}

async function loadHistoryList() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<div class="text-xs text-slate-500 text-center py-8">正在读取历史备课清单...</div>';

  try {
    const res = await fetch('/api/tasks', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      list.innerHTML = '<div class="text-xs text-slate-500 text-center py-8">请先登录后查看历史</div>';
      return;
    }

    const tasks = await res.json();
    if (tasks.length === 0) {
      list.innerHTML = '<div class="text-xs text-slate-500 text-center py-8">暂无历史备课记录</div>';
      return;
    }

    list.innerHTML = '';
    tasks.forEach(t => {
      const item = document.createElement('div');
      item.className = 'p-3.5 rounded-xl bg-dark-surface border border-dark-border space-y-2.5 transition hover:border-dark-borderLight';
      const statusBadge = t.status === 'completed'
        ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">已就绪</span>'
        : (t.status === 'failed' ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-semibold">失败/中断</span>'
        : '<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold animate-pulse">生成中</span>');

      let actionHtml = '';
      if (t.status === 'completed') {
        actionHtml = `
          <!-- 四件套独立下载网格：教案、导学单、课件、随堂作业 -->
          <div class="grid grid-cols-2 gap-1.5 pt-1">
            <button onclick="triggerDownload('/api/download/${t.id}/docx_plan')" 
              class="px-2.5 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold flex items-center justify-between transition cursor-pointer active:scale-95" title="点击下载教案Word文档">
              <span class="flex items-center gap-1.5"><i data-lucide="file-text" class="w-3.5 h-3.5 text-indigo-400"></i>备课教案</span>
              <span class="text-[10px] text-indigo-400/80 font-mono">DOCX</span>
            </button>

            <button onclick="triggerDownload('/api/download/${t.id}/docx_worksheet')" 
              class="px-2.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold flex items-center justify-between transition cursor-pointer active:scale-95" title="点击下载导学单Word文档">
              <span class="flex items-center gap-1.5"><i data-lucide="layout" class="w-3.5 h-3.5 text-cyan-400"></i>探究导学单</span>
              <span class="text-[10px] text-cyan-400/80 font-mono">DOCX</span>
            </button>

            <button onclick="triggerDownload('/api/download/${t.id}/pptx')" 
              class="px-2.5 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-semibold flex items-center justify-between transition cursor-pointer active:scale-95" title="点击下载演示课件PPTX">
              <span class="flex items-center gap-1.5"><i data-lucide="presentation" class="w-3.5 h-3.5 text-purple-400"></i>大屏课件</span>
              <span class="text-[10px] text-purple-400/80 font-mono">PPTX</span>
            </button>

            <button onclick="triggerDownload('/api/download/${t.id}/html')" 
              class="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold flex items-center justify-between transition cursor-pointer active:scale-95" title="点击下载互动作业HTML文件">
              <span class="flex items-center gap-1.5"><i data-lucide="gamepad-2" class="w-3.5 h-3.5 text-emerald-400"></i>随堂作业</span>
              <span class="text-[10px] text-emerald-400/80 font-mono">HTML</span>
            </button>
          </div>

          <!-- 快捷操作栏：试玩作业 + 下载全套 ZIP -->
          <div class="flex items-center gap-2 pt-2 border-t border-dark-border/70">
            <a href="/api/preview/${t.id}/html${token ? `?token=${encodeURIComponent(token)}` : ''}" target="_blank" 
              class="flex-1 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center justify-center gap-1.5 transition">
              <i data-lucide="play" class="w-3.5 h-3.5"></i>
              <span>试玩作业</span>
            </a>
            <button onclick="triggerDownload('/api/download/${t.id}/zip')" 
              class="flex-1 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-brand-500/20 transition cursor-pointer active:scale-95">
              <i data-lucide="archive" class="w-3.5 h-3.5"></i>
              <span>下载全套 (.ZIP)</span>
            </button>
          </div>
        `;
      } else if (t.status === 'failed') {
        actionHtml = `
          <div class="text-[11px] text-rose-400/90 truncate">${t.error_msg || '任务已中断'}</div>
          <div class="flex items-center gap-2 pt-1">
            <button onclick="retryHistoryTask('${t.id}')" class="px-3 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-sm shadow-brand-500/20">
              <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
              <span>重新生成</span>
            </button>
          </div>
        `;
      } else {
        // generating / pending
        actionHtml = `
          <div class="text-[11px] text-amber-400/90 flex items-center gap-1.5">
            <span class="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            <span>${t.progress_text || '正在生成中...'}</span>
          </div>
          <div class="flex items-center gap-2 pt-1">
            <button onclick="cancelHistoryTask('${t.id}')" class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-1 transition cursor-pointer">
              <i data-lucide="x-circle" class="w-3.5 h-3.5"></i>
              <span>取消生成</span>
            </button>
          </div>
        `;
      }

      item.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-semibold text-brand-300 font-mono">${t.grade}</span>
          ${statusBadge}
        </div>
        <div class="text-xs font-bold text-slate-100 truncate">${t.lesson_title}</div>
        <div class="text-[10px] text-slate-500 font-mono">${new Date(t.created_at).toLocaleString()}</div>
        ${actionHtml}
      `;
      list.appendChild(item);
    });
    refreshIcons();
  } catch (err) {
    list.innerHTML = `<div class="text-xs text-red-400 text-center py-8">加载失败: ${err.message}</div>`;
  }
}

// ======================== 登录 / 注册浮窗 ========================

function openAuthModal(mode = 'login') {
  authMode = mode;
  const modal = document.getElementById('authModal');
  const title = document.getElementById('authModalTitle');
  const btn = document.getElementById('btnAuthSubmit');
  const switchLink = document.getElementById('authSwitchLink');
  const registerFields = document.getElementById('registerFields');

  if (mode === 'register') {
    title.textContent = '教师注册';
    btn.textContent = '立即注册';
    registerFields.classList.remove('hidden');
    switchLink.textContent = '已有账号？点此直接登录';
  } else {
    title.textContent = '教师登录';
    btn.textContent = '登 录';
    registerFields.classList.add('hidden');
    switchLink.textContent = '没有账号？点此注册';
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  refreshIcons();
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function toggleAuthMode() {
  openAuthModal(authMode === 'login' ? 'register' : 'login');
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  const inviteCode = document.getElementById('authInviteCode').value.trim();
  const realName = document.getElementById('authRealName') ? document.getElementById('authRealName').value.trim() : '';
  const school = document.getElementById('authSchool') ? document.getElementById('authSchool').value.trim() : '';

  const endpoint = authMode === 'register' ? '/api/register' : '/api/login';
  const body = { username, password };
  if (authMode === 'register') {
    body.inviteCode = inviteCode;
    body.realName = realName;
    body.school = school;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || '请求失败，请重试');
      return;
    }

    token = data.token;
    localStorage.setItem('itls_token', token);

    await initUser();
    closeAuthModal();
  } catch (err) {
    alert('网络连接错误：' + err.message);
  }
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('itls_token');
  initUser();
}
