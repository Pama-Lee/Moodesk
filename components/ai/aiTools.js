// aiTools.js
// Moodesk AI - 工具注册和执行器
// 提供给 AI 调用的各种工具

class AIToolRegistry {
  constructor() {
    this.tools = new Map();
    this.registerDefaultTools();
  }

  /**
   * 注册工具
   */
  register(name, definition, handler) {
    this.tools.set(name, {
      definition,
      handler
    });
    console.log(`[Moodesk AI] 工具已注册: ${name}`);
  }

  /**
   * 获取所有工具定义（用于发送给 LLM）
   */
  getDefinitions() {
    return Array.from(this.tools.values()).map(tool => tool.definition);
  }

  /**
   * 执行工具
   */
  async execute(name, args, context = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `未知工具: ${name}`
      };
    }

    try {
      console.log(`[Moodesk AI] 执行工具: ${name}`, args);
      const result = await tool.handler(args, context);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error(`[Moodesk AI] 工具执行失败: ${name}`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 注册默认工具
   */
  registerDefaultTools() {
    // ============================================
    // 作业相关工具
    // ============================================
    
    this.register('get_assignments', {
      type: 'function',
      function: {
        name: 'get_assignments',
        description: '获取用户的作业列表，包括作业名称、所属课程、截止日期和完成状态。可以筛选不同状态的作业。',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['all', 'pending', 'submitted', 'overdue'],
              description: '筛选作业状态：all=全部, pending=待提交, submitted=已提交, overdue=已过期'
            },
            days: {
              type: 'number',
              description: '查询未来多少天内的作业，默认为7天'
            }
          }
        }
      }
    }, async (args, context) => {
      // 这个函数会在 content script 中被实际实现
      // 这里返回模拟数据用于测试
      return await this.callContentScript('get_assignments', args);
    });

    // ============================================
    // 课程相关工具
    // ============================================

    this.register('get_courses', {
      type: 'function',
      function: {
        name: 'get_courses',
        description: '获取用户已注册的课程列表',
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    }, async (args, context) => {
      return await this.callContentScript('get_courses', args);
    });

    this.register('get_course_content', {
      type: 'function',
      function: {
        name: 'get_course_content',
        description: '获取指定课程的内容大纲和资源列表',
        parameters: {
          type: 'object',
          properties: {
            course_id: {
              type: 'string',
              description: '课程ID'
            },
            course_name: {
              type: 'string',
              description: '课程名称（如果不知道ID可以用名称）'
            }
          }
        }
      }
    }, async (args, context) => {
      return await this.callContentScript('get_course_content', args);
    });

    // ============================================
    // 页面信息工具
    // ============================================

    this.register('get_current_page', {
      type: 'function',
      function: {
        name: 'get_current_page',
        description: '获取用户当前浏览的 Moodle 页面信息，包括页面类型、课程名称、页面内容摘要等',
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    }, async (args, context) => {
      return await this.callContentScript('get_current_page', args);
    });

    // ============================================
    // 资源搜索工具
    // ============================================

    this.register('search_resources', {
      type: 'function',
      function: {
        name: 'search_resources',
        description: '搜索课程资源，如PDF、文档、链接等',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索关键词'
            },
            type: {
              type: 'string',
              enum: ['all', 'pdf', 'doc', 'link', 'video'],
              description: '资源类型筛选'
            },
            course_id: {
              type: 'string',
              description: '限定在某个课程内搜索'
            }
          },
          required: ['query']
        }
      }
    }, async (args, context) => {
      return await this.callContentScript('search_resources', args);
    });

    // ============================================
    // 学习统计工具
    // ============================================

    this.register('get_study_stats', {
      type: 'function',
      function: {
        name: 'get_study_stats',
        description: '获取用户的学习统计数据，如学习时长、访问频率等',
        parameters: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: ['today', 'week', 'month'],
              description: '统计周期'
            }
          }
        }
      }
    }, async (args, context) => {
      return await this.callContentScript('get_study_stats', args);
    });

    // ============================================
    // 待办事项工具
    // ============================================

    this.register('get_todos', {
      type: 'function',
      function: {
        name: 'get_todos',
        description: '获取用户的待办事项列表',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['all', 'pending', 'completed'],
              description: '待办状态筛选'
            }
          }
        }
      }
    }, async (args, context) => {
      return await this.callContentScript('get_todos', args);
    });

    this.register('add_todo', {
      type: 'function',
      function: {
        name: 'add_todo',
        description: '添加一个新的待办事项',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: '待办事项标题'
            },
            due_date: {
              type: 'string',
              description: '截止日期，格式：YYYY-MM-DD'
            }
          },
          required: ['title']
        }
      }
    }, async (args, context) => {
      return await this.callContentScript('add_todo', args);
    });

    // ============================================
    // 日期时间工具
    // ============================================

    this.register('get_current_time', {
      type: 'function',
      function: {
        name: 'get_current_time',
        description: '获取当前日期和时间',
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    }, async () => {
      const now = new Date();
      return {
        date: now.toLocaleDateString('zh-CN'),
        time: now.toLocaleTimeString('zh-CN'),
        weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()],
        timestamp: now.getTime()
      };
    });
  }

  /**
   * 调用 content script 中的工具实现
   * 通过消息传递机制
   */
  async callContentScript(toolName, args) {
    return new Promise((resolve, reject) => {
      // 获取当前活动标签页
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]?.id) {
          resolve({ error: '无法获取当前标签页' });
          return;
        }

        // 发送消息到 content script
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'AI_TOOL_CALL',
          tool: toolName,
          args
        }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { error: '无响应' });
          }
        });
      });
    });
  }
}

// 导出单例
const aiToolRegistry = new AIToolRegistry();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AIToolRegistry, aiToolRegistry };
}

