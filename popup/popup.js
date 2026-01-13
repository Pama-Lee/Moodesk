// Moodesk Popup 设置页面 - 带 Tab 切换

// 默认配置
const DEFAULT_CONFIG = {
  configUrl: 'https://raw.githubusercontent.com/Pama-Lee/moodesk-themes/refs/heads/main/site-themes.json',
  fallbackUrl: 'https://cdn.jsdelivr.net/gh/Pama-Lee/moodesk-themes@main/site-themes.json'
};

// 存储键名
const STORAGE_KEYS = {
  configUrl: 'moodeskRemoteConfigUrl',
  fallbackUrl: 'moodeskRemoteFallbackUrl',
  cachedConfig: 'moodeskRemoteConfig',
  lastFetch: 'moodeskRemoteConfigLastFetch',
  autoLoginSettings: 'moodesk_autologin_settings',
  credentialPrefix: 'moodesk_cred_',
  // AI 配置
  aiApiHost: 'moodesk_ai_api_host',
  aiApiKey: 'moodesk_ai_api_key',
  aiModel: 'moodesk_ai_model',
  aiEnabled: 'moodesk_ai_enabled',
  // 导航行为
  redirectMyToCourses: 'moodesk_redirect_my_to_courses',
  // 侧边栏显示设置
  sidebarEnabled: 'moodesk_sidebar_enabled'
};

// DOM 元素
let elements = {};

// ============================================
// 初始化
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  // 获取 DOM 元素
  elements = {
    // Tab 相关
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanels: document.querySelectorAll('.tab-panel'),
    
    // 状态
    headerStatus: document.getElementById('headerStatus'),
    statusIndicator: document.querySelector('.status-indicator'),
    
    // 常规设置
    configUrl: document.getElementById('configUrl'),
    fallbackUrl: document.getElementById('fallbackUrl'),
    saveBtn: document.getElementById('saveBtn'),
    resetBtn: document.getElementById('resetBtn'),
    clearCacheBtn: document.getElementById('clearCacheBtn'),
    reloadBtn: document.getElementById('reloadBtn'),
    configCacheTime: document.getElementById('configCacheTime'),
    lastUpdate: document.getElementById('lastUpdate'),
    redirectMyToCourses: document.getElementById('redirectMyToCourses'),
    sidebarEnabled: document.getElementById('sidebarEnabled'),
    
    // 自动登录
    autoLoginEnabled: document.getElementById('autoLoginEnabled'),
    savedCredentials: document.getElementById('savedCredentials'),
    noCredentials: document.getElementById('noCredentials'),
    credentialsList: document.getElementById('credentialsList'),
    clearCredentialsBtn: document.getElementById('clearCredentialsBtn'),
    
    // AI 设置
    aiEnabled: document.getElementById('aiEnabled'),
    aiApiHostPreset: document.getElementById('aiApiHostPreset'),
    aiApiHost: document.getElementById('aiApiHost'),
    aiApiKey: document.getElementById('aiApiKey'),
    aiModel: document.getElementById('aiModel'),
    toggleApiKey: document.getElementById('toggleApiKey'),
    testAiBtn: document.getElementById('testAiBtn'),
    saveAiBtn: document.getElementById('saveAiBtn'),
    
    // 关于
    version: document.getElementById('version'),
    aboutVersion: document.getElementById('aboutVersion'),
    openDocsBtn: document.getElementById('openDocsBtn'),
    openGithubBtn: document.getElementById('openGithubBtn'),
    reportBugBtn: document.getElementById('reportBugBtn'),
    
    // Toast
    toast: document.getElementById('toast')
  };

  // 初始化 Tab 切换
  initTabs();
  
  // 加载数据
  await loadCurrentConfig();
  await loadCacheInfo();
  await loadAutoLoginSettings();
  await loadAISettings();
  await loadRedirectSettings();
  await loadSidebarSettings();
  
  // 绑定事件
  bindEvents();
  
  // 加载版本号
  loadVersion();
  
  // 更新状态
  updateHeaderStatus('success');
});

// ============================================
// Tab 切换
// ============================================
function initTabs() {
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  // 更新按钮状态
  elements.tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  
  // 更新面板显示
  elements.tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });
}

// ============================================
// 状态管理
// ============================================
function updateHeaderStatus(type) {
  const indicator = elements.statusIndicator;
  if (indicator) {
    indicator.className = `status-indicator ${type === 'error' ? 'error' : ''}`;
  }
}

