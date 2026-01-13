// remoteConfigManager.js
// 远程站点配置管理器 - 从 GitHub 加载站点样式配置

class RemoteConfigManager {
  constructor() {
    // 默认远程配置 URL（托管在 GitHub）
    this.defaultConfigUrl = 'https://raw.githubusercontent.com/Pama-Lee/moodesk-themes/refs/heads/main/site-themes.json';
    // 默认备用 URL
    this.defaultFallbackUrl = 'https://cdn.jsdelivr.net/gh/Pama-Lee/moodesk-themes@main/site-themes.json';
    
    // 实际使用的 URL（可通过设置页面修改）
    this.configUrl = this.defaultConfigUrl;
    this.fallbackUrl = this.defaultFallbackUrl;
    
    // 存储键名（与 popup 保持一致）
    this.urlStorageKey = 'moodeskRemoteConfigUrl';
    this.fallbackUrlStorageKey = 'moodeskRemoteFallbackUrl';
    
    // 缓存配置
    this.cacheKey = 'moodeskRemoteConfig';
    this.cacheTimeKey = 'moodeskRemoteConfigLastFetch';
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24小时缓存
    
    // 当前配置
    this.config = null;
    this.isLoaded = false;
    
    // 内置默认配置（离线备用）
    this.defaultConfig = this.getDefaultConfig();
    
    // 监听配置更新消息
    this.setupMessageListener();
  }
  
