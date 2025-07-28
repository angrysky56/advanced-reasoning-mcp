import { WebSocket } from 'ws';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: any;
  id?: string | number | null;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: string | number | null;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export class McpServer {
  private handlers: Map<string, (params: any) => Promise<any>> = new Map();

  public setRequestHandler(method: string, handler: (params: any) => Promise<any>) {
    this.handlers.set(method, handler);
  }

  public async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const handler = this.handlers.get(request.method);
    if (!handler) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: 'Method not found',
        },
        id: request.id,
      };
    }

    try {
      const result = await handler(request.params);
      return {
        jsonrpc: '2.0',
        result,
        id: request.id,
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
        id: request.id,
      };
    }
  }

  public connect(transport: WebSocket) {
    transport.on('message', async (message: string) => {
      try {
        const request = JSON.parse(message) as JsonRpcRequest;
        const response = await this.handleRequest(request);
        transport.send(JSON.stringify(response));
      } catch (error) {
        transport.send(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32700,
            message: 'Parse error',
          },
          id: null,
        }));
      }
    });
  }
}
