# Semantic Code MCP Server

This is a Model Context Protocol (MCP) server that provides semantic code analysis capabilities using the Language Server Protocol (LSP).

## Features

- **Semantic Navigation**: Go to definition, find references, hover info.
- **Relationship Analysis**: Check if function A calls function B (using LSP references).

## Architecture

This server acts as a bridge between MCP and LSP. It spawns a `typescript-language-server` instance and translates MCP tool calls into LSP JSON-RPC requests.

## Tools

- `get_definition`: Find where a symbol is defined.
- `get_references`: Find all usages of a symbol.
- `search_in_file`: Search for a string in a file to find its line and character position.
- `check_function_call`: Analyze if one function calls another.

## Usage

### Installation

1. Clone the repository:

   ```bash
   git clone git@github.com:thousandmiles/lsp-mcp-server.git
   cd lsp-mcp-server
   ```

2. Run the setup script to build the project and generate the configuration:

   ```bash
   ./setup.sh
   ```

3. Copy the output JSON and paste it into your MCP client configuration file.

### Manual Setup

1. Install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

2. Configure your MCP client (e.g. Claude Desktop) to run this server:
   ```json
   {
     "mcpServers": {
       "semantic-code": {
         "command": "node",
         "args": ["/path/to/code_node/build/index.js"]
       }
     }
   }
   ```
