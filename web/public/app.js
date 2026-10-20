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
window.handleDropzoneClick = handleDropzoneClick;
window.clearAllImages = clearAllImages;
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

// 单机版 AI 引擎与密钥设置窗口
window.openAiSettingsModal = openAiSettingsModal;
window.closeAiSettingsModal = closeAiSettingsModal;
window.selectAiProvider = selectAiProvider;
window.testAiConnection = testAiConnection;
window.saveAiSettings = saveAiSettings;
window.toggleApiKeyVisibility = toggleApiKeyVisibility;
window.fetchAvailableModels = fetchAvailableModels;
window.handleKeyInputBlur = handleKeyInputBlur;
window.handleAiInputAutoFetch = handleAiInputAutoFetch;
window.handleModelSelectChange = handleModelSelectChange;
window.toggleCustomModelInput = toggleCustomModelInput;

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
  const btnAiSettings = document.getElementById('btnAiSettings');

  // 1. 检查运行模式与当前 AI 状态
  let systemModeData = { standalone: false, hasApiKey: false, provider: 'deepseek', model: '' };
  try {
    const modeRes = await fetch('/api/system/mode');
    if (modeRes.ok) {
      systemModeData = await modeRes.json();
      if (systemModeData.standalone) {
        window.isStandalone = true;
        if (!token) {
          token = 'standalone_local_token';
          localStorage.setItem('itls_token', token);
        }
        setupStandaloneUI(systemModeData);
        return;
      }
    }
  } catch (e) {
    console.warn('System mode check note:', e.message);
  }

  // 2. 团队多用户服务器模式
  if (!token) {
    currentUser = null;
    userProfileBtn?.classList.add('hidden');
    btnAdminModal?.classList.add('hidden');
    btnHistory?.classList.add('hidden');
    btnLogout?.classList.add('hidden');
    btnLoginModal?.classList.remove('hidden');
    btnAiSettings?.classList.add('hidden');
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
      btnAiSettings?.classList.remove('hidden');
      updateAiStatusBadge(systemModeData.hasApiKey, systemModeData.provider, systemModeData.model);
    } else {
      userRoleIcon.textContent = '👤';
      userNameDisplay.textContent = `${displayName} 老师`;
      userProfileBtn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-500/15 text-brand-300 border border-brand-500/30 hover:border-brand-500/60 text-xs font-medium transition cursor-pointer';
      btnAdminModal.classList.add('hidden');
      btnAiSettings?.classList.add('hidden');
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

// ======================== 单机便携版与 AI 引擎配置 ========================

function setupStandaloneUI(modeData) {
  const userProfileBtn = document.getElementById('userProfileBtn');
  const btnAdminModal = document.getElementById('btnAdminModal');
  const btnHistory = document.getElementById('btnHistory');
  const btnLogout = document.getElementById('btnLogout');
  const btnLoginModal = document.getElementById('btnLoginModal');
  const btnAiSettings = document.getElementById('btnAiSettings');

  // 单机版彻底隐藏团队多余按钮
  userProfileBtn?.classList.add('hidden');
  btnAdminModal?.classList.add('hidden');
  btnLogout?.classList.add('hidden');
  btnLoginModal?.classList.add('hidden');

  // 显示历史与 AI 设置
  btnHistory?.classList.remove('hidden');
  btnAiSettings?.classList.remove('hidden');

  // 刷新顶栏 AI 状态胶囊
  updateAiStatusBadge(modeData.hasApiKey, modeData.provider, modeData.model);

  refreshIcons();

  // 若从未配置过 API Key，首次打开温和弹出配置向导
  if (!modeData.hasApiKey && !sessionStorage.getItem('itls_ai_modal_shown')) {
    sessionStorage.setItem('itls_ai_modal_shown', 'true');
    setTimeout(() => {
      openAiSettingsModal(true);
    }, 600);
  }
}

let currentAiProvider = 'deepseek';
let isCustomModelMode = false;
let autoFetchTimer = null;

const PROVIDER_PRESETS = {
  deepseek: {
    name: 'DeepSeek 官方',
    base: 'https://api.deepseek.com/v1',
    helpText: '获取 DeepSeek 密钥',
    helpUrl: 'https://platform.deepseek.com/api_keys',
    tip: ''
  },
  aliyun: {
    name: '阿里云百炼',
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    helpText: '获取百炼 API-Key',
    helpUrl: 'https://bailian.console.aliyun.com/',
    tip: ''
  },
  custom: {
    name: '自定义接口',
    base: '',
    helpText: '',
    helpUrl: '',
    tip: '支持任何兼容 OpenAI /chat/completions 规范的 Base URL 或本地 Ollama'
  }
};

// 三大服务商各自独立保存配置，切换绝不互相覆盖或还原
let providerConfigs = {
  deepseek: { apiKey: '', apiBase: 'https://api.deepseek.com/v1', model: '', models: [], lastFetchedSig: '' },
  aliyun:   { apiKey: '', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '', models: [], lastFetchedSig: '' },
  custom:   { apiKey: '', apiBase: '', model: '', models: [], lastFetchedSig: '' }
};

function saveCurrentProviderDomState() {
  if (!currentAiProvider || !providerConfigs[currentAiProvider]) return;
  const keyEl = document.getElementById('inputAiKey');
  const baseEl = document.getElementById('inputAiBase');
  const cfg = providerConfigs[currentAiProvider];
  if (keyEl) cfg.apiKey = keyEl.value.trim();
  if (baseEl) cfg.apiBase = baseEl.value.trim();
  const activeModel = getActiveModelValue();
  if (activeModel) cfg.model = activeModel;
}

function populateModelOptions(modelList = [], selectedValue = '') {
  const select = document.getElementById('selectAiModel');
  if (!select) return;

  select.innerHTML = '';
  const list = Array.isArray(modelList) ? modelList : [];

  if (list.length === 0) {
    if (selectedValue) {
      const opt = document.createElement('option');
      opt.value = selectedValue;
      opt.textContent = selectedValue;
      opt.selected = true;
      select.appendChild(opt);
    } else {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '-- 填入密钥与端点后自动拉取模型 --';
      placeholder.selected = true;
      select.appendChild(placeholder);
    }
  } else {
    let matchFound = false;
    list.forEach(m => {
      const id = typeof m === 'string' ? m : m.id;
      const label = typeof m === 'string' ? m : (m.label || m.id);
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = label;
      if (selectedValue && id === selectedValue) {
        opt.selected = true;
        matchFound = true;
      }
      select.appendChild(opt);
    });

    if (!matchFound) {
      select.selectedIndex = 0;
    }
  }

  const inputAiModel = document.getElementById('inputAiModel');
  if (inputAiModel) {
    inputAiModel.value = select.value || selectedValue || '';
  }
  if (providerConfigs[currentAiProvider] && select.value) {
    providerConfigs[currentAiProvider].model = select.value;
  }
}

function handleModelSelectChange(val) {
  const inputAiModel = document.getElementById('inputAiModel');
  if (inputAiModel) {
    inputAiModel.value = val;
  }
  if (providerConfigs[currentAiProvider]) {
    providerConfigs[currentAiProvider].model = val;
  }
}

function toggleCustomModelInput() {
  const selectBox = document.getElementById('modelSelectContainer');
  const inputBox = document.getElementById('modelInputContainer');
  const btnToggleText = document.getElementById('textToggleModel');
  const inputAiModel = document.getElementById('inputAiModel');
  const selectAiModel = document.getElementById('selectAiModel');

  isCustomModelMode = !isCustomModelMode;

  if (isCustomModelMode) {
    selectBox?.classList.add('hidden');
    inputBox?.classList.remove('hidden');
    if (btnToggleText) btnToggleText.textContent = '📋 下拉选';
    if (inputAiModel && selectAiModel && selectAiModel.value) {
      inputAiModel.value = selectAiModel.value;
    }
    inputAiModel?.focus();
  } else {
    selectBox?.classList.remove('hidden');
    inputBox?.classList.add('hidden');
    if (btnToggleText) btnToggleText.textContent = '✍️ 手动填';
    if (inputAiModel && selectAiModel && inputAiModel.value.trim()) {
      const val = inputAiModel.value.trim();
      let exists = false;
      for (let i = 0; i < selectAiModel.options.length; i++) {
        if (selectAiModel.options[i].value === val) {
          selectAiModel.selectedIndex = i;
          exists = true;
          break;
        }
      }
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        opt.selected = true;
        selectAiModel.prepend(opt);
      }
      if (providerConfigs[currentAiProvider]) {
        providerConfigs[currentAiProvider].model = val;
      }
    }
  }
  refreshIcons();
}

