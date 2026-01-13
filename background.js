// background.js
// Moodesk 后台服务脚本 - 处理跨域认证请求

// 用于存储捕获的 moodlemobile:// token URL
let capturedTokenUrl = null;
let tokenCaptureResolve = null;

// 监听重定向，捕获 moodlemobile:// URL
chrome.webRequest.onBeforeRedirect.addListener(
  (details) => {
    if (details.redirectUrl && details.redirectUrl.startsWith('moodlemobile://')) {
      console.log('[Background] 捕获到 moodlemobile 重定向:', details.redirectUrl);
      capturedTokenUrl = details.redirectUrl;
      
      // 如果有等待的 Promise，resolve 它
      if (tokenCaptureResolve) {
        tokenCaptureResolve(details.redirectUrl);
        tokenCaptureResolve = null;
      }
    }
  },
  { urls: ['https://*.ukm.my/*', 'https://*.ukm.edu.my/*', 'https://*.xmu.edu.my/*'] }
);

/**
 * SAML SSO Token 获取器
 */
class SamlTokenFetcher {
  constructor() {
    this.cookieStore = new Map();
  }

  /**
   * 清除 cookies
   */
  clearCookies() {
    this.cookieStore.clear();
  }

  /**
   * 从浏览器获取指定域的 cookies
   */
  async getBrowserCookies(url) {
    try {
      const urlObj = new URL(url);
      const cookies = await chrome.cookies.getAll({ domain: urlObj.hostname });
      if (cookies.length > 0) {
        return cookies.map(c => `${c.name}=${c.value}`).join('; ');
      }
      // 尝试获取父域的 cookies（如 .ukm.my）
      const parts = urlObj.hostname.split('.');
      if (parts.length >= 2) {
        const parentDomain = '.' + parts.slice(-2).join('.');
        const parentCookies = await chrome.cookies.getAll({ domain: parentDomain });
        if (parentCookies.length > 0) {
          return parentCookies.map(c => `${c.name}=${c.value}`).join('; ');
        }
      }
    } catch (e) {
      console.log('[Background] 获取浏览器 cookies 失败:', e);
    }
    return '';
  }

