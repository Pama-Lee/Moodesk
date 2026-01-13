// siteStyleManager.js
// 站点样式管理器 - 应用远程配置的样式、隐藏元素等

class SiteStyleManager {
  constructor() {
    this.hostname = window.location.hostname;
    this.siteConfig = null;
    this.styleElement = null;
    this.isApplied = false;
  }

  /**
   * 初始化样式管理器
   */
  async init() {
    try {
      // 等待远程配置加载
      await remoteConfigManager.init();
      
      // 获取当前站点配置
      this.siteConfig = remoteConfigManager.getSiteConfig(this.hostname);
      
      if (this.siteConfig) {
        console.log(`[Moodesk Style] 应用站点配置: ${this.siteConfig.name}`);
        this.applyStyles();
      }
      
      return this.siteConfig;
    } catch (error) {
      console.error('[Moodesk Style] 初始化失败:', error);
      return null;
    }
  }

  /**
   * 应用所有样式
   */
  applyStyles() {
    if (this.isApplied) return;
    
    // 创建样式元素
    this.styleElement = document.createElement('style');
    this.styleElement.id = 'moodesk-site-styles';
    
    let cssRules = [];
    
    // 1. 应用隐藏元素规则
    if (this.siteConfig.hideElements?.length > 0) {
      cssRules.push(this.generateHideRules(this.siteConfig.hideElements));
    }
    
    // 2. 应用自定义样式
    if (this.siteConfig.customStyles) {
      cssRules.push(this.generateCustomStyles(this.siteConfig.customStyles));
    }
    
    // 3. 应用主题变量
    if (this.siteConfig.theme) {
      const theme = remoteConfigManager.getTheme(this.siteConfig.theme);
      cssRules.push(this.generateThemeVariables(theme));
    }
    
    // 4. 应用布局调整
    if (this.siteConfig.layoutAdjustments) {
      cssRules.push(this.generateLayoutAdjustments(this.siteConfig.layoutAdjustments));
    }
    
    this.styleElement.textContent = cssRules.join('\n');
    document.head.appendChild(this.styleElement);
    
    // 5. 执行 DOM 操作（如果有）
    if (this.siteConfig.domOperations) {
      this.executeDomOperations(this.siteConfig.domOperations);
    }

    console.log('[Moodesk Style] 执行 DOM 操作:', this.siteConfig);
    
    // 6. 注入自定义元素（如果有）
    if (this.siteConfig.injectElements) {
      console.log('[Moodesk Style] 注入元素:', this.siteConfig.injectElements);
      this.injectElements(this.siteConfig.injectElements);
    }
    
    this.isApplied = true;
    console.log('[Moodesk Style] 样式已应用');
  }

  /**
   * 生成隐藏元素的 CSS 规则
   */
  generateHideRules(elements) {
    if (!elements || elements.length === 0) return '';
    
    const rules = elements.map(item => {
      if (typeof item === 'string') {
        // 简单选择器
        return `${item} { display: none !important; }`;
      } else if (typeof item === 'object') {
        // 带条件的选择器
        const { selector, condition, style } = item;
        
        // 检查条件
        if (condition) {
          if (condition.path && !window.location.pathname.includes(condition.path)) {
            return '';
          }
          if (condition.notPath && window.location.pathname.includes(condition.notPath)) {
            return '';
          }
        }
        
        // 自定义隐藏样式或默认隐藏
        const hideStyle = style || 'display: none !important;';
        return `${selector} { ${hideStyle} }`;
      }
      return '';
    }).filter(r => r);
    
    return `/* 隐藏元素 */\n${rules.join('\n')}`;
  }

  /**
   * 生成自定义样式
   */
  generateCustomStyles(styles) {
    if (!styles || Object.keys(styles).length === 0) return '';
    
    const rules = [];
    
    for (const [selector, properties] of Object.entries(styles)) {
      if (typeof properties === 'string') {
        // CSS 字符串
        rules.push(`${selector} { ${properties} }`);
      } else if (typeof properties === 'object') {
        // 属性对象
        const props = Object.entries(properties)
          .map(([prop, value]) => `${this.camelToKebab(prop)}: ${value} !important`)
          .join('; ');
        rules.push(`${selector} { ${props}; }`);
      }
    }
    
    return `/* 自定义样式 */\n${rules.join('\n')}`;
  }

  /**
   * 生成主题 CSS 变量
   */
  generateThemeVariables(theme) {
    if (!theme) return '';
    
    const variables = Object.entries(theme)
      .map(([name, value]) => `--moodesk-${this.camelToKebab(name)}: ${value}`)
      .join(';\n  ');
    
    return `/* 主题变量 */\n:root {\n  ${variables};\n}`;
  }