function handleAiInputAutoFetch() {
  saveCurrentProviderDomState();
  if (autoFetchTimer) clearTimeout(autoFetchTimer);
  autoFetchTimer = setTimeout(() => {
    const apiKey = document.getElementById('inputAiKey')?.value.trim() || '';
    const apiBase = document.getElementById('inputAiBase')?.value.trim() || '';
    const cfg = providerConfigs[currentAiProvider];
    const sig = `${apiBase}|${apiKey}`;
    if (apiKey.length >= 8 && apiKey !== 'sk-none' && /^https?:\/\/.+/i.test(apiBase)) {
      if (!cfg || cfg.lastFetchedSig !== sig || !cfg.models || cfg.models.length === 0) {
        fetchAvailableModels(true);
      }
    }
  }, 600);
}

function handleKeyInputBlur() {
  saveCurrentProviderDomState();
  const apiKey = document.getElementById('inputAiKey')?.value.trim() || '';
  const apiBase = document.getElementById('inputAiBase')?.value.trim() || '';
  const cfg = providerConfigs[currentAiProvider];
  const sig = `${apiBase}|${apiKey}`;
  if (apiKey.length >= 8 && apiKey !== 'sk-none' && /^https?:\/\/.+/i.test(apiBase)) {
    if (!cfg || cfg.lastFetchedSig !== sig || !cfg.models || cfg.models.length === 0) {
      fetchAvailableModels(true);
    }
  }
}

