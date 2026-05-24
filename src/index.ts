import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOrcaRouterMcpServer } from "./server.js";

async function main(): Promise<void> {
  const apiKey = process.env.ORCAROUTER_API_KEY?.trim() || undefined;
  const baseUrl = process.env.ORCAROUTER_BASE_URL?.trim() || undefined;
  const timeoutRaw = process.env.ORCAROUTER_REQUEST_TIMEOUT?.trim();
  let timeoutMs: number | undefined;
  if (timeoutRaw) {
    const parsedSeconds = Number(timeoutRaw);
    if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
      timeoutMs = parsedSeconds * 1000;
    }
  }

  const { server } = createOrcaRouterMcpServer({
    apiKey,
    baseUrl,
    timeoutMs,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `[orcarouter-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
