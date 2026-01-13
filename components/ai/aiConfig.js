// aiConfig.js
// Moodesk AI 配置管理

const AI_CONFIG_KEYS = {
  apiHost: 'moodesk_ai_api_host',
  apiKey: 'moodesk_ai_api_key',
  model: 'moodesk_ai_model',
  enabled: 'moodesk_ai_enabled'
};

const DEFAULT_AI_CONFIG = {
  apiHost: 'https://api.openai.com',
  apiKey: '',
  model: 'gpt-4o-mini',
  enabled: false
};

// 支持的模型列表
// 说明：
// - OpenAI/Anthropic/DeepSeek 等走 OpenAI 兼容 /v1/chat/completions 或各自官方接口
// - Gemini 模型推荐通过 OpenRouter 等 OpenAI 兼容网关使用（模型 ID 使用官方命名）
//   例如：在 OpenRouter 上可以直接使用 gemini-1.5-flash / gemini-1.5-pro 等模型 ID
const SUPPORTED_MODELS = [
  // OpenAI
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },

  // Anthropic (Claude)
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic' },

  // DeepSeek
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek' },

  // Google Gemini 系列（通过 OpenAI 兼容网关，如 OpenRouter）
  // 参考模型版本：Gemini 1.5 / 2.0 / 2.5 / 3.0 等 [来源: Google Gemini 模型系列介绍](https://en.wikipedia.org/wiki/Gemini_%28language_model%29?utm_source=openai)
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini' },
  { id: 'gemini-3.0-pro', name: 'Gemini 3.0 Pro', provider: 'gemini' }
];

// 预设的 API Host
const PRESET_HOSTS = [
  { name: 'OpenAI', url: 'https://api.openai.com' },
  { name: 'Anthropic', url: 'https://api.anthropic.com' },
  { name: 'DeepSeek', url: 'https://api.deepseek.com' },
  // Google Gemini OpenAI 兼容接口（官方推荐方式）
  // 文档示例：baseURL = https://generativelanguage.googleapis.com/v1beta/openai/
  { name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api' },
  { name: '自定义', url: '' }
];

class AIConfigManager {
  constructor() {
    this.config = { ...DEFAULT_AI_CONFIG };
    this.isLoaded = false;
  }

  /**
   * 加载配置
   */
  async load() {
    if (this.isLoaded) return this.config;

    try {
      const result = await chrome.storage.local.get(Object.values(AI_CONFIG_KEYS));
      
      this.config = {
        apiHost: result[AI_CONFIG_KEYS.apiHost] || DEFAULT_AI_CONFIG.apiHost,
        apiKey: result[AI_CONFIG_KEYS.apiKey] || DEFAULT_AI_CONFIG.apiKey,
        model: result[AI_CONFIG_KEYS.model] || DEFAULT_AI_CONFIG.model,
        enabled: result[AI_CONFIG_KEYS.enabled] || DEFAULT_AI_CONFIG.enabled
      };

      this.isLoaded = true;
      console.log('[Moodesk AI] 配置已加载');
    } catch (error) {
      console.error('[Moodesk AI] 加载配置失败:', error);
    }

    return this.config;
  }

  /**
   * 保存配置
   */
  async save(config) {
    try {
      const dataToSave = {
        [AI_CONFIG_KEYS.apiHost]: config.apiHost,
        [AI_CONFIG_KEYS.apiKey]: config.apiKey,
        [AI_CONFIG_KEYS.model]: config.model,
        [AI_CONFIG_KEYS.enabled]: config.enabled
      };

      await chrome.storage.local.set(dataToSave);
      this.config = { ...config };
      console.log('[Moodesk AI] 配置已保存');
      return true;
    } catch (error) {
      console.error('[Moodesk AI] 保存配置失败:', error);
      return false;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * 检查配置是否有效
   */
  isConfigValid() {
    return !!(this.config.apiHost && this.config.apiKey && this.config.model);
  }

  /**
   * 检查 AI 是否启用
   */
  isEnabled() {
    return this.config.enabled && this.isConfigValid();
  }

  /**
   * 获取支持的模型列表
   */
  getSupportedModels() {
    return SUPPORTED_MODELS;
  }

  /**
   * 获取预设 Host 列表
   */
  getPresetHosts() {
    return PRESET_HOSTS;
  }
}

// 导出单例
const aiConfigManager = new AIConfigManager();

// 兼容不同环境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AIConfigManager, aiConfigManager, AI_CONFIG_KEYS, SUPPORTED_MODELS, PRESET_HOSTS };
}