async function fetchAvailableModels(silent = false) {
  const targetProvider = currentAiProvider;
  const btnFetch = document.getElementById('btnFetchModels');
  const textFetch = document.getElementById('textFetchModels');
  const iconFetch = document.getElementById('iconFetchModels');
  const apiKey = document.getElementById('inputAiKey')?.value.trim() || '';
  const apiBase = document.getElementById('inputAiBase')?.value.trim() || '';
  const tip = document.getElementById('modelFetchTip');

  saveCurrentProviderDomState();

  if (!apiKey || apiKey === 'sk-none') {
    if (!silent) alert('请先填入有效的 API Key 密钥');
    return;
  }
  if (!apiBase || !/^https?:\/\/.+/i.test(apiBase)) {
    if (!silent) alert('请先填入有效的端点地址 (Base URL)');
    return;
  }

  if (iconFetch) iconFetch.classList.add('animate-spin');
  if (textFetch) textFetch.textContent = '拉取中...';
  if (btnFetch) btnFetch.disabled = true;

  try {
    const res = await fetch('/api/settings/fetch-models', {
      method: 'POST',
      headers: token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } : { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiBase, apiKey })
    });

    const result = await res.json();
    if (res.ok && result.success && Array.isArray(result.models) && result.models.length > 0) {
      const cfg = providerConfigs[targetProvider];
      if (cfg) {
        cfg.models = result.models;
        cfg.lastFetchedSig = `${apiBase}|${apiKey}`;
      }

      if (currentAiProvider === targetProvider) {
        const preferredModel = cfg?.model || getActiveModelValue();
        populateModelOptions(result.models, preferredModel);
        if (textFetch) textFetch.textContent = `已获取 ${result.models.length} 个模型`;
        if (tip) {
          tip.textContent = `✅ 已自动拉取 ${result.models.length} 个可用模型`;
          tip.className = 'text-[10px] text-emerald-400 font-medium';
        }
      }
    } else {
      if (!silent) {
        alert('拉取模型失败：' + (result.error || '未获取到模型列表'));
      }
      if (currentAiProvider === targetProvider) {
        if (textFetch) textFetch.textContent = '拉取失败(重试)';
        if (tip) {
          tip.textContent = `⚠️ 未能拉取模型列表 (${result.error || '接口未返回'})，可点右上角“手动填”`;
          tip.className = 'text-[10px] text-amber-400';
        }
      }
    }
  } catch (err) {
    if (!silent) {
      alert('拉取模型异常：' + err.message);
    }
    if (currentAiProvider === targetProvider && textFetch) {
      textFetch.textContent = '拉取异常(重试)';
    }
  } finally {
    if (iconFetch) iconFetch.classList.remove('animate-spin');
    if (btnFetch) btnFetch.disabled = false;
    refreshIcons();
  }
}

