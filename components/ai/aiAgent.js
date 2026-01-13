// aiAgent.js
// Moodesk AI - ReAct Agent 核心
// 支持多轮工具调用、流式输出、自主决策

class MoodeskAgent {
  constructor(llmClient, toolRegistry) {
    this.llm = llmClient;
    this.tools = toolRegistry;
    this.maxIterations = 10; // 最大迭代次数，防止无限循环
    this.conversationHistory = [];
  }

  /**
   * 构建系统提示词
   */
  buildSystemPrompt(context = {}) {
    const toolDescriptions = this.tools.getDefinitions()
      .map(t => `- ${t.function.name}: ${t.function.description}`)
      .join('\n');

    return `你是 Moodesk AI，一个智能的 Moodle 学习助手。你可以帮助用户管理作业、查询课程信息、规划学习等。

## 当前上下文
- 站点：${context.site || '未知'}
- 用户：${context.username || '未知'}
- 当前时间：${new Date().toLocaleString('zh-CN')}
- 当前页面：${context.currentPage || '未知'}

## 可用工具
${toolDescriptions}

## 工作方式
1. 当用户提问时，先理解用户的需求
2. 如果需要获取数据，使用工具来获取
3. 可以多次调用工具来完成复杂任务
4. 获取数据后，用友好的方式向用户展示结果
5. 如果工具返回错误，尝试其他方法或告知用户

## 回复规范
- 使用中文回复
- 保持友好、简洁
- 对于作业截止日期，使用相对时间描述（如"还有3天"）
- 对于重要信息，使用适当的强调
- 如果需要调用工具，先简短告知用户你在做什么

## 示例对话
用户：我有什么作业要交？
助手：让我帮你查看一下作业情况。
[调用 get_assignments 工具]
助手：根据查询结果，你有以下作业需要注意：
1. 📝 **数据结构作业3** - 还有2天截止
2. 📝 **英语写作练习** - 明天截止 ⚠️
建议你优先完成英语写作练习！`;
  }

  /**
   * 运行 Agent（主入口）
   * @param {string} userMessage - 用户消息
   * @param {object} context - 上下文信息
   * @param {function} onUpdate - 更新回调，用于流式输出
   * @returns {Promise<object>} - 最终结果
   */
  async run(userMessage, context = {}, onUpdate = null) {
    // 添加用户消息到历史
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    // 构建完整的消息列表
    const messages = [
      { role: 'system', content: this.buildSystemPrompt(context) },
      ...this.conversationHistory
    ];

    const result = {
      content: '',
      toolCalls: [],
      iterations: 0
    };

    // ReAct 循环
    for (let i = 0; i < this.maxIterations; i++) {
      result.iterations = i + 1;

      try {
        // 调用 LLM
        const response = await this.llm.chat(messages, {
          tools: this.tools.getDefinitions(),
          tool_choice: 'auto',
          temperature: 0.7
        });

        const assistantMessage = response.choices[0].message;
        messages.push(assistantMessage);

        // 检查是否有文本内容需要输出
        if (assistantMessage.content) {
          result.content += (result.content ? '\n\n' : '') + assistantMessage.content;
          
          // 回调通知 UI 更新
          if (onUpdate) {
            onUpdate({
              type: 'content',
              content: assistantMessage.content,
              isPartial: !!assistantMessage.tool_calls
            });
          }
        }

        // 检查是否需要调用工具
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          // 通知 UI 正在调用工具
          if (onUpdate) {
            onUpdate({
              type: 'tool_start',
              tools: assistantMessage.tool_calls.map(tc => tc.function.name)
            });
          }

          // 执行所有工具调用
          for (const toolCall of assistantMessage.tool_calls) {
            const toolName = toolCall.function.name;
            let toolArgs = {};
            
            try {
              toolArgs = JSON.parse(toolCall.function.arguments);
            } catch (e) {
              console.warn('[Moodesk AI] 解析工具参数失败:', toolCall.function.arguments);
            }

            // 执行工具
            const toolResult = await this.tools.execute(toolName, toolArgs, context);
            
            result.toolCalls.push({
              name: toolName,
              args: toolArgs,
              result: toolResult
            });

            // 将工具结果添加到消息
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResult)
            });

            // 通知 UI 工具执行完成
            if (onUpdate) {
              onUpdate({
                type: 'tool_result',
                tool: toolName,
                result: toolResult
              });
            }
          }

          // 继续循环，让 AI 处理工具结果
          continue;
        }

        // 没有工具调用，任务完成
        break;

      } catch (error) {
        console.error('[Moodesk AI] Agent 执行错误:', error);
        
        if (onUpdate) {
          onUpdate({
            type: 'error',
            error: error.message
          });
        }

        result.error = error.message;
        break;
      }
    }

    // 检查是否达到最大迭代次数
    if (result.iterations >= this.maxIterations) {
      const warningMsg = '\n\n⚠️ 处理步骤较多，已自动停止。如需继续，请重新提问。';
      result.content += warningMsg;
      
      if (onUpdate) {
        onUpdate({
          type: 'content',
          content: warningMsg,
          isPartial: false
        });
      }
    }

    // 保存助手回复到历史
    if (result.content) {
      this.conversationHistory.push({
        role: 'assistant',
        content: result.content
      });
    }

    return result;
  }

  /**
   * 流式运行（实时输出文本）
   * 注意：流式模式下不支持工具调用，仅用于简单对话
   */
  async *runStream(userMessage, context = {}) {
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    const messages = [
      { role: 'system', content: this.buildSystemPrompt(context) },
      ...this.conversationHistory
    ];

    let fullContent = '';

    try {
      for await (const chunk of this.llm.streamChat(messages)) {
        if (chunk.content) {
          fullContent += chunk.content;
          yield {
            type: 'content',
            content: chunk.content,
            fullContent
          };
        }
      }

      // 保存完整回复到历史
      this.conversationHistory.push({
        role: 'assistant',
        content: fullContent
      });

      yield {
        type: 'done',
        content: fullContent
      };

    } catch (error) {
      yield {
        type: 'error',
        error: error.message
      };
    }
  }

  /**
   * 清除对话历史
   */
  clearHistory() {
    this.conversationHistory = [];
    console.log('[Moodesk AI] 对话历史已清除');
  }

  /**
   * 获取对话历史
   */
  getHistory() {
    return [...this.conversationHistory];
  }

  /**
   * 设置对话历史（用于恢复会话）
   */
  setHistory(history) {
    this.conversationHistory = [...history];
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MoodeskAgent };
}

