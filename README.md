# chathook — AI 对话钩子 MCP Server

> 利用 MCP 原生 elicitation 能力，在 AI 对话的工具调用 UI 中直接嵌入用户输入框，让对话不中断，直到用户明确结束。

## 工作原理

```
用户提问 → AI 处理任务 → AI 调用 chat_hook 工具
                                    ↓
              MCP 客户端在聊天 UI 中原生渲染输入表单
                   （就在工具调用框内，不开浏览器）
                                    ↓
                     用户输入回复 / 点击 Decline 结束
                                    ↓
                    工具返回用户输入 → AI 继续处理
                                    ↓
                        AI 再次调用 chat_hook ...
                                    ↓
                      用户点击 Decline → 工具返回结束信号
                                    ↓
                         AI 结束回合，对话完成
```

**核心机制**：工具 handler 调用 `server.elicitInput()` → MCP 客户端收到 `elicitation/create` 请求 → 客户端在**原生聊天 UI** 中渲染表单 → 用户提交 → 结果返回给工具 handler → 工具返回给 AI。

## 与第一版的区别

| | 第一版（已废弃） | 当前版 |
|---|---|---|
| UI 渲染 | 独立浏览器窗口 | **MCP 客户端原生 UI** |
| 传输 | HTTP + SSE | **MCP elicitation 协议** |
| 用户体验 | 需要切换到浏览器 | **直接在对话界面操作** |
| 依赖 | 需要 `open` 包 | **零额外依赖** |

## 客户端兼容性

本工具依赖 MCP 客户端对 **elicitation** 能力的支持。已知支持的客户端：

- ✅ Cline（较新版本）
- ✅ Roo Code（较新版本）
- ✅ 任何声明了 `elicitation: { form: true }` capability 的 MCP 客户端

如果客户端不支持 elicitation，工具会返回 `[CHATHOOK:CLIENT_NOT_SUPPORTED]` 信号。

## 安装

```bash
cd mcp-chathook
npm install
npm run build
```

## 配置

### Cline (VSCode)

在 Cline 的 MCP 设置中添加：

```json
{
  "mcpServers": {
    "chathook": {
      "command": "node",
      "args": ["<path-to>/mcp-chathook/dist/index.js"]
    }
  }
}
```

### Roo Code (VSCode)

在 Roo Code 的 MCP 设置中添加相同的配置。

## 使用方法

### 系统提示词配置

在你的 AI Agent 的系统提示词 / 自定义指令中添加：

```
## chathook 对话钩子使用规范

在每次完成用户任务后，你必须调用 `chat_hook` 工具询问用户是否需要其他帮助，而不是直接结束回复。

调用示例：
- message: 简要总结你完成的工作，然后询问用户下一步需求
- suggestions: 提供快捷回复选项，如 ["继续", "修改上面的内容", "结束对话"]

工具返回值说明：
- 正常文本：用户的新请求或反馈，请继续处理
- [CHATHOOK:USER_DECLINED]：用户点击了 Decline，请停止调用 chat_hook 并结束回复
- [CHATHOOK:USER_CANCELLED]：用户取消了输入，你可以结束回复或再次调用 chat_hook
- [CHATHOOK:CLIENT_NOT_SUPPORTED]：客户端不支持 elicitation，请正常结束回复

重要：不要在回复中写"有什么可以帮你的吗？"然后结束，而是调用 chat_hook 工具来询问。
```

### 工具参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | ✅ | 显示给用户的消息 |
| `suggestions` | string[] | ❌ | 快捷回复下拉选项 |

### 工具返回值

| 返回值 | 含义 |
|--------|------|
| 用户输入的文本 | 用户的新请求 |
| `[CHATHOOK:USER_DECLINED]` | 用户点击了 Decline（结束对话） |
| `[CHATHOOK:USER_CANCELLED]` | 用户取消了输入 |
| `[CHATHOOK:CLIENT_NOT_SUPPORTED]` | 客户端不支持 elicitation |

## 项目结构

```
mcp-chathook/
├── src/
│   ├── index.ts          # 入口文件
│   └── ChatHookServer.ts # MCP Server（工具定义 + elicitation 调用）
├── package.json
├── tsconfig.json
└── README.md
```

## 技术细节

- **MCP 传输**：stdio
- **UI 渲染**：MCP 客户端原生渲染（elicitation/create → client form UI）
- **零额外依赖**：仅依赖 `@modelcontextprotocol/sdk`
- **阻塞机制**：`elicitInput()` 返回 Promise，在用户响应前不 resolve

## License

MIT