  /**
   * 生成布局调整样式
   */
  generateLayoutAdjustments(adjustments) {
    if (!adjustments) return '';
    
    const rules = [];
    
    // 调整主内容区域宽度
    if (adjustments.mainContentWidth) {
      rules.push(`#region-main, [role="main"] { max-width: ${adjustments.mainContentWidth} !important; }`);
    }
    
    // 调整侧边栏
    if (adjustments.hideSidebar) {
      rules.push(`#block-region-side-pre, #block-region-side-post, .block-region { display: none !important; }`);
    }
    
    // 调整页面边距
    if (adjustments.pagePadding) {
      rules.push(`#page-content { padding: ${adjustments.pagePadding} !important; }`);
    }
    
    // 全宽模式
    if (adjustments.fullWidth) {
      rules.push(`
        #page, #page-content, .container-fluid { 
          max-width: 100% !important; 
          padding-left: 20px !important;
          padding-right: 20px !important;
        }
      `);
    }
    
    return `/* 布局调整 */\n${rules.join('\n')}`;
  }

  /**
   * 执行 DOM 操作
   */
  executeDomOperations(operations) {
    if (!operations || operations.length === 0) return;
    
    operations.forEach(op => {
      try {
        switch (op.type) {
          case 'remove':
            document.querySelectorAll(op.selector).forEach(el => el.remove());
            break;
            
          case 'addClass':
            document.querySelectorAll(op.selector).forEach(el => {
              el.classList.add(...op.classes);
            });
            break;
            
          case 'removeClass':
            document.querySelectorAll(op.selector).forEach(el => {
              el.classList.remove(...op.classes);
            });
            break;
            
          case 'setAttribute':
            document.querySelectorAll(op.selector).forEach(el => {
              el.setAttribute(op.attribute, op.value);
            });
            break;
            
          case 'moveElement':
            const elements = document.querySelectorAll(op.selector);
            const target = document.querySelector(op.target);
            if (target) {
              elements.forEach(el => {
                if (op.position === 'before') {
                  target.parentNode.insertBefore(el, target);
                } else if (op.position === 'after') {
                  target.parentNode.insertBefore(el, target.nextSibling);
                } else {
                  target.appendChild(el);
                }
              });
            }
            break;
        }
      } catch (error) {
        console.warn('[Moodesk Style] DOM 操作失败:', op, error);
      }
    });
  }

  /**
   * 注入自定义元素
   * 支持通过远程配置在页面中添加新的 HTML 元素
   */
  injectElements(elements) {
    if (!elements || elements.length === 0) return;

    console.log('[Moodesk Style] 注入元素:', elements);
    
    elements.forEach(config => {
      try {
        // 检查条件
        if (config.condition) {
          if (config.condition.path && !window.location.pathname.includes(config.condition.path)) {
            return;
          }
          if (config.condition.notPath && window.location.pathname.includes(config.condition.notPath)) {
            return;
          }
          if (config.condition.hostname && window.location.hostname !== config.condition.hostname) {
            return;
          }
        }
        
        // 检查是否已存在（避免重复注入）
        if (config.id && document.getElementById(config.id)) {
          console.log(`[Moodesk Style] 元素已存在，跳过注入: #${config.id}`);
          return;
        }
        
        // 查找目标容器
        const container = document.querySelector(config.target);
        if (!container) {
          console.warn(`[Moodesk Style] 找不到目标容器: ${config.target}`);
          return;
        }
        
        // 创建元素
        const element = this.createElement(config);
        if (!element) return;
        
        // 插入元素
        switch (config.position) {
          case 'prepend':
            container.insertBefore(element, container.firstChild);
            break;
          case 'before':
            container.parentNode.insertBefore(element, container);
            break;
          case 'after':
            container.parentNode.insertBefore(element, container.nextSibling);
            break;
          case 'append':
          default:
            container.appendChild(element);
            break;
        }
        
        // 绑定事件
        if (config.events) {
          // 如果配置了 eventTarget，则绑定到子元素上
          const eventTarget = config.eventTarget 
            ? element.querySelector(config.eventTarget) || element
            : element;
          this.bindElementEvents(eventTarget, config.events);
        }
        
        console.log(`[Moodesk Style] 元素已注入: ${config.id || config.tag}`);
      } catch (error) {
        console.warn('[Moodesk Style] 注入元素失败:', config, error);
      }
    });
  }

