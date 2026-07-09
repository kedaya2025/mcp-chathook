/**
 * Special return signals from chat_hook tool.
 * The AI agent's system prompt should be configured to recognize these.
 */
export declare const SIGNALS: {
    readonly USER_DECLINED: "[CHATHOOK:USER_DECLINED]";
    readonly USER_CANCELLED: "[CHATHOOK:USER_CANCELLED]";
};
export declare class ChatHookServer {
    private server;
    constructor();
    private setupHandlers;
    run(): Promise<void>;
}
