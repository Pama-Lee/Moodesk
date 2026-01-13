// authModule.js
// 多站点认证模块 - 支持标准 Moodle 认证、SAML SSO 等多种认证方式
// 依赖: siteConfig.js, credentialManager.js

class AuthModule {
  constructor() {
    this.currentSite = null;
    this.token = null;
    this.sesskey = null;
    this.userId = null;
    this.isInitialized = false;
    this.autoLoginInProgress = false;
    
    // 检测当前站点
    this.detectCurrentSite();
  }

  /**
   * 检测当前所在的站点
   */
  detectCurrentSite() {
    const hostname = window.location.hostname;
    
    // 使用配置管理器获取站点配置
    if (typeof siteConfigManager !== 'undefined') {
      this.currentSite = siteConfigManager.getConfig(hostname);
    } else {
      // 回退到默认配置
      this.currentSite = this.createDefaultConfig(hostname);
    }
    
    console.log(`[Moodesk Auth] 检测到站点: ${this.currentSite?.name || hostname}, 类型: ${this.currentSite?.type}`);
  }

  /**
   * 创建默认站点配置
   */
  createDefaultConfig(hostname) {
    return {
      hostname,
      name: hostname,
      shortName: hostname.split('.')[0].toUpperCase(),
      type: 'auto_detect',
      urls: {
        login: `https://${hostname}/login/index.php`,
        token: `https://${hostname}/login/token.php`,
        service: `https://${hostname}/webservice/rest/server.php`,
        ajax: `https://${hostname}/lib/ajax/service.php`,
        launch: `https://${hostname}/admin/tool/mobile/launch.php`
      },
      features: { mobileApp: true, webService: true }
    };
  }

  /**
   * 初始化认证模块
   */
  async init() {
    if (this.isInitialized) return;
    
    console.log(`[Moodesk Auth] 初始化 - 站点: ${this.currentSite?.name}, 类型: ${this.currentSite?.type}`);

    // 根据站点类型选择认证方式
    switch (this.currentSite?.type) {
      case 'standard':
        this.extractSesskey();
        this.extractUserInfo();
        await this.initStandardAuth();
        break;
        
      case 'saml_sso':
        this.extractSesskey();
        this.extractUserInfo();
        await this.initSamlSsoAuth();
        break;
        
      case 'sso_provider':
        // SSO 提供商页面（如 sso.ukm.my）
        await this.initSsoProviderPage();
        break;
        
      case 'auto_detect':
        this.extractSesskey();
        this.extractUserInfo();
        await this.autoDetectAndInit();
        break;
        
      default:
        this.extractSesskey();
        this.extractUserInfo();
        if (this.isLoggedIn()) {
          await this.initSessionBasedAuth();
        }
    }

    this.isInitialized = true;
    this.addStyles();
  }

  /**
   * 自动检测站点类型并初始化
   */
  async autoDetectAndInit() {
    if (this.detectSamlSso()) {
      console.log('[Moodesk Auth] 检测到 SAML SSO 站点');
      this.currentSite.type = 'saml_sso';
      await this.initSamlSsoAuth();
      return;
    }

    this.currentSite.type = 'standard';
    await this.initStandardAuth();
  }

  /**
   * 检测是否为 SAML SSO 站点
   */
  detectSamlSso() {
    const pageContent = document.documentElement.innerHTML.toLowerCase();
    const samlIndicators = ['simplesaml', 'saml2', 'authstate', '/idp/ssoservice'];
    return samlIndicators.some(indicator => pageContent.includes(indicator));
  }

  // ============================================
  // SSO 提供商页面处理 (sso.ukm.my)
  // ============================================

  async initSsoProviderPage() {
    console.log('[Moodesk Auth] 在 SSO 提供商登录页面');
    
    // 显示 Moodesk 激活状态
    this.showSsoActiveBadge();
    
    // 检查是否是 Mobile App 认证流程（从 Moodle 跳转过来的）
    const authState = document.querySelector('input[name="AuthState"]')?.value || '';
    const isMobileAppFlow = authState.includes('moodle_mobile_app') || authState.includes('launch.php');
    
    // 检查 URL 参数中是否有来源站点信息
    const relayState = this.extractRelayState(authState);
    const targetSite = this.extractTargetSite(relayState || document.referrer);
    
    if (targetSite) {
      console.log('[Moodesk Auth] 目标 Moodle 站点:', targetSite);
      // 存储目标站点，用于获取 token
      await this.saveTargetSite(targetSite);
    }
    
    // 拦截登录表单
    this.setupSsoLoginInterception(isMobileAppFlow, targetSite);
  }

