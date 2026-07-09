import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { showNativeDialog } from "./NativeDialog.js";

/**
 * Special return signals from chat_hook tool.
 * The AI agent's system prompt should be configured to recognize these.
 */
export const SIGNALS = {
  USER_DECLINED: "[CHATHOOK:USER_DECLINED]",
  USER_CANCELLED: "[CHATHOOK:USER_CANCELLED]",
} as const;

export class ChatHookServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: "chathook", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // --- List Tools ---
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "chat_hook",
          description: [
            "Display an input dialog to the user and wait for their response.",
            "",
            "IMPORTANT: After completing a task or response, you SHOULD call this tool",
            "to keep the conversation alive. The tool blocks until the user responds.",
            "",
            "USAGE: Do NOT put your full response inside the 'message' parameter.",
            "Instead, say everything you need in the conversation first, then call this",
            "tool with a short prompt (or omit 'message' entirely). The dialog is just",
            "an input box — it should not be used to display your message.",
            "",
            "Possible return values:",
            "  - Normal text: The user's new request or feedback. Continue working.",
            "  - '用户关闭了工具对话': The user closed the dialog or submitted empty.",
            "    Stop calling this tool and end your response.",
          ].join("\n"),
          inputSchema: {
            type: "object" as const,
            properties: {
              message: {
                type: "string",
                description:
                  "Optional short prompt shown above the input box (e.g. '请输入回复'). " +
                  "Do NOT put your full response here — say it in the conversation instead. " +
                  "If omitted, a default prompt is used.",
              },
              suggestions: {
                type: "array",
                items: { type: "string" },
                description:
                  "Optional quick-reply buttons. " +
                  "e.g. ['继续', '修改上面的内容', '结束对话']. " +
                  "The user can still type freely if they prefer.",
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
              type: "text" as const,
              text: `Error: Unknown tool "${name}". Available tool: chat_hook`,
            },
          ],
          isError: true,
        };
      }

      const message = (args?.message as string | undefined) || "请输入您的回复";

      const suggestions = (args?.suggestions as string[] | undefined) ?? [];

      // ─── Strategy: try MCP elicitation first, fall back to native dialog ───

      try {
        // Attempt 1: MCP native elicitation (works if client supports it)
        const formProperties: Record<string, object> = {
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
          mode: "form" as const,
          message,
          requestedSchema: {
            type: "object" as const,
            properties: formProperties as never,
            required: ["user_input"],
          },
        });

        switch (result.action) {
          case "accept": {
            const content = result.content ?? {};
            const userInput = (content.user_input as string) ?? "";
            const quickReply = (content.quick_reply as string) ?? "";
            const finalText = userInput.trim() || quickReply.trim();
            return {
              content: [
                {
                  type: "text" as const,
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
                { type: "text" as const, text: "用户关闭了工具对话" },
              ],
            };
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const elicitationNotSupported =
          errorMsg.includes("does not support") &&
          errorMsg.includes("elicitation");

        // If elicitation failed for other reasons, report error
        if (!elicitationNotSupported) {
          // Fall through to native dialog for any error
          process.stderr.write(
            `[chathook] Elicitation failed (${errorMsg}), falling back to native dialog\n`,
          );
        } else {
          process.stderr.write(
            `[chathook] Client doesn't support elicitation, using native dialog\n`,
          );
        }

        // ─── Attempt 2: Native desktop dialog (fallback) ───
        try {
          const dialogResult = await showNativeDialog(message, suggestions);

          if (dialogResult.action === "accept" && dialogResult.text.trim()) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: dialogResult.text,
                },
              ],
            };
          } else {
            // User closed dialog or submitted empty content
            return {
              content: [
                { type: "text" as const, text: "用户关闭了工具对话" },
              ],
            };
          }
        } catch (dialogErr) {
          const dialogErrorMsg =
            dialogErr instanceof Error ? dialogErr.message : String(dialogErr);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${dialogErrorMsg}`,
              },
            ],
            isError: true,
          };
        }
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    process.stderr.write(`[chathook] MCP server started (stdio).\n`);
    process.stderr.write(
      `[chathook] Strategy: elicitation-first, native dialog fallback.\n`,
    );
  }
}
