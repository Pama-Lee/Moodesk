// commandModule.js
class CommandModule {
  constructor() {
    this.isOpen = false;
    this.isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    // 设置修饰键
    this.modKey = this.isMac ? "⌘" : "Alt";
    this.commandCategories = new Set();

    this.commands = [
      {
        id: "toggle-todo",
        name: "切换待办事项面板",
        shortcut: `${this.modKey} + T`,
        category: "视图",
        handler: () => document.querySelector(".moodesk-header h3")?.click(),
      },
      {
        id: "add-todo",
        name: "添加待办事项",
        shortcut: `${this.modKey} + N`,
        category: "待办事项",
        handler: () => document.querySelector(".moodesk-todo-input")?.focus(),
      },
      {
        id: "toggle-theme",
        name: "切换主题",
        shortcut: `${this.modKey} + L`,
        category: "外观",
        handler: () => document.querySelector(".theme-button")?.click(),
      },

      // PDF操作命令
      {
        id: "open-pdf",
        name: "在新标签页打开PDF",
        shortcut: `${this.modKey} + O`,
        category: "PDF",
        handler: () =>
          document.querySelector(".moodesk-floating-button")?.click(),
      },

      // 课程操作命令
      {
        id: "mark-all-done",
        name: "标记所有活动为完成",
        shortcut: `${this.modKey} + M`,
        category: "课程操作",
        handler: () => this.markAllAsDone(),
      },
      {
        id: "mark-all-undone",
        name: "标记所有活动为未完成",
        shortcut: `${this.modKey} + U`,
        category: "课程操作",
        handler: () => this.markAllAsUndone(),
      },
      {
        id: "mark-visible-done",
        name: "标记当前可见活动为完成",
        shortcut: `${this.modKey} + V`,
        category: "课程操作",
        handler: () => this.markVisibleAsDone(),
      },
      {
        id: "mark-section-done",
        name: "标记当前章节活动为完成",
        shortcut: `${this.modKey} + S`,
        category: "课程操作",
        handler: () => this.markCurrentSectionDone(),
      },
      {
        id: "expand-all-sections",
        name: "展开所有章节",
        shortcut: `${this.modKey} + E`,
        category: "课程操作",
        handler: () => this.expandAllSections(),
      },
      {
        id: "collapse-all-sections",
        name: "折叠所有章节",
        shortcut: `${this.modKey} + C`,
        category: "课程操作",
        handler: () => this.collapseAllSections(),
      },
    ];

    this.operationInProgress = false;
    // 初始化基础分类
    this.updateCategories();
  }

  init() {
    this.createCommandPalette();
    this.setupEventListeners();
  }

  /**
   * 动态添加新命令
   * @param {Object|Array} commandConfig - 单个命令配置对象或命令配置对象数组
   * @returns {boolean} - 添加是否成功
   */
  addCommands(commandConfig) {
    try {
      const configs = Array.isArray(commandConfig)
        ? commandConfig
        : [commandConfig];

      configs.forEach((config) => {
        // 验证命令配置
        if (!this.validateCommandConfig(config)) {
          throw new Error(
            `Invalid command configuration: ${JSON.stringify(config)}`
          );
        }

        // 检查ID是否已存在
        if (this.commands.some((cmd) => cmd.id === config.id)) {
          console.warn(
            `Command with ID "${config.id}" already exists. Skipping.`
          );
          return;
        }

        // 格式化快捷键
        const formattedConfig = {
          ...config,
          shortcut: this.formatShortcut(config.shortcut),
        };

        // 添加命令
        this.commands.push(formattedConfig);
      });

      // 更新分类
      this.updateCategories();

      // 如果命令面板是打开的，重新渲染
      if (this.isOpen) {
        this.filterCommands("");
      }

      return true;
    } catch (error) {
      console.error("Error adding commands:", error);
      return false;
    }
  }

  /**
   * 移除命令
   * @param {string|Array} commandIds - 要移除的命令ID或ID数组
   * @returns {boolean} - 移除是否成功
   */
  removeCommands(commandIds) {
    try {
      const ids = Array.isArray(commandIds) ? commandIds : [commandIds];

      ids.forEach((id) => {
        const index = this.commands.findIndex((cmd) => cmd.id === id);
        if (index !== -1) {
          this.commands.splice(index, 1);
        }
      });

      // 更新分类
      this.updateCategories();

      // 如果命令面板是打开的，重新渲染
      if (this.isOpen) {
        this.filterCommands("");
      }

      return true;
    } catch (error) {
      console.error("Error removing commands:", error);
      return false;
    }
  }