  /**
   * 设置消息监听器，用于接收 popup 的配置更新通知
   */
  setupMessageListener() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'RELOAD_CONFIG') {
          console.log('[RemoteConfig] 收到配置更新通知，重新加载...');
          this.isLoaded = false;
          this.config = null;
          this.init().then(() => {
            console.log('[RemoteConfig] 配置已重新加载');
            // 重新应用样式
            if (typeof siteStyleManager !== 'undefined') {
              siteStyleManager.isApplied = false;
              siteStyleManager.init();
            }
          });
        }
      });
    }
  }

  /**
   * 获取内置默认配置
   */
  getDefaultConfig() {
    return {
      version: '1.0.0',
      sites: {
        'l.xmu.edu.my': {
          name: 'XMUM Moodle',
          theme: 'default',
          selectors: {
            pageContent: '#page-content',
            courseTitle: '.page-header-headings h1, h1',
            mainRegion: '#region-main',
            todoInsertPoint: '#region-main-box, #region-main',
            // 待完成作业组件插入位置（默认使用与 todo 不同的区域）
            assignmentInsertPoint: '#page-content'
          },
          hideElements: [],
          customStyles: {},
          features: {
            todo: true,
            pdf: true,
            analytics: true,
            courseSwitcher: true,
            resourceManager: true,
            assignmentTracker: true,
            search: true
          }
        },
        'ukmfolio.ukm.my': {
          name: 'UKM Folio',
          theme: 'ukm-minimal',
          selectors: {
            pageContent: '#page-content',
            courseTitle: 'h1',
            mainRegion: '[role="main"], #region-main',
            todoInsertPoint: '.course-content, #region-main',
            assignmentInsertPoint: '#page-content'
          },
          hideElements: [],
          customStyles: {},
          features: {
            todo: true,
            pdf: true,
            analytics: true,
            courseSwitcher: true,
            resourceManager: true,
            assignmentTracker: true,
            search: true
          }
        }
      },
      themes: {
        'default': {
          primary: '#1a73e8',
          secondary: '#4285f4',
          accent: '#ea4335'
        },
        'ukm-minimal': {
          primary: '#0066b3',
          secondary: '#00a8e8',
          accent: '#ff6b00'
        }
      }
    };
  }

  /**
   * 初始化并加载配置
   */
  async init() {
    try {
      // 先加载用户自定义的配置 URL
      await this.loadCustomUrls();
      
      // 尝试从缓存加载
      const cached = await this.loadFromCache();
      if (cached) {
        this.config = cached;
        this.isLoaded = true;
        console.log('[Moodesk Config] 从缓存加载配置');
        
        // 后台检查更新
        this.checkForUpdates();
      } else {
        // 从远程加载
        await this.loadFromRemote();
      }
    } catch (error) {
      console.warn('[Moodesk Config] 加载配置失败，使用默认配置:', error);
      this.config = this.defaultConfig;
      this.isLoaded = true;
    }
    
    return this.config;
  }

  /**
   * 加载用户自定义的配置 URL
   */
  async loadCustomUrls() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const result = await chrome.storage.local.get([
          this.urlStorageKey,
          this.fallbackUrlStorageKey
        ]);
        
        if (result[this.urlStorageKey]) {
          this.configUrl = result[this.urlStorageKey];
          console.log('[Moodesk Config] 使用自定义配置 URL:', this.configUrl);
        }
        
        if (result[this.fallbackUrlStorageKey]) {
          this.fallbackUrl = result[this.fallbackUrlStorageKey];
        }
      }
    } catch (error) {
      console.warn('[Moodesk Config] 加载自定义 URL 失败:', error);
    }
  }

  /**
   * 从缓存加载配置
   */
  async loadFromCache() {
    try {
      const result = await chrome.storage.local.get([this.cacheKey, this.cacheTimeKey]);
      const config = result[this.cacheKey];
      const cacheTime = result[this.cacheTimeKey];
      
      if (config && cacheTime) {
        const age = Date.now() - cacheTime;
        if (age < this.cacheExpiry) {
          return config;
        }
      }
    } catch (error) {
      console.warn('[Moodesk Config] 缓存读取失败:', error);
    }
    return null;
  }

  /**
   * 从远程加载配置
   */
  async loadFromRemote() {
    let config = null;
    
    // 尝试主 URL
    try {
      const response = await fetch(this.configUrl, { 
        cache: 'no-cache',
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        config = await response.json();
        console.log('[Moodesk Config] 从主 URL 加载配置成功');
      }
    } catch (error) {
      console.warn('[Moodesk Config] 主 URL 加载失败:', error);
    }
    
    // 尝试备用 URL
    if (!config) {
      try {
        const response = await fetch(this.fallbackUrl, { 
          cache: 'no-cache',
          headers: { 'Accept': 'application/json' }
        });
        if (response.ok) {
          config = await response.json();
          console.log('[Moodesk Config] 从备用 URL 加载配置成功');
        }
      } catch (error) {
        console.warn('[Moodesk Config] 备用 URL 加载失败:', error);
      }
    }
    
    if (config) {
      // 合并默认配置（确保新站点也有基本配置）
      this.config = this.mergeWithDefault(config);
      this.isLoaded = true;
      
      // 保存到缓存
      await this.saveToCache(this.config);
    } else {
      // 使用默认配置
      this.config = this.defaultConfig;
      this.isLoaded = true;
    }
    
    return this.config;
  }

  /**
   * 合并远程配置和默认配置
   */
  mergeWithDefault(remoteConfig) {
    return {
      ...this.defaultConfig,
      ...remoteConfig,
      sites: {
        ...this.defaultConfig.sites,
        ...remoteConfig.sites
      },
      themes: {
        ...this.defaultConfig.themes,
        ...remoteConfig.themes
      }
    };
  }

  /**
   * 保存配置到缓存
   */
  async saveToCache(config) {
    try {
      await chrome.storage.local.set({
        [this.cacheKey]: config,
        [this.cacheTimeKey]: Date.now()
      });
      console.log('[Moodesk Config] 配置已缓存');
    } catch (error) {
      console.warn('[Moodesk Config] 缓存保存失败:', error);
    }
  }

  /**
   * 检查更新（后台静默更新）
   */
  async checkForUpdates() {
    try {
      const response = await fetch(this.configUrl, { 
        cache: 'no-cache',
        headers: { 'Accept': 'application/json' }
      });
      
      if (response.ok) {
        const newConfig = await response.json();
        
        // 比较版本
        if (newConfig.version !== this.config?.version) {
          console.log('[Moodesk Config] 发现新版本配置:', newConfig.version);
          this.config = this.mergeWithDefault(newConfig);
          await this.saveToCache(this.config);
          
          // 通知页面刷新可能需要
          this.notifyConfigUpdate(newConfig.version);
        }
      }
    } catch (error) {
      // 静默失败
    }
  }

  /**
   * 通知配置更新
   */
  notifyConfigUpdate(version) {
    // 可以显示一个小提示
    console.log(`[Moodesk Config] 配置已更新到 ${version}，刷新页面生效`);
  }

  /**
   * 获取当前站点配置
   */
  getSiteConfig(hostname) {
    if (!this.config?.sites) {
      return this.defaultConfig.sites[hostname] || this.createGenericConfig(hostname);
    }
    
    // 精确匹配
    if (this.config.sites[hostname]) {
      return this.config.sites[hostname];
    }
    
    // 通配符匹配
    for (const pattern of Object.keys(this.config.sites)) {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (regex.test(hostname)) {
          return this.config.sites[pattern];
        }
      }
    }
    
    // 返回通用配置
    return this.createGenericConfig(hostname);
  }

  /**
   * 创建通用站点配置
   */
  createGenericConfig(hostname) {
    return {
      name: hostname,
      theme: 'default',
      selectors: {
        pageContent: '#page-content, #page, .pagelayout-standard',
        courseTitle: 'h1',
        mainRegion: '#region-main, [role="main"], main',
        todoInsertPoint: '#region-main, .course-content',
        assignmentInsertPoint: '#page-content, #region-main, .course-content'
      },
      hideElements: [],
      customStyles: {},
      features: {
        todo: true,
        pdf: true,
        analytics: true,
        courseSwitcher: true,
        resourceManager: true,
        assignmentTracker: true,
        search: true
      }
    };
  }

  /**
   * 获取主题配置
   */
  getTheme(themeName) {
    return this.config?.themes?.[themeName] || this.defaultConfig.themes.default;
  }

  /**
   * 强制刷新配置
   */
  async forceRefresh() {
    await chrome.storage.local.remove([this.cacheKey, this.cacheTimeKey]);
    return this.loadFromRemote();
  }
}

// 创建全局实例
const remoteConfigManager = new RemoteConfigManager();

