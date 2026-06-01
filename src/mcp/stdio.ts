#!/usr/bin/env node
/**
 * 1ai-content MCP Server Entry Point
 *
 * Starts the MCP server over stdio for integration with
 * Claude Code, OpenCode, and other AI agents.
 */

import { createMcpServer } from "./server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initializeDatabase } from "../config/database";
import { initializeRedis } from "../config/redis";
import { initConfig } from "../config/env";

async function main() {
  initConfig();

  await initializeDatabase();
  await initializeRedis();

  const server = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("1ai-content MCP server started on stdio");
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