function selectAiProvider(providerKey, skipSaveCurrent = false) {
  if (!skipSaveCurrent && currentAiProvider) {
    saveCurrentProviderDomState();
  }

  currentAiProvider = providerKey;
  const preset = PROVIDER_PRESETS[providerKey] || PROVIDER_PRESETS.deepseek;
  const cfg = providerConfigs[providerKey] || { apiKey: '', apiBase: preset.base, model: '', models: [] };

  ['deepseek', 'aliyun', 'custom'].forEach(p => {
    const btn = document.getElementById(`providerBtn${p.charAt(0).toUpperCase() + p.slice(1)}`);
    if (!btn) return;
    if (p === providerKey) {
      btn.className = 'p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-brand-500/15 border-brand-500 text-brand-300 shadow-sm';
    } else {
      btn.className = 'p-3 rounded-2xl border border-dark-border bg-dark-surface/60 hover:bg-dark-surface text-slate-300 text-center transition flex flex-col items-center justify-center gap-1.5 cursor-pointer';
    }
  });

  const inputKey = document.getElementById('inputAiKey');
  const inputBase = document.getElementById('inputAiBase');
  const providerKeyHelp = document.getElementById('providerKeyHelp');
  const providerKeyTip = document.getElementById('providerKeyTip');
  const tip = document.getElementById('modelFetchTip');
  const textFetch = document.getElementById('textFetchModels');

  if (inputKey) {
    inputKey.value = cfg.apiKey || '';
  }
  if (inputBase) {
    inputBase.value = cfg.apiBase !== undefined && cfg.apiBase !== '' ? cfg.apiBase : preset.base;
    inputBase.placeholder = preset.base || 'https://api.openai.com/v1';
  }

  if (providerKeyTip) {
    if (preset.tip) {
      providerKeyTip.textContent = preset.tip;
      providerKeyTip.classList.remove('hidden');
    } else {
      providerKeyTip.textContent = '';
      providerKeyTip.classList.add('hidden');
    }
  }

  // 恢复该服务商已拉取的模型列表与选中模型（不预置固定模型）
  const savedModels = Array.isArray(cfg.models) ? cfg.models : [];
  populateModelOptions(savedModels, cfg.model || '');

  if (savedModels.length > 0) {
    if (textFetch) textFetch.textContent = `已获取 ${savedModels.length} 个模型`;
    if (tip) {
      tip.textContent = `✅ 已加载 ${savedModels.length} 个可用模型`;
      tip.className = 'text-[10px] text-emerald-400 font-medium';
    }
  } else {
    if (textFetch) textFetch.textContent = '拉取模型';
    if (tip) {
      tip.textContent = '填入密钥与端点后将自动拉取可用模型列表';
      tip.className = 'text-[10px] text-slate-500';
    }
  }

  // 默认保持下拉选择模式
  if (isCustomModelMode) {
    toggleCustomModelInput();
  }

  if (providerKeyHelp) {
    if (preset.helpUrl) {
      providerKeyHelp.href = preset.helpUrl;
      providerKeyHelp.innerHTML = `<span>${preset.helpText}</span><i data-lucide="external-link" class="w-3 h-3"></i>`;
      providerKeyHelp.classList.remove('hidden');
    } else {
      providerKeyHelp.classList.add('hidden');
    }
  }

  hideTestResult();
  refreshIcons();

  // 如果该服务商已填有 Key 与 Base URL，则自动拉取最新模型列表
  const effectiveBase = inputBase ? inputBase.value.trim() : '';
  const effectiveKey = inputKey ? inputKey.value.trim() : '';
  if (effectiveKey && effectiveKey !== 'sk-none' && /^https?:\/\/.+/i.test(effectiveBase)) {
    if (savedModels.length === 0) {
      fetchAvailableModels(true);
    }
  }
}