  /**
   * 获取请求头（包含浏览器 cookies 和本地 cookies）
   */
  async getHeaders(url, extraHeaders = {}) {
    const localCookies = this.cookieStore.get(new URL(url).hostname) || '';
    const browserCookies = await this.getBrowserCookies(url);
    
    // 合并 cookies
    let allCookies = '';
    if (browserCookies && localCookies) {
      allCookies = `${browserCookies}; ${localCookies}`;
    } else {
      allCookies = browserCookies || localCookies;
    }

    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      ...(allCookies ? { 'Cookie': allCookies } : {}),
      ...extraHeaders
    };
  }

  /**
   * 保存响应中的 cookies
   */
  saveCookies(url, response) {
    const setCookies = response.headers.get('set-cookie');
    if (setCookies) {
      const hostname = new URL(url).hostname;
      const existing = this.cookieStore.get(hostname) || '';
      const newCookies = setCookies.split(',').map(c => c.split(';')[0].trim()).join('; ');
      this.cookieStore.set(hostname, existing ? `${existing}; ${newCookies}` : newCookies);
    }
  }

  /**
   * 执行请求并跟随重定向
   */
  async fetchWithRedirects(url, options = {}, maxRedirects = 10) {
    let currentUrl = url;
    let response;

    for (let i = 0; i < maxRedirects; i++) {
      response = await fetch(currentUrl, {
        ...options,
        headers: await this.getHeaders(currentUrl, options.headers),
        redirect: 'manual'
      });

      this.saveCookies(currentUrl, response);

      const location = response.headers.get('location');
      if (!location) break;

      // 检查是否是 moodlemobile:// URL
      if (location.startsWith('moodlemobile://')) {
        return { response, finalUrl: location };
      }

      currentUrl = location.startsWith('http') 
        ? location 
        : new URL(location, currentUrl).toString();
    }

    return { response, finalUrl: null };
  }

  /**
   * 从 HTML 中提取表单数据
   */
  extractFormData(html) {
    const actionMatch = html.match(/<form[^>]*action="([^"]*)"[^>]*>/i);
    const action = actionMatch ? actionMatch[1].replace(/&amp;/g, '&') : null;
    
    const inputs = {};
    const inputRegex = /<input[^>]*name="([^"]*)"[^>]*value="([^"]*)"[^>]*/gi;
    let match;
    while ((match = inputRegex.exec(html)) !== null) {
      inputs[match[1]] = match[2].replace(/&amp;/g, '&');
    }

    return { action, inputs };
  }

  /**
   * 从 Base64 token 中提取 wstoken
   */
  extractWsToken(base64Token) {
    try {
      const decoded = atob(base64Token);
      const parts = decoded.split(':::');
      return parts.length >= 2 ? parts[1] : null;
    } catch (e) {
      console.error('[Background] Base64 解码失败:', e);
      return null;
    }
  }

  /**
   * 获取已登录用户的 Token
   */
  async getTokenForLoggedInUser(launchUrl) {
    try {
      console.log('[Background] 尝试获取 token:', launchUrl);
      
      const { response, finalUrl } = await this.fetchWithRedirects(launchUrl);

      if (finalUrl && finalUrl.includes('token=')) {
        const match = finalUrl.match(/token=([A-Za-z0-9+/=]+)/);
        if (match) {
          const wstoken = this.extractWsToken(match[1]);
          console.log('[Background] 成功获取 token');
          return { success: true, token: wstoken };
        }
      }

      const location = response.headers.get('location');
      if (location && location.includes('token=')) {
        const match = location.match(/token=([A-Za-z0-9+/=]+)/);
        if (match) {
          const wstoken = this.extractWsToken(match[1]);
          return { success: true, token: wstoken };
        }
      }

      return { success: false, needsLogin: true };
    } catch (error) {
      console.error('[Background] 获取 token 失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 执行完整的 SAML SSO 登录流程
   */
  async performSamlLogin(launchUrl, username, password, ssoConfig) {
    try {
      console.log('[Background] 开始 SAML 登录流程');
      console.log('[Background] Launch URL:', launchUrl);
      
      this.clearCookies();

      // 步骤1: 访问 launch.php，使用 redirect: 'follow' 自动跟随所有重定向
      console.log('[Background] 步骤1: 访问 launch.php (自动跟随重定向)...');
      
      let html = '';
      let authState = null;
      
      const headers = await this.getHeaders(launchUrl);
      console.log('[Background] 请求头 Cookie:', headers.Cookie?.substring(0, 100) || '无');
      
      const response = await fetch(launchUrl, {
        method: 'GET',
        headers: headers,
        redirect: 'follow'  // 自动跟随所有重定向
      });
      
      console.log('[Background] 最终 URL:', response.url);
      console.log('[Background] 响应状态:', response.status);
      
      // 检查最终 URL 是否包含 token（用户已登录的情况）
      if (response.url.includes('token=')) {
        const match = response.url.match(/token=([A-Za-z0-9+/=]+)/);
        if (match) {
          const wstoken = this.extractWsToken(match[1]);
          console.log('[Background] 用户已登录，直接获取到 token');
          return { success: true, token: wstoken };
        }
      }
      
      // 读取最终页面内容
      html = await response.text();
      console.log('[Background] 页面内容长度:', html.length);
      
      // 检查是否有 AuthState（在 SSO 登录页面）
      const authStateMatch = html.match(/name="AuthState"\s*value="([^"]+)"/i);
      if (authStateMatch) {
        authState = authStateMatch[1].replace(/&amp;/g, '&');
        console.log('[Background] 找到 AuthState，长度:', authState.length);
      }

      // 步骤2: 检查是否找到 AuthState
      console.log('[Background] 步骤2: 检查 AuthState...');
      if (!authState) {
        // 可能已经登录了，检查是否有 token
        const tokenMatch = html.match(/token=([A-Za-z0-9+/=]+)/);
        if (tokenMatch) {
          const wstoken = this.extractWsToken(tokenMatch[1]);
          if (wstoken) {
            return { success: true, token: wstoken };
          }
        }
        console.log('[Background] 页面内容片段:', html.substring(0, 500));
        throw new Error('无法找到 AuthState');
      }

      // 步骤3: POST 登录
      console.log('[Background] 步骤3: 提交登录...');
      const loginUrl = ssoConfig?.loginEndpoint || 'https://sso.ukm.my/module.php/core/loginuserpass.php';
      const fields = ssoConfig?.fields || {
        username: 'username',
        password: 'password',
        submit: 'submit',
        authState: 'AuthState'
      };

      const loginHeaders = await this.getHeaders(loginUrl);
      const loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          ...loginHeaders,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          [fields.username]: username,
          [fields.password]: password,
          [fields.submit]: 'Sign in',
          [fields.authState]: authState
        }),
        redirect: 'manual'
      });

      this.saveCookies(loginUrl, loginResponse);
      html = await loginResponse.text();

      // 检查登录错误
      const lowerHtml = html.toLowerCase();
      if (lowerHtml.includes('incorrect') || 
          lowerHtml.includes('wrong') ||
          lowerHtml.includes('invalid') ||
          lowerHtml.includes('error')) {
        if (lowerHtml.includes('username') || lowerHtml.includes('password')) {
          throw new Error('用户名或密码错误');
        }
      }

      // 步骤4: 处理 SAML Response
      console.log('[Background] 步骤4: 处理 SAML Response...');
      const formData = this.extractFormData(html);
      
      if (!formData.action || !formData.inputs.SAMLResponse) {
        console.log('[Background] 未找到 SAML Response，检查页面内容...');
        // 可能直接重定向了
        const location = loginResponse.headers.get('location');
        if (location) {
          const { finalUrl } = await this.fetchWithRedirects(location);
          if (finalUrl && finalUrl.includes('token=')) {
            const match = finalUrl.match(/token=([A-Za-z0-9+/=]+)/);
            if (match) {
              const wstoken = this.extractWsToken(match[1]);
              return { success: true, token: wstoken };
            }
          }
        }
        throw new Error('无法获取 SAML Response');
      }

      console.log('[Background] SAML ACS URL:', formData.action);
      
      // 步骤5: POST SAML Response 并获取 token
      // 重置捕获的 token URL
      capturedTokenUrl = null;
      
      // 创建一个 Promise 用于等待 webRequest 捕获 token
      const tokenPromise = new Promise((resolve) => {
        tokenCaptureResolve = resolve;
        // 5秒超时
        setTimeout(() => {
          if (tokenCaptureResolve === resolve) {
            tokenCaptureResolve = null;
            resolve(null);
          }
        }, 5000);
      });
      
      const samlHeaders = await this.getHeaders(formData.action);
      
      // 发起请求（会触发重定向，被 webRequest 捕获）
      try {
        await fetch(formData.action, {
          method: 'POST',
          headers: {
            ...samlHeaders,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams(formData.inputs),
          redirect: 'follow'
        });
      } catch (fetchError) {
        // 预期的错误 - 重定向到 moodlemobile:// 会失败
        console.log('[Background] 预期的 fetch 错误:', fetchError.message);
      }

      // 等待 webRequest 捕获 token
      console.log('[Background] 等待 webRequest 捕获 token...');
      const tokenUrl = await tokenPromise;
      
      if (tokenUrl || capturedTokenUrl) {
        const url = tokenUrl || capturedTokenUrl;
        console.log('[Background] 成功捕获 token URL:', url);
        
        const match = url.match(/token=([A-Za-z0-9+/=]+)/);
        if (match) {
          const wstoken = this.extractWsToken(match[1]);
          console.log('[Background] SAML 登录成功，获取到 token');
          capturedTokenUrl = null;
          return { success: true, token: wstoken };
        }
      }

      throw new Error('无法捕获 token');
    } catch (error) {
      console.error('[Background] SAML 登录失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 直接 SAML 登录（使用现有 AuthState，适用于已在 SSO 页面的情况）
   */
  async performDirectSamlLogin(targetSite, launchUrl, username, password, authState, ssoConfig) {
    try {
      console.log('[Background] 开始直接 SAML 登录流程');
      console.log('[Background] 目标站点:', targetSite);
      console.log('[Background] AuthState 长度:', authState?.length);
      
      if (!authState) {
        throw new Error('缺少 AuthState');
      }

      this.clearCookies();

      // 步骤1: 直接 POST 登录（使用传入的 AuthState）
      console.log('[Background] 步骤1: 提交登录...');
      const loginUrl = ssoConfig?.loginEndpoint || 'https://sso.ukm.my/module.php/core/loginuserpass.php';
      const fields = ssoConfig?.fields || {
        username: 'username',
        password: 'password',
        submit: 'submit',
        authState: 'AuthState'
      };

      const directLoginHeaders = await this.getHeaders(loginUrl);
      const loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          ...directLoginHeaders,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          [fields.username]: username,
          [fields.password]: password,
          [fields.submit]: 'Sign in',
          [fields.authState]: authState
        }),
        redirect: 'manual'
      });

      this.saveCookies(loginUrl, loginResponse);
      let html = await loginResponse.text();

      // 检查登录错误
      const lowerHtml = html.toLowerCase();
      if (lowerHtml.includes('incorrect') || 
          lowerHtml.includes('wrong') ||
          lowerHtml.includes('invalid')) {
        if (lowerHtml.includes('username') || lowerHtml.includes('password')) {
          throw new Error('用户名或密码错误');
        }
      }

      // 步骤2: 处理 SAML Response
      console.log('[Background] 步骤2: 处理 SAML Response...');
      const formData = this.extractFormData(html);
      
      if (!formData.action || !formData.inputs.SAMLResponse) {
        // 可能直接重定向了
        const location = loginResponse.headers.get('location');
        if (location) {
          console.log('[Background] 跟随重定向:', location);
          const { finalUrl } = await this.fetchWithRedirects(location);
          if (finalUrl && finalUrl.includes('token=')) {
            const match = finalUrl.match(/token=([A-Za-z0-9+/=]+)/);
            if (match) {
              const wstoken = this.extractWsToken(match[1]);
              return { success: true, token: wstoken };
            }
          }
        }
        console.log('[Background] 登录后页面内容片段:', html.substring(0, 500));
        throw new Error('无法获取 SAML Response');
      }

      console.log('[Background] SAML ACS URL:', formData.action);
      
      const directSamlHeaders = await this.getHeaders(formData.action);
      const samlResponse = await fetch(formData.action, {
        method: 'POST',
        headers: {
          ...directSamlHeaders,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(formData.inputs),
        redirect: 'manual'
      });

      this.saveCookies(formData.action, samlResponse);

      // 步骤3: 跟随重定向到 Moodle
      console.log('[Background] 步骤3: 跟随重定向到 Moodle...');
      let nextUrl = samlResponse.headers.get('location');
      
      if (!nextUrl) {
        const responseHtml = await samlResponse.text();
        const redirectMatch = responseHtml.match(/url=([^"'\s>]+)/i);
        if (redirectMatch) {
          nextUrl = redirectMatch[1];
        }
      }

      if (nextUrl) {
        console.log('[Background] 重定向到:', nextUrl);
        const { response: moodleResponse, finalUrl } = await this.fetchWithRedirects(nextUrl);
        
        // 检查重定向 URL 中是否有 token
        if (finalUrl && finalUrl.includes('token=')) {
          const match = finalUrl.match(/token=([A-Za-z0-9+/=]+)/);
          if (match) {
            const wstoken = this.extractWsToken(match[1]);
            console.log('[Background] 直接 SAML 登录成功，获取到 token');
            return { success: true, token: wstoken };
          }
        }

        // 检查响应头中的 Location
        const moodleLocation = moodleResponse.headers.get('location');
        if (moodleLocation && moodleLocation.includes('token=')) {
          const match = moodleLocation.match(/token=([A-Za-z0-9+/=]+)/);
          if (match) {
            const wstoken = this.extractWsToken(match[1]);
            console.log('[Background] 直接 SAML 登录成功，获取到 token');
            return { success: true, token: wstoken };
          }
        }

        // 步骤4: 用户现在已登录，访问 launch.php 获取 token
        console.log('[Background] 步骤4: 访问 launch.php 获取 token...');
        const { finalUrl: tokenUrl } = await this.fetchWithRedirects(launchUrl);
        
        if (tokenUrl && tokenUrl.includes('token=')) {
          const match = tokenUrl.match(/token=([A-Za-z0-9+/=]+)/);
          if (match) {
            const wstoken = this.extractWsToken(match[1]);
            console.log('[Background] 直接 SAML 登录成功，获取到 token');
            return { success: true, token: wstoken };
          }
        }
      }

      throw new Error('无法获取 token');
    } catch (error) {
      console.error('[Background] 直接 SAML 登录失败:', error);
      return { success: false, error: error.message };
    }
  }
}

const tokenFetcher = new SamlTokenFetcher();

// ============================================
// AI Agent 相关
// ============================================

// AI 配置存储键
const AI_STORAGE_KEYS = {
  apiHost: 'moodesk_ai_api_host',
  apiKey: 'moodesk_ai_api_key',
  model: 'moodesk_ai_model',
  enabled: 'moodesk_ai_enabled'
};

// AI Agent 实例
let aiAgent = null;
let aiLLMClient = null;
let aiConversationHistory = [];

/**
 * 简单的 LLM 客户端（支持流式输出）
 */
class SimpleLLMClient {
  constructor(config = {}) {
    this.apiHost = config.apiHost || 'https://api.openai.com';
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'gpt-4o-mini';
  }

  updateConfig(config) {
    if (config.apiHost) this.apiHost = config.apiHost;
    if (config.apiKey) this.apiKey = config.apiKey;
    if (config.model) this.model = config.model;
  }

  /**
   * 非流式聊天（用于工具调用）
   */
  async chat(messages, options = {}) {
    const url = `${this.apiHost.replace(/\/$/, '')}/v1/chat/completions`;
    
    const body = {
      model: this.model,
      messages,
      stream: false
    };

    if (options.tools?.length > 0) {
      body.tools = options.tools;
      body.tool_choice = options.tool_choice || 'auto';
    }
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API Error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 流式聊天
   */
  async *streamChat(messages, options = {}) {
    const url = `${this.apiHost.replace(/\/$/, '')}/v1/chat/completions`;
    
    const body = {
      model: this.model,
      messages,
      stream: true
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API Error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async testConnection() {
    try {
      await this.chat([{ role: 'user', content: 'Hi' }], { max_tokens: 5 });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * AI 工具定义
 */
const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_assignments',
      description: '获取用户的作业列表，包括作业名称、所属课程、截止日期和完成状态',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['all', 'pending', 'submitted', 'overdue'],
            description: '筛选作业状态'
          },
          days: {
            type: 'number',
            description: '查询未来多少天内的作业，默认7天'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_courses',
      description: '获取用户已注册的课程列表',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_current_page',
      description: '获取用户当前浏览的 Moodle 页面信息',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '获取当前日期和时间',
      parameters: { type: 'object', properties: {} }
    }
  }
];

/**
 * 构建系统提示词
 */
function buildSystemPrompt(context = {}) {
  return `你是 Moodesk AI，一个智能的 Moodle 学习助手。你可以帮助用户管理作业、查询课程信息、规划学习等。

## 当前上下文
- 站点：${context.site || '未知'}
- 用户：${context.username || '未知'}
- 当前时间：${new Date().toLocaleString('zh-CN')}
- 当前页面：${context.currentPage || '未知'}

## 工作方式（重要！必须严格遵守）
1. 当用户提问时，先理解用户的需求
2. **CRITICAL: 如果需要获取数据，你必须先输出一段文字告知用户你即将做什么，然后再调用工具。绝对不要直接调用工具而不先输出文字！**
3. 示例流程：
   - 用户问："我有什么作业快截止了？"
   - 正确做法：先输出"我来帮你查看一下最近的作业情况，请稍等。"，然后调用 get_assignments 工具
   - 错误做法：直接调用 get_assignments 工具（不要这样做！）
4. 可以多次调用工具来完成复杂任务
5. 获取数据后，用友好的方式向用户展示结果
6. 如果工具返回错误，尝试其他方法或告知用户

## 回复规范
- 使用中文回复
- 保持友好、简洁
- 对于作业截止日期，使用相对时间描述（如"还有3天"）
- **工具调用前必须输出提示文字，例如："我将分析当前页面内容，请稍等。" 或 "我来查看你的作业情况，请稍等。"**`;
}

/**
 * 执行工具调用
 */
async function executeToolCall(tabId, toolName, args) {
  // 内置工具
  if (toolName === 'get_current_time') {
    const now = new Date();
    return {
      success: true,
      data: {
        date: now.toLocaleDateString('zh-CN'),
        time: now.toLocaleTimeString('zh-CN'),
        weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]
      }
    };
  }

  // 需要 content script 执行的工具
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, {
      type: 'AI_TOOL_CALL',
      tool: toolName,
      args
    }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: false, error: '无响应' });
      }
    });
  });
}