  /**
   * 更新现有命令
   * @param {string} commandId - 要更新的命令ID
   * @param {Object} updates - 要更新的属性
   * @returns {boolean} - 更新是否成功
   */
  updateCommand(commandId, updates) {
    try {
      const command = this.commands.find((cmd) => cmd.id === commandId);
      if (!command) {
        console.warn(`Command with ID "${commandId}" not found.`);
        return false;
      }

      // 验证更新
      const updatedCommand = { ...command, ...updates };
      if (!this.validateCommandConfig(updatedCommand)) {
        throw new Error(`Invalid command updates: ${JSON.stringify(updates)}`);
      }

      // 应用更新
      Object.assign(command, updates);

      // 更新分类
      this.updateCategories();

      // 如果命令面板是打开的，重新渲染
      if (this.isOpen) {
        this.filterCommands("");
      }

      return true;
    } catch (error) {
      console.error("Error updating command:", error);
      return false;
    }
  }

  /**
   * 验证命令配置
   * @param {Object} config - 命令配置对象
   * @returns {boolean} - 配置是否有效
   */
  validateCommandConfig(config) {
    const requiredFields = ["id", "name", "shortcut", "category", "handler"];
    const hasAllFields = requiredFields.every((field) => field in config);

    if (!hasAllFields) {
      return false;
    }

    // 验证处理函数
    if (typeof config.handler !== "function") {
      return false;
    }

    // 验证快捷键格式
    const shortcutPattern = new RegExp(`^${this.modKey} \\+ [A-Za-z0-9\\[\\]]$`);   
    if (!shortcutPattern.test(config.shortcut)) {
      return false;
    }

    return true;
  }

  /**
   * 格式化快捷键显示
   * @param {string} shortcut - 原始快捷键
   * @returns {string} - 格式化后的快捷键
   */
  formatShortcut(shortcut) {
    if (this.isMac) {
      return shortcut.replace("⌘", "⌘").replace("+", "").trim();
    }
    return shortcut;
  }

  /**
   * 更新命令分类集合
   */
  updateCategories() {
    this.commandCategories = new Set(this.commands.map((cmd) => cmd.category));
  }

  /**
   * 获取所有可用的命令分类
   * @returns {Array} - 分类数组
   */
  getCategories() {
    return Array.from(this.commandCategories);
  }

  /**
   * 获取指定分类的所有命令
   * @param {string} category - 分类名称
   * @returns {Array} - 命令数组
   */
  getCommandsByCategory(category) {
    return this.commands.filter((cmd) => cmd.category === category);
  }

  /**
   * 获取命令数量
   * @returns {number} - 命令总数
   */
  getCommandCount() {
    return this.commands.length;
  }

  createCommandPalette() {
    const palette = document.createElement("div");
    palette.className = "moodesk-command-palette";
    palette.innerHTML = `
        <div class="command-overlay"></div>
        <div class="command-container">
          <div class="command-header">
            <div class="command-search-container">
              <svg class="command-search-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" class="command-search" placeholder="搜索命令... (Esc 关闭)" autofocus>
            </div>
          </div>
          <div class="command-list"></div>
        </div>
      `;

    document.body.appendChild(palette);
  }

  setupEventListeners() {
    // 快捷键监听
    document.addEventListener("keydown", (e) => {
      // Ctrl+K 或 Cmd+K 打开命令面板
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        this.togglePalette();
      }

      this.commands.forEach((command) => {
        const key = command.shortcut.split("+")[1].trim().toLowerCase();
        const needsMod = command.shortcut.includes(this.modKey);

        // Mac 使用 metaKey (Command), Windows 使用 altKey
        const modPressed = this.isMac ? e.metaKey : e.altKey;

        if (needsMod && modPressed && e.key.toLowerCase() === key) {
          e.preventDefault();
          command.handler();
        }
      });
    });

    // 命令面板事件
    const palette = document.querySelector(".moodesk-command-palette");
    if (!palette) return;

