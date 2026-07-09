#!/usr/bin/env node
import { ChatHookServer } from "./ChatHookServer.js";
async function main() {
    const server = new ChatHookServer();
    await server.run();
}
main().catch((err) => {
    process.stderr.write(`[chathook] Fatal error: ${err}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map