function getActiveModelValue() {
  if (isCustomModelMode) {
    return document.getElementById('inputAiModel')?.value.trim() || '';
  }
  const select = document.getElementById('selectAiModel');
  return select ? select.value.trim() : (document.getElementById('inputAiModel')?.value.trim() || '');
}

async function openAiSettingsModal(isFirstRun = false) {
  const modal = document.getElementById('aiSettingsModal');
  if (!modal) return;

  try {
    const res = await fetch('/api/settings/ai', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (res.ok) {
      const data = await res.json();
      if (data.configs && typeof data.configs === 'object') {
        for (const k of ['deepseek', 'aliyun', 'custom']) {
          if (data.configs[k]) {
            providerConfigs[k] = {
              ...providerConfigs[k],
              ...data.configs[k],
              models: Array.isArray(data.configs[k].models) ? data.configs[k].models : (providerConfigs[k].models || [])
            };
          }
        }
      }
      const activeProv = data.provider || 'deepseek';
      if (providerConfigs[activeProv]) {
        if (data.apiKey && !providerConfigs[activeProv].apiKey) providerConfigs[activeProv].apiKey = data.apiKey;
        if (data.apiBase && !providerConfigs[activeProv].apiBase) providerConfigs[activeProv].apiBase = data.apiBase;
        if (data.model && !providerConfigs[activeProv].model) providerConfigs[activeProv].model = data.model;
      }
      selectAiProvider(activeProv, true);
    }
  } catch (e) {
    console.error('Failed to load AI settings:', e);
  }

  hideTestResult();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  refreshIcons();
}

function closeAiSettingsModal() {
  saveCurrentProviderDomState();
  const modal = document.getElementById('aiSettingsModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('inputAiKey');
  const eyeIcon = document.getElementById('eyeIcon');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    eyeIcon?.setAttribute('data-lucide', 'eye-off');
  } else {
    input.type = 'password';
    eyeIcon?.setAttribute('data-lucide', 'eye');
  }
  refreshIcons();
}

async function testAiConnection() {
  saveCurrentProviderDomState();
  const btn = document.getElementById('btnTestAi');
  const btnText = document.getElementById('testAiBtnText');
  const apiKey = document.getElementById('inputAiKey').value.trim();
  const model = getActiveModelValue();
  const apiBase = document.getElementById('inputAiBase').value.trim();

  if (!apiKey) {
    showTestResult(false, '请先填入 API Key 密钥');
    return;
  }
  if (!model) {
    showTestResult(false, '请先拉取并选择模型（或点击“手动填”输入模型代号）');
    return;
  }

  btn.disabled = true;
  btnText.textContent = '测试中...';
  hideTestResult();

  try {
    const res = await fetch('/api/settings/test-connection', {
      method: 'POST',
      headers: token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } : { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiBase, apiKey, model })
    });
    const result = await res.json();
    if (res.ok && result.success) {
      showTestResult(true, `✅ ${result.message || '连接成功！'}`);
    } else {
      showTestResult(false, `❌ ${result.error || '连接失败'}`);
    }
  } catch (err) {
    showTestResult(false, `❌ 网络异常: ${err.message}`);
  } finally {
    btn.disabled = false;
    btnText.textContent = '测试连通性';
  }
}

