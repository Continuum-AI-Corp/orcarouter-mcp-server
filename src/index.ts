import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOrcaRouterMcpServer } from "./server.js";
import { startHttpServer } from "./http.js";
import { parseArgs, serverOptionsFromEnv, USAGE } from "./cli.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }

  const serverOptions = serverOptionsFromEnv();

  if (args.transport === "http") {
    const running = await startHttpServer({
      server: serverOptions,
      port: args.port,
      host: args.host,
      path: args.path,
      stateless: args.stateless,
      allowedHosts: args.allowedHosts,
      allowedOrigins: args.allowedOrigins,
      disableDnsRebindingProtection: args.disableDnsRebindingProtection,
      authToken: process.env.MCP_HTTP_AUTH_TOKEN?.trim() || undefined,
    });
    // Close listening sockets and every open session so an orchestrator's SIGTERM is a clean
    // shutdown rather than a killed process with half-written SSE streams.
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        void running.close().finally(() => process.exit(0));
      });
    }
    return;
  }

  const { server } = createOrcaRouterMcpServer(serverOptions);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `[orcarouter-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