// ============================================
// 配置管理
// ============================================
async function loadCurrentConfig() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.configUrl,
      STORAGE_KEYS.fallbackUrl
    ]);
    
    elements.configUrl.value = result[STORAGE_KEYS.configUrl] || DEFAULT_CONFIG.configUrl;
    elements.fallbackUrl.value = result[STORAGE_KEYS.fallbackUrl] || DEFAULT_CONFIG.fallbackUrl;
  } catch (error) {
    console.error('加载配置失败:', error);
    updateHeaderStatus('error');
  }
}

async function loadCacheInfo() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.cachedConfig,
      STORAGE_KEYS.lastFetch
    ]);
    
    if (result[STORAGE_KEYS.cachedConfig]) {
      const config = result[STORAGE_KEYS.cachedConfig];
      elements.configCacheTime.textContent = `v${config.version || '未知'}`;
      
      if (result[STORAGE_KEYS.lastFetch]) {
        const date = new Date(result[STORAGE_KEYS.lastFetch]);
        elements.lastUpdate.textContent = formatDate(date);
      }
    } else {
      elements.configCacheTime.textContent = '未缓存';
      elements.lastUpdate.textContent = '-';
    }
  } catch (error) {
    console.error('加载缓存信息失败:', error);
  }
}

// ============================================
// 事件绑定
// ============================================
function bindEvents() {
  // 常规设置
  elements.saveBtn?.addEventListener('click', saveConfig);
  elements.resetBtn?.addEventListener('click', resetConfig);
  elements.clearCacheBtn?.addEventListener('click', clearCache);
  elements.reloadBtn?.addEventListener('click', reloadConfig);
  
  // 自动登录
  elements.autoLoginEnabled?.addEventListener('change', toggleGlobalAutoLogin);
  elements.clearCredentialsBtn?.addEventListener('click', clearAllCredentials);

  // 导航行为
  elements.redirectMyToCourses?.addEventListener('change', toggleRedirectMyToCourses);
  
  // 侧边栏设置
  elements.sidebarEnabled?.addEventListener('change', toggleSidebar);
  
  // AI 设置
  elements.aiEnabled?.addEventListener('change', toggleAI);
  elements.aiApiHostPreset?.addEventListener('change', handleApiHostPresetChange);
  elements.toggleApiKey?.addEventListener('click', toggleApiKeyVisibility);
  elements.testAiBtn?.addEventListener('click', testAIConnection);
  elements.saveAiBtn?.addEventListener('click', saveAISettings);
  
  // 关于页面链接
  elements.openDocsBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/Pama-Lee/Moodesk#readme' });
  });
  
  elements.openGithubBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/Pama-Lee/Moodesk' });
  });
  
  elements.reportBugBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/Pama-Lee/Moodesk/issues/new' });
  });
}

// ============================================
// 配置操作
// ============================================
async function saveConfig() {
  const configUrl = elements.configUrl.value.trim();
  const fallbackUrl = elements.fallbackUrl.value.trim();
  
  if (!configUrl) {
    showToast('请输入配置文件 URL', 'error');
    return;
  }
  
  if (!isValidUrl(configUrl)) {
    showToast('请输入有效的 URL', 'error');
    return;
  }
  
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.configUrl]: configUrl,
      [STORAGE_KEYS.fallbackUrl]: fallbackUrl
    });
    
    // 清除缓存
    await chrome.storage.local.remove([
      STORAGE_KEYS.cachedConfig,
      STORAGE_KEYS.lastFetch
    ]);
    
    await loadCacheInfo();
    showToast('配置已保存', 'success');
  } catch (error) {
    console.error('保存配置失败:', error);
    showToast('保存失败', 'error');
  }
}

async function resetConfig() {
  elements.configUrl.value = DEFAULT_CONFIG.configUrl;
  elements.fallbackUrl.value = DEFAULT_CONFIG.fallbackUrl;
  await saveConfig();
}

async function clearCache() {
  try {
    await chrome.storage.local.remove([
      STORAGE_KEYS.cachedConfig,
      STORAGE_KEYS.lastFetch
    ]);
    
    await loadCacheInfo();
    showToast('缓存已清除', 'success');
  } catch (error) {
    console.error('清除缓存失败:', error);
    showToast('清除失败', 'error');
  }
}

async function reloadConfig() {
  try {
    await clearCache();
    
    const configUrl = elements.configUrl.value.trim() || DEFAULT_CONFIG.configUrl;
    const response = await fetch(configUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const config = await response.json();
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.cachedConfig]: config,
      [STORAGE_KEYS.lastFetch]: Date.now()
    });
    
    await loadCacheInfo();
    showToast('配置已刷新', 'success');
    notifyTabs();
  } catch (error) {
    console.error('加载配置失败:', error);
    showToast(`刷新失败: ${error.message}`, 'error');
    updateHeaderStatus('error');
  }
}