  /**
   * 显示 SSO 页面激活徽章
   */
  showSsoActiveBadge() {
    const badge = document.createElement('div');
    badge.id = 'moodesk-sso-badge';
    badge.innerHTML = `
      <div class="moodesk-badge-content">
        <svg class="moodesk-badge-icon" viewBox="0 0 24 24" width="20" height="20">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span>Moodesk 已激活</span>
        <span class="moodesk-badge-hint">登录后将自动获取 Token</span>
      </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      #moodesk-sso-badge {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%);
        color: white;
        padding: 10px 20px;
        z-index: 10000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        animation: moodesk-slideDown 0.3s ease;
      }
      .moodesk-badge-content {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
      }
      .moodesk-badge-icon {
        flex-shrink: 0;
      }
      .moodesk-badge-hint {
        font-size: 12px;
        opacity: 0.8;
        font-weight: normal;
        margin-left: 10px;
        padding-left: 10px;
        border-left: 1px solid rgba(255,255,255,0.3);
      }
      @keyframes moodesk-slideDown {
        from { transform: translateY(-100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      /* 调整页面内容，避免被遮挡 */
      body {
        margin-top: 50px !important;
      }
      /* 处理中状态 */
      #moodesk-sso-badge.processing {
        background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
      }
      #moodesk-sso-badge.success {
        background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
      }
      #moodesk-sso-badge.error {
        background: linear-gradient(135deg, #f44336 0%, #c62828 100%);
      }
    `;
    
    document.head.appendChild(style);
    document.body.insertBefore(badge, document.body.firstChild);
  }

  /**
   * 更新徽章状态
   */
  updateBadgeStatus(status, message) {
    const badge = document.getElementById('moodesk-sso-badge');
    if (!badge) return;
    
    badge.className = status;
    badge.querySelector('.moodesk-badge-content').innerHTML = `
      <svg class="moodesk-badge-icon" viewBox="0 0 24 24" width="20" height="20">
        ${status === 'processing' 
          ? '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="40" stroke-dashoffset="10"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle>'
          : status === 'success'
          ? '<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>'
          : '<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>'}
      </svg>
      <span>${message}</span>
    `;
  }