/**
 * 运行 AI Agent（支持多轮工具调用和流式输出）
 * 每次文字输出都是独立的气泡，工具调用也是独立显示
 */
async function runAIAgent(userMessage, context, tabId, sendUpdate) {
  // 加载配置
  const config = await chrome.storage.local.get(Object.values(AI_STORAGE_KEYS));
  
  if (!aiLLMClient) {
    aiLLMClient = new SimpleLLMClient({
      apiHost: config[AI_STORAGE_KEYS.apiHost] || 'https://api.openai.com',
      apiKey: config[AI_STORAGE_KEYS.apiKey] || '',
      model: config[AI_STORAGE_KEYS.model] || 'gpt-4o-mini'
    });
  }

  // 添加用户消息到历史
  aiConversationHistory.push({ role: 'user', content: userMessage });

  // 构建消息
  const messages = [
    { role: 'system', content: buildSystemPrompt(context) },
    ...aiConversationHistory
  ];

  const maxIterations = 10;
  let fullContent = '';
  let allToolCalls = [];
  let isFirstMessage = true;

  for (let i = 0; i < maxIterations; i++) {
    try {
      // 开始新的消息气泡
      sendUpdate({ type: 'new_message' });
      
      let streamContent = '';
      let hasToolCalls = false;
      let toolCallsData = [];
      
      // 使用流式 API，在流式过程中检测工具调用
      try {
        // 先尝试流式调用（带工具）
        const streamResponse = await fetch(`${aiLLMClient.apiHost.replace(/\/$/, '')}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiLLMClient.apiKey}`
          },
          body: JSON.stringify({
            model: aiLLMClient.model,
            messages,
            tools: AI_TOOLS,
            tool_choice: 'auto',
            stream: true,
            temperature: 0.7
          })
        });

        if (!streamResponse.ok) {
          throw new Error(`API Error: ${streamResponse.status}`);
        }

        const reader = streamResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        let finishReason = null;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              const delta = choice?.delta;
              
              // 检查内容（优先处理内容）
              if (delta?.content) {
                sendUpdate({ type: 'stream_chunk', content: delta.content });
                streamContent += delta.content;
              }
              
              // 检查工具调用（但不立即设置 hasToolCalls，等流式完成后再处理）
              if (delta?.tool_calls) {
                const toolCall = delta.tool_calls[0];
                const index = toolCall.index || 0;
                
                if (!toolCallsData[index]) {
                  toolCallsData[index] = {
                    id: toolCall.id || '',
                    type: 'function',
                    function: {
                      name: toolCall.function?.name || '',
                      arguments: toolCall.function?.arguments || ''
                    }
                  };
                } else {
                  // 追加参数（流式参数可能分多次）
                  toolCallsData[index].function.arguments += (toolCall.function?.arguments || '');
                }
              }
              
              // 检查完成原因（只在流式结束时才判断）
              if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
                if (finishReason === 'tool_calls') {
                  hasToolCalls = true;
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
        
        // 流式完成后，如果有工具调用数据但没有 finish_reason，也认为有工具调用
        if (!hasToolCalls && toolCallsData.length > 0 && finishReason === 'tool_calls') {
          hasToolCalls = true;
        }
      } catch (streamError) {
        // 如果流式失败，回退到非流式调用
        console.warn('[Moodesk AI] 流式输出失败，回退到非流式:', streamError);
        const response = await aiLLMClient.chat(messages, {
          tools: AI_TOOLS,
          tool_choice: 'auto',
          temperature: 0.7
        });
        
        const assistantMessage = response.choices[0].message;
        streamContent = assistantMessage.content || '';
        hasToolCalls = !!assistantMessage.tool_calls?.length;
        toolCallsData = assistantMessage.tool_calls || [];
        
        if (streamContent) {
          sendUpdate({ type: 'stream_chunk', content: streamContent });
        }
      }

      // 如果有工具调用但内容为空，添加默认提示
      if (hasToolCalls && toolCallsData.length > 0 && !streamContent.trim()) {
        // AI 没有遵循指令，直接调用了工具，我们添加一个默认提示
        const defaultMessages = {
          'get_assignments': '我来查看你的作业情况，请稍等。',
          'get_courses': '我来获取你的课程列表，请稍等。',
          'get_current_page': '我来分析当前页面内容，请稍等。',
          'get_course_content': '我来获取课程内容，请稍等。',
          'search_resources': '我来搜索相关资源，请稍等。',
          'get_study_stats': '我来获取学习统计数据，请稍等。',
          'get_todos': '我来查看你的待办事项，请稍等。',
          'add_todo': '我来添加待办事项，请稍等。',
          'get_current_time': '我来获取当前时间，请稍等。'
        };
        
        const toolName = toolCallsData[0]?.function?.name;
        const defaultMsg = defaultMessages[toolName] || '正在处理中，请稍等...';
        
        // 在当前消息气泡中添加默认提示
        sendUpdate({ type: 'stream_chunk', content: defaultMsg });
        streamContent = defaultMsg;
      }
      
      // 结束当前消息气泡
      sendUpdate({ type: 'message_end' });
      if (streamContent) {
        fullContent += (fullContent ? '\n\n' : '') + streamContent;
      }

      // 如果有工具调用
      if (hasToolCalls && toolCallsData.length > 0) {
        // 添加助手消息到历史
        messages.push({
          role: 'assistant',
          content: streamContent,
          tool_calls: toolCallsData
        });

        // 显示工具调用
        sendUpdate({
          type: 'tool_start',
          tools: toolCallsData.map(tc => tc.function.name)
        });

        for (const toolCall of toolCallsData) {
          const toolName = toolCall.function.name;
          let toolArgs = {};
          try {
            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch (e) {}

          const result = await executeToolCall(tabId, toolName, toolArgs);
          
          allToolCalls.push({ name: toolName, args: toolArgs, result });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });

          sendUpdate({
            type: 'tool_result',
            tool: toolName,
            result
          });
        }
        // 继续循环让 AI 处理工具结果
        continue;
      }

      // 没有工具调用，检查是否提到了要调用工具但没调用
      if (streamContent) {
        messages.push({ role: 'assistant', content: streamContent });
        
        // 检测工具调用意图关键词
        const toolIntentKeywords = [
          '查看', '检查', '获取', '查询', '搜索', '分析', '获取', '查看一下',
          '帮你查看', '我来查看', '让我查看', '我来检查', '让我检查',
          '我来获取', '让我获取', '我来查询', '让我查询',
          '查看你的', '检查你的', '获取你的', '查询你的'
        ];
        
        const hasToolIntent = toolIntentKeywords.some(keyword => 
          streamContent.includes(keyword)
        );
        
        // 如果提到了要调用工具但没调用，且不是最后一次迭代，发送提示
        if (hasToolIntent && i < maxIterations - 1) {
          console.log('[Moodesk AI] 检测到工具调用意图但未调用工具，发送系统提示...');
          
          // 根据内容推断应该调用哪个工具
          let suggestedTool = null;
          const toolMapping = {
            '作业': 'get_assignments',
            'assignment': 'get_assignments',
            '课程': 'get_courses',
            'course': 'get_courses',
            '当前页面': 'get_current_page',
            '页面内容': 'get_current_page',
            '待办': 'get_todos',
            'todo': 'get_todos',
            '资源': 'search_resources',
            'resource': 'search_resources'
          };
          
          for (const [keyword, tool] of Object.entries(toolMapping)) {
            if (streamContent.includes(keyword)) {
              suggestedTool = tool;
              break;
            }
          }
          
          // 发送系统提示消息（不显示给用户，只在后台提示 AI）
          const systemPrompt = suggestedTool 
            ? `你刚才回复说"${streamContent}"，表示要${suggestedTool === 'get_assignments' ? '查看作业' : suggestedTool === 'get_courses' ? '查看课程' : suggestedTool === 'get_current_page' ? '分析当前页面' : '执行操作'}，但你没有实际调用工具。请立即调用 ${suggestedTool} 工具来完成用户的需求。不要只是说要做某事，必须实际调用工具。`
            : `你刚才回复说"${streamContent}"，表示要调用工具，但你没有实际调用。请立即调用相应的工具来完成用户的需求。不要只是说要做某事，必须实际调用工具。`;
          
          // 添加系统提示到消息历史（不发送到 UI）
          // 注意：assistant 消息已经在上面添加过了，这里只需要添加 user 提示
          messages.push({
            role: 'user',
            content: systemPrompt
          });
          
          // 继续循环，让 AI 调用工具（这次应该会调用）
          continue;
        }
      }

      // 完成
      break;

    } catch (error) {
      console.error('[Moodesk AI] Agent 错误:', error);
      sendUpdate({ type: 'error', error: error.message });
      return { error: error.message };
    }
  }

  // 保存助手回复
  if (fullContent) {
    aiConversationHistory.push({ role: 'assistant', content: fullContent });
  }

  return { content: fullContent, toolCalls: allToolCalls };
}

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] 收到消息:', message.type);

  switch (message.type) {
    case 'FETCH_SAML_TOKEN':
      tokenFetcher.getTokenForLoggedInUser(message.url)
        .then(sendResponse)
        .catch(e => sendResponse({ success: false, error: e.message }));
      return true;

    case 'SAML_LOGIN':
      console.log('[Background] 执行 SAML 登录...');
      tokenFetcher.performSamlLogin(
        message.launchUrl,
        message.username,
        message.password,
        message.ssoConfig
      )
        .then(result => {
          console.log('[Background] SAML 登录结果:', result.success ? '成功' : result.error);
          sendResponse(result);
        })
        .catch(e => {
          console.error('[Background] SAML 登录异常:', e);
          sendResponse({ success: false, error: e.message });
        });
      return true;

    case 'SAML_LOGIN_DIRECT':
      console.log('[Background] 执行直接 SAML 登录（使用现有 AuthState）...');
      tokenFetcher.performDirectSamlLogin(
        message.targetSite,
        message.launchUrl,
        message.username,
        message.password,
        message.authState,
        message.ssoConfig
      )
        .then(result => {
          console.log('[Background] 直接 SAML 登录结果:', result.success ? '成功' : result.error);
          sendResponse(result);
        })
        .catch(e => {
          console.error('[Background] 直接 SAML 登录异常:', e);
          sendResponse({ success: false, error: e.message });
        });
      return true;

    // ============================================
    // AI 相关消息
    // ============================================
    
    case 'AI_CHAT':
      console.log('[Background] AI 聊天请求');
      const tabId = sender.tab?.id;
      
      // 使用 port 进行流式通信
      runAIAgent(message.message, message.context, tabId, (update) => {
        // 发送更新到 content script
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            type: 'AI_UPDATE',
            update
          }).catch(() => {});
        }
      }).then(result => {
        sendResponse(result);
      }).catch(e => {
        sendResponse({ error: e.message });
      });
      return true;

    case 'AI_CLEAR_HISTORY':
      aiConversationHistory = [];
      console.log('[Background] AI 对话历史已清除');
      sendResponse({ success: true });
      return true;

    case 'AI_CONFIG_UPDATED':
      console.log('[Background] AI 配置已更新');
      // 重新加载配置
      chrome.storage.local.get(Object.values(AI_STORAGE_KEYS)).then(config => {
        if (aiLLMClient) {
          aiLLMClient.updateConfig({
            apiHost: config[AI_STORAGE_KEYS.apiHost],
            apiKey: config[AI_STORAGE_KEYS.apiKey],
            model: config[AI_STORAGE_KEYS.model]
          });
        }
      });
      sendResponse({ success: true });
      return true;

    case 'AI_TEST_CONNECTION':
      console.log('[Background] 测试 AI 连接');
      const testClient = new SimpleLLMClient(message.config);
      testClient.testConnection()
        .then(result => sendResponse(result))
        .catch(e => sendResponse({ success: false, error: e.message }));
      return true;

    default:
      return false;
  }
});

// 扩展安装/更新时的处理
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Moodesk] 扩展已安装/更新:', details.reason);
});

console.log('[Moodesk Background] 服务已启动');