function notifyTabs() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && (
        tab.url.includes('xmu.edu.my') || 
        tab.url.includes('ukm.my') ||
        tab.url.includes('ukm.edu.my')
      )) {
        chrome.tabs.sendMessage(tab.id, { type: 'RELOAD_CONFIG' }).catch(() => {});
      }
    });
  });
}

// ============================================
// 自动登录功能
// ============================================
async function loadAutoLoginSettings() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.autoLoginSettings);
    const settings = result[STORAGE_KEYS.autoLoginSettings] || { enabled: false, sites: {} };
    
    if (elements.autoLoginEnabled) {
      elements.autoLoginEnabled.checked = settings.enabled;
    }
    
    await loadSavedCredentials(settings);
  } catch (error) {
    console.error('加载自动登录设置失败:', error);
  }
}

async function loadSavedCredentials(settings) {
  try {
    const all = await chrome.storage.local.get(null);
    const credentials = [];
    
    for (const key of Object.keys(all)) {
      if (key.startsWith(STORAGE_KEYS.credentialPrefix) && 
          !key.includes('_time') && 
          !key.includes('_username')) {
        const site = key.replace(STORAGE_KEYS.credentialPrefix, '');
        const username = all[`${key}_username`] || '未知用户';
        const savedAt = all[`${key}_time`];
        const isEnabled = settings.sites?.[site]?.enabled || false;
        
        credentials.push({ site, username, savedAt, isEnabled });
      }
    }
    
    renderCredentialsList(credentials);
  } catch (error) {
    console.error('加载凭据列表失败:', error);
  }
}

