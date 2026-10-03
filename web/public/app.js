// 全局状态
let token = localStorage.getItem('itls_token');
let currentUsername = localStorage.getItem('itls_user');
let authMode = 'login'; // 'login' | 'register'
let pollTimer = null;

// 浙教版各年级典型课题快速选填预设
const LESSON_PRESETS = {
  '三年级上册': ['第01课 感受智能生活', '第02课 了解智能工具', '第03课 认识数字设备', '第07课 初识键盘与输入'],
  '三年级下册': ['第01课 身边的编码', '第02课 身份证号的秘密', '第05课 制作数字作品'],
  '四年级上册': ['第01课 从数据到编码', '第04课 条形码的应用', '第10课 二维码的奥秘'],
  '四年级下册': ['第01课 身边的数据安全', '第06课 简单的数据图表'],
  '五年级上册': ['第01课 算法的特征', '第05课 算法的执行', '第09课 分支结构算法'],
  '五年级下册': ['第01课 控制系统的基本环节', '第05课 智能恒温箱设计'],
  '六年级上册': ['第01课 认识大模型', '第05课 图像智能识别', '第08课 探秘无人驾驶'],
  '六年级下册': ['第01课 小型物联系统', '第04课 智能微农场'],
  '七年级上册': ['第01课 互联网的本质', '第03课 网页与信息呈现', '第07课 网站架构设计'],
  '七年级下册': ['第01课 数据的数字编码', '第05课 Python 数据统计'],
  '八年级上册': ['第01课 算法思维进阶', '第05课 排序与查找算法', '第12课 数据解密与安全'],
  '八年级下册': ['第01课 局域网搭建与排错', '第06课 小型数据库应用']
};

document.addEventListener('DOMContentLoaded', () => {
  initUser();
  updateLessonPresets();
  refreshIcons();
});

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// 初始化用户信息与导航栏
function initUser() {
  const userNameDisplay = document.getElementById('userNameDisplay');
  const btnHistory = document.getElementById('btnHistory');
  const btnLogout = document.getElementById('btnLogout');
  const btnLoginModal = document.getElementById('btnLoginModal');

  if (token && currentUsername) {
    userNameDisplay.textContent = `👤 ${currentUsername} 老师`;
    userNameDisplay.classList.remove('hidden');
    btnHistory.classList.remove('hidden');
    btnLogout.classList.remove('hidden');
    btnLoginModal.classList.add('hidden');
  } else {
    userNameDisplay.classList.add('hidden');
    btnHistory.classList.add('hidden');
    btnLogout.classList.add('hidden');
    btnLoginModal.classList.remove('hidden');
  }
}

// 更新快捷推荐课时胶囊
function updateLessonPresets() {
  const grade = document.getElementById('selectGrade').value;
  const container = document.getElementById('presetChips');
  container.innerHTML = '';

  const list = LESSON_PRESETS[grade] || [];
  list.forEach(title => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'preset-pill text-xs px-2.5 py-1 rounded-lg text-slate-300 flex items-center gap-1.5 cursor-pointer';
    chip.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-brand-400"></span><span>${title}</span>`;
    chip.onclick = () => {
      document.getElementById('inputTitle').value = title;
    };
    container.appendChild(chip);
  });
}

// 登录/注册弹窗交互
function openAuthModal(mode = 'login') {
  authMode = mode;
  const modal = document.getElementById('authModal');
  const title = document.getElementById('authModalTitle');
  const btn = document.getElementById('btnAuthSubmit');
  const switchLink = document.getElementById('authSwitchLink');
  const inviteGroup = document.getElementById('inviteCodeGroup');

  if (mode === 'register') {
    title.textContent = '教研组成员注册';
    btn.textContent = '立即注册';
    inviteGroup.classList.remove('hidden');
    switchLink.textContent = '已有账号？点此直接登录';
  } else {
    title.textContent = '教师登录';
    btn.textContent = '登 录';
    inviteGroup.classList.add('hidden');
    switchLink.textContent = '没有账号？凭邀请码注册';
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

  const endpoint = authMode === 'register' ? '/api/register' : '/api/login';
  const body = { username, password };
  if (authMode === 'register') body.inviteCode = inviteCode;

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
    currentUsername = data.username;
    localStorage.setItem('itls_token', token);
    localStorage.setItem('itls_user', currentUsername);

    initUser();
    closeAuthModal();
  } catch (err) {
    alert('网络连接错误：' + err.message);
  }
}

function logout() {
  token = null;
  currentUsername = null;
  localStorage.removeItem('itls_token');
  localStorage.removeItem('itls_user');
  initUser();
}

// 提交创建任务
async function handleCreateTask(e) {
  e.preventDefault();

  if (!token) {
    openAuthModal('login');
    return;
  }

  const grade = document.getElementById('selectGrade').value;
  const lessonTitle = document.getElementById('inputTitle').value.trim();
  const requirements = document.getElementById('inputRequirements').value.trim();

  const btnSubmit = document.getElementById('btnSubmit');
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>正在提交任务...</span>`;
  refreshIcons();

  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ grade, lessonTitle, requirements })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || '任务启动失败');
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<i data-lucide="wand-2" class="w-4 h-4"></i><span>立即合成全套四位一体教学资料</span>`;
      refreshIcons();
      return;
    }

    showProgressCard(lessonTitle);
    startPolling(data.taskId);
  } catch (err) {
    alert('创建任务失败: ' + err.message);
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `<i data-lucide="wand-2" class="w-4 h-4"></i><span>立即合成全套四位一体教学资料</span>`;
    refreshIcons();
  }
}

