// aiSidebar.js
// Moodesk AI 侧边栏 UI 组件
// 支持流式输出和 Markdown 渲染

class AISidebar {
  constructor() {
    this.isOpen = false;
    this.isProcessing = false;
    this.messages = [];
    this.sidebar = null;
    this.messagesContainer = null;
    this.textarea = null;
    this.sendBtn = null;
    this.currentStreamingMessage = null;
    this.currentStreamingContent = '';
  }

  /**
   * 初始化侧边栏
   */
  init() {
    this.createSidebar();
    this.bindEvents();
    console.log('[Moodesk AI] 侧边栏已初始化');
  }

  /**
   * 创建侧边栏
   */
  createSidebar() {
    this.sidebar = document.createElement('div');
    this.sidebar.className = 'moodesk-ai-sidebar';
    this.sidebar.innerHTML = `
      <!-- 头部 -->
      <div class="moodesk-ai-header">
        <div class="moodesk-ai-header-left">
          <div class="moodesk-ai-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v2"/>
              <path d="M12 20v2"/>
              <path d="M4.93 4.93l1.41 1.41"/>
              <path d="M17.66 17.66l1.41 1.41"/>
              <path d="M2 12h2"/>
              <path d="M20 12h2"/>
              <path d="M6.34 17.66l-1.41 1.41"/>
              <path d="M19.07 4.93l-1.41 1.41"/>
            </svg>
          </div>
          <span class="moodesk-ai-title">Moodesk AI</span>
        </div>
        <div class="moodesk-ai-header-actions">
          <button class="moodesk-ai-header-btn" id="moodesk-ai-clear" title="清除对话">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
          <button class="moodesk-ai-header-btn" id="moodesk-ai-close" title="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 消息区域 -->
      <div class="moodesk-ai-messages" id="moodesk-ai-messages">
        <div class="moodesk-ai-welcome">
          <div class="moodesk-ai-welcome-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h3>你好！我是 Moodesk AI</h3>
          <p>我可以帮你查看作业进度、课程信息，或者回答学习相关的问题。</p>
          <div class="moodesk-ai-suggestions">
            <button class="moodesk-ai-suggestion" data-msg="我有什么作业快截止了？">📝 作业截止提醒</button>
            <button class="moodesk-ai-suggestion" data-msg="帮我看看这周的学习计划">📅 学习计划</button>
            <button class="moodesk-ai-suggestion" data-msg="当前页面是什么内容？">📄 当前页面</button>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="moodesk-ai-input-area">
        <div class="moodesk-ai-input-wrapper">
          <textarea 
            class="moodesk-ai-textarea" 
            id="moodesk-ai-input"
            placeholder="输入你的问题..."
            rows="1"
          ></textarea>
          <button class="moodesk-ai-send-btn" id="moodesk-ai-send" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.sidebar);

    // 获取元素引用
    this.messagesContainer = this.sidebar.querySelector('#moodesk-ai-messages');
    this.textarea = this.sidebar.querySelector('#moodesk-ai-input');
    this.sendBtn = this.sidebar.querySelector('#moodesk-ai-send');
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 关闭按钮
    this.sidebar.querySelector('#moodesk-ai-close').addEventListener('click', () => this.close());

    // 清除对话
    this.sidebar.querySelector('#moodesk-ai-clear').addEventListener('click', () => this.clearChat());

    // 发送按钮
    this.sendBtn.addEventListener('click', () => this.sendMessage());

    // 输入框
    this.textarea.addEventListener('input', () => {
      this.autoResize();
      this.updateSendButton();
    });

    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // 建议按钮
    this.sidebar.querySelectorAll('.moodesk-ai-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = btn.dataset.msg;
        this.textarea.value = msg;
        this.updateSendButton();
        this.sendMessage();
      });
    });

    // Escape 快捷键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  /**
   * 切换侧边栏
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * 打开侧边栏
   */
  open() {
    this.isOpen = true;
    this.sidebar.classList.add('open');
    document.body.classList.add('moodesk-ai-open');
    this.textarea.focus();
  }

  /**
   * 关闭侧边栏
   */
  close() {
    this.isOpen = false;
    this.sidebar.classList.remove('open');
    document.body.classList.remove('moodesk-ai-open');
  }

  /**
   * 自动调整输入框高度
   */
  autoResize() {
    this.textarea.style.height = 'auto';
    this.textarea.style.height = Math.min(this.textarea.scrollHeight, 120) + 'px';
  }

  /**
   * 更新发送按钮状态
   */
  updateSendButton() {
    const hasContent = this.textarea.value.trim().length > 0;
    this.sendBtn.disabled = !hasContent || this.isProcessing;
  }

  /**
   * 发送消息
   */
  async sendMessage() {
    const content = this.textarea.value.trim();
    if (!content || this.isProcessing) return;

    // 清空输入框
    this.textarea.value = '';
    this.autoResize();
    this.updateSendButton();

    // 隐藏欢迎消息
    const welcome = this.messagesContainer.querySelector('.moodesk-ai-welcome');
    if (welcome) welcome.remove();

    // 添加用户消息
    this.addMessage('user', content);

    // 开始处理
    this.isProcessing = true;
    this.updateSendButton();

    // 重置流式状态（不预先创建容器，等 new_message 事件）
    this.currentStreamingContent = '';
    this.currentStreamingMessage = null;

    try {
      // 发送到 background script
      chrome.runtime.sendMessage({
        type: 'AI_CHAT',
        message: content,
        context: this.getContext()
      }, (response) => {
        if (chrome.runtime.lastError) {
          this.finishProcessing();
          this.addError(chrome.runtime.lastError.message);
        }
        // 响应通过 onMessage 处理
      });

    } catch (error) {
      this.finishProcessing();
      this.addError(error.message || '发生未知错误');
    }
  }

  /**
   * 创建流式消息容器
   */
  createStreamingMessage() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'moodesk-ai-message assistant';
    messageDiv.innerHTML = `
      <div class="moodesk-ai-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v2"/><path d="M12 20v2"/>
          <path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/>
        </svg>
      </div>
      <div class="moodesk-ai-bubble markdown-body">
        <span class="moodesk-ai-cursor"></span>
      </div>
    `;
    this.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();
    return messageDiv;
  }

  /**
   * 更新流式消息内容
   */
  updateStreamingContent(newContent) {
    this.currentStreamingContent += newContent;
    
    if (this.currentStreamingMessage) {
      const bubble = this.currentStreamingMessage.querySelector('.moodesk-ai-bubble');
      if (bubble) {
        bubble.innerHTML = this.renderMarkdown(this.currentStreamingContent) + '<span class="moodesk-ai-cursor"></span>';
        this.scrollToBottom();
      }
    }
  }

  /**
   * 完成当前流式消息（不改变 isProcessing 状态）
   */
  finishStreaming() {
    if (this.currentStreamingMessage && this.currentStreamingContent) {
      const bubble = this.currentStreamingMessage.querySelector('.moodesk-ai-bubble');
      if (bubble) {
        // 移除光标，保留最终内容
        bubble.innerHTML = this.renderMarkdown(this.currentStreamingContent);
      }
      
      this.messages.push({ role: 'assistant', content: this.currentStreamingContent });
    }
    
    this.currentStreamingMessage = null;
    this.currentStreamingContent = '';
  }
  
  /**
   * 完成整个对话处理
   */
  finishProcessing() {
    this.finishStreaming();
    this.isProcessing = false;
    this.updateSendButton();
  }

  /**
   * 获取当前上下文
   */
  getContext() {
    return {
      site: window.location.hostname,
      currentPage: document.title,
      url: window.location.href,
      username: this.extractUsername()
    };
  }

  /**
   * 提取用户名
   */
  extractUsername() {
    const userMenu = document.querySelector('.usermenu .usertext, .userbutton .usertext, [data-userid]');
    return userMenu?.textContent?.trim() || '未知用户';
  }

  /**
   * 添加消息
   */
  addMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `moodesk-ai-message ${role}`;
    
    const avatarSvg = role === 'user' 
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/></svg>';

    const formattedContent = role === 'user' ? this.escapeHtml(content) : this.renderMarkdown(content);

    messageDiv.innerHTML = `
      <div class="moodesk-ai-avatar">${avatarSvg}</div>
      <div class="moodesk-ai-bubble ${role === 'assistant' ? 'markdown-body' : ''}">${formattedContent}</div>
    `;

    this.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();

    this.messages.push({ role, content });
    return messageDiv;
  }

  /**
   * 渲染 Markdown
   */
  renderMarkdown(content) {
    if (!content) return '';
    
    let html = this.escapeHtml(content);
    
    // 代码块 (```code```)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="language-${lang || 'plaintext'}">${code.trim()}</code></pre>`;
    });
    
    // 行内代码 (`code`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // 粗体 (**text**)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // 斜体 (*text* 或 _text_)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // 标题
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    
    // 无序列表
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    // 有序列表
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    
    // 链接 [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    
    // 分隔线
    html = html.replace(/^---$/gm, '<hr>');
    
    // 引用块
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    
    // 换行（保留段落）
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    
    // 包装段落
    if (!html.startsWith('<')) {
      html = '<p>' + html + '</p>';
    }
    
    // 清理空段落
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<h[234]>)/g, '$1');
    html = html.replace(/(<\/h[234]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)<\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
    
    return html;
  }

  /**
   * 转义 HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 添加工具调用状态
   */
  addToolStatus(toolName, isDone = false) {
    const statusDiv = document.createElement('div');
    statusDiv.className = `moodesk-ai-tool-status ${isDone ? 'done' : ''}`;
    
    const toolLabels = {
      'get_assignments': '📝 获取作业列表',
      'get_courses': '📚 获取课程列表',
      'get_course_content': '📖 获取课程内容',
      'get_current_page': '📄 分析当前页面',
      'search_resources': '🔍 搜索资源',
      'get_study_stats': '📊 获取学习统计',
      'get_todos': '✅ 获取待办事项',
      'add_todo': '➕ 添加待办事项',
      'get_current_time': '🕐 获取当前时间'
    };

    const label = toolLabels[toolName] || `🔧 ${toolName}`;
    
    statusDiv.innerHTML = isDone
      ? `<svg class="moodesk-ai-tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg><span>${label} 完成</span>`
      : `<div class="moodesk-ai-tool-spinner"></div><span>${label}...</span>`;

    this.messagesContainer.appendChild(statusDiv);
    this.scrollToBottom();

    return statusDiv;
  }

  /**
   * 添加错误消息
   */
  addError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'moodesk-ai-error';
    errorDiv.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>${this.escapeHtml(message)}</span>
    `;
    this.messagesContainer.appendChild(errorDiv);
    this.scrollToBottom();
    
    this.isProcessing = false;
    this.updateSendButton();
  }

  /**
   * 滚动到底部
   */
  scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    });
  }

  /**
   * 清除对话
   */
  clearChat() {
    this.messages = [];
    this.currentStreamingMessage = null;
    this.currentStreamingContent = '';
    
    this.messagesContainer.innerHTML = `
      <div class="moodesk-ai-welcome">
        <div class="moodesk-ai-welcome-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <h3>对话已清除</h3>
        <p>有什么我可以帮助你的吗？</p>
        <div class="moodesk-ai-suggestions">
          <button class="moodesk-ai-suggestion" data-msg="我有什么作业快截止了？">📝 作业截止提醒</button>
          <button class="moodesk-ai-suggestion" data-msg="帮我看看这周的学习计划">📅 学习计划</button>
          <button class="moodesk-ai-suggestion" data-msg="当前页面是什么内容？">📄 当前页面</button>
        </div>
      </div>
    `;

    // 重新绑定建议按钮事件
    this.messagesContainer.querySelectorAll('.moodesk-ai-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = btn.dataset.msg;
        this.textarea.value = msg;
        this.updateSendButton();
        this.sendMessage();
      });
    });

    // 通知 background 清除历史
    chrome.runtime.sendMessage({ type: 'AI_CLEAR_HISTORY' });
  }

  /**
   * 处理来自 background 的更新（流式）
   */
  handleAgentUpdate(update) {
    switch (update.type) {
      case 'new_message':
        // 开始新的消息气泡
        this.finishStreaming(); // 先结束之前的（如果有）
        this.currentStreamingContent = '';
        this.currentStreamingMessage = this.createStreamingMessage();
        break;
        
      case 'stream_chunk':
        // 流式内容块
        // 如果没有当前消息容器，创建一个
        if (!this.currentStreamingMessage) {
          this.currentStreamingContent = '';
          this.currentStreamingMessage = this.createStreamingMessage();
        }
        this.updateStreamingContent(update.content);
        break;
        
      case 'message_end':
        // 当前消息气泡结束，完成整个处理
        this.finishProcessing();
        break;

      case 'tool_start':
        // 工具调用开始前，先结束当前的流式消息（但不结束处理）
        this.finishStreaming();
        update.tools.forEach(tool => {
          this.addToolStatus(tool, false);
        });
        break;

      case 'tool_result':
        // 更新工具状态为完成
        const statusElements = this.messagesContainer.querySelectorAll('.moodesk-ai-tool-status:not(.done)');
        if (statusElements.length > 0) {
          statusElements[0].classList.add('done');
          const span = statusElements[0].querySelector('span');
          if (span) span.textContent = span.textContent.replace('...', ' 完成');
          const spinner = statusElements[0].querySelector('.moodesk-ai-tool-spinner');
          if (spinner) {
            spinner.outerHTML = '<svg class="moodesk-ai-tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
          }
        }
        break;

      case 'error':
        this.finishProcessing();
        this.addError(update.error);
        break;
    }
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AISidebar };
}
