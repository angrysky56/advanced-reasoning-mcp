# Advanced Reasoning MCP Server

This project implements an advanced cognitive reasoning server based on the Model Context Protocol (MCP). It features meta-cognition, hypothesis testing, and an integrated memory system, providing a robust platform for developing and testing sophisticated AI reasoning agents.

## Features

- **MCP Compliant**: Implements the Model Context Protocol for standardized communication with AI models and tools.
- **Advanced Reasoning Tools**: Includes tools for complex cognitive tasks such as hypothesis testing, evidence management, and confidence scoring.
- **Integrated Cognitive Memory**: A graph-based memory system that persists across sessions, allowing for long-term learning and context retention.
- **Session Management**: Supports multiple reasoning sessions, each with its own context and goals.
- **System JSON Storage**: A document-based storage system for structured data, workflows, and instructions.
- **LangChain Integration**: Provides tools for interacting with LangChain models and providers.
- **Multiple Transports**: Supports `stdio`, `HTTP/REST`, and `WebSocket` transports for flexible connectivity.

## Getting Started

### Prerequisites

- Node.js (v20.0.0 or higher)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/advanced-reasoning-mcp.git
   ```
2. Install the dependencies:
   ```bash
   cd advanced-reasoning-mcp
   npm install
   ```

### Building the Server

To build the server, run the following command:

```bash
npm run build
```

### Running the Server

To run the server, use the following command:

```bash
npm start
```

The server will start and listen for connections on `stdio`, `HTTP/REST` (port 3000), and `WebSockets` (port 3000).

## Usage

The server exposes a set of tools that can be called through the MCP interface. These tools provide access to the server's advanced reasoning capabilities, memory system, and LangChain integration.

### MCP Interface

The server implements the MCP protocol and can be accessed via `stdio`, `HTTP/REST`, and `WebSockets`. The HTTP/REST endpoint for MCP is `/mcp`.

### Tools

- `list_tools`: Lists all available tools.
- `call_tool`: Calls a tool with the specified arguments.

### Available Tools

- `advanced_reasoning`: Performs a step in a reasoning process, with support for meta-cognition, hypothesis testing, and evidence tracking.
- `query_reasoning_memory`: Queries the cognitive memory for relevant information.
- `create_memory_library`: Creates a new memory library.
- `list_memory_libraries`: Lists all available memory libraries.
- `switch_memory_library`: Switches to a different memory library.
- `get_current_library_info`: Gets information about the current memory library.
- `create_system_json`: Creates a new system JSON document.
- `get_system_json`: Retrieves a system JSON document.
- `search_system_json`: Searches for system JSON documents.
- `list_system_json`: Lists all available system JSON documents.
- `create_session`: Creates a new reasoning session.
- `list_langchain_models`: Lists the available LangChain models for a given provider.
- `generate_langchain_text`: Generates text using a LangChain model.

### API Endpoints

- `POST /mcp`: The MCP endpoint for sending JSON-RPC requests.
- `POST /advanced-reasoning`: Executes an advanced reasoning thought.
- `GET /providers`: Retrieves a list of available LangChain providers.
- `GET /models?provider=<provider>`: Retrieves a list of available models for a given provider.
- `POST /session`: Creates a new reasoning session.

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
