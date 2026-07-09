import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { showNativeDialog } from "./NativeDialog.js";
/**
 * Special return signals from chat_hook tool.
 * The AI agent's system prompt should be configured to recognize these.
 */
export const SIGNALS = {
    USER_DECLINED: "[CHATHOOK:USER_DECLINED]",
    USER_CANCELLED: "[CHATHOOK:USER_CANCELLED]",
};
export class ChatHookServer {
    server;
    constructor() {
        this.server = new Server({ name: "chathook", version: "1.0.0" }, { capabilities: { tools: {} } });
        this.setupHandlers();
    }
    setupHandlers() {
        // --- List Tools ---
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: "chat_hook",
                    description: "Display an input dialog and wait for user response. Returns the user's text, or '用户关闭了工具对话' if closed/empty.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            message: {
                                type: "string",
                                description: "Optional prompt text.",
                            },
                            suggestions: {
                                type: "array",
                                items: { type: "string" },
                                description: "Optional quick-reply options.",
                            },
                        },
                        required: [],
                    },
                },
            ],
        }));
        // --- Call Tool ---
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            if (name !== "chat_hook") {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: Unknown tool "${name}". Available tool: chat_hook`,
                        },
                    ],
                    isError: true,
                };
            }
            const message = args?.message || "请输入您的回复";
            const suggestions = args?.suggestions ?? [];
            // ─── Strategy: try MCP elicitation first, fall back to native dialog ───
            try {
                // Attempt 1: MCP native elicitation (works if client supports it)
                const formProperties = {
                    user_input: {
                        type: "string",
                        title: "Your Response",
                        description: message,
                        minLength: 0,
                    },
                };
                if (suggestions.length > 0) {
                    formProperties.quick_reply = {
                        type: "string",
                        title: "Quick Reply",
                        description: "Select a quick reply, or type your own response above",
                        oneOf: suggestions.map((s) => ({
                            const: s,
                            title: s,
                        })),
                    };
                }
                const result = await this.server.elicitInput({
                    mode: "form",
                    message,
                    requestedSchema: {
                        type: "object",
                        properties: formProperties,
                        required: ["user_input"],
                    },
                });
                switch (result.action) {
                    case "accept": {
                        const content = result.content ?? {};
                        const userInput = content.user_input ?? "";
                        const quickReply = content.quick_reply ?? "";
                        const finalText = userInput.trim() || quickReply.trim();
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: finalText || "(用户提交了空回复)",
                                },
                            ],
                        };
                    }
                    case "decline":
                    case "cancel":
                    default:
                        return {
                            content: [
                                { type: "text", text: "用户关闭了工具对话" },
                            ],
                        };
                }
            }
            catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                const elicitationNotSupported = errorMsg.includes("does not support") &&
                    errorMsg.includes("elicitation");
                // If elicitation failed for other reasons, report error
                if (!elicitationNotSupported) {
                    // Fall through to native dialog for any error
                    process.stderr.write(`[chathook] Elicitation failed (${errorMsg}), falling back to native dialog\n`);
                }
                else {
                    process.stderr.write(`[chathook] Client doesn't support elicitation, using native dialog\n`);
                }
                // ─── Attempt 2: Native desktop dialog (fallback) ───
                try {
                    const dialogResult = await showNativeDialog(message, suggestions);
                    if (dialogResult.action === "accept" && dialogResult.text.trim()) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: dialogResult.text,
                                },
                            ],
                        };
                    }
                    else {
                        // User closed dialog or submitted empty content
                        return {
                            content: [
                                { type: "text", text: "用户关闭了工具对话" },
                            ],
                        };
                    }
                }
                catch (dialogErr) {
                    const dialogErrorMsg = dialogErr instanceof Error ? dialogErr.message : String(dialogErr);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Error: ${dialogErrorMsg}`,
                            },
                        ],
                        isError: true,
                    };
                }
            }
        });
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        process.stderr.write(`[chathook] MCP server started (stdio).\n`);
        process.stderr.write(`[chathook] Strategy: elicitation-first, native dialog fallback.\n`);
    }
}
//# sourceMappingURL=ChatHookServer.js.map