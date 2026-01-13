// aiLLMClient.js
// Moodesk AI - LLM 客户端
// 支持 OpenAI 兼容 API、流式响应、Tool Calling

class LLMClient {
  constructor(config = {}) {
    this.apiHost = config.apiHost || 'https://api.openai.com';
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'gpt-4o-mini';
    this.timeout = config.timeout || 60000; // 60秒超时
  }

  /**
   * 更新配置
   */
  updateConfig(config) {
    if (config.apiHost) this.apiHost = config.apiHost;
    if (config.apiKey) this.apiKey = config.apiKey;
    if (config.model) this.model = config.model;
  }

  /**
   * 构建请求头
   */
  buildHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };

    // 根据不同的 API 提供商设置认证头
    if (this.apiHost.includes('anthropic')) {
      headers['x-api-key'] = this.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * 构建 API URL
   */
  buildUrl() {
    // 移除尾部斜杠
    const host = this.apiHost.replace(/\/$/, '');
    
    // Anthropic 使用不同的端点
    if (host.includes('anthropic')) {
      return `${host}/v1/messages`;
    }
    
    return `${host}/v1/chat/completions`;
  }

  /**
   * 转换消息格式（适配不同 API）
   */
  convertMessages(messages) {
    // Anthropic 格式转换
    if (this.apiHost.includes('anthropic')) {
      const systemMessage = messages.find(m => m.role === 'system');
      const otherMessages = messages.filter(m => m.role !== 'system');
      
      return {
        system: systemMessage?.content || '',
        messages: otherMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }))
      };
    }
    
    return { messages };
  }

  /**
   * 非流式聊天请求（支持 Tool Calling）
   */
  async chat(messages, options = {}) {
    const url = this.buildUrl();
    const headers = this.buildHeaders();
    const { messages: convertedMessages, system } = this.convertMessages(messages);

    const body = {
      model: this.model,
      messages: convertedMessages || messages,
      stream: false
    };

    // 添加 system prompt（Anthropic）
    if (system) {
      body.system = system;
    }

    // 添加工具定义
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
      if (options.tool_choice) {
        body.tool_choice = options.tool_choice;
      }
    }

    // 其他选项
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.max_tokens) body.max_tokens = options.max_tokens;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API Error: ${response.status}`);
      }

      const data = await response.json();
      return this.normalizeResponse(data);
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('请求超时，请稍后重试');
      }
      throw error;
    }
  }

  /**
   * 流式聊天请求
   * 返回一个异步生成器，逐步产出内容
   */
  async *streamChat(messages, options = {}) {
    const headers = this.buildHeaders();
    const { messages: convertedMessages, system } = this.convertMessages(messages);

    const body = {
      model: this.model,
      messages: convertedMessages || messages,
      stream: true
    };

    if (system) body.system = system;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.max_tokens) body.max_tokens = options.max_tokens;

    const response = await fetch(this.buildUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API Error: ${response.status}`);
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
            const content = this.extractStreamContent(parsed);
            if (content) {
              yield { type: 'content', content };
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

  /**
   * 从流式响应中提取内容
   */
  extractStreamContent(data) {
    // OpenAI 格式
    if (data.choices?.[0]?.delta?.content) {
      return data.choices[0].delta.content;
    }
    // Anthropic 格式
    if (data.delta?.text) {
      return data.delta.text;
    }
    return null;
  }

  /**
   * 标准化响应格式
   */
  normalizeResponse(data) {
    // 已经是 OpenAI 格式
    if (data.choices) {
      return data;
    }

    // Anthropic 格式转换
    if (data.content) {
      const textContent = data.content.find(c => c.type === 'text');
      const toolUse = data.content.filter(c => c.type === 'tool_use');

      return {
        choices: [{
          message: {
            role: 'assistant',
            content: textContent?.text || '',
            tool_calls: toolUse.length > 0 ? toolUse.map(t => ({
              id: t.id,
              type: 'function',
              function: {
                name: t.name,
                arguments: JSON.stringify(t.input)
              }
            })) : undefined
          },
          finish_reason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop'
        }],
        usage: data.usage
      };
    }

    return data;
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      const result = await this.chat([
        { role: 'user', content: 'Hi, just testing. Reply with "OK".' }
      ], { max_tokens: 10 });

      return {
        success: true,
        message: '连接成功',
        model: this.model
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        model: this.model
      };
    }
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LLMClient };
}

