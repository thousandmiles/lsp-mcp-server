import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as fs from 'fs/promises';
import { LspClient } from "./lspClient.js";
import path from "path";
import { Location, Range } from "vscode-languageserver-protocol";

// Configuration
const LSP_COMMAND = path.resolve(process.cwd(), "node_modules/.bin/typescript-language-server");
const LSP_ARGS = ["--stdio"];
const PROJECT_ROOT = process.cwd();

// Initialize LSP Client
const lspClient = new LspClient(LSP_COMMAND, LSP_ARGS, PROJECT_ROOT);

// Create MCP Server
const server = new Server(
  {
    name: "semantic-code-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper: Check if a location is within a range
function isLocationInRange(location: Location, range: Range, filePath: string): boolean {
    // Normalize paths
    const locPath = location.uri.replace("file://", "");
    const targetPath = path.resolve(PROJECT_ROOT, filePath);
    
    if (path.resolve(locPath) !== targetPath) return false;

    const locLine = location.range.start.line;
    const startLine = range.start.line;
    const endLine = range.end.line;

    if (locLine < startLine || locLine > endLine) return false;
    if (locLine === startLine && location.range.start.character < range.start.character) return false;
    if (locLine === endLine && location.range.end.character > range.end.character) return false;

    return true;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_definition",
        description: "Get the definition location of a symbol. Returns the file path, line, and character where the symbol is defined. Tip: Use 'search_in_file' to find the exact line and character of the symbol you are interested in.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The absolute path to the file containing the symbol usage (e.g. /path/to/project/src/index.ts)"
            },
            line: {
              type: "string",
              description: "The 0-based line number where the symbol is located"
            },
            character: {
              type: "string",
              description: "The 0-based character offset on the line where the symbol is located"
            }
          },
          required: ["filePath", "line", "character"]
        }
      },
      {
        name: "get_references",
        description: "Find all references to a symbol. Returns a list of locations where the symbol is used. Tip: Use 'search_in_file' to find the exact line and character of the symbol definition or usage.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The absolute path to the file containing the symbol definition or usage"
            },
            line: {
              type: "string",
              description: "The 0-based line number of the symbol"
            },
            character: {
              type: "string",
              description: "The 0-based character offset of the symbol"
            }
          },
          required: ["filePath", "line", "character"]
        }
      },
      {
        name: "search_in_file",
        description: "Search for a string in a file to find its line and character position. Useful for finding the arguments for get_definition.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The absolute path to the file to search in"
            },
            query: {
              type: "string",
              description: "The string to search for"
            }
          },
          required: ["filePath", "query"]
        }
      },
      {
        name: "check_function_call",
        description: "Check if one function calls another (direct call). Analyzes if 'sourceFunction' (defined in sourceFile) contains any references to 'targetFunction' (defined in targetFile).",
        inputSchema: {
          type: "object",
          properties: {
            sourceFile: {
              type: "string",
              description: "The absolute path to the file containing the definition of the caller function"
            },
            sourceFunction: {
              type: "string",
              description: "The name of the caller function (e.g. 'main')"
            },
            targetFile: {
              type: "string",
              description: "The absolute path to the file containing the definition of the callee function"
            },
            targetFunction: {
              type: "string",
              description: "The name of the callee function (e.g. 'add')"
            }
          },
          required: ["sourceFile", "sourceFunction", "targetFile", "targetFunction"]
        }
      }
    ]
  };
});

// Tool Handlers

async function handleGetDefinition(args: any) {
  const argsSchema = z.object({
    filePath: z.string(),
    line: z.union([z.string(), z.number()]).transform(val => Number(val)),
    character: z.union([z.string(), z.number()]).transform(val => Number(val)),
  });
  const { filePath, line, character } = argsSchema.parse(args);

  const result = await lspClient.getDefinition(filePath, line, character);
  
  if (!result) {
      return { content: [{ type: "text", text: "No definition found." }] };
  }

  const formatLocation = (loc: any) => {
      const uri = loc.uri.startsWith('file://') ? loc.uri.slice(7) : loc.uri;
      return `File: ${uri}\nLine: ${loc.range.start.line}, Character: ${loc.range.start.character}`;
  };

  let text = "";
  if (Array.isArray(result)) {
      text = result.map(formatLocation).join("\n\n");
  } else {
      text = formatLocation(result);
  }

  return {
    content: [{ type: "text", text }],
  };
}