  /**
   * 创建 HTML 元素
   */
  createElement(config) {
    // 如果提供了 HTML 字符串，直接解析
    if (config.html) {
      const template = document.createElement('template');
      template.innerHTML = config.html.trim();
      const element = template.content.firstChild;
      if (config.id) element.id = config.id;
      return element;
    }
    
    // 否则通过配置创建元素
    const element = document.createElement(config.tag || 'div');
    
    if (config.id) element.id = config.id;
    if (config.className) element.className = config.className;
    if (config.text) element.textContent = config.text;
    if (config.innerHTML) element.innerHTML = config.innerHTML;
    
    // 设置属性
    if (config.attributes) {
      for (const [key, value] of Object.entries(config.attributes)) {
        element.setAttribute(key, value);
      }
    }
    
    // 设置样式
    if (config.style) {
      if (typeof config.style === 'string') {
        element.style.cssText = config.style;
      } else {
        for (const [key, value] of Object.entries(config.style)) {
          element.style[key] = value;
        }
      }
    }
    
    // 创建子元素
    if (config.children) {
      config.children.forEach(childConfig => {
        const child = this.createElement(childConfig);
        if (child) element.appendChild(child);
      });
    }
    
    return element;
  }

  /**
   * 绑定元素事件
   */
  bindElementEvents(element, events) {
    for (const [eventName, handler] of Object.entries(events)) {
      try {
        // 支持预定义的动作
        if (typeof handler === 'object') {
          switch (handler.action) {
            case 'navigate':
              element.addEventListener(eventName, () => {
                window.location.href = handler.url;
              });
              break;
              
            case 'openWindow':
              element.addEventListener(eventName, () => {
                window.open(handler.url, handler.target || '_blank');
              });
              break;
              
            case 'toggle':
              element.addEventListener(eventName, () => {
                const target = document.querySelector(handler.target);
                if (target) target.classList.toggle(handler.class || 'hidden');
              });
              break;
              
            case 'addClass':
              element.addEventListener(eventName, () => {
                const target = document.querySelector(handler.target);
                if (target) target.classList.add(handler.class);
              });
              break;
              
            case 'removeClass':
              element.addEventListener(eventName, () => {
                const target = document.querySelector(handler.target);
                if (target) target.classList.remove(handler.class);
              });
              break;
              
            case 'call':
              // 调用全局函数或 Moodesk 模块方法
              element.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.executeAction(handler);
              });
              break;
          }
        }
      } catch (error) {
        console.warn('[Moodesk Style] 绑定事件失败:', eventName, handler, error);
      }
    }
  }

  /**
   * 执行自定义动作
   */
  executeAction(handler) {
    try {
      console.log('[Moodesk Style] 执行动作:', handler);
      
      // 支持调用 Moodesk 模块的方法
      if (handler.module && handler.method) {
        // 尝试多种方式查找模块
        const module = window[handler.module] 
          || window.moodesk?.[handler.module]
          || window.moodesk?.authModule;  // 特殊处理 authModule
        
        console.log('[Moodesk Style] 找到模块:', handler.module, module);
        
        if (module && typeof module[handler.method] === 'function') {
          console.log('[Moodesk Style] 调用方法:', handler.method);
          module[handler.method](...(handler.args || []));
        } else {
          console.warn('[Moodesk Style] 模块或方法未找到:', handler.module, handler.method);
        }
      }
      // 支持调用全局函数
      else if (handler.function && typeof window[handler.function] === 'function') {
        window[handler.function](...(handler.args || []));
      }
    } catch (error) {
      console.warn('[Moodesk Style] 执行动作失败:', handler, error);
    }
  }

  /**
   * 驼峰转短横线
   */
  camelToKebab(str) {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * 获取选择器
   */
  getSelector(name) {
    return this.siteConfig?.selectors?.[name] || null;
  }

  /**
   * 检查功能是否启用
   */
  isFeatureEnabled(featureName) {
    return this.siteConfig?.features?.[featureName] !== false;
  }

  /**
   * 动态添加隐藏规则
   */
  hideElement(selector) {
    if (!this.styleElement) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'moodesk-site-styles';
      document.head.appendChild(this.styleElement);
    }
    
    this.styleElement.textContent += `\n${selector} { display: none !important; }`;
  }

  /**
   * 动态添加样式
   */
  addCustomStyle(selector, styles) {
    if (!this.styleElement) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = 'moodesk-site-styles';
      document.head.appendChild(this.styleElement);
    }
    
    const props = typeof styles === 'string' 
      ? styles 
      : Object.entries(styles).map(([k, v]) => `${this.camelToKebab(k)}: ${v} !important`).join('; ');
    
    this.styleElement.textContent += `\n${selector} { ${props}; }`;
  }

  /**
   * 移除所有应用的样式
   */
  removeStyles() {
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }
    this.isApplied = false;
  }

  /**
   * 获取站点配置
   */
  getConfig() {
    return this.siteConfig;
  }
}

// 创建全局实例
const siteStyleManager = new SiteStyleManager();