  /**
   * 从 AuthState 提取 RelayState
   */
  extractRelayState(authState) {
    try {
      const match = authState.match(/RelayState=([^&]+)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    } catch (e) {}
    return null;
  }

  /**
   * 从 URL 提取目标 Moodle 站点
   */
  extractTargetSite(url) {
    if (!url) return null;
    
    try {
      // 查找 Moodle 站点 URL
      const patterns = [
        /https?:\/\/([^\/]+\.ukm\.my)/,
        /https?:\/\/([^\/]+\.ukm\.edu\.my)/,
        /https?:\/\/(l\.xmu\.edu\.my)/
      ];
      
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return match[1];
        }
      }
    } catch (e) {}
    return null;
  }

  /**
   * 保存目标站点
   */
  async saveTargetSite(site) {
    try {
      await chrome.storage.local.set({
        'moodesk_pending_sso_site': site,
        'moodesk_pending_sso_time': Date.now()
      });
    } catch (e) {}
  }

  /**
   * 获取待处理的目标站点
   */
  async getPendingTargetSite() {
    try {
      const result = await chrome.storage.local.get([
        'moodesk_pending_sso_site',
        'moodesk_pending_sso_time'
      ]);
      
      // 5分钟内有效
      if (result.moodesk_pending_sso_site && 
          result.moodesk_pending_sso_time &&
          (Date.now() - result.moodesk_pending_sso_time) < 5 * 60 * 1000) {
        return result.moodesk_pending_sso_site;
      }
    } catch (e) {}
    return null;
  }

  /**
   * 设置 SSO 登录拦截
   */
  setupSsoLoginInterception(isMobileAppFlow, targetSite) {
    const loginForm = document.querySelector('form#login, form[name="f"], form[method="POST"]');
    if (!loginForm) {
      console.log('[Moodesk Auth] 未找到登录表单');
      return;
    }

    console.log('[Moodesk Auth] 已找到 SSO 登录表单，设置拦截...');

    // 添加"记住我"选项
    this.addRememberMeOption(loginForm);

    // 使用原生的 submit 方法（避免被 name="submit" 的按钮覆盖）
    const submitForm = () => {
      HTMLFormElement.prototype.submit.call(loginForm);
    };
    
    // 拦截表单提交
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // 获取用户名和密码
      const username = loginForm.querySelector('input[name="username"], input[type="username"], input#focus')?.value;
      const password = loginForm.querySelector('input[name="password"], input[type="password"]')?.value;
      const authState = loginForm.querySelector('input[name="AuthState"]')?.value;
      const rememberMe = loginForm.querySelector('#moodesk-remember-me')?.checked;
      
      if (!username || !password) {
        console.log('[Moodesk Auth] 用户名或密码为空，直接提交');
        submitForm();
        return;
      }

      // 如果没有目标站点，尝试从存储获取
      let site = targetSite;
      if (!site) {
        site = await this.getPendingTargetSite();
      }
      
      // 尝试从 AuthState 获取站点
      if (!site && authState) {
        const relayState = this.extractRelayState(authState);
        site = this.extractTargetSite(relayState);
      }

      if (!site) {
        console.log('[Moodesk Auth] 未找到目标站点，使用默认站点');
        // 使用关联的第一个站点
        site = this.currentSite?.associatedSites?.[0] || 'ukmfolio.ukm.my';
      }

      console.log('[Moodesk Auth] 目标站点:', site);

      // 如果用户选择了"记住我"，保存凭据
      if (rememberMe && typeof credentialManager !== 'undefined') {
        try {
          await credentialManager.saveCredentials(site, username, password);
          await credentialManager.setAutoLoginForSite(site, true);
          await credentialManager.setGlobalAutoLogin(true);
          console.log('[Moodesk Auth] 凭据已保存，自动登录已启用');
        } catch (error) {
          console.error('[Moodesk Auth] 保存凭据失败:', error);
        }
      }

      // 更新状态
      this.updateBadgeStatus('processing', '正在获取 Token...');

      try {
        // 通过 background script 执行 SAML 登录并获取 token
        const token = await this.performSamlLoginAndGetToken(site, username, password, authState);
        
        if (token) {
          this.updateBadgeStatus('success', `Token 获取成功！正在跳转...`);
          
          // 保存 token
          await this.saveTokenForSite(site, token);
          
          // 等待一下让用户看到成功消息
          await new Promise(resolve => setTimeout(resolve, 800));
        } else {
          this.updateBadgeStatus('error', '无法获取 Token，继续登录...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error('[Moodesk Auth] 获取 token 失败:', error);
        this.updateBadgeStatus('error', '获取 Token 失败，继续登录...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 无论成功与否，都继续原始的登录流程
      submitForm();
    });

    console.log('[Moodesk Auth] SSO 登录拦截已设置');
  }

  /**
   * 添加"记住我/自动登录"选项到登录表单
   */
  addRememberMeOption(loginForm) {
    // 检查是否已添加
    if (loginForm.querySelector('#moodesk-remember-me')) return;

    // 查找提交按钮的位置
    const submitBtn = loginForm.querySelector('button[type="submit"], input[type="submit"], button[name="submit"]');
    if (!submitBtn) return;

    // 创建"记住我"复选框容器
    const container = document.createElement('div');
    container.id = 'moodesk-remember-container';
    container.innerHTML = `
      <label class="moodesk-remember-label">
        <input type="checkbox" id="moodesk-remember-me" name="moodesk_remember">
        <span class="moodesk-checkbox-custom"></span>
        <span class="moodesk-remember-text">
          <strong>Moodesk 自动登录</strong>
          <small>下次访问时自动登录（凭据将加密保存）</small>
        </span>
      </label>
    `;

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      #moodesk-remember-container {
        margin: 16px 0;
        padding: 12px 16px;
        background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
        border-radius: 8px;
        border: 1px solid #90caf9;
      }
      .moodesk-remember-label {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        cursor: pointer;
        user-select: none;
      }
      .moodesk-remember-label input[type="checkbox"] {
        display: none;
      }
      .moodesk-checkbox-custom {
        width: 20px;
        height: 20px;
        border: 2px solid #1976d2;
        border-radius: 4px;
        background: white;
        flex-shrink: 0;
        position: relative;
        transition: all 0.2s ease;
        margin-top: 2px;
      }
      .moodesk-remember-label input:checked + .moodesk-checkbox-custom {
        background: #1976d2;
        border-color: #1976d2;
      }
      .moodesk-remember-label input:checked + .moodesk-checkbox-custom::after {
        content: '';
        position: absolute;
        left: 6px;
        top: 2px;
        width: 5px;
        height: 10px;
        border: solid white;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }
      .moodesk-remember-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .moodesk-remember-text strong {
        color: #1565c0;
        font-size: 14px;
      }
      .moodesk-remember-text small {
        color: #1976d2;
        font-size: 12px;
        opacity: 0.8;
      }
    `;

    document.head.appendChild(style);
    submitBtn.parentNode.insertBefore(container, submitBtn);
  }

  /**
   * 执行 SAML 登录并获取 token
   */
  async performSamlLoginAndGetToken(targetSite, username, password, authState) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        resolve(null);
        return;
      }

      const ssoConfig = this.currentSite?.sso || {
        loginEndpoint: 'https://sso.ukm.my/module.php/core/loginuserpass.php',
        fields: {
          username: 'username',
          password: 'password',
          submit: 'submit',
          authState: 'AuthState'
        }
      };

      // 构建 launch URL（用于获取 token）
      const passport = this.generatePassport();
      const launchUrl = `https://${targetSite}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=moodlemobile`;

      console.log('[Moodesk Auth] 发送 SAML_LOGIN 请求，从 launch.php 开始完整流程');

      chrome.runtime.sendMessage({
        type: 'SAML_LOGIN',
        launchUrl,
        username,
        password,
        ssoConfig
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Moodesk Auth] 消息发送失败:', chrome.runtime.lastError);
          resolve(null);
          return;
        }
        
        if (response?.success && response?.token) {
          console.log('[Moodesk Auth] 成功获取 token');
          resolve(response.token);
        } else {
          console.log('[Moodesk Auth] 获取 token 失败:', response?.error);
          resolve(null);
        }
      });

      // 超时处理
      setTimeout(() => resolve(null), 15000);
    });
  }

  /**
   * 为特定站点保存 token
   */
  async saveTokenForSite(site, token) {
    try {
      await chrome.storage.local.set({
        [`moodesk_token_${site}`]: token,
        [`moodesk_token_time_${site}`]: Date.now()
      });
      console.log(`[Moodesk Auth] Token 已保存到 ${site}`);
    } catch (error) {
      console.error('[Moodesk Auth] 保存 Token 失败:', error);
    }
  }

  // ============================================
  // 标准 Moodle 认证
  // ============================================

  async initStandardAuth() {
    console.log('[Moodesk Auth] 使用标准 Moodle 认证');
    
    if (window.location.href.includes('/login/index.php')) {
      this.setupStandardLoginInterception();
    }
    
    if (this.isLoggedIn()) {
      await this.tryGetTokenFromStorage();
    }
  }

  setupStandardLoginInterception() {
    const loginForm = document.getElementById('login');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('username')?.value;
      const password = document.getElementById('password')?.value;

      if (!username || !password) {
        loginForm.submit();
        return;
      }

      try {
        this.showLoadingState('正在认证...');
        await this.getStandardToken(username, password);
        loginForm.submit();
      } catch (error) {
        console.error('[Moodesk Auth] 认证错误:', error);
        this.showError(error.message);
        this.hideLoadingState();
      }
    });

    console.log('[Moodesk Auth] 已拦截标准登录表单');
  }

  async getStandardToken(username, password) {
    const tokenUrl = this.currentSite.urls?.token || 
      `https://${this.currentSite.hostname}/login/token.php`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username,
        password,
        service: 'moodle_mobile_app'
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    if (!data.token) {
      throw new Error('无法获取认证令牌');
    }

    this.token = data.token;
    await this.saveToken(data.token);
    return data.token;
  }

  // ============================================
  // SAML SSO 认证
  // ============================================

  async initSamlSsoAuth() {
    console.log('[Moodesk Auth] 使用 SAML SSO 认证');
    
    if (this.isLoggedIn()) {
      console.log('[Moodesk Auth] 用户已登录');
      await this.tryGetSamlToken();
    } else {
      console.log('[Moodesk Auth] 用户未登录');
      // 检查是否应该自动登录
      await this.checkAndTriggerAutoLogin();
    }
  }

  /**
   * 检查并触发自动登录
   */
  async checkAndTriggerAutoLogin() {
    // 防止重复触发
    if (this.autoLoginInProgress) {
      console.log('[Moodesk Auth] 自动登录已在进行中');
      return;
    }

    // 检查是否在登录页面（避免无限循环）
    if (window.location.pathname.includes('/login/')) {
      console.log('[Moodesk Auth] 当前在登录页面，跳过自动登录检查');
      return;
    }

    // 检查 URL 参数是否表明刚刚登录失败
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('errorcode') || urlParams.has('loginfailed')) {
      console.log('[Moodesk Auth] 检测到登录失败参数，跳过自动登录');
      return;
    }

    try {
      const hostname = this.currentSite?.hostname;
      if (!hostname) return;

      // 检查是否启用了自动登录
      const isEnabled = await credentialManager.isAutoLoginEnabled(hostname);
      if (!isEnabled) {
        console.log('[Moodesk Auth] 自动登录未启用');
        return;
      }

      // 获取保存的凭据
      const credentials = await credentialManager.getCredentials(hostname);
      if (!credentials) {
        console.log('[Moodesk Auth] 没有保存的凭据');
        return;
      }

      console.log('[Moodesk Auth] 发现保存的凭据，准备自动登录...');
      this.autoLoginInProgress = true;

      // 显示自动登录提示
      this.showAutoLoginNotification();

      // 延迟一下让用户看到提示
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 触发 SSO 登录流程
      await this.performAutoLogin(credentials);

    } catch (error) {
      console.error('[Moodesk Auth] 自动登录检查失败:', error);
      this.autoLoginInProgress = false;
    }
  }

  /**
   * 执行自动登录
   */
  async performAutoLogin(credentials) {
    const hostname = this.currentSite?.hostname;
    
    // 生成 passport 并构建 launch URL
    const passport = this.generatePassport();
    const launchUrl = `${window.location.origin}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=moodlemobile`;

    console.log('[Moodesk Auth] 开始自动登录流程...');

    try {
      // 通过 background script 执行完整的 SAML 登录
      const token = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'SAML_LOGIN',
          launchUrl,
          username: credentials.username,
          password: credentials.password,
          ssoConfig: this.currentSite?.sso || {
            loginEndpoint: 'https://sso.ukm.my/module.php/core/loginuserpass.php',
            fields: {
              username: 'username',
              password: 'password',
              submit: 'submit',
              authState: 'AuthState'
            }
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          if (response?.success && response?.token) {
            resolve(response.token);
          } else {
            reject(new Error(response?.error || '获取 token 失败'));
          }
        });

        // 超时处理
        setTimeout(() => reject(new Error('登录超时')), 20000);
      });

      if (token) {
        console.log('[Moodesk Auth] 自动登录成功，获取到 token');
        
        // 保存 token
        await this.saveTokenForSite(hostname, token);
        
        // 更新最后登录时间
        await credentialManager.updateLastLogin(hostname);

        // 更新通知状态
        this.updateAutoLoginNotification('success', '自动登录成功！正在刷新页面...');

        // 刷新页面以应用登录状态
        await new Promise(resolve => setTimeout(resolve, 1000));
        window.location.reload();
      }
    } catch (error) {
      console.error('[Moodesk Auth] 自动登录失败:', error);
      this.updateAutoLoginNotification('error', `自动登录失败: ${error.message}`);
      
      // 5秒后移除通知
      setTimeout(() => {
        this.removeAutoLoginNotification();
        this.autoLoginInProgress = false;
      }, 5000);
    }
  }

  /**
   * 显示自动登录通知
   */
  showAutoLoginNotification() {
    // 移除已存在的通知
    this.removeAutoLoginNotification();

    const notification = document.createElement('div');
    notification.id = 'moodesk-autologin-notification';
    notification.innerHTML = `
      <div class="moodesk-autologin-content">
        <div class="moodesk-autologin-spinner"></div>
        <div class="moodesk-autologin-text">
          <strong>Moodesk 自动登录</strong>
          <span>正在使用保存的凭据登录...</span>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.id = 'moodesk-autologin-styles';
    style.textContent = `
      #moodesk-autologin-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(26, 115, 232, 0.4);
        z-index: 100000;
        animation: moodesk-slideIn 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .moodesk-autologin-content {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .moodesk-autologin-spinner {
        width: 24px;
        height: 24px;
        border: 3px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: moodesk-spin 1s linear infinite;
      }
      .moodesk-autologin-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .moodesk-autologin-text strong {
        font-size: 14px;
      }
      .moodesk-autologin-text span {
        font-size: 12px;
        opacity: 0.9;
      }
      #moodesk-autologin-notification.success {
        background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
      }
      #moodesk-autologin-notification.error {
        background: linear-gradient(135deg, #f44336 0%, #c62828 100%);
      }
      @keyframes moodesk-slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes moodesk-spin {
        to { transform: rotate(360deg); }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(notification);
  }

  /**
   * 更新自动登录通知
   */
  updateAutoLoginNotification(status, message) {
    const notification = document.getElementById('moodesk-autologin-notification');
    if (!notification) return;

    notification.className = status;
    notification.innerHTML = `
      <div class="moodesk-autologin-content">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${status === 'success' 
            ? '<path d="M20 6L9 17l-5-5"/>' 
            : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
        </svg>
        <div class="moodesk-autologin-text">
          <strong>Moodesk 自动登录</strong>
          <span>${message}</span>
        </div>
      </div>
    `;
  }

  /**
   * 移除自动登录通知
   */
  removeAutoLoginNotification() {
    document.getElementById('moodesk-autologin-notification')?.remove();
    document.getElementById('moodesk-autologin-styles')?.remove();
  }

  async tryGetSamlToken() {
    try {
      const existingToken = await this.getStoredToken();
      if (existingToken) {
        console.log('[Moodesk Auth] 使用已保存的 token');
        this.token = existingToken;
        return;
      }

      console.log('[Moodesk Auth] 尝试获取新 token...');
      const token = await this.getSamlTokenViaLaunch();
      
      if (token) {
        this.token = token;
        await this.saveToken(token);
        console.log('[Moodesk Auth] 成功获取 SAML token');
      } else {
        console.log('[Moodesk Auth] 使用 sesskey 认证');
        await this.saveSessionInfo();
      }
    } catch (error) {
      console.error('[Moodesk Auth] 获取 SAML token 失败:', error);
      await this.saveSessionInfo();
    }
  }

  async getSamlTokenViaLaunch() {
    const passport = this.generatePassport();
    const launchUrl = this.currentSite.urls?.launch || 
      `https://${this.currentSite.hostname}/admin/tool/mobile/launch.php`;
    
    const fullUrl = `${launchUrl}?service=moodle_mobile_app&passport=${passport}&urlscheme=moodlemobile`;

    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'FETCH_SAML_TOKEN',
          url: fullUrl,
          passport
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[Moodesk Auth] Background 消息发送失败:', chrome.runtime.lastError);
            resolve(null);
            return;
          }
          if (response?.success && response?.token) {
            resolve(response.token);
          } else {
            resolve(null);
          }
        });

        setTimeout(() => resolve(null), 10000);
      } else {
        resolve(null);
      }
    });
  }

  // ============================================
  // 会话认证（备用方案）
  // ============================================

  async initSessionBasedAuth() {
    if (this.isLoggedIn()) {
      console.log('[Moodesk Auth] 使用会话认证');
      await this.saveSessionInfo();
    }
  }

  // ============================================
  // 工具方法
  // ============================================

  generatePassport() {
    const int = Math.floor(Math.random() * 1000);
    const decimal = Math.floor(Math.random() * 10000000);
    return `${int}.${decimal}`;
  }

  isLoggedIn() {
    if (this.currentSite?.type === 'sso_provider') {
      return false;
    }
    
    const logoutLink = document.querySelector('a[href*="logout"]');
    const notLoggedIn = document.body.classList.contains('notloggedin');
    return logoutLink && !notLoggedIn;
  }

  extractSesskey() {
    if (this.currentSite?.type === 'sso_provider') {
      return;
    }
    
    if (typeof M !== 'undefined' && M.cfg?.sesskey) {
      this.sesskey = M.cfg.sesskey;
      return;
    }

    const match = document.documentElement.innerHTML.match(/"sesskey":"([^"]+)"/);
    if (match) {
      this.sesskey = match[1];
      return;
    }

    const input = document.querySelector('input[name="sesskey"]');
    if (input) {
      this.sesskey = input.value;
    }
  }

  extractUserInfo() {
    if (this.currentSite?.type === 'sso_provider') {
      return;
    }
    
    if (typeof M !== 'undefined' && M.cfg?.userid) {
      this.userId = M.cfg.userid;
    }
  }

  // ============================================
  // 存储管理
  // ============================================

  async saveToken(token) {
    try {
      const hostname = this.currentSite?.hostname;
      if (!hostname) return;
      
      await chrome.storage.local.set({
        [`moodesk_token_${hostname}`]: token,
        [`moodesk_token_time_${hostname}`]: Date.now()
      });
      console.log('[Moodesk Auth] Token 已保存');
    } catch (error) {
      console.error('[Moodesk Auth] 保存 Token 失败:', error);
    }
  }

  async saveSessionInfo() {
    try {
      const hostname = this.currentSite?.hostname;
      if (!hostname || !this.sesskey) return;
      
      await chrome.storage.local.set({
        [`moodesk_sesskey_${hostname}`]: this.sesskey,
        [`moodesk_userid_${hostname}`]: this.userId,
        [`moodesk_session_time_${hostname}`]: Date.now()
      });
      console.log('[Moodesk Auth] 会话信息已保存');
    } catch (error) {
      console.error('[Moodesk Auth] 保存会话信息失败:', error);
    }
  }

  async getStoredToken() {
    try {
      const hostname = this.currentSite?.hostname;
      if (!hostname) return null;
      
      const key = `moodesk_token_${hostname}`;
      const timeKey = `moodesk_token_time_${hostname}`;
      const result = await chrome.storage.local.get([key, timeKey]);
      
      const token = result[key];
      const time = result[timeKey];
      
      if (token && time && (Date.now() - time) < 7 * 24 * 60 * 60 * 1000) {
        return token;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async tryGetTokenFromStorage() {
    const token = await this.getStoredToken();
    if (token) {
      this.token = token;
      console.log('[Moodesk Auth] 从存储中加载 token');
    }
  }

  // ============================================
  // API 调用
  // ============================================

  async callApi(methodName, args = {}) {
    if (this.token) {
      return this.callApiWithToken(methodName, args);
    } else if (this.sesskey) {
      return this.callApiWithSesskey(methodName, args);
    } else {
      throw new Error('没有可用的认证方式');
    }
  }

  async callApiWithToken(methodName, args = {}) {
    const serviceUrl = this.currentSite.urls?.service ||
      `https://${this.currentSite.hostname}/webservice/rest/server.php`;

    const response = await fetch(serviceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        wstoken: this.token,
        wsfunction: methodName,
        moodlewsrestformat: 'json',
        ...args
      })
    });

    return response.json();
  }

  async callApiWithSesskey(methodName, args = {}) {
    const ajaxUrl = this.currentSite.urls?.ajax ||
      `https://${this.currentSite.hostname}/lib/ajax/service.php`;

    const response = await fetch(`${ajaxUrl}?sesskey=${this.sesskey}&info=${methodName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ index: 0, methodname: methodName, args }]),
      credentials: 'include'
    });

    const data = await response.json();
    
    if (Array.isArray(data) && data[0]) {
      if (data[0].error) {
        throw new Error(data[0].exception?.message || 'API 调用失败');
      }
      return data[0].data;
    }
    return data;
  }

  // ============================================
  // UI 方法
  // ============================================

  showLoadingState(message = '加载中...') {
    if (document.querySelector('.moodesk-auth-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'moodesk-auth-overlay';
    overlay.innerHTML = `
      <div class="moodesk-auth-loading">
        <div class="loading-spinner"></div>
        <p>${message}</p>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  hideLoadingState() {
    document.querySelector('.moodesk-auth-overlay')?.remove();
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'moodesk-auth-error';
    errorDiv.textContent = message;

    const container = document.querySelector('.login-wrapper, .login-box, #login, .center-block, .login-form-block');
    if (container) {
      container.insertBefore(errorDiv, container.firstChild);
      setTimeout(() => errorDiv.remove(), 5000);
    }
  }

  addStyles() {
    if (document.getElementById('moodesk-auth-styles')) return;

    const style = document.createElement('style');
    style.id = 'moodesk-auth-styles';
    style.textContent = `
      .moodesk-auth-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(255, 255, 255, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }
      .moodesk-auth-loading {
        text-align: center;
      }
      .loading-spinner {
        width: 40px; height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #1a73e8;
        border-radius: 50%;
        margin: 0 auto 16px;
        animation: moodesk-spin 1s linear infinite;
      }
      @keyframes moodesk-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .moodesk-auth-error {
        background: #ffebee;
        color: #c62828;
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 16px;
        animation: moodesk-slideIn 0.3s ease;
      }
      @keyframes moodesk-slideIn {
        from { transform: translateY(-10px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================
  // 静态方法
  // ============================================

  static async getToken() {
    try {
      const hostname = window.location.hostname;
      const tokenKey = `moodesk_token_${hostname}`;
      const timeKey = `moodesk_token_time_${hostname}`;
      const sesskeyKey = `moodesk_sesskey_${hostname}`;
      
      const result = await chrome.storage.local.get([tokenKey, timeKey, sesskeyKey]);
      
      if (result[tokenKey] && result[timeKey]) {
        const age = Date.now() - result[timeKey];
        if (age < 7 * 24 * 60 * 60 * 1000) {
          return result[tokenKey];
        }
      }
      
      if (result[sesskeyKey]) {
        return { type: 'sesskey', value: result[sesskeyKey] };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  static decodeUkmToken(base64Token) {
    try {
      const decoded = atob(base64Token);
      const parts = decoded.split(':::');
      if (parts.length >= 2) {
        return {
          privateToken: parts[0],
          wstoken: parts[1],
          signature: parts[2] || ''
        };
      }
    } catch (error) {
      console.error('[Moodesk Auth] 解码 token 失败:', error);
    }
    return null;
  }

  // Getters
  getSiteConfig() { return this.currentSite; }
  getSesskey() { return this.sesskey; }
  getWsToken() { return this.token; }
  getUserId() { return this.userId; }
  isSsoSite() { return ['saml_sso', 'oauth2', 'cas'].includes(this.currentSite?.type); }
  isSsoProviderPage() { return this.currentSite?.type === 'sso_provider'; }

  /**
   * 触发 SSO 登录 - 跳转到 SSO 登录页面
   * 可以通过远程配置的按钮调用此方法
   */
  triggerSsoLogin() {
    console.log('[Moodesk Auth] 触发 SSO 登录');
    
    // 获取 SSO 提供商配置
    let ssoLoginUrl = null;
    
    if (this.currentSite?.sso?.provider) {
      // 从站点配置中获取 SSO 登录 URL
      const ssoProvider = siteConfigManager?.getSsoProvider(this.currentSite.sso.provider);
      ssoLoginUrl = ssoProvider?.loginUrl;
    }
    
    // 如果没有配置 SSO 提供商，使用 launch.php 触发 SAML 流程
    if (!ssoLoginUrl) {
      const passport = this.generatePassport();
      ssoLoginUrl = `${window.location.origin}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=moodlemobile`;
    }
    
    console.log('[Moodesk Auth] 跳转到 SSO 登录:', ssoLoginUrl);
    window.location.href = ssoLoginUrl;
  }
}