async function handleGetReferences(args: any) {
  const argsSchema = z.object({
    filePath: z.string(),
    line: z.union([z.string(), z.number()]).transform(val => Number(val)),
    character: z.union([z.string(), z.number()]).transform(val => Number(val)),
  });
  const { filePath, line, character } = argsSchema.parse(args);

  const result = await lspClient.getReferences(filePath, line, character);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

async function handleSearchInFile(args: any) {
  const { filePath, query } = z.object({
    filePath: z.string(),
    query: z.string(),
  }).parse(args);

  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const matches = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let index = line.indexOf(query);
    while (index !== -1) {
      matches.push({ line: i, character: index, text: line.trim() });
      index = line.indexOf(query, index + 1);
    }
  }

  return {
    content: [{ 
      type: "text", 
      text: `Found ${matches.length} matches (coordinates are 0-based, ready for use with get_definition/get_references):\n${JSON.stringify(matches, null, 2)}` 
    }],
  };
}

async function handleCheckFunctionCall(args: any) {
  const { sourceFile, sourceFunction, targetFile, targetFunction } = z.object({
    sourceFile: z.string(),
    sourceFunction: z.string(),
    targetFile: z.string(),
    targetFunction: z.string(),
  }).parse(args);

  // 1. Find the range of the source function
  const sourceSymbols = await lspClient.getDocumentSymbols(sourceFile);
  if (!sourceSymbols) return { content: [{ type: "text", text: "Source file symbols not found" }] };
  
  function findSymbol(symbols: any[], name: string): any {
      for (const sym of symbols) {
          if (sym.name === name) return sym;
          if (sym.children) {
              const found = findSymbol(sym.children, name);
              if (found) return found;
          }
      }
      return null;
  }

  const sourceSym = findSymbol(sourceSymbols, sourceFunction);
  if (!sourceSym) return { content: [{ type: "text", text: `Source function '${sourceFunction}' not found in ${sourceFile}` }] };

  // 2. Find the definition location of the target function to get its position
  const targetSymbols = await lspClient.getDocumentSymbols(targetFile);
  if (!targetSymbols) return { content: [{ type: "text", text: "Target file symbols not found" }] };
  
  const targetSym = findSymbol(targetSymbols, targetFunction);
  if (!targetSym) return { content: [{ type: "text", text: `Target function '${targetFunction}' not found in ${targetFile}` }] };

  // 3. Find references of the target function
  // Handle both DocumentSymbol (with selectionRange) and SymbolInformation (with location)
  let targetLine: number;
  let targetChar: number;

  if (targetSym.selectionRange) {
      targetLine = targetSym.selectionRange.start.line;
      targetChar = targetSym.selectionRange.start.character;
  } else if (targetSym.location) {
      targetLine = targetSym.location.range.start.line;
      targetChar = targetSym.location.range.start.character;
  } else {
      return { content: [{ type: "text", text: "Could not determine location of target symbol" }] };
  }

  const references = await lspClient.getReferences(targetFile, targetLine, targetChar);
  
  if (!references) return { content: [{ type: "text", text: "No references found for target function" }] };

  // 4. Check if any reference is inside the source function's range
  let sourceRange: Range;
  if (sourceSym.range) {
      sourceRange = sourceSym.range;
  } else if (sourceSym.location) {
      sourceRange = sourceSym.location.range;
  } else {
      return { content: [{ type: "text", text: "Could not determine range of source symbol" }] };
  }

  const calls = references.filter(ref => isLocationInRange(ref, sourceRange, sourceFile));

  if (calls.length > 0) {
      return {
          content: [{ type: "text", text: `Yes, '${sourceFunction}' calls '${targetFunction}' ${calls.length} times.\nLocations: ${JSON.stringify(calls, null, 2)}` }]
      };
  } else {
      return {
          content: [{ type: "text", text: `No direct call found from '${sourceFunction}' to '${targetFunction}'.` }]
      };
  }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_definition":
        return await handleGetDefinition(args);
      case "get_references":
        return await handleGetReferences(args);
      case "search_in_file":
        return await handleSearchInFile(args);
      case "check_function_call":
        return await handleCheckFunctionCall(args);
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (e: any) {
    return {
      content: [{ type: "text", text: `Error: ${e.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Semantic Code MCP Server (LSP-based) running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
