# Semantic Code MCP Server

This is a Model Context Protocol (MCP) server that provides semantic code analysis capabilities using the Language Server Protocol (LSP).

## Features

- **Semantic Navigation**: Go to definition, find references, hover info.
- **Structure Analysis**: Get document symbols (outline).
- **Relationship Analysis**: Check if function A calls function B (using LSP references).

## Architecture

This server acts as a bridge between MCP and LSP. It spawns a `typescript-language-server` instance and translates MCP tool calls into LSP JSON-RPC requests.

## Tools

- `get_definition`: Find where a symbol is defined.
- `get_references`: Find all usages of a symbol.
- `get_document_symbols`: Get the outline of a file.
- `search_in_file`: Search for a string in a file to find its line and character position.
- `check_function_call`: Analyze if one function calls another.

## Usage

### Quick Setup

Run the setup script to build the project and generate the configuration:

```bash
./setup.sh
```

Copy the output JSON and paste it into your MCP client configuration file.

### Manual Setup

1. Build the project:

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