function showTestResult(isSuccess, message) {
  const banner = document.getElementById('testAiResult');
  const bannerText = document.getElementById('testAiResultText');
  if (!banner || !bannerText) return;

  bannerText.textContent = message;
  banner.className = `p-3 rounded-xl text-xs flex items-center justify-between border ${
    isSuccess ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'
  }`;
  banner.classList.remove('hidden');
}

function hideTestResult() {
  const banner = document.getElementById('testAiResult');
  if (banner) banner.classList.add('hidden');
}

async function saveAiSettings() {
  saveCurrentProviderDomState();
  const apiKey = document.getElementById('inputAiKey').value.trim();
  const model = getActiveModelValue();
  const apiBase = document.getElementById('inputAiBase').value.trim();
  const btnSave = document.getElementById('btnSaveAiModal');

  btnSave.disabled = true;
  btnSave.textContent = '保存中...';

  try {
    const res = await fetch('/api/settings/ai', {
      method: 'PUT',
      headers: token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } : { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: currentAiProvider,
        apiBase,
        apiKey,
        model,
        configs: providerConfigs
      })
    });

    if (!res.ok) {
      const err = await res.json();
      alert('保存失败：' + (err.error || '未知错误'));
      return;
    }

    const hasKey = Boolean(apiKey && apiKey !== 'sk-none');
    updateAiStatusBadge(hasKey, currentAiProvider, model);
    closeAiSettingsModal();
  } catch (e) {
    alert('保存失败：' + e.message);
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = '保存配置';
  }
}