function renderCredentialsList(credentials) {
  if (!elements.credentialsList || !elements.noCredentials) return;
  
  if (credentials.length === 0) {
    elements.noCredentials.style.display = 'flex';
    elements.credentialsList.style.display = 'none';
    elements.credentialsList.innerHTML = '';
    return;
  }
  
  elements.noCredentials.style.display = 'none';
  elements.credentialsList.style.display = 'flex';
  
  elements.credentialsList.innerHTML = credentials.map(cred => `
    <div class="credential-item" data-site="${cred.site}">
      <div class="credential-info">
        <span class="credential-site">${cred.site}</span>
        <span class="credential-user">${cred.username} · ${cred.savedAt ? formatDate(new Date(cred.savedAt)) : '未知时间'}</span>
      </div>
      <div class="credential-actions">
        <label class="credential-toggle">
          <input type="checkbox" ${cred.isEnabled ? 'checked' : ''} data-action="toggle" data-site="${cred.site}">
          <span class="toggle-track"></span>
        </label>
        <button class="credential-delete" data-action="delete" data-site="${cred.site}" title="删除凭据">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
  
  // 绑定事件
  elements.credentialsList.querySelectorAll('[data-action="toggle"]').forEach(el => {
    el.addEventListener('change', (e) => toggleSiteAutoLogin(e.target.dataset.site, e.target.checked));
  });
  
  elements.credentialsList.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', (e) => {
      const site = e.currentTarget.dataset.site;
      if (confirm(`确定要删除 ${site} 的登录凭据吗？`)) {
        deleteCredential(site);
      }
    });
  });
}

async function toggleGlobalAutoLogin() {
  try {
    const enabled = elements.autoLoginEnabled.checked;
    const result = await chrome.storage.local.get(STORAGE_KEYS.autoLoginSettings);
    const settings = result[STORAGE_KEYS.autoLoginSettings] || { enabled: false, sites: {} };
    
    settings.enabled = enabled;
    await chrome.storage.local.set({ [STORAGE_KEYS.autoLoginSettings]: settings });
    
    showToast(enabled ? '自动登录已启用' : '自动登录已禁用', 'success');
  } catch (error) {
    console.error('切换自动登录失败:', error);
    showToast('操作失败', 'error');
  }
}

async function toggleSiteAutoLogin(site, enabled) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.autoLoginSettings);
    const settings = result[STORAGE_KEYS.autoLoginSettings] || { enabled: false, sites: {} };
    
    if (!settings.sites) settings.sites = {};
    if (!settings.sites[site]) settings.sites[site] = {};
    settings.sites[site].enabled = enabled;
    
    await chrome.storage.local.set({ [STORAGE_KEYS.autoLoginSettings]: settings });
    showToast(`${site} 自动登录${enabled ? '已启用' : '已禁用'}`, 'success');
  } catch (error) {
    console.error('切换站点自动登录失败:', error);
    showToast('操作失败', 'error');
  }
}

async function deleteCredential(site) {
  try {
    const key = `${STORAGE_KEYS.credentialPrefix}${site}`;
    await chrome.storage.local.remove([key, `${key}_time`, `${key}_username`]);
    await toggleSiteAutoLogin(site, false);
    await loadAutoLoginSettings();
    showToast(`${site} 凭据已删除`, 'success');
  } catch (error) {
    console.error('删除凭据失败:', error);
    showToast('删除失败', 'error');
  }
}

async function clearAllCredentials() {
  if (!confirm('确定要清除所有保存的登录凭据吗？此操作不可恢复。')) {
    return;
  }
  
  try {
    const all = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(all).filter(key => 
      key.startsWith(STORAGE_KEYS.credentialPrefix) || 
      key === 'moodesk_encryption_key'
    );
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.autoLoginSettings]: { enabled: false, sites: {} }
    });
    
    await loadAutoLoginSettings();
    showToast('所有凭据已清除', 'success');
  } catch (error) {
    console.error('清除凭据失败:', error);
    showToast('清除失败', 'error');
  }
}

// ============================================
// 工具函数
// ============================================
function showToast(message, type = 'info') {
  const toast = elements.toast;
  if (!toast) return;
  
  toast.querySelector('.toast-message').textContent = message;
  toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

function formatDate(date) {
  if (!date || isNaN(date.getTime())) return '-';
  
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) {
    return '刚刚';
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)} 分钟前`;
  } else if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)} 小时前`;
  } else {
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric'
    });
  }
}

function loadVersion() {
  const manifest = chrome.runtime.getManifest();
  const version = `v${manifest.version}`;
  
  if (elements.version) elements.version.textContent = version;
  if (elements.aboutVersion) elements.aboutVersion.textContent = version;
}

// ============================================
// AI 设置功能
// ============================================

const DEFAULT_AI_CONFIG = {
  apiHost: 'https://api.openai.com',
  apiKey: '',
  model: 'gpt-4o-mini',
  enabled: false
};

async function loadAISettings() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.aiApiHost,
      STORAGE_KEYS.aiApiKey,
      STORAGE_KEYS.aiModel,
      STORAGE_KEYS.aiEnabled
    ]);

    const apiHost = result[STORAGE_KEYS.aiApiHost] || DEFAULT_AI_CONFIG.apiHost;
    const apiKey = result[STORAGE_KEYS.aiApiKey] || '';
    const model = result[STORAGE_KEYS.aiModel] || DEFAULT_AI_CONFIG.model;
    const enabled = result[STORAGE_KEYS.aiEnabled] || false;

    // 设置表单值
    if (elements.aiEnabled) elements.aiEnabled.checked = enabled;
    if (elements.aiApiHost) elements.aiApiHost.value = apiHost;
    if (elements.aiApiKey) elements.aiApiKey.value = apiKey;
    if (elements.aiModel) elements.aiModel.value = model;

    // 设置预设选择
    if (elements.aiApiHostPreset) {
      const presetValue = getPresetFromHost(apiHost);
      elements.aiApiHostPreset.value = presetValue;
      // 如果是自定义，显示输入框
      elements.aiApiHost.style.display = presetValue === 'custom' ? 'block' : 'none';
    }

  } catch (error) {
    console.error('加载 AI 设置失败:', error);
  }
}

// ============================================
// 导航行为设置
// ============================================

async function loadRedirectSettings() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.redirectMyToCourses);
    const enabled = !!result[STORAGE_KEYS.redirectMyToCourses];
    if (elements.redirectMyToCourses) {
      elements.redirectMyToCourses.checked = enabled;
    }
  } catch (error) {
    console.error('加载导航行为设置失败:', error);
  }
}

async function toggleRedirectMyToCourses() {
  try {
    const enabled = !!elements.redirectMyToCourses?.checked;
    await chrome.storage.local.set({
      [STORAGE_KEYS.redirectMyToCourses]: enabled
    });
    showToast(enabled ? '已启用自动跳转到「我的课程」' : '已关闭自动跳转', 'success');
  } catch (error) {
    console.error('切换导航行为失败:', error);
    showToast('操作失败', 'error');
  }
}

// ============================================
// 侧边栏设置
// ============================================

async function loadSidebarSettings() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.sidebarEnabled);
    // 默认关闭
    const enabled = result[STORAGE_KEYS.sidebarEnabled] === true;
    if (elements.sidebarEnabled) {
      elements.sidebarEnabled.checked = enabled;
    }
  } catch (error) {
    console.error('加载侧边栏设置失败:', error);
  }
}

async function toggleSidebar() {
  try {
    const enabled = !!elements.sidebarEnabled?.checked;
    await chrome.storage.local.set({
      [STORAGE_KEYS.sidebarEnabled]: enabled
    });
    showToast(enabled ? '已启用侧边栏' : '已关闭侧边栏', 'success');
    
    // 通知所有标签页更新设置
    notifyTabsSidebarStatus(enabled);
  } catch (error) {
    console.error('切换侧边栏设置失败:', error);
    showToast('操作失败', 'error');
  }
}

function notifyTabsSidebarStatus(enabled) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && (
        tab.url.includes('xmu.edu.my') || 
        tab.url.includes('ukm.my') ||
        tab.url.includes('ukm.edu.my')
      )) {
        chrome.tabs.sendMessage(tab.id, { 
          type: 'SIDEBAR_STATUS_CHANGED',
          enabled 
        }).catch(() => {});
      }
    });
  });
}

function getPresetFromHost(host) {
  const presets = {
    'https://api.openai.com': 'https://api.openai.com',
    'https://api.deepseek.com': 'https://api.deepseek.com',
    'https://generativelanguage.googleapis.com/v1beta/openai': 'https://generativelanguage.googleapis.com/v1beta/openai',
    'https://openrouter.ai/api': 'https://openrouter.ai/api'
  };
  return presets[host] || 'custom';
}

function handleApiHostPresetChange() {
  const preset = elements.aiApiHostPreset.value;
  if (preset === 'custom') {
    elements.aiApiHost.style.display = 'block';
    elements.aiApiHost.value = '';
    elements.aiApiHost.focus();
  } else {
    elements.aiApiHost.style.display = 'none';
    elements.aiApiHost.value = preset;
  }
}

function toggleApiKeyVisibility() {
  const input = elements.aiApiKey;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  
  // 更新图标
  elements.toggleApiKey.innerHTML = isPassword
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}

async function toggleAI() {
  try {
    const enabled = elements.aiEnabled.checked;
    await chrome.storage.local.set({ [STORAGE_KEYS.aiEnabled]: enabled });
    showToast(enabled ? 'AI 助手已启用' : 'AI 助手已禁用', 'success');
    
    // 通知标签页
    notifyTabsAIStatus(enabled);
  } catch (error) {
    console.error('切换 AI 失败:', error);
    showToast('操作失败', 'error');
  }
}

async function saveAISettings() {
  const apiHost = elements.aiApiHostPreset.value === 'custom' 
    ? elements.aiApiHost.value.trim()
    : elements.aiApiHostPreset.value;
  const apiKey = elements.aiApiKey.value.trim();
  const model = elements.aiModel.value;

  if (!apiHost) {
    showToast('请输入 API Host', 'error');
    return;
  }

  if (!apiKey) {
    showToast('请输入 API Key', 'error');
    return;
  }

  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.aiApiHost]: apiHost,
      [STORAGE_KEYS.aiApiKey]: apiKey,
      [STORAGE_KEYS.aiModel]: model
    });

    showToast('AI 设置已保存', 'success');
    
    // 通知 background 更新配置
    chrome.runtime.sendMessage({ type: 'AI_CONFIG_UPDATED' });
  } catch (error) {
    console.error('保存 AI 设置失败:', error);
    showToast('保存失败', 'error');
  }
}

async function testAIConnection() {
  const apiHost = elements.aiApiHostPreset.value === 'custom' 
    ? elements.aiApiHost.value.trim()
    : elements.aiApiHostPreset.value;
  const apiKey = elements.aiApiKey.value.trim();
  const model = elements.aiModel.value;

  if (!apiHost || !apiKey) {
    showToast('请先填写 API Host 和 API Key', 'error');
    return;
  }

  elements.testAiBtn.disabled = true;
  elements.testAiBtn.textContent = '测试中...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_TEST_CONNECTION',
      config: { apiHost, apiKey, model }
    });

    if (response?.success) {
      showToast('连接成功！', 'success');
    } else {
      showToast(response?.error || '连接失败', 'error');
    }
  } catch (error) {
    showToast('测试失败: ' + error.message, 'error');
  } finally {
    elements.testAiBtn.disabled = false;
    elements.testAiBtn.textContent = '测试连接';
  }
}

function notifyTabsAIStatus(enabled) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && (
        tab.url.includes('xmu.edu.my') || 
        tab.url.includes('ukm.my') ||
        tab.url.includes('ukm.edu.my')
      )) {
        chrome.tabs.sendMessage(tab.id, { 
          type: 'AI_STATUS_CHANGED',
          enabled 
        }).catch(() => {});
      }
    });
  });
}
