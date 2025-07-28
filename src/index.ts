import { McpServer } from './mcp.js';
import { LangChainTools } from "./langchain-tools.js";
import {
  AdvancedReasoningServer,
} from "./server.js";
import {
  startServer,
} from "./http.js";
import {
  ALL_TOOLS,
} from "./tools.js";

// ===== SERVER SETUP =====

const mcpServer = new McpServer();
const reasoningServer = new AdvancedReasoningServer();
const langChainTools = new LangChainTools();

mcpServer.setRequestHandler("list_tools", async () => ({
  tools: ALL_TOOLS,
}));

mcpServer.setRequestHandler("call_tool", async (params) => {
  const { name, arguments: args } = params;
  
  switch (name) {
    case "advanced_reasoning":
      return reasoningServer.processAdvancedThought(args);
    
    case "query_reasoning_memory":
      const { session_id, query } = args as { session_id: string; query: string };
      return reasoningServer.queryMemory(session_id, query);
    
    case "create_memory_library":
      const { library_name: createLibName } = args as { library_name: string };
      return await reasoningServer.createLibrary(createLibName);
    
    case "list_memory_libraries":
      return await reasoningServer.listLibraries();
    
    case "switch_memory_library":
      const { library_name: switchLibName } = args as { library_name: string };
      return await reasoningServer.switchLibrary(switchLibName);
    
    case "get_current_library_info":
      return reasoningServer.getCurrentLibraryInfo();
    
    case "create_system_json":
      const { name: sysJsonName, domain, description, data, tags } = args as { 
        name: string; 
        domain: string; 
        description: string; 
        data: Record<string, unknown>; 
        tags?: string[] 
      };
      return await reasoningServer.createSystemJSON(sysJsonName, domain, description, data, tags);
    
    case "get_system_json":
      const { name: getSysJsonName } = args as { name: string };
      return await reasoningServer.getSystemJSON(getSysJsonName);
    
    case "search_system_json":
      const { query: searchQuery } = args as { query: string };
      return await reasoningServer.searchSystemJSON(searchQuery);
    
    case "list_system_json":
      return await reasoningServer.listSystemJSON();
    
    case "list_langchain_models":
      const { provider: listProvider } = args as { provider: string };
      const models = await langChainTools.listModels(listProvider);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(models, null, 2),
        }],
      };

    case "generate_langchain_text":
      const { provider: genProvider, modelName, prompt, systemMessage, apiKey } = args as {
        provider: string;
        modelName: string;
        prompt: string;
        systemMessage?: string;
        apiKey?: string;
      };
      const text = await langChainTools.generateText(
        genProvider,
        modelName,
        prompt,
        systemMessage,
        apiKey
      );
      return {
        content: [{
          type: "text",
          text,
        }],
      };

    case "create_session":
      const { goal, libraryName } = args as { goal: string; libraryName?: string };
      const sessionId = await reasoningServer.memory.createSession(goal, libraryName);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ sessionId }),
        }],
      };

    default:
      return {
        content: [{
          type: "text",
          text: `Unknown tool: ${name}`
        }],
        isError: true
      };
  }
});

import readline from 'readline';

async function run() {
  // Start the HTTP and WebSocket server
  startServer(mcpServer, reasoningServer, langChainTools);

  // Start the stdio transport
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    try {
      const request = JSON.parse(line);
      const response = await mcpServer.handleRequest(request);
      console.log(JSON.stringify(response));
    } catch (error) {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error'
        },
        id: null
      }));
    }
  });

  console.error("Advanced Reasoning MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
