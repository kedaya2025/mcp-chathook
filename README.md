# chathook — AI 对话钩子 MCP Server

> 在 AI 完成任务后弹出原生输入对话框，让用户直接输入回复，保持对话不中断，直到用户明确结束。

## 工作原理

```
用户提问 → AI 处理任务 → AI 调用 chat_hook 工具
                                    ↓
                    弹出原生桌面对话框（输入框 + 提交按钮 + 倒计时）
                                    ↓
                     用户输入回复 / 关闭对话框结束
                                    ↓
                    工具返回用户输入 → AI 继续处理
                                    ↓
                        AI 再次调用 chat_hook ...
                                    ↓
                      用户关闭对话框 → 工具返回结束信号
                                    ↓
                         AI 结束回合，对话完成
```

## 安装

### 方式一：npx 从 npm 安装（推荐）

在 MCP 客户端的配置中添加：

```json
{
  "mcpServers": {
    "chathook": {
      "command": "npx",
      "args": ["-y", "mcp-chathook"]
    }
  }
}
```

### 方式二：npx 从 GitHub 安装

```json
{
  "mcpServers": {
    "chathook": {
      "command": "npx",
      "args": ["-y", "github:kedaya2025/mcp-chathook"]
    }
  }
}
```

### 方式三：本地运行

```bash
git clone https://github.com/kedaya2025/mcp-chathook.git
cd mcp-chathook
npm install
npm run build
```

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

## 使用方法

### 系统提示词配置

在 AI Agent 的系统提示词 / 自定义指令中添加：

```
所有对话或任务结束时，都必须调用 chathook 工具来向用户确认工作进程，
除非用户结束该工具的调用视为任务完成不再调用。
```

### 工具参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | ❌ | 可选提示语（UI 中不显示，仅用于日志） |
| `suggestions` | string[] | ❌ | 保留字段，当前 UI 不显示 |

### 工具返回值

| 返回值 | 含义 |
|--------|------|
| 用户输入的文本 | 用户的新请求，继续处理 |
| `用户关闭了工具对话` | 用户关闭了对话框或提交了空内容，停止调用并结束 |

## 平台支持

| 平台 | 对话框方式 |
|------|-----------|
| Windows | mshta.exe + JScript（IE 引擎渲染，清晰锐利） |
| Linux/macOS | 终端 stdin 输入 |

## 技术细节

- **MCP 传输**：stdio
- **Windows 对话框**：mshta.exe (HTA) + JScript
- **编码方案**：Base64 传输（PS1 BOM + Base64 text + Base64 result）
- **倒计时**：170 秒（MCP 超时约 180 秒，留 10 秒余量）
- **窗口尺寸**：固定 600px 宽，高度 300-800px 可调

## License

MIT