    const overlay = palette.querySelector(".command-overlay");
    const searchInput = palette.querySelector(".command-search");

    overlay.addEventListener("click", () => this.togglePalette(false));

    searchInput.addEventListener("input", (e) => {
      this.filterCommands(e.target.value.trim().toLowerCase());
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.togglePalette(false);
      } else if (e.key === "Enter") {
        const activeItem = palette.querySelector(".command-item.active");
        if (activeItem) {
          const commandId = activeItem.dataset.id;
          const command = this.commands.find((c) => c.id === commandId);
          if (command) {
            command.handler();
            this.togglePalette(false);
          }
        }
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.navigateCommands(e.key === "ArrowDown" ? 1 : -1);
      }
    });

    // 命令点击事件
    palette.querySelector(".command-list").addEventListener("click", (e) => {
      const item = e.target.closest(".command-item");
      if (item) {
        const commandId = item.dataset.id;
        const command = this.commands.find((c) => c.id === commandId);
        if (command) {
          command.handler();
          this.togglePalette(false);
        }
      }
    });

    // 鼠标悬停事件
    palette
      .querySelector(".command-list")
      .addEventListener("mousemove", (e) => {
        const item = e.target.closest(".command-item");
        if (item) {
          palette
            .querySelectorAll(".command-item")
            .forEach((i) => i.classList.remove("active"));
          item.classList.add("active");
        }
      });
  }

  togglePalette(show = true) {
    const palette = document.querySelector(".moodesk-command-palette");
    if (!palette) return;

    this.isOpen = show;
    palette.classList.toggle("show", show);

    if (show) {
      const searchInput = palette.querySelector(".command-search");
      searchInput.value = "";
      searchInput.focus();
      this.filterCommands("");
    }
  }

  filterCommands(query) {
    const commandList = document.querySelector(".command-list");
    if (!commandList) return;

    const filteredCommands = query
      ? this.commands.filter(
          (cmd) =>
            cmd.name.toLowerCase().includes(query) ||
            cmd.category.toLowerCase().includes(query)
        )
      : this.commands;

    const groupedCommands = this.groupCommandsByCategory(filteredCommands);

    commandList.innerHTML = Object.entries(groupedCommands)
      .map(
        ([category, commands]) => `
          <div class="command-category">
            <div class="category-name">${category}</div>
            ${commands
              .map(
                (cmd) => `
              <div class="command-item" data-id="${cmd.id}">
                <div class="command-item-name">${cmd.name}</div>
                <div class="command-item-shortcut">${cmd.shortcut}</div>
              </div>
            `
              )
              .join("")}
          </div>
        `
      )
      .join("");

    // 默认选中第一项
    const firstItem = commandList.querySelector(".command-item");
    if (firstItem) {
      firstItem.classList.add("active");
    }
  }

  groupCommandsByCategory(commands) {
    return commands.reduce((groups, command) => {
      if (!groups[command.category]) {
        groups[command.category] = [];
      }
      groups[command.category].push(command);
      return groups;
    }, {});
  }

  navigateCommands(direction) {
    const items = [...document.querySelectorAll(".command-item")];
    const currentIndex = items.findIndex((item) =>
      item.classList.contains("active")
    );

    items.forEach((item) => item.classList.remove("active"));

    let nextIndex;
    if (currentIndex === -1) {
      nextIndex = 0;
    } else {
      nextIndex = (currentIndex + direction + items.length) % items.length;
    }

    items[nextIndex]?.classList.add("active");
    items[nextIndex]?.scrollIntoView({ block: "nearest" });
  }

  async markAllAsDone() {
    if (this.operationInProgress) return;
    this.operationInProgress = true;

    try {
      const buttons = this.getAllMarkButtons("undone");
      await this.processButtonsSequentially(buttons, "正在标记所有活动...");
      this.showNotification("已完成所有活动的标记");
    } catch (error) {
      this.showNotification("操作过程中出现错误", "error");
      console.error("Mark all done error:", error);
    } finally {
      this.operationInProgress = false;
    }
  }

  async markAllAsUndone() {
    if (this.operationInProgress) return;
    this.operationInProgress = true;

    try {
      const buttons = this.getAllMarkButtons("done");
      await this.processButtonsSequentially(buttons, "正在重置所有活动...");
      this.showNotification("已重置所有活动的标记");
    } catch (error) {
      this.showNotification("操作过程中出现错误", "error");
      console.error("Mark all undone error:", error);
    } finally {
      this.operationInProgress = false;
    }
  }

  async markVisibleAsDone() {
    if (this.operationInProgress) return;
    this.operationInProgress = true;

    try {
      const buttons = this.getVisibleMarkButtons("undone");
      await this.processButtonsSequentially(buttons, "正在标记可见活动...");
      this.showNotification("已完成可见活动的标记");
    } catch (error) {
      this.showNotification("操作过程中出现错误", "error");
      console.error("Mark visible done error:", error);
    } finally {
      this.operationInProgress = false;
    }
  }

  async markCurrentSectionDone() {
    if (this.operationInProgress) return;
    this.operationInProgress = true;

    try {
      const currentSection = this.getCurrentSection();
      if (!currentSection) {
        this.showNotification("未找到当前章节", "warning");
        return;
      }

      const buttons = this.getSectionMarkButtons(currentSection, "undone");
      await this.processButtonsSequentially(buttons, "正在标记当前章节...");
      this.showNotification("已完成当前章节的标记");
    } catch (error) {
      this.showNotification("操作过程中出现错误", "error");
      console.error("Mark section done error:", error);
    } finally {
      this.operationInProgress = false;
    }
  }

  // 工具方法
  getAllMarkButtons(status = "undone") {
    const selector =
      status === "done"
        ? '[data-toggletype="manual:mark-undone"]'
        : '[data-toggletype="manual:mark-done"]';
    return [...document.querySelectorAll(selector)];
  }

  getVisibleMarkButtons(status = "undone") {
    return this.getAllMarkButtons(status).filter((btn) => {
      const rect = btn.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
  }

  getCurrentSection() {
    // 查找当前可见的章节
    const sections = document.querySelectorAll("li.section");
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      if (rect.top >= 0 && rect.top <= window.innerHeight) {
        return section;
      }
    }
    return null;
  }

  getSectionMarkButtons(section, status = "undone") {
    const selector =
      status === "done"
        ? '[data-toggletype="manual:mark-undone"]'
        : '[data-toggletype="manual:mark-done"]';
    return [...section.querySelectorAll(selector)];
  }

  async processButtonsSequentially(buttons, message) {
    if (buttons.length === 0) {
      this.showNotification("没有找到需要处理的活动", "info");
      return;
    }

    const progress = this.showProgress(message, buttons.length);

    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      try {
        // 点击按钮
        button.click();
        // 等待一小段时间，避免服务器压力
        await new Promise((resolve) => setTimeout(resolve, 300));
        // 更新进度
        progress.update(i + 1);
      } catch (error) {
        console.error("Button click error:", error);
        // 继续处理下一个按钮
      }
    }

    progress.complete();
  }

  expandAllSections() {
    const expandButtons = document.querySelectorAll(
      'a[role="button"][aria-expanded="false"]'
    );
    expandButtons.forEach((btn) => btn.click());
  }

  collapseAllSections() {
    const collapseButtons = document.querySelectorAll(
      'a[role="button"][aria-expanded="true"]'
    );
    collapseButtons.forEach((btn) => btn.click());
  }

  // UI 反馈方法
  showNotification(message, type = "success") {
    const notification = document.createElement("div");
    notification.className = `moodesk-notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // 添加动画类
    setTimeout(() => notification.classList.add("show"), 10);

    // 自动移除
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  showProgress(message, total) {
    const progress = document.createElement("div");
    progress.className = "moodesk-progress";
    progress.innerHTML = `
          <div class="progress-message">${message}</div>
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
          <div class="progress-text">0/${total}</div>
        `;

    document.body.appendChild(progress);

    return {
      update: (current) => {
        const fill = progress.querySelector(".progress-fill");
        const text = progress.querySelector(".progress-text");
        const percentage = (current / total) * 100;
        fill.style.width = `${percentage}%`;
        text.textContent = `${current}/${total}`;
      },
      complete: () => {
        setTimeout(() => {
          progress.classList.add("fade-out");
          setTimeout(() => progress.remove(), 300);
        }, 1000);
      },
    };
  }

}
