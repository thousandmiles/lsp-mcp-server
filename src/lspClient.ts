import * as cp from "child_process";
import * as rpc from "vscode-jsonrpc/node.js";
import {
  InitializeParams,
  InitializeResult,
  InitializeRequest,
  InitializedNotification,
  DidOpenTextDocumentNotification,
  DefinitionRequest,
  ReferencesRequest,
  HoverRequest,
  DocumentSymbolRequest,
  SymbolInformation,
  DocumentSymbol,
  Location,
  Hover,
  ReferenceParams,
  TextDocumentPositionParams,
} from "vscode-languageserver-protocol";
import path from "path";
import fs from "fs/promises";

export class LspClient {
  private connection: rpc.MessageConnection;
  private process: cp.ChildProcess;
  private rootPath: string;
  private isInitialized = false;
  private openFiles: Set<string> = new Set();

  constructor(serverCommand: string, serverArgs: string[], rootPath: string) {
    this.rootPath = path.resolve(rootPath);
    
    this.process = cp.spawn(serverCommand, serverArgs, {
      cwd: this.rootPath,
      env: process.env,
    });

    this.connection = rpc.createMessageConnection(
      new rpc.StreamMessageReader(this.process.stdout!),
      new rpc.StreamMessageWriter(this.process.stdin!)
    );

    this.connection.listen();
    
    this.process.stderr?.on('data', (data) => {
        console.error(`LSP Stderr: ${data}`);
    });

    this.process.on('error', (err) => {
        console.error(`LSP Process Error: ${err.message}`);
    });

    this.process.on('exit', (code, signal) => {
        console.error(`LSP Process Exited with code ${code} and signal ${signal}`);
    });
  }

  async initialize() {
    if (this.isInitialized) return;

    console.error("Initializing LSP connection...");
    const params: InitializeParams = {
      processId: process.pid,
      rootUri: `file://${this.rootPath}`,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: true,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: false,
          },
          completion: {
            dynamicRegistration: true,
            completionItem: {
              snippetSupport: false,
            },
          },
          hover: {
            dynamicRegistration: true,
            contentFormat: ["markdown", "plaintext"],
          },
          definition: {
            dynamicRegistration: true,
          },
          references: {
            dynamicRegistration: true,
          },
          documentSymbol: {
            dynamicRegistration: true,
            hierarchicalDocumentSymbolSupport: true,
          },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      workspaceFolders: [
        {
          uri: `file://${this.rootPath}`,
          name: "root",
        },
      ],
    };

    try {
        console.error("Sending initialize request...");
        const result = await this.connection.sendRequest("initialize", params) as InitializeResult;
        console.error("Initialize request successful.");
        await this.connection.sendNotification("initialized", {});
        this.isInitialized = true;
        return result;
    } catch (e: any) {
        console.error(`Failed to initialize LSP: ${e.message}`);
        throw e;
    }
  }

  async getDefinition(filePath: string, line: number, character: number): Promise<Location | Location[] | null> {
    await this.ensureInitialized();
    await this.didOpen(filePath);
    const uri = `file://${path.resolve(this.rootPath, filePath)}`;
    
    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position: { line, character },
    };

    return this.connection.sendRequest("textDocument/definition", params) as Promise<Location | Location[] | null>;
  }

  async getReferences(filePath: string, line: number, character: number): Promise<Location[] | null> {
    await this.ensureInitialized();
    await this.didOpen(filePath);
    const uri = `file://${path.resolve(this.rootPath, filePath)}`;

    const params: ReferenceParams = {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: true },
    };

    return this.connection.sendRequest("textDocument/references", params) as Promise<Location[] | null>;
  }

  async getHover(filePath: string, line: number, character: number): Promise<Hover | null> {
    await this.ensureInitialized();
    await this.didOpen(filePath);
    const uri = `file://${path.resolve(this.rootPath, filePath)}`;

    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position: { line, character },
    };

    return this.connection.sendRequest("textDocument/hover", params) as Promise<Hover | null>;
  }

  async getDocumentSymbols(filePath: string): Promise<SymbolInformation[] | DocumentSymbol[] | null> {
    await this.ensureInitialized();
    await this.didOpen(filePath);
    const uri = `file://${path.resolve(this.rootPath, filePath)}`;

    return this.connection.sendRequest("textDocument/documentSymbol", {
      textDocument: { uri },
    }) as Promise<SymbolInformation[] | DocumentSymbol[] | null>;
  }

  private async didOpen(filePath: string) {
      const fullPath = path.resolve(this.rootPath, filePath);
      const uri = `file://${fullPath}`;
      if (this.openFiles.has(uri)) return;

      try {
          const content = await fs.readFile(fullPath, 'utf-8');
          await this.connection.sendNotification("textDocument/didOpen", {
              textDocument: {
                  uri,
                  languageId: this.getLanguageId(filePath),
                  version: 1,
                  text: content
              }
          });
          this.openFiles.add(uri);
      } catch (e) {
          console.error(`Failed to open file: ${filePath}`, e);
      }
  }

  private getLanguageId(filePath: string): string {
      if (filePath.endsWith('.ts')) return 'typescript';
      if (filePath.endsWith('.js')) return 'javascript';
      if (filePath.endsWith('.py')) return 'python';
      return 'plaintext';
  }

  private async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  close() {
    this.connection.dispose();
    this.process.kill();
  }
}
