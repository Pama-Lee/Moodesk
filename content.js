// content.js
class Moodesk {
  constructor() {
    // 初始化命令模块并注册到全局
    this.commandModule = new CommandModule();
    window.moodeskCommandModule = this.commandModule;

    // 初始化其他模块
    this.todoModule = new TodoModule();
    this.pdfModule = new PDFModule();
    this.analyticsModule = new AnalyticsModule();
    this.themeModule = new ThemeModule(this.analyticsModule);
    this.courseSwitcherModule = new CourseSwitcherModule();

    // 存储模块引用，方便其他模块访问
    window.moodesk = {
      commandModule: this.commandModule,
      todoModule: this.todoModule,
      pdfModule: this.pdfModule,
      analyticsModule: this.analyticsModule,
      themeModule: this.themeModule,
      courseSwitcherModule: this.courseSwitcherModule
    };

    this.init();
  }

  async init() {
    try {
      // 先初始化命令模块
      this.commandModule.init();

      // 注册基础命令
      this.registerBaseCommands();

      // 初始化其他模块
      await Promise.all([
        this.todoModule.init(),
        this.analyticsModule.init(),
        this.courseSwitcherModule.init()
      ]);

      this.themeModule.init();

      console.log('Moodesk initialized successfully');
    } catch (error) {
      console.error('Error initializing Moodesk:', error);
    }
  }

  registerBaseCommands() {
    // 注册全局级别的基础命令
    this.commandModule.addCommands([
      {
        id: 'toggle-theme',
        name: '切换主题',
        shortcut: `${this.commandModule.modKey} + L`,
        category: '外观',
        handler: () => this.themeModule.toggleTheme()
      },
      {
        id: 'reload-page',
        name: '重新加载页面',
        shortcut: `${this.commandModule.modKey} + R`,
        category: '系统',
        handler: () => window.location.reload()
      },
      {
        id: 'open-help',
        name: '打开帮助',
        shortcut: `${this.commandModule.modKey} + H`,
        category: '帮助',
        handler: () => this.showHelp()
      }
    ]);
  }

  showHelp() {
    // 创建帮助对话框
    const helpDialog = document.createElement('div');
    helpDialog.className = 'moodesk-help-dialog';
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
    return categories.map(category => `
      <div class="help-section">
        <h3>${category}</h3>
        <div class="help-commands">
          ${this.commandModule.getCommandsByCategory(category)
            .map(cmd => `
              <div class="help-command">
                <span class="command-name">${cmd.name}</span>
                <span class="command-shortcut">${cmd.shortcut}</span>
              </div>
            `).join('')}
        </div>
      </div>
    `).join('');
  }

  setupHelpDialogEvents(dialog) {
    const closeButton = dialog.querySelector('.close-button');
    const overlay = dialog.querySelector('.help-overlay');

    const closeDialog = () => {
      dialog.classList.add('closing');
      setTimeout(() => dialog.remove(), 200);
    };

    closeButton.addEventListener('click', closeDialog);
    overlay.addEventListener('click', closeDialog);
    
    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDialog();
    }, { once: true });
  }

  addHelpStyles() {
    if (!document.getElementById('moodesk-help-styles')) {
      const style = document.createElement('style');
      style.id = 'moodesk-help-styles';
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

// Initialize Moodesk when the page is loaded
window.addEventListener('load', () => {
  new Moodesk();
});
