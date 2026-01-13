class Moodesk {
  constructor() {
    // 先检查是否是 SSO 提供商页面
    this.authModule = new AuthModule();
    
    // 立即将 authModule 暴露到全局，供远程配置的按钮使用
    window.moodeskAuthModule = this.authModule;
    
    // 如果是 SSO 提供商页面，只初始化认证模块
    if (this.authModule.isSsoProviderPage()) {
      console.log('[Moodesk] SSO 提供商页面，只初始化认证模块');
      this.initSsoProviderPage();
      return;
    }

    // 正常的 Moodle 页面，初始化所有模块
    this.initFullModules();
    
    // 初始化站点样式管理器（在 authModule 暴露后）
    this.initSiteStyles();
  }

  /**
   * 初始化站点样式管理器
   */
  async initSiteStyles() {
    try {
      // 初始化远程配置和样式管理
      await siteStyleManager.init();
      console.log('[Moodesk] 站点样式已加载');
      
      // 将样式管理器暴露到全局
      window.moodeskStyleManager = siteStyleManager;
      window.moodeskConfigManager = remoteConfigManager;
    } catch (error) {
      console.warn('[Moodesk] 站点样式加载失败:', error);
    }
  }

  /**
   * SSO 提供商页面初始化（简化版）
   */
  async initSsoProviderPage() {
    try {
      await this.authModule.init();
      console.log('[Moodesk] SSO 页面初始化完成');
    } catch (error) {
      console.error('[Moodesk] SSO 页面初始化失败:', error);
    }
  }

  /**
   * 完整模块初始化（Moodle 页面）
   */
  initFullModules() {
    this.commandModule = new CommandModule();
    window.moodeskCommandModule = this.commandModule;

    this.todoModule = new TodoModule();
    this.pdfModule = new PDFModule();
    this.analyticsModule = new AnalyticsModule();
    this.themeModule = new ThemeModule(this.analyticsModule);
    this.courseSwitcherModule = new CourseSwitcherModule();
    this.resourceManager = new ResourceManagerModule();
    this.assignmentModule = new AssignmentTrackerModule();
    this.searchModule = new SearchModule();
    this.searchModuleUI = new SearchUIModule(this.searchModule);

    window.moodesk = {
      authModule: this.authModule,
      commandModule: this.commandModule,
      todoModule: this.todoModule,
      pdfModule: this.pdfModule,
      analyticsModule: this.analyticsModule,
      themeModule: this.themeModule,
      courseSwitcherModule: this.courseSwitcherModule,
      resourceManager: this.resourceManager,
      assignmentModule: this.assignmentModule,
      searchModule: this.searchModule,
    };

    this.init();
    
    // 初始化 AI 侧边栏
    this.initAISidebar();
  }
  
  /**
   * 初始化 AI 侧边栏
   */
  async initAISidebar() {
    try {
      // 检查 AI 是否启用
      const result = await chrome.storage.local.get('moodesk_ai_enabled');
      if (!result.moodesk_ai_enabled) {
        console.log('[Moodesk] AI 未启用');
        return;
      }

      // 创建 AI 侧边栏
      this.aiSidebar = new AISidebar();
      this.aiSidebar.init();
      window.moodesk.aiSidebar = this.aiSidebar;
      
      // 监听来自 background 的 AI 更新
      this.setupAIMessageListener();
      
      console.log('[Moodesk] AI 侧边栏已初始化');
    } catch (error) {
      console.error('[Moodesk] AI 侧边栏初始化失败:', error);
    }
  }
  
  /**
   * 设置 AI 消息监听器
   */
  setupAIMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'AI_UPDATE' && this.aiSidebar) {
        this.aiSidebar.handleAgentUpdate(message.update);
        sendResponse({ received: true });
      }
      
      if (message.type === 'AI_TOOL_CALL') {
        this.handleAIToolCall(message.tool, message.args)
          .then(result => sendResponse(result))
          .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
      }
      
      if (message.type === 'AI_STATUS_CHANGED') {
        if (message.enabled && !this.aiSidebar) {
          this.initAISidebar();
        } else if (!message.enabled && this.aiSidebar) {
          // 移除 AI 侧边栏
          document.querySelector('.moodesk-ai-sidebar')?.remove();
          this.aiSidebar = null;
        }
      }
      
      if (message.type === 'SIDEBAR_STATUS_CHANGED') {
        this.handleSidebarStatusChange(message.enabled);
        sendResponse({ received: true });
      }
    });
  }
  
  /**
   * 处理侧边栏状态变化
   */
  handleSidebarStatusChange(enabled) {
    if (!window.location.href.includes("/course/view.php")) {
      return;
    }
    
    if (enabled) {
      // 启用侧边栏 - 需要刷新页面才能完全初始化
      if (!this.todoModule.container) {
        // 显示提示，建议刷新页面
        this.showSidebarNotification('侧边栏已启用，刷新页面后生效');
      }
    } else {
      // 禁用侧边栏 - 立即隐藏
      const container = document.querySelector('.moodesk-container');
      if (container) {
        container.remove();
      }
      const showButton = document.querySelector('.moodesk-show-button');
      if (showButton) {
        showButton.remove();
      }
      this.showSidebarNotification('侧边栏已关闭');
    }
  }
  
  /**
   * 显示侧边栏通知
   */
  showSidebarNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #1a73e8;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  /**
   * 处理 AI 工具调用
   */
  async handleAIToolCall(toolName, args) {
    console.log('[Moodesk] 处理 AI 工具调用:', toolName, args);
    
    switch (toolName) {
      case 'get_assignments':
        return await this.getAssignmentsForAI(args);
      
      case 'get_courses':
        return await this.getCoursesForAI();
      
      case 'get_current_page':
        return this.getCurrentPageForAI();
      
      default:
        return { success: false, error: `未知工具: ${toolName}` };
    }
  }
  
  /**
   * 获取作业列表（供 AI 使用）
   */
  async getAssignmentsForAI(args) {
    try {
      // 确保有 token
      if (!this.assignmentModule.token) {
        this.assignmentModule.token = await AuthModule.getToken();
      }
      
      if (!this.assignmentModule.token) {
        return { 
          success: false, 
          error: '未登录或无法获取访问令牌，请先登录 Moodle' 
        };
      }
      
      await this.assignmentModule.fetchAssignments();
      const assignments = this.assignmentModule.assignments || [];
      const now = new Date();
      const daysLimit = args?.days || 14; // 默认查看14天内的作业
      
      let filtered = [...assignments];
      
      // 按状态筛选
      if (args?.status === 'pending') {
        filtered = assignments.filter(a => !a.submitted && new Date(a.duedate * 1000) > now);
      } else if (args?.status === 'submitted') {
        filtered = assignments.filter(a => a.submitted);
      } else if (args?.status === 'overdue') {
        filtered = assignments.filter(a => !a.submitted && new Date(a.duedate * 1000) < now);
      }
      
      // 按天数筛选（只对未来的作业）
      const limitDate = new Date(now.getTime() + daysLimit * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(a => {
        const dueDate = new Date(a.duedate * 1000);
        return dueDate <= limitDate;
      });
      
      // 格式化返回数据
      const result = filtered.map(a => {
        const dueDate = new Date(a.duedate * 1000);
        const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
        
        return {
          name: a.name,
          course: a.course || a.courseName || '未知课程', // 使用 course 字段
          dueDate: dueDate.toLocaleDateString('zh-CN'),
          dueTime: dueDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          daysLeft: diffDays,
          status: a.submitted ? '已提交' : (diffDays < 0 ? '已过期' : '待提交'),
          urgent: diffDays <= 2 && diffDays >= 0
        };
      });
      
      // 按截止日期排序
      result.sort((a, b) => a.daysLeft - b.daysLeft);
      
      if (result.length === 0) {
        return {
          success: true,
          data: {
            total: 0,
            assignments: [],
            message: '未来两周内没有待提交的作业'
          }
        };
      }
      
      return {
        success: true,
        data: {
          total: result.length,
          assignments: result
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 获取课程列表（供 AI 使用）
   */
  async getCoursesForAI() {
    try {
      // 获取 token
      const token = await AuthModule.getToken();
      if (!token) {
        return { 
          success: false, 
          error: '未登录或无法获取访问令牌，请先登录 Moodle' 
        };
      }
      
      // 调用 Moodle API 获取用户课程
      const response = await fetch(
        `${window.location.origin}/webservice/rest/server.php`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            wstoken: token,
            wsfunction: 'core_enrol_get_users_courses',
            moodlewsrestformat: 'json',
            userid: await this.getCurrentUserId(token)
          }),
        }
      );
      
      const courses = await response.json();
      
      if (courses.exception) {
        throw new Error(courses.message);
      }
      
      return {
        success: true,
        data: {
          total: courses.length,
          courses: courses.map(c => ({
            id: c.id,
            name: c.fullname || c.shortname,
            shortname: c.shortname
          }))
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 获取当前用户 ID
   */
  async getCurrentUserId(token) {
    try {
      const response = await fetch(
        `${window.location.origin}/webservice/rest/server.php`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            wstoken: token,
            wsfunction: 'core_webservice_get_site_info',
            moodlewsrestformat: 'json'
          }),
        }
      );
      
      const info = await response.json();
      return info.userid;
    } catch (error) {
      console.error('[Moodesk] 获取用户 ID 失败:', error);
      return null;
    }
  }
  
  /**
   * 获取当前页面信息（供 AI 使用）
   */
  getCurrentPageForAI() {
    const url = window.location.href;
    const title = document.title;
    
    let pageType = '未知';
    let pageInfo = {};
    
    if (url.includes('/course/view.php')) {
      pageType = '课程页面';
      pageInfo.courseName = document.querySelector('.page-header-headings h1')?.textContent?.trim();
      pageInfo.sections = Array.from(document.querySelectorAll('.section-title')).map(s => s.textContent?.trim()).filter(Boolean);
    } else if (url.includes('/mod/assign/view.php')) {
      pageType = '作业页面';
      pageInfo.assignmentName = document.querySelector('.page-header-headings h1')?.textContent?.trim();
    } else if (url.includes('/mod/resource/view.php') || url.includes('/mod/url/view.php')) {
      pageType = '资源页面';
    } else if (url.includes('/my/')) {
      pageType = '个人主页';
    } else if (url.includes('/user/')) {
      pageType = '用户页面';
    }
    
    return {
      success: true,
      data: {
        url,
        title,
        pageType,
        ...pageInfo
      }
    };
  }

  async init() {
    try {
      // 初始化命令模块
      this.commandModule.init();
      this.registerBaseCommands();
      
      // 初始化认证模块
      await this.authModule.init();
      
      // 获取 token
      const token = await AuthModule.getToken();
      if (token) {
        window.moodesk.token = token;
      }

      // 初始化其他模块
      await this.assignmentModule.init();
      await this.searchModule.init();
      await this.searchModuleUI.init();

      // 课程页面特定模块
      if (window.location.href.includes("/course/view.php")) {
        // 检查侧边栏是否启用
        const result = await chrome.storage.local.get('moodesk_sidebar_enabled');
        const sidebarEnabled = result.moodesk_sidebar_enabled === true;
        
        if (sidebarEnabled) {
          await Promise.all([
            this.todoModule.init(),
            this.analyticsModule.init(),
            this.courseSwitcherModule.init(),
            this.resourceManager.init(),
          ]);
        } else {
          // 即使侧边栏未启用，也初始化课程切换器和资源管理器
          await Promise.all([
            this.courseSwitcherModule.init(),
            this.resourceManager.init(),
          ]);
        }
      }
      
      // 主题模块
      this.themeModule.init();
      
      console.log("[Moodesk] 初始化成功");
    } catch (error) {
      console.error("[Moodesk] 初始化失败:", error);
    }
  }

  registerBaseCommands() {
    this.commandModule.addCommands([
      {
        id: "toggle-theme",
        name: "切换主题",
        shortcut: `${this.commandModule.modKey} + Shift + L`,
        category: "外观",
        handler: () => this.themeModule.toggleTheme(),
      },
      {
        id: "reload-page",
        name: "重新加载页面",
        shortcut: `${this.commandModule.modKey} + Shift + R`,
        category: "系统",
        handler: () => window.location.reload(),
      },
      {
        id: "open-help",
        name: "打开帮助",
        shortcut: `${this.commandModule.modKey} + Shift + H`,
        category: "帮助",
        handler: () => this.showHelp(),
      },
      {
        id: "toggle-ai",
        name: "打开/关闭 AI 助手",
        shortcut: `${this.commandModule.modKey} + Shift + A`,
        category: "AI",
        handler: () => this.toggleAISidebar(),
      },
      {
        id: "toggle-resource-manager",
        name: "打开/关闭资源管理器",
        shortcut: `${this.commandModule.modKey} + Shift + F`,
        category: "工具",
        handler: () => this.toggleResourceManager(),
      },
    ]);
  }
  
  /**
   * 切换资源管理器
   */
  toggleResourceManager() {
    if (this.resourceManager) {
      this.resourceManager.toggleVisibility();
    } else {
      this.showSidebarNotification('资源管理器仅在课程页面可用');
    }
  }
  
  /**
   * 切换 AI 侧边栏
   */
  toggleAISidebar() {
    if (!this.aiSidebar) {
      // 如果 AI 侧边栏未初始化，先初始化
      this.initAISidebar().then(() => {
        if (this.aiSidebar) {
          this.aiSidebar.open();
        }
      });
    } else {
      this.aiSidebar.toggle();
    }
  }

  showHelp() {
    const helpDialog = document.createElement("div");
    helpDialog.className = "moodesk-help-dialog";
    helpDialog.innerHTML = `
      <div class="help-overlay"></div>
      <div class="help-content">
        <div class="help-header">
          <h2>Moodesk 快捷键帮助</h2>
          <button class="close-button">×</button>
        </div>
        <div class="help-body">
          ${this.generateHelpContent()}
        </div>
      </div>
    `;

    document.body.appendChild(helpDialog);
    this.setupHelpDialogEvents(helpDialog);
    this.addHelpStyles();
  }

  generateHelpContent() {
    const categories = this.commandModule.getCategories();
    return categories
      .map(
        (category) => `
      <div class="help-section">
        <h3>${category}</h3>
        <div class="help-commands">
          ${this.commandModule
            .getCommandsByCategory(category)
            .map(
              (cmd) => `
              <div class="help-command">
                <span class="command-name">${cmd.name}</span>
                <span class="command-shortcut">${cmd.shortcut}</span>
              </div>
            `
            )
            .join("")}
        </div>
      </div>
    `
      )
      .join("");
  }

  setupHelpDialogEvents(dialog) {
    const closeButton = dialog.querySelector(".close-button");
    const overlay = dialog.querySelector(".help-overlay");

    const closeDialog = () => {
      dialog.classList.add("closing");
      setTimeout(() => dialog.remove(), 200);
    };

    closeButton.addEventListener("click", closeDialog);
    overlay.addEventListener("click", closeDialog);

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") closeDialog();
      },
      { once: true }
    );
  }

  addHelpStyles() {
    if (!document.getElementById("moodesk-help-styles")) {
      const style = document.createElement("style");
      style.id = "moodesk-help-styles";
      style.textContent = `
        .moodesk-help-dialog {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 10002;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .help-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          animation: fadeIn 0.2s ease;
        }

        .help-content {
          position: relative;
          width: 90%;
          max-width: 800px;
          max-height: 80vh;
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          animation: slideIn 0.2s ease;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .help-header {
          padding: 16px;
          border-bottom: 1px solid #e0e0e0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .help-header h2 {
          margin: 0;
          font-size: 18px;
          color: #1a73e8;
        }

        .close-button {
          background: none;
          border: none;
          font-size: 24px;
          color: #666;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .close-button:hover {
          background: #f0f0f0;
          color: #333;
        }

        .help-body {
          padding: 16px;
          overflow-y: auto;
          flex-grow: 1;
        }

        .help-section {
          margin-bottom: 24px;
        }

        .help-section h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
          color: #333;
        }

        .help-commands {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 8px;
        }

        .help-command {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #f8f9fa;
          border-radius: 6px;
        }

        .command-name {
          font-size: 14px;
          color: #333;
        }

        .command-shortcut {
          font-size: 12px;
          color: #666;
          padding: 2px 6px;
          background: white;
          border-radius: 4px;
          border: 1px solid #e0e0e0;
        }

        .moodesk-help-dialog.closing .help-overlay {
          opacity: 0;
          transition: opacity 0.2s;
        }

        .moodesk-help-dialog.closing .help-content {
          opacity: 0;
          transform: scale(0.95);
          transition: all 0.2s;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideIn {
          from { 
            opacity: 0;
            transform: scale(0.95);
          }
          to { 
            opacity: 1;
            transform: scale(1);
          }
        }

        @media (max-width: 768px) {
          .help-content {
            width: 95%;
            max-height: 90vh;
          }

          .help-commands {
            grid-template-columns: 1fr;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }
}

async function maybeRedirectMyToCourses() {
  try {
    // 仅处理 /my/ 根页面
    const path = window.location.pathname;
    if (!/\/my\/?$/.test(path)) return false;

    const result = await chrome.storage.local.get('moodesk_redirect_my_to_courses');
    const enabled = !!result['moodesk_redirect_my_to_courses'];
    if (!enabled) return false;

    const targetUrl = `${window.location.origin}/my/courses.php`;
    if (window.location.href !== targetUrl) {
      window.location.href = targetUrl;
      return true;
    }
  } catch (e) {
    console.warn('[Moodesk] 自动跳转到 /my/courses.php 失败:', e);
  }
  return false;
}

window.addEventListener("load", async () => {
  const redirected = await maybeRedirectMyToCourses();
  if (!redirected) {
    new Moodesk();
  }
});