function showProgressCard(title) {
  document.getElementById('deliveryCard').classList.add('hidden');
  const progressCard = document.getElementById('progressCard');
  progressCard.classList.remove('hidden');
  document.getElementById('progressTitle').textContent = `正在生成《${title}》全套教学资料...`;
  progressCard.scrollIntoView({ behavior: 'smooth' });
  refreshIcons();
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
      updateProgressUI(task);

      if (task.status === 'completed') {
        clearInterval(pollTimer);
        finishTask(task);
      } else if (task.status === 'failed') {
        clearInterval(pollTimer);
        failTask(task);
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 2000);
}

function updateProgressUI(task) {
  const percent = task.progress || 0;
  document.getElementById('progressPercent').textContent = `${percent}%`;
  document.getElementById('progressBarFill').style.width = `${percent}%`;
  document.getElementById('progressText').textContent = task.progress_text || '处理中...';

  const updateDot = (id, active) => {
    const el = document.getElementById(id);
    const dot = el.querySelector('.step-dot');
    if (active) {
      dot.classList.add('bg-brand-500', 'text-white', 'border-brand-400');
      el.classList.add('text-slate-200');
    } else {
      dot.classList.remove('bg-brand-500', 'text-white', 'border-brand-400');
      el.classList.remove('text-slate-200');
    }
  };

  updateDot('step1', percent >= 20);
  updateDot('step2', percent >= 60);
  updateDot('step3', percent >= 90);
}

function finishTask(task) {
  const btnSubmit = document.getElementById('btnSubmit');
  btnSubmit.disabled = false;
  btnSubmit.innerHTML = `<i data-lucide="wand-2" class="w-4 h-4"></i><span>立即合成全套四位一体教学资料</span>`;

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

  document.getElementById('btnPlayHtml').href = `/api/preview/${task.id}/html`;

  refreshIcons();
  deliveryCard.scrollIntoView({ behavior: 'smooth' });
}

function failTask(task) {
  const btnSubmit = document.getElementById('btnSubmit');
  btnSubmit.disabled = false;
  btnSubmit.innerHTML = `<i data-lucide="wand-2" class="w-4 h-4"></i><span>重新合成资料</span>`;
  alert(`生成失败：${task.error_msg || '未知错误，请检查大模型接口配置'}`);
  refreshIcons();
}

async function triggerDownload(url) {
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      alert('下载文件失败');
      return;
    }

    const disposition = res.headers.get('Content-Disposition');
    let filename = 'deliverable.bin';
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match && match[1]) {
        filename = decodeURIComponent(match[1].replace(/['"]/g, ''));
      }
    }

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    alert('下载出错: ' + err.message);
  }
}

// 历史备课抽屉
function toggleHistoryDrawer() {
  const overlay = document.getElementById('drawerOverlay');
  const drawer = document.getElementById('historyDrawer');
  const isOpen = !drawer.classList.contains('translate-x-full');

  if (!isOpen) {
    loadHistoryTasks();
    overlay.classList.remove('hidden');
    drawer.classList.remove('translate-x-full');
  } else {
    overlay.classList.add('hidden');
    drawer.classList.add('translate-x-full');
  }
}

async function loadHistoryTasks() {
  const container = document.getElementById('historyList');
  container.innerHTML = '<p class="text-xs text-slate-500">正在检索历史记录...</p>';

  try {
    const res = await fetch('/api/tasks', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const tasks = await res.json();

    if (!tasks || tasks.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-500">暂无备课记录</p>';
      return;
    }

    container.innerHTML = '';
    tasks.forEach(t => {
      const item = document.createElement('div');
      item.className = 'p-3 rounded-xl bg-dark-surface border border-dark-border space-y-2';
      item.innerHTML = `
        <div class="text-xs font-bold text-slate-200">${t.grade} · ${t.lesson_title}</div>
        <div class="flex items-center justify-between text-[10px] text-slate-400">
          <span>${t.status === 'completed' ? '✅ 已就绪' : t.status}</span>
          <span>${t.created_at ? t.created_at.slice(0, 16) : ''}</span>
        </div>
        ${t.status === 'completed' ? `
          <div class="flex gap-2 pt-1">
            <button class="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 transition" onclick="triggerDownload('/api/download/${t.id}/zip')">下载ZIP</button>
            <a class="flex-1 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-[11px] text-white text-center transition" target="_blank" href="/api/preview/${t.id}/html">试玩作业</a>
          </div>
        ` : ''}
      `;
      container.appendChild(item);
    });
    refreshIcons();
  } catch (err) {
    container.innerHTML = '<p class="text-xs text-red-400">加载历史失败</p>';
  }
}