function updateAiStatusBadge(hasKey, provider, model) {
  const btnAi = document.getElementById('btnAiSettings');
  const text = document.getElementById('aiModelStatusText');
  const dot = document.getElementById('aiStatusDot');
  if (!btnAi || !text || !dot) return;

  if (hasKey) {
    const providerName = provider === 'aliyun' ? '阿里云百炼' : (provider === 'custom' ? '自定义' : 'DeepSeek');
    text.textContent = `AI 引擎：${providerName}`;
    dot.className = 'w-2 h-2 rounded-full bg-emerald-400 pulse-dot';
    btnAi.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-brand-500/35 bg-brand-500/10 hover:bg-brand-500/20 text-xs font-semibold text-brand-300 transition cursor-pointer shadow-sm';
  } else {
    text.textContent = '⚠️ 点击配置 AI 密钥';
    dot.className = 'w-2 h-2 rounded-full bg-amber-400';
    btnAi.className = 'flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-xs font-semibold text-amber-300 transition cursor-pointer shadow-sm animate-pulse';
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

// 2. 加载与保存注册邀请码
async function loadAdminSettings() {
  try {
    const res = await fetch('/api/admin/settings', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const inviteInput = document.getElementById('settingInviteCode');
    if (inviteInput) inviteInput.value = data.invite_code || '';
  } catch (err) {
    alert('加载配置失败: ' + err.message);
  }
}

async function handleSaveAdminSettings(e) {
  e.preventDefault();
  const invite_code = document.getElementById('settingInviteCode').value.trim();

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ invite_code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert('✅ 注册邀请码已更新生效！');
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

function clearAllImages() {
  uploadedImages = [];
  window.uploadedImages = uploadedImages;
  renderImagePreviews();
  hideImageError();
}

function handleDropzoneClick(e) {
  if (uploadedImages.length < 5) {
    triggerImageFileInput();
  }
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
  const dropPrompt = document.getElementById('imageDropPrompt');
  const previewContainer = document.getElementById('imagePreviewContainer');
  const btnClear = document.getElementById('btnClearImages');
  const remainSlots = document.getElementById('imageRemainSlots');
  const dropHint = document.getElementById('imageDropHint');

  const count = uploadedImages.length;
  if (counter) counter.textContent = count;
  if (btnClear) {
    if (count > 0) btnClear.classList.remove('hidden');
    else btnClear.classList.add('hidden');
  }

  if (count === 0) {
    if (dropPrompt) dropPrompt.classList.remove('hidden');
    if (previewContainer) previewContainer.classList.add('hidden');
    if (grid) grid.innerHTML = '';
    return;
  }

  if (dropPrompt) dropPrompt.classList.add('hidden');
  if (previewContainer) previewContainer.classList.remove('hidden');

  if (remainSlots) remainSlots.textContent = 5 - count;
  if (dropHint) {
    if (count >= 5) {
      dropHint.textContent = '已达到 5 张上限 · 悬停卡片右上角 ✕ 可删除并替换';
    } else {
      dropHint.textContent = '支持拖拽新图或直接按 Ctrl+V 继续追加';
    }
  }

  if (!grid) return;
  grid.innerHTML = '';

  uploadedImages.forEach((img, idx) => {
    const card = document.createElement('div');
    card.className = 'relative group rounded-xl overflow-hidden border border-dark-borderLight bg-dark-bg/80 flex flex-col p-1 transition hover:border-brand-500/50 shadow-sm';
    card.onclick = (e) => e.stopPropagation();
    card.innerHTML = `
      <div class="w-full h-16 rounded-lg bg-dark-surface overflow-hidden flex items-center justify-center relative">
        <img src="${img.data}" alt="${img.name}" class="w-full h-full object-cover">
        <button type="button" onclick="event.stopPropagation(); removeUploadedImage('${img.id}')"
          title="删除此图片"
          class="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600/90 hover:bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition shadow">
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

  // 若未达到上限，在虚线框网格内渲染一个“继续添加”插槽
  if (count < 5) {
    const addSlot = document.createElement('div');
    addSlot.className = 'rounded-xl border-2 border-dashed border-dark-borderLight hover:border-brand-500/60 bg-dark-bg/30 hover:bg-brand-500/5 flex flex-col items-center justify-center h-[88px] text-slate-400 hover:text-brand-300 transition cursor-pointer group';
    addSlot.onclick = (e) => {
      e.stopPropagation();
      triggerImageFileInput();
    };
    addSlot.innerHTML = `
      <i data-lucide="plus" class="w-5 h-5 mb-1 group-hover:scale-110 transition text-brand-400"></i>
      <span class="text-[10px] font-medium text-slate-300">添加</span>
    `;
    grid.appendChild(addSlot);
  }

  refreshIcons();
}

// ======================== 任务创建与状态机 ========================

async function handleCreateTask(e) {
  e.preventDefault();

  if (!token) {
    if (window.isStandalone) {
      token = 'standalone_local_token';
      localStorage.setItem('itls_token', token);
    } else {
      openAuthModal('login');
      return;
    }
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
      btnSubmit.innerHTML = `<i data-lucide="sparkles" class="w-5 h-5"></i><span>生成整套备课资料</span>`;
      refreshIcons();
      return;
    }

    currentTaskId = data.taskId;
    showProgressCard(lessonTitle);
    startPolling(data.taskId);
  } catch (err) {
    alert('创建任务失败: ' + err.message);
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `<i data-lucide="sparkles" class="w-5 h-5"></i><span>生成整套备课资料</span>`;
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
  btnSubmit.innerHTML = `<i data-lucide="sparkles" class="w-5 h-5"></i><span>生成整套备课资料</span>`;

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

  updateStepState('stepPlan', 'running', '备课教案');
  updateStepState('stepWorksheet', 'waiting', '探究导学单');
  updateStepState('stepSlides', 'waiting', '演示课件');
  updateStepState('stepClasswork', 'waiting', '随堂互动作业');

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
  updateStepState('stepPlan', 'running', '备课教案');
  updateStepState('stepWorksheet', 'waiting', '探究导学单');
  updateStepState('stepSlides', 'waiting', '演示课件');
  updateStepState('stepClasswork', 'waiting', '随堂互动作业');

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

  if (nameEl) nameEl.textContent = name;
  if (descEl && desc) descEl.textContent = desc;

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
    textEl.textContent = '正在构建备课教案...';
    subDetailEl.textContent = '情境设计 · 任务分解 · 降坡度支架';
    updateStepState('stepPlan', 'running', '备课教案');
    updateStepState('stepWorksheet', 'waiting', '探究导学单');
    updateStepState('stepSlides', 'waiting', '演示课件');
    updateStepState('stepClasswork', 'waiting', '随堂互动作业');
  } else if (pInt < 50) {
    textEl.textContent = '正在编排探究导学单...';
    subDetailEl.textContent = '上机实操支架 · 核心探究任务';
    updateStepState('stepPlan', 'done', '备课教案');
    updateStepState('stepWorksheet', 'running', '探究导学单');
    updateStepState('stepSlides', 'waiting', '演示课件');
    updateStepState('stepClasswork', 'waiting', '随堂互动作业');
  } else if (pInt < 75) {
    textEl.textContent = '正在制作演示课件...';
    subDetailEl.textContent = '卡片网格布局 · 课堂任务引导';
    updateStepState('stepPlan', 'done', '备课教案');
    updateStepState('stepWorksheet', 'done', '探究导学单');
    updateStepState('stepSlides', 'running', '演示课件');
    updateStepState('stepClasswork', 'waiting', '随堂互动作业');
  } else if (pInt < 95) {
    textEl.textContent = '正在构建随堂互动作业...';
    subDetailEl.textContent = '单文件离线秒开 · 仿真关卡与凭单导出';
    updateStepState('stepPlan', 'done', '备课教案');
    updateStepState('stepWorksheet', 'done', '探究导学单');
    updateStepState('stepSlides', 'done', '演示课件');
    updateStepState('stepClasswork', 'running', '随堂互动作业');
  } else if (pInt < 100) {
    textEl.textContent = '正在执行全套资源打包...';
    subDetailEl.textContent = '格式排版校验 · ZIP 打包';
    updateStepState('stepPlan', 'done', '备课教案');
    updateStepState('stepWorksheet', 'done', '探究导学单');
    updateStepState('stepSlides', 'done', '演示课件');
    updateStepState('stepClasswork', 'done', '随堂互动作业');
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
        document.getElementById('progressSubDetail').textContent = '已完成全部教学资源编译';
        updateStepState('stepPlan', 'done', '备课教案');
        updateStepState('stepWorksheet', 'done', '探究导学单');
        updateStepState('stepSlides', 'done', '演示课件');
        updateStepState('stepClasswork', 'done', '随堂互动作业');

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
  btnSubmit.innerHTML = `<i data-lucide="sparkles" class="w-5 h-5"></i><span>生成整套备课资料</span>`;

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
  btnSubmit.innerHTML = `<i data-lucide="sparkles" class="w-5 h-5"></i><span>生成整套备课资料</span>`;

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
  const names = ['备课教案', '探究导学单', '演示课件', '随堂互动作业'];
  ['stepPlan', 'stepWorksheet', 'stepSlides', 'stepClasswork'].forEach((id, idx) => {
    const el = document.getElementById(id);
    if (!el) return;
    const statusEl = el.querySelector('.step-status');
    const isDone = statusEl && statusEl.textContent === '已就绪';
    if (!isDone) {
      updateStepState(id, 'stopped', names[idx]);
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
    btnSubmit.innerHTML = `<i data-lucide="sparkles" class="w-5 h-5"></i><span>生成整套备课资料</span>`;
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
              <span class="flex items-center gap-1.5"><i data-lucide="presentation" class="w-3.5 h-3.5 text-purple-400"></i>演示课件</span>
              <span class="text-[10px] text-purple-400/80 font-mono">PPTX</span>
            </button>

            <button onclick="triggerDownload('/api/download/${t.id}/html')" 
              class="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold flex items-center justify-between transition cursor-pointer active:scale-95" title="点击下载互动作业HTML文件">
              <span class="flex items-center gap-1.5"><i data-lucide="gamepad-2" class="w-3.5 h-3.5 text-emerald-400"></i>随堂互动作业</span>
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
