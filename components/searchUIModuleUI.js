class SearchUIModule {
    constructor(searchModule) {
      this.isVisible = false;
      this.searchModule = null;
      this.container = null;
      this.searchTimeout = null;
      this.selectedIndex = 0;
      this.currentResults = [];
      this.searchModule = searchModule;
    }
  
    async init() {
      this.createContainer();
      this.registerCommand();
      this.setupKeyboardShortcuts();
    }
  
    registerCommand() {
      // 获取全局命令模块实例
      const commandModule = window.moodeskCommandModule;
      if (!commandModule) return;
  
      // 注册搜索命令
      commandModule.commands.push({
        id: 'global-search',
        name: '全局搜索',
        shortcut: `${commandModule.modKey} + Shift + F`,
        category: '搜索',
        handler: () => this.toggleSearch()
      });
    }
  
    setupKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        // 打开搜索框快捷键 (Ctrl/Cmd + Shift + F)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          this.toggleSearch();
        }
  
        // 搜索框显示时的快捷键
        if (this.isVisible) {
          switch (e.key) {
            case 'Escape':
              this.toggleSearch(false);
              break;
            case 'ArrowDown':
              e.preventDefault();
              this.navigateResults(1);
              break;
            case 'ArrowUp':
              e.preventDefault();
              this.navigateResults(-1);
              break;
            case 'Enter':
              e.preventDefault();
              this.openSelectedResult();
              break;
          }
        }
      });
    }
  
    createContainer() {
      this.container = document.createElement('div');
      this.container.className = 'moodesk-search-overlay';
      this.container.innerHTML = `
        <div class="moodesk-search-container">
          <div class="search-header">
            <div class="search-input-wrapper">
              <svg class="search-icon" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" class="search-input" placeholder="搜索课程、作业、资源...">
              <div class="search-shortcuts">
                <span class="shortcut">↑↓</span>
                <span class="shortcut-text">选择</span>
                <span class="shortcut">↵</span>
                <span class="shortcut-text">打开</span>
                <span class="shortcut">Esc</span>
                <span class="shortcut-text">关闭</span>
              </div>
            </div>
            <div class="search-filters">
              <button class="filter-btn active" data-type="all">全部</button>
              <button class="filter-btn" data-type="course">课程</button>
              <button class="filter-btn" data-type="assignment">作业</button>
              <button class="filter-btn" data-type="resource">资源</button>
            </div>
          </div>
          <div class="search-results"></div>
        </div>
      `;
  
      // 添加事件监听
      const input = this.container.querySelector('.search-input');
      input.addEventListener('input', () => {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => this.performSearch(), 300);
      });
  
      const overlay = this.container;
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.toggleSearch(false);
        }
      });
  
      // 过滤器点击事件
      const filters = this.container.querySelectorAll('.filter-btn');
      filters.forEach(btn => {
        btn.addEventListener('click', () => {
          filters.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.performSearch();
        });
      });
  
      // 添加样式
      this.addStyles();
  
      document.body.appendChild(this.container);
    }
  
    addStyles() {
      const style = document.createElement('style');
      style.textContent = `
        .moodesk-search-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: none;
          align-items: flex-start;
          justify-content: center;
          padding-top: 100px;
          z-index: 10000;
          animation: fadeIn 0.2s ease;
        }
  
        .moodesk-search-overlay.visible {
          display: flex;
        }
  
        .moodesk-search-container {
          width: 90%;
          max-width: 700px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          animation: slideDown 0.2s ease;
        }
  
        .search-header {
          padding: 16px;
          border-bottom: 1px solid #eee;
        }
  
        .search-input-wrapper {
          position: relative;
          margin-bottom: 12px;
        }
  
        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #666;
        }
  
        .search-input {
          width: 100%;
          padding: 12px 12px 12px 44px;
          border: 2px solid #eee;
          border-radius: 8px;
          font-size: 16px;
          transition: all 0.2s;
        }
  
        .search-input:focus {
          outline: none;
          border-color: #1a73e8;
          box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.1);
        }
  
        .search-shortcuts {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          gap: 8px;
          color: #666;
        }
  
        .shortcut {
          padding: 2px 6px;
          background: #f1f3f4;
          border-radius: 4px;
          font-size: 12px;
        }
  
        .shortcut-text {
          font-size: 12px;
        }
  
        .search-filters {
          display: flex;
          gap: 8px;
        }
  
        .filter-btn {
          padding: 6px 12px;
          border: none;
          border-radius: 16px;
          background: #f1f3f4;
          color: #666;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
  
        .filter-btn.active {
          background: #1a73e8;
          color: white;
        }
  
        .search-results {
          max-height: 400px;
          overflow-y: auto;
          padding: 8px;
        }
  
        .result-item {
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
  
        .result-item:hover,
        .result-item.selected {
          background: #f8f9fa;
        }
  
        .result-icon {
          width: 24px;
          height: 24px;
          padding: 4px;
          border-radius: 6px;
          background: #e8f0fe;
          color: #1a73e8;
        }
  
        .result-content {
          flex: 1;
          min-width: 0;
        }
  
        .result-title {
          font-size: 14px;
          color: #333;
          margin-bottom: 4px;
        }
  
        .result-title mark {
          background: #fff2a8;
          border-radius: 2px;
          padding: 0 2px;
        }
  
        .result-meta {
          font-size: 12px;
          color: #666;
          display: flex;
          gap: 8px;
        }
  
        .result-type {
          color: #1a73e8;
        }
  
        .empty-state {
          padding: 32px;
          text-align: center;
          color: #666;
        }
  
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
  
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `;
      document.head.appendChild(style);
    }
  
    toggleSearch(show = true) {
      this.isVisible = show;
      this.container.classList.toggle('visible', show);
      
      if (show) {
        const input = this.container.querySelector('.search-input');
        input.value = '';
        input.focus();
        this.selectedIndex = 0;
        this.currentResults = [];
        this.updateResults([]);
      }
    }
  
    async performSearch() {
      const input = this.container.querySelector('.search-input');
      const query = input.value.trim();
      
      if (!query) {
        this.updateResults([]);
        return;
      }
  
      // 获取当前选中的过滤器
      const activeFilter = this.container.querySelector('.filter-btn.active');
      const filterType = activeFilter.dataset.type;
      
      // 设置搜索选项
      const options = {
        limit: 10,
        types: filterType === 'all' ? undefined : [filterType]
      };
  
      // 执行搜索
      const results = await this.searchModule.search(query, options);
      this.currentResults = results;
      this.selectedIndex = 0;
      this.updateResults(results);
    }
  
    updateResults(results) {
      const container = this.container.querySelector('.search-results');
      
      if (results.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            ${this.container.querySelector('.search-input').value.trim() ? 
              '未找到相关结果' : 
              '输入关键词开始搜索'}
          </div>
        `;
        return;
      }
  
      container.innerHTML = results.map((result, index) => `
        <div class="result-item ${index === this.selectedIndex ? 'selected' : ''}" data-index="${index}">
          <div class="result-icon">
            ${this.getResultIcon(result.type)}
          </div>
          <div class="result-content">
            <div class="result-title">${result.title}</div>
            <div class="result-meta">
              <span class="result-type">${this.getResultTypeName(result.type)}</span>
              <span class="result-course">${result.courseName}</span>
              ${result.dueDate ? `
                <span class="result-due">截止日期: ${this.formatDate(result.dueDate)}</span>
              ` : ''}
            </div>
          </div>
        </div>
      `).join('');
  
      // 添加点击事件
      container.querySelectorAll('.result-item').forEach(item => {
        item.addEventListener('click', () => {
          this.selectedIndex = parseInt(item.dataset.index);
          this.openSelectedResult();
        });
      });
    }
  
    navigateResults(direction) {
      if (this.currentResults.length === 0) return;
  
      this.selectedIndex = (this.selectedIndex + direction + this.currentResults.length) % this.currentResults.length;
      
      // 更新选中状态
      const items = this.container.querySelectorAll('.result-item');
      items.forEach((item, index) => {
        item.classList.toggle('selected', index === this.selectedIndex);
      });
  
      // 确保选中项可见
      const selectedItem = items[this.selectedIndex];
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  
    openSelectedResult() {
      const result = this.currentResults[this.selectedIndex];
      if (!result) return;
  
      window.location.href = result.url;
      this.toggleSearch(false);
    }
  
    getResultIcon(type) {
        const icons = {
          course: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"/>
          </svg>`,
          assignment: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>`,
          resource: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
            <polyline points="13 2 13 9 20 9"/>
          </svg>`,
          section: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
          </svg>`,
          url: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>`,
          pdf: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>`,
          folder: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>`,
          video: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <polygon points="23 7 16 12 23 17 23 7"/>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>`,
          image: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>`
        };
    
        return icons[type] || icons.resource;
      }
    
      getResultTypeName(type) {
        const typeNames = {
          course: '课程',
          assignment: '作业',
          resource: '资源',
          section: '章节',
          url: '链接',
          pdf: 'PDF文档',
          folder: '文件夹',
          video: '视频',
          image: '图片'
        };
    
        return typeNames[type] || '资源';
      }
    
      formatDate(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diff = (now - date) / 1000;
    
        // 如果是未来时间
        if (diff < 0) {
          // 24小时内
          if (Math.abs(diff) < 86400) {
            const hours = Math.ceil(Math.abs(diff) / 3600);
            return `${hours}小时后`;
          }
          // 7天内
          if (Math.abs(diff) < 604800) {
            const days = Math.ceil(Math.abs(diff) / 86400);
            return `${days}天后`;
          }
        }
    
        // 默认格式化
        return date.toLocaleDateString('zh-CN', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric'
        });
      }
    
      // 为不同类型的结果添加图标和标识
      addResultMetadata(result) {
        const typeIcons = {
          pdf: `📄`,
          video: `🎥`,
          image: `🖼️`,
          url: `🔗`,
          assignment: `✍️`
        };
    
        const typeLabels = {
          pdf: "PDF文档",
          video: "视频",
          image: "图片",
          url: "链接",
          assignment: "作业"
        };
    
        result.icon = typeIcons[result.type] || `📑`;
        result.typeLabel = typeLabels[result.type] || "文档";
        return result;
      }
    
      // 高亮显示匹配文本
      highlightMatch(text, matches) {
        if (!matches || matches.length === 0) return text;
    
        let highlighted = '';
        let lastIndex = 0;
    
        // 按照匹配位置排序
        matches.sort((a, b) => a[0] - b[0]);
    
        matches.forEach(([start, end]) => {
          // 添加未匹配部分
          highlighted += text.slice(lastIndex, start);
          // 添加匹配部分(带高亮)
          highlighted += `<mark>${text.slice(start, end + 1)}</mark>`;
          lastIndex = end + 1;
        });
    
        // 添加剩余未匹配部分
        highlighted += text.slice(lastIndex);
        return highlighted;
      }
}
