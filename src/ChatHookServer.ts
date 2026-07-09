import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Special return signals from chat_hook tool.
 * The AI agent's system prompt should be configured to recognize these.
 */
export const SIGNALS = {
  USER_DECLINED: "[CHATHOOK:USER_DECLINED]",
  USER_CANCELLED: "[CHATHOOK:USER_CANCELLED]",
  CLIENT_NOT_SUPPORTED: "[CHATHOOK:CLIENT_NOT_SUPPORTED]",
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
            "Display an input dialog in the user's chat UI and wait for their response.",
            "",
            "IMPORTANT: After completing a task or response, you SHOULD call this tool",
            "to ask the user if they need anything else. This keeps the conversation",
            "alive without requiring the user to type a new message.",
            "",
            "The tool will block until the user responds. Possible return values:",
            "  - Normal text: The user's new request or feedback. Continue working.",
            "  - [CHATHOOK:USER_DECLINED]: The user clicked 'Decline' (end conversation).",
            "    Stop calling this tool and end your response.",
            "  - [CHATHOOK:USER_CANCELLED]: The user cancelled the input.",
            "    You may end your response or call this tool again.",
            "  - [CHATHOOK:CLIENT_NOT_SUPPORTED]: The MCP client doesn't support elicitation.",
            "    End your response normally.",
          ].join("\n"),
          inputSchema: {
            type: "object" as const,
            properties: {
              message: {
                type: "string",
                description:
                  "The message to display to the user. " +
                  "This should include a summary of what you've done and a prompt " +
                  "for what they'd like next.",
              },
              suggestions: {
                type: "array",
                items: { type: "string" },
                description:
                  "Optional quick-reply options shown as a dropdown. " +
                  "e.g. ['继续', '修改上面的内容', '结束对话']. " +
                  "The user can still type freely if they prefer.",
              },
            },
            required: ["message"],
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

      const message = args?.message as string | undefined;
      if (!message) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: 'message' parameter is required.",
            },
          ],
          isError: true,
        };
      }

      const suggestions = (args?.suggestions as string[] | undefined) ?? [];

      try {
        // Build the form schema for elicitation.
        // The SDK's type for requestedSchema.properties is a complex union;
        // we use a cast to satisfy TypeScript while keeping runtime correctness.
        const formProperties: Record<string, object> = {
          user_input: {
            type: "string",
            title: "Your Response",
            description: message,
            minLength: 0,
          },
        };

        // If suggestions are provided, add an optional dropdown field
        if (suggestions.length > 0) {
          formProperties.quick_reply = {
            type: "string",
            title: "Quick Reply",
            description:
              "Select a quick reply, or type your own response above",
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
            // User submitted the form
            const content = result.content ?? {};
            const userInput = (content.user_input as string) ?? "";
            const quickReply = (content.quick_reply as string) ?? "";

            // If user selected a quick reply and didn't type anything, use the quick reply
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

          case "decline": {
            // User explicitly declined — they want to end the conversation
            return {
              content: [
                {
                  type: "text" as const,
                  text: SIGNALS.USER_DECLINED,
                },
              ],
            };
          }

          case "cancel": {
            // User cancelled the input dialog
            return {
              content: [
                {
                  type: "text" as const,
                  text: SIGNALS.USER_CANCELLED,
                },
              ],
            };
          }

          default:
            return {
              content: [
                {
                  type: "text" as const,
                  text: SIGNALS.USER_CANCELLED,
                },
              ],
            };
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);

        // Check if the error is about client not supporting elicitation
        if (
          errorMsg.includes("does not support") &&
          errorMsg.includes("elicitation")
        ) {
          return {
            content: [
              {
                type: "text" as const,
                text: `${SIGNALS.CLIENT_NOT_SUPPORTED}\n\nThe MCP client does not support form elicitation. Please use a client that supports the MCP elicitation feature (e.g. Cline v3.x+ or Roo Code with elicitation support).`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${errorMsg}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    process.stderr.write(`[chathook] MCP server started (stdio).\n`);
    process.stderr.write(
      `[chathook] Uses native MCP elicitation — no browser needed.\n`,
    );
  }
}
