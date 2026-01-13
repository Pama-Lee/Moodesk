// pdfModule.js
class PDFModule {
    constructor() {
      this.pdfViewer = null;
      this.currentPDFLink = null;
      this.isOpen = false;
      this.panelWidth = 50; // 默认宽度百分比
      this.setupPDFHandler();
      this.injectStyles();
    }
  
    setupPDFHandler() {
      // 监听所有链接点击
      document.addEventListener("click", this.handlePDFClick.bind(this));
      // 监听窗口大小变化
      window.addEventListener("resize", this.updatePDFViewerHeight.bind(this));
      // 监听 ESC 键关闭
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.isOpen) {
          this.closePDFViewer();
        }
      });
    }
    
    injectStyles() {
      if (document.getElementById('moodesk-pdf-panel-styles')) return;
      
      const style = document.createElement('style');
      style.id = 'moodesk-pdf-panel-styles';
      style.textContent = `
        /* PDF 浮动面板 */
        .moodesk-pdf-panel {
          position: fixed;
          top: 0;
          right: 0;
          width: 50%;
          height: 100vh;
          background: #fff;
          box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
          z-index: 9999;
          display: flex;
          flex-direction: column;
          transform: translateX(100%);
          transition: transform 0.3s ease;
        }
        
        .moodesk-pdf-panel.open {
          transform: translateX(0);
        }
        
        /* 面板头部 */
        .moodesk-pdf-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: linear-gradient(135deg,rgb(237, 193, 0),rgb(255, 222, 103));
          color: white;
          flex-shrink: 0;
        }
        
        .moodesk-pdf-panel-title {
          font-size: 14px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          margin-right: 12px;
        }
        
        .moodesk-pdf-panel-actions {
          display: flex;
          gap: 8px;
        }
        
        .moodesk-pdf-panel-btn {
          background: rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 6px;
          padding: 6px 10px;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          transition: background 0.2s;
        }
        
        .moodesk-pdf-panel-btn:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        
        .moodesk-pdf-panel-btn svg {
          width: 16px;
          height: 16px;
        }
        
        /* 面板内容 */
        .moodesk-pdf-panel-content {
          flex: 1;
          overflow: hidden;
        }
        
        .moodesk-pdf-panel-content iframe {
          width: 100%;
          height: 100%;
          border: none;
        }
        
        /* 左侧拖动条 */
        .moodesk-pdf-resizer {
          position: absolute;
          left: 0;
          top: 0;
          width: 6px;
          height: 100%;
          cursor: col-resize;
          background: transparent;
          transition: background 0.2s;
        }
        
        .moodesk-pdf-resizer:hover,
        .moodesk-pdf-resizer.dragging {
          background: rgba(26, 115, 232, 0.3);
        }
        
        /* 页面内容压缩 */
        body.moodesk-pdf-open {
          margin-right: 50% !important;
          transition: margin-right 0.3s ease;
        }
        
        /* 当前查看的 PDF 链接高亮 */
        .moodesk-current-pdf {
          background: rgba(26, 115, 232, 0.1) !important;
          border-radius: 4px;
        }
        
        .moodesk-viewing-badge {
          display: inline-block;
          background: #1a73e8;
          color: white;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 10px;
          margin-left: 8px;
          vertical-align: middle;
        }
        
        .moodesk-current-pdf-container {
          background: rgba(26, 115, 232, 0.05);
          border-radius: 8px;
        }
        
        /* 面板底部提示 */
        .moodesk-pdf-panel-footer {
          padding: 8px 16px;
          background: #f8f9fa;
          font-size: 11px;
          color: #666;
          text-align: center;
          flex-shrink: 0;
          border-top: 1px solid #eee;
        }
        
        /* 遮罩层（拖动时使用） */
        .moodesk-pdf-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10000;
          cursor: col-resize;
        }
      `;
      document.head.appendChild(style);
    }
    
    isPdfLink(element) {
      let currentElement = element;
      while (currentElement && !currentElement.classList.contains('activity')) {
        currentElement = currentElement.parentElement;
      }
      
      if (!currentElement) return false;
      
      const iconContainer = currentElement.querySelector('.activityiconcontainer');
      if (!iconContainer) return false;
      
      // 方法1: 检查是否有 PDF 图标
      const hasPdfIcon = iconContainer.querySelector('img[src*="pdf"]') !== null ||
                        iconContainer.querySelector('img[title*="PDF"]') !== null ||
                        iconContainer.querySelector('.activityicon[src*="pdf"]') !== null;
      
      if (hasPdfIcon) return true;
      
      // 方法2: 检查是否是 resource 类型，并且链接指向 /mod/resource/view.php
      // 这是为了支持 UKM Folio 等站点，它们的 PDF 文件显示为通用 "File" 图标
      const hasResourceIcon = iconContainer.querySelector('img[src*="resource"]') !== null ||
                             iconContainer.querySelector('img[alt*="File"]') !== null;
      
      if (hasResourceIcon && element.href && element.href.includes('/mod/resource/view.php')) {
        return true;
      }
      
      return false;
    }
  
    handlePDFClick(e) {
      const link = e.target.closest("a");
      if (!link) return;

      // 检查是否是PDF链接
      if (!this.isPdfLink(link)) return

      e.preventDefault(); // 阻止默认跳转

      // 移除之前的高亮
      this.removeCurrentPDFHighlight();
      
      // 设置新的高亮
      this.setCurrentPDFHighlight(link);
      
      // 保存当前链接引用
      this.currentPDFLink = link;

      // 获取文件名
      const fileName = this.extractFileName(link);
      
      this.openPDFViewer(link.href, fileName);
    }
    
    extractFileName(link) {
      // 尝试从链接文本获取文件名
      const linkText = link.textContent.trim();
      // 移除 "File" 后缀
      return linkText.replace(/\s*File\s*$/i, '').trim() || 'PDF 文档';
    }
  
    setCurrentPDFHighlight(link) {
      // 为链接添加高亮样式
      link.classList.add('moodesk-current-pdf');
      
      // 创建并添加"正在查看"标记
      const viewingBadge = document.createElement('span');
      viewingBadge.className = 'moodesk-viewing-badge';
      viewingBadge.textContent = '正在查看';
      
      // 检查是否已经存在badge
      if (!link.parentElement.querySelector('.moodesk-viewing-badge')) {
        link.parentElement.appendChild(viewingBadge);
      }
      
      // 应用高亮样式到父容器
      const activityInstance = link.closest('.activityinstance');
      if (activityInstance) {
        activityInstance.classList.add('moodesk-current-pdf-container');
      }
    }
  
    removeCurrentPDFHighlight() {
      if (this.currentPDFLink) {
        // 移除链接的高亮样式
        this.currentPDFLink.classList.remove('moodesk-current-pdf');
        
        // 移除"正在查看"标记
        const viewingBadge = this.currentPDFLink.parentElement.querySelector('.moodesk-viewing-badge');
        if (viewingBadge) {
          viewingBadge.remove();
        }
        
        // 移除父容器的高亮样式
        const activityInstance = this.currentPDFLink.closest('.activityinstance');
        if (activityInstance) {
          activityInstance.classList.remove('moodesk-current-pdf-container');
        }
      }
    }
  
    openPDFViewer(pdfUrl, fileName) {
      // 保存当前滚动位置
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      
      if (!this.pdfViewer) {
        this.createPDFPanel();
      }
      
      // 更新 iframe src
      const iframe = this.pdfViewer.querySelector('iframe');
      if (iframe) {
        iframe.src = pdfUrl;
      }
      
      // 更新标题
      const title = this.pdfViewer.querySelector('.moodesk-pdf-panel-title');
      if (title) {
        title.textContent = fileName;
        title.title = fileName;
      }
      
      // 更新新标签页打开按钮的 URL
      this.currentPdfUrl = pdfUrl;
      
      // 打开面板
      this.pdfViewer.classList.add('open');
      document.body.classList.add('moodesk-pdf-open');
      this.isOpen = true;
      
      // 更新页面压缩
      this.updateBodyMargin();
      
      // 恢复滚动位置，确保正在查看的文件仍然可见
      requestAnimationFrame(() => {
        window.scrollTo(scrollX, scrollY);
        
        // 确保当前链接在视口中可见
        if (this.currentPDFLink) {
          const rect = this.currentPDFLink.getBoundingClientRect();
          const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
          
          if (!isInViewport) {
            this.currentPDFLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      });
      
      console.log('[Moodesk PDF] 打开文件:', pdfUrl);
    }
    
    closePDFViewer() {
      if (this.pdfViewer) {
        this.pdfViewer.classList.remove('open');
      }
      document.body.classList.remove('moodesk-pdf-open');
      this.isOpen = false;
      
      // 重置页面样式
      this.resetBodyStyles();
      
      // 移除高亮
      this.removeCurrentPDFHighlight();
      this.currentPDFLink = null;
    }
    
    createPDFPanel() {
      const panel = document.createElement('div');
      panel.className = 'moodesk-pdf-panel';
      panel.id = 'moodesk-pdf-viewer';
      
      panel.innerHTML = `
        <div class="moodesk-pdf-resizer"></div>
        <div class="moodesk-pdf-panel-header">
          <span class="moodesk-pdf-panel-title">PDF 文档</span>
          <div class="moodesk-pdf-panel-actions">
            <button class="moodesk-pdf-panel-btn" id="moodesk-open-newtab" title="在新标签页打开">
              <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </button>
            <button class="moodesk-pdf-panel-btn" id="moodesk-close-pdf" title="关闭 (ESC)">
              <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="moodesk-pdf-panel-content">
          <iframe></iframe>
        </div>
        <div class="moodesk-pdf-panel-footer">
          由 Moodesk 提供支持 · 拖动左边缘调整宽度 · 按 ESC 关闭
        </div>
      `;
      
      document.body.appendChild(panel);
      this.pdfViewer = panel;
      
      // 绑定事件
      this.bindPanelEvents();
    }
    
    bindPanelEvents() {
      // 关闭按钮
      const closeBtn = this.pdfViewer.querySelector('#moodesk-close-pdf');
      closeBtn.addEventListener('click', () => this.closePDFViewer());
      
      // 新标签页打开按钮
      const newTabBtn = this.pdfViewer.querySelector('#moodesk-open-newtab');
      newTabBtn.addEventListener('click', () => {
        if (this.currentPdfUrl) {
          window.open(this.currentPdfUrl, '_blank');
        }
      });
      
      // 拖动调整宽度
      const resizer = this.pdfViewer.querySelector('.moodesk-pdf-resizer');
      this.setupResizer(resizer);
    }
    
    setupResizer(resizer) {
      let isResizing = false;
      let startX = 0;
      let startWidth = 0;
      
      resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = this.pdfViewer.offsetWidth;
        
        resizer.classList.add('dragging');
        
        // 创建遮罩防止 iframe 干扰
        const overlay = document.createElement('div');
        overlay.className = 'moodesk-pdf-overlay';
        document.body.appendChild(overlay);
        
        const onMouseMove = (e) => {
          if (!isResizing) return;
          
          const delta = startX - e.clientX;
          const newWidth = startWidth + delta;
          const windowWidth = window.innerWidth;
          
          // 限制宽度在 20% - 80% 之间
          const minWidth = windowWidth * 0.2;
          const maxWidth = windowWidth * 0.8;
          const clampedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
          
          this.panelWidth = (clampedWidth / windowWidth) * 100;
          this.pdfViewer.style.width = `${this.panelWidth}%`;
          this.updateBodyMargin();
        };
        
        const onMouseUp = () => {
          isResizing = false;
          resizer.classList.remove('dragging');
          overlay.remove();
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }
    
    updateBodyMargin() {
      if (this.isOpen) {
        // 设置页面宽度，让 Moodle 内容适应剩余空间
        const contentWidth = 100 - this.panelWidth;
        document.body.style.width = `${contentWidth}%`;
        document.body.style.marginRight = '0';
        document.body.style.overflowX = 'hidden';
        
        // 确保 html 元素也不会产生滚动条
        document.documentElement.style.overflowX = 'hidden';
      }
    }
    
    resetBodyStyles() {
      document.body.style.width = '';
      document.body.style.marginRight = '';
      document.body.style.overflowX = '';
      document.documentElement.style.overflowX = '';
    }

    updatePDFViewerHeight() {
      // 面板使用 fixed 定位和 100vh，不需要手动更新高度
    }
}
