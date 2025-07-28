import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { LangChainTools } from './langchain-tools.js';
import { AdvancedReasoningServer } from './server.js';
import { McpServer } from './mcp.js';

export function startServer(mcpServer: McpServer, reasoningServer: AdvancedReasoningServer, langChainTools: LangChainTools) {
  const httpServer = http.createServer(async (req, res) => {
    if (req.url === '/mcp' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const request = JSON.parse(body);
          const response = await mcpServer.handleRequest(request);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: (error as Error).message }));
        }
      });
    } else if (req.url === '/advanced-reasoning' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const { apiKey, prompt } = JSON.parse(body);
          const result = await reasoningServer.processAdvancedThought({
            thought: prompt,
            thoughtNumber: 1,
            totalThoughts: 1,
            nextThoughtNeeded: false,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: (error as Error).message }));
        }
      });
    } else if (req.url === '/providers' && req.method === 'GET') {
      const providers = await langChainTools.getProviders();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(providers));
    } else if (req.url && req.url.startsWith('/models') && req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const provider = url.searchParams.get('provider');
      if (provider) {
        const models = await langChainTools.listModels(provider);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(models));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Provider not specified' }));
      }
    } else if (req.url === '/session' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const { goal, libraryName } = JSON.parse(body);
          const sessionId = await reasoningServer.memory.createSession(goal, libraryName);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ sessionId }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: (error as Error).message }));
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected');
    mcpServer.connect(ws);
    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });

  const port = process.env.PORT || 3000;
  httpServer.listen(port, () => {
    console.error(`HTTP server listening on port ${port}`);
  });
}
