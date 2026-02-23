import * as vscode from 'vscode';
import Redis from 'ioredis';
import { KeysTreeProvider } from './providers/keysTreeProvider';
import { ServerInfoTreeProvider } from './providers/serverInfoTreeProvider';
import { FerriteQLCompletionProvider } from './ferriteql-completions';
import { ConnectionManager } from './connectionManager';

let client: Redis | null = null;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let keysTreeProvider: KeysTreeProvider;
let serverInfoProvider: ServerInfoTreeProvider;

// Connection manager extracted for better modularity and testability
const connectionManager = new ConnectionManager();

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Ferrite');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'ferrite.connect';
    updateStatusBar(false);
    statusBarItem.show();

    // Register tree view providers
    const connectionsProvider = new ConnectionsTreeProvider();
    keysTreeProvider = new KeysTreeProvider(() => client);
    serverInfoProvider = new ServerInfoTreeProvider(() => client);

    vscode.window.registerTreeDataProvider('ferrite-connections', connectionsProvider);
    vscode.window.registerTreeDataProvider('ferrite-keys', keysTreeProvider);
    vscode.window.registerTreeDataProvider('ferrite-info', serverInfoProvider);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('ferrite.connect', connect),
        vscode.commands.registerCommand('ferrite.disconnect', disconnect),
        vscode.commands.registerCommand('ferrite.executeCommand', executeCommand),
        vscode.commands.registerCommand('ferrite.executeSelection', executeSelection),
        vscode.commands.registerCommand('ferrite.showServerInfo', showServerInfo),
        vscode.commands.registerCommand('ferrite.browseKeys', browseKeys),
        vscode.commands.registerCommand('ferrite.flushDb', flushDb),
        vscode.commands.registerCommand('ferrite.validateConfig', validateConfig),
        vscode.commands.registerCommand('ferrite.refreshKeys', () => keysTreeProvider.refresh()),
        vscode.commands.registerCommand('ferrite.refreshInfo', () => serverInfoProvider.refresh()),
        vscode.commands.registerCommand('ferrite.inspectKey', inspectKey),
    );

    // Register completion provider for FerriteQL
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider('ferriteql', new FerriteCompletionProvider(), ' ')
    );

    // Register FerriteQL SQL-like completion provider
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'ferriteql' },
            new FerriteQLCompletionProvider(),
            '.', ' '
        )
    );

    // Register hover provider
    context.subscriptions.push(
        vscode.languages.registerHoverProvider('ferriteql', new FerriteHoverProvider())
    );

    // Register diagnostics for config files
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('ferrite-config');
    context.subscriptions.push(diagnosticCollection);

    // Validate config on save
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.fileName.endsWith('ferrite.toml')) {
                validateConfigFile(doc, diagnosticCollection);
            }
        })
    );

    // Auto-connect if enabled
    const config = vscode.workspace.getConfiguration('ferrite');
    if (config.get('autoConnect')) {
        connect();
    }
}

export function deactivate() {
    serverInfoProvider?.stopAutoRefresh();
    if (client) {
        client.quit();
    }
}

// Inspect a key from the tree view
async function inspectKey(key: string) {
    if (!client) {
        vscode.window.showErrorMessage('Not connected to Ferrite');
        return;
    }

    try {
        const type = await client.type(key);
        const ttl = await client.ttl(key);
        let value: any;

        switch (type) {
            case 'string':
                value = await client.get(key);
                break;
            case 'hash':
                value = await client.hgetall(key);
                break;
            case 'list':
                value = await client.lrange(key, 0, -1);
                break;
            case 'set':
                value = await client.smembers(key);
                break;
            case 'zset':
                value = await client.zrange(key, 0, -1, 'WITHSCORES');
                break;
            default:
                value = `(${type})`;
        }

        const content = JSON.stringify({
            key,
            type,
            ttl: ttl === -1 ? 'persistent' : `${ttl}s`,
            value
        }, null, 2);

        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'json'
        });

        await vscode.window.showTextDocument(doc);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to inspect key: ${err.message}`);
    }
}

// Update status bar
function updateStatusBar(connected: boolean, info?: string) {
    if (connected) {
        statusBarItem.text = `$(database) Ferrite: ${info || 'Connected'}`;
        statusBarItem.tooltip = 'Connected to Ferrite server';
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = '$(database) Ferrite: Disconnected';
        statusBarItem.tooltip = 'Click to connect to Ferrite';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
}

// Connect to Ferrite
async function connect() {
    const config = vscode.workspace.getConfiguration('ferrite');
    const connections = config.get<any[]>('connections') || [];

    let connectionConfig: any;

    if (connections.length === 0) {
        // Prompt for connection details
        const host = await vscode.window.showInputBox({
            prompt: 'Ferrite host',
            value: 'localhost'
        });
        if (!host) return;

        const portStr = await vscode.window.showInputBox({
            prompt: 'Ferrite port',
            value: '6379'
        });
        if (!portStr) return;

        const password = await vscode.window.showInputBox({
            prompt: 'Password (leave empty for none)',
            password: true
        });

        connectionConfig = {
            host,
            port: parseInt(portStr),
            password: password || undefined
        };
    } else if (connections.length === 1) {
        connectionConfig = connections[0];
    } else {
        // Show picker for multiple connections
        const items = connections.map(c => ({
            label: c.name || `${c.host}:${c.port}`,
            description: `${c.host}:${c.port}`,
            connection: c
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a connection'
        });

        if (!selected) return;
        connectionConfig = selected.connection;
    }

    try {
        client = new Redis({
            host: connectionConfig.host,
            port: connectionConfig.port,
            password: connectionConfig.password,
            db: connectionConfig.database || 0,
            lazyConnect: true,
            connectTimeout: 5000,
            retryStrategy(times: number) {
                if (times > 3) {
                    return null;
                }
                return Math.min(times * 200, 2000);
            },
        });

        await client.connect();

        const info = await client.info('server');
        const version = info.match(/ferrite_version:([^\r\n]+)/)?.[1] || 'unknown';

        updateStatusBar(true, `${connectionConfig.host}:${connectionConfig.port}`);
        vscode.commands.executeCommand('setContext', 'ferrite.connected', true);

        // Refresh tree views
        keysTreeProvider.refresh();
        serverInfoProvider.refresh();
        serverInfoProvider.startAutoRefresh(10000);

        outputChannel.appendLine(`Connected to Ferrite at ${connectionConfig.host}:${connectionConfig.port}`);
        outputChannel.appendLine(`Server version: ${version}`);

        vscode.window.showInformationMessage(`Connected to Ferrite at ${connectionConfig.host}:${connectionConfig.port}`);
    } catch (err: any) {
        const message = err.message || 'Unknown error';
        const isTimeout = message.includes('ETIMEDOUT') || message.includes('timeout');
        const isRefused = message.includes('ECONNREFUSED');
        const isAuth = message.includes('NOAUTH') || message.includes('ERR AUTH');

        let suggestion = '';
        if (isTimeout) {
            suggestion = ' Check that the server is reachable and the port is correct.';
        } else if (isRefused) {
            suggestion = ' Ensure the Ferrite server is running on the specified host and port.';
        } else if (isAuth) {
            suggestion = ' Verify your authentication password in the connection settings.';
        }

        vscode.window.showErrorMessage(`Failed to connect: ${message}.${suggestion}`, 'Retry', 'Open Settings').then(action => {
            if (action === 'Retry') {
                connect();
            } else if (action === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'ferrite.connections');
            }
        });

        if (client) {
            client.disconnect();
        }
        client = null;
    }
}

// Disconnect from Ferrite
async function disconnect() {
    if (client) {
        await client.quit();
        client = null;
        updateStatusBar(false);
        vscode.commands.executeCommand('setContext', 'ferrite.connected', false);
        serverInfoProvider.stopAutoRefresh();
        keysTreeProvider.refresh();
        serverInfoProvider.refresh();
        outputChannel.appendLine('Disconnected from Ferrite');
        vscode.window.showInformationMessage('Disconnected from Ferrite');
    }
}

// Execute command from editor
async function executeCommand() {
    if (!client) {
        vscode.window.showErrorMessage('Not connected to Ferrite');
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const line = editor.document.lineAt(editor.selection.active.line);
    const command = line.text.trim();

    if (!command || command.startsWith('#') || command.startsWith('//')) {
        return;
    }

    await executeCommandText(command);
}

// Execute selected text
async function executeSelection() {
    if (!client) {
        vscode.window.showErrorMessage('Not connected to Ferrite');
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.document.getText(editor.selection);
    const commands = selection.split('\n').filter(c => c.trim() && !c.trim().startsWith('#'));

    for (const command of commands) {
        await executeCommandText(command.trim());
    }
}

// Execute a command string
async function executeCommandText(commandText: string) {
    if (!client) return;

    try {
        const parts = parseCommand(commandText);
        const command = parts[0].toUpperCase();
        const args = parts.slice(1);

        outputChannel.appendLine(`> ${commandText}`);

        const result = await client.call(command, ...args);

        const config = vscode.workspace.getConfiguration('ferrite');
        const format = config.get('outputFormat') || 'json';

        const formatted = formatResult(result, format as string);
        outputChannel.appendLine(formatted);
        outputChannel.appendLine('');
        outputChannel.show(true);
    } catch (err: any) {
        const message = err.message || 'Unknown error';
        outputChannel.appendLine(`Error executing '${commandText}': ${message}`);
        outputChannel.show(true);
    }
}

// Parse command string into parts (exported for testing)
export function parseCommand(cmd: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    let escape = false;

    for (const char of cmd) {
        if (escape) {
            current += char;
            escape = false;
            continue;
        }

        if (char === '\\') {
            escape = true;
            continue;
        }

        if ((char === '"' || char === "'") && !inQuote) {
            inQuote = true;
            quoteChar = char;
            continue;
        }

        if (char === quoteChar && inQuote) {
            inQuote = false;
            quoteChar = '';
            continue;
        }

        if (char === ' ' && !inQuote) {
            if (current) {
                parts.push(current);
                current = '';
            }
            continue;
        }

        current += char;
    }

    if (current) {
        parts.push(current);
    }

    return parts;
}

// Format result based on output format (exported for testing)
export function formatResult(result: any, format: string): string {
    if (result === null) {
        return '(nil)';
    }

    if (format === 'json') {
        return JSON.stringify(result, null, 2);
    }

    if (format === 'table' && Array.isArray(result)) {
        return result.map((item, i) => `${i + 1}) ${JSON.stringify(item)}`).join('\n');
    }

    return String(result);
}

// Show server info
async function showServerInfo() {
    if (!client) {
        vscode.window.showErrorMessage('Not connected to Ferrite');
        return;
    }

    try {
        const info = await client.info();

        const doc = await vscode.workspace.openTextDocument({
            content: info,
            language: 'ini'
        });

        await vscode.window.showTextDocument(doc);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to get server info: ${err.message}`);
    }
}

// Browse keys
async function browseKeys() {
    if (!client) {
        vscode.window.showErrorMessage('Not connected to Ferrite');
        return;
    }

    const pattern = await vscode.window.showInputBox({
        prompt: 'Key pattern',
        value: '*',
        placeHolder: 'e.g., user:*, session:*'
    });

    if (!pattern) return;

    try {
        const config = vscode.workspace.getConfiguration('ferrite');
        const maxKeys = config.get('maxKeys') || 1000;

        const keys = await client.keys(pattern);
        const limitedKeys = keys.slice(0, maxKeys as number);

        if (keys.length > (maxKeys as number)) {
            vscode.window.showWarningMessage(`Showing first ${maxKeys} of ${keys.length} keys`);
        }

        const items = await Promise.all(limitedKeys.map(async key => {
            const type = await client!.type(key);
            const ttl = await client!.ttl(key);
            return {
                label: key,
                description: type,
                detail: ttl > 0 ? `TTL: ${ttl}s` : (ttl === -1 ? 'No expiry' : 'Expired')
            };
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Found ${keys.length} keys`
        });

        if (selected) {
            // Show key details
            const type = await client.type(selected.label);
            let value: any;

            switch (type) {
                case 'string':
                    value = await client.get(selected.label);
                    break;
                case 'hash':
                    value = await client.hgetall(selected.label);
                    break;
                case 'list':
                    value = await client.lrange(selected.label, 0, -1);
                    break;
                case 'set':
                    value = await client.smembers(selected.label);
                    break;
                case 'zset':
                    value = await client.zrange(selected.label, 0, -1, 'WITHSCORES');
                    break;
                default:
                    value = `(${type})`;
            }

            const doc = await vscode.workspace.openTextDocument({
                content: JSON.stringify(value, null, 2),
                language: 'json'
            });

            await vscode.window.showTextDocument(doc);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to browse keys: ${err.message}`);
    }
}

// Flush database
async function flushDb() {
    if (!client) {
        vscode.window.showErrorMessage('Not connected to Ferrite');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        'Are you sure you want to flush the current database? This cannot be undone.',
        { modal: true },
        'Flush Database'
    );

    if (confirm === 'Flush Database') {
        try {
            await client.flushdb();
            vscode.window.showInformationMessage('Database flushed successfully');
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to flush database: ${err.message}`);
        }
    }
}

// Validate config file
async function validateConfig() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.fileName.endsWith('ferrite.toml')) {
        vscode.window.showErrorMessage('Please open a ferrite.toml file');
        return;
    }

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('ferrite-config');
    validateConfigFile(editor.document, diagnosticCollection);
}

// Validate config file content (exported for testing)
export function validateConfigFile(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection) {
    const text = document.getText();
    const problems: vscode.Diagnostic[] = [];

    // Check for common issues
    const lines = text.split('\n');

    lines.forEach((line, i) => {
        // Check for invalid section names
        const sectionMatch = line.match(/^\s*\[([^\]]+)\]/);
        if (sectionMatch) {
            const validSections = ['server', 'storage', 'persistence', 'logging', 'metrics', 'tls', 'auth', 'cluster', 'replication'];
            const section = sectionMatch[1].split('.')[0];
            if (!validSections.includes(section)) {
                problems.push(new vscode.Diagnostic(
                    new vscode.Range(i, 0, i, line.length),
                    `Unknown section: ${section}`,
                    vscode.DiagnosticSeverity.Warning
                ));
            }
        }

        // Check for typos in common keys
        const keyMatch = line.match(/^\s*([a-z_]+)\s*=/);
        if (keyMatch) {
            const key = keyMatch[1];
            const typos: Record<string, string> = {
                'prot': 'port',
                'hosr': 'host',
                'databse': 'database',
                'pasword': 'password',
                'enbled': 'enabled',
            };
            if (typos[key]) {
                problems.push(new vscode.Diagnostic(
                    new vscode.Range(i, 0, i, line.length),
                    `Did you mean '${typos[key]}'?`,
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }

        // Check for invalid port numbers
        const portMatch = line.match(/port\s*=\s*(\d+)/);
        if (portMatch) {
            const port = parseInt(portMatch[1]);
            if (port < 1 || port > 65535) {
                problems.push(new vscode.Diagnostic(
                    new vscode.Range(i, 0, i, line.length),
                    'Port must be between 1 and 65535',
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }
    });

    diagnostics.set(document.uri, problems);

    if (problems.length === 0) {
        vscode.window.showInformationMessage('Configuration is valid');
    }
}

// Completion provider (exported for testing)
export class FerriteCompletionProvider implements vscode.CompletionItemProvider {
    private commands = [
        { name: 'GET', description: 'Get the value of a key', args: 'key' },
        { name: 'SET', description: 'Set the value of a key', args: 'key value [EX seconds] [NX|XX]' },
        { name: 'DEL', description: 'Delete one or more keys', args: 'key [key ...]' },
        { name: 'EXISTS', description: 'Check if key exists', args: 'key [key ...]' },
        { name: 'EXPIRE', description: 'Set key expiration', args: 'key seconds' },
        { name: 'TTL', description: 'Get time to live', args: 'key' },
        { name: 'INCR', description: 'Increment value', args: 'key' },
        { name: 'DECR', description: 'Decrement value', args: 'key' },
        { name: 'HSET', description: 'Set hash field', args: 'key field value [field value ...]' },
        { name: 'HGET', description: 'Get hash field', args: 'key field' },
        { name: 'HGETALL', description: 'Get all hash fields', args: 'key' },
        { name: 'LPUSH', description: 'Push to list head', args: 'key value [value ...]' },
        { name: 'RPUSH', description: 'Push to list tail', args: 'key value [value ...]' },
        { name: 'LRANGE', description: 'Get list range', args: 'key start stop' },
        { name: 'SADD', description: 'Add to set', args: 'key member [member ...]' },
        { name: 'SMEMBERS', description: 'Get set members', args: 'key' },
        { name: 'ZADD', description: 'Add to sorted set', args: 'key score member [score member ...]' },
        { name: 'ZRANGE', description: 'Get sorted set range', args: 'key start stop [WITHSCORES]' },
        { name: 'XADD', description: 'Add to stream', args: 'key * field value [field value ...]' },
        { name: 'XREAD', description: 'Read from stream', args: '[COUNT n] [BLOCK ms] STREAMS key [key ...] id [id ...]' },
        { name: 'PUBLISH', description: 'Publish message', args: 'channel message' },
        { name: 'SUBSCRIBE', description: 'Subscribe to channel', args: 'channel [channel ...]' },
        { name: 'MULTI', description: 'Start transaction', args: '' },
        { name: 'EXEC', description: 'Execute transaction', args: '' },
        { name: 'PING', description: 'Ping server', args: '' },
        { name: 'INFO', description: 'Get server info', args: '[section]' },
        { name: 'VECTOR.SEARCH', description: 'Vector similarity search', args: 'index vector TOP_K n' },
        { name: 'TS.ADD', description: 'Add time series sample', args: 'key timestamp value' },
        { name: 'DOC.INSERT', description: 'Insert document', args: 'collection id document' },
    ];

    provideCompletionItems(
        _document: vscode.TextDocument,
        _position: vscode.Position
    ): vscode.CompletionItem[] {
        return this.commands.map(cmd => {
            const item = new vscode.CompletionItem(cmd.name, vscode.CompletionItemKind.Function);
            item.detail = cmd.args;
            item.documentation = cmd.description;
            item.insertText = new vscode.SnippetString(`${cmd.name} $0`);
            return item;
        });
    }
}

// Hover provider (exported for testing)
export class FerriteHoverProvider implements vscode.HoverProvider {
    private commands: Record<string, { syntax: string; description: string }> = {
        'GET': { syntax: 'GET key', description: 'Get the value of a key. Returns nil if the key does not exist.' },
        'SET': { syntax: 'SET key value [EX seconds] [PX ms] [NX|XX]', description: 'Set key to hold the string value. EX sets expiry in seconds, PX in milliseconds. NX only sets if key does not exist, XX only if it exists.' },
        'DEL': { syntax: 'DEL key [key ...]', description: 'Removes the specified keys. Returns the number of keys removed.' },
        'HSET': { syntax: 'HSET key field value [field value ...]', description: 'Sets field in the hash stored at key to value. Returns the number of fields added.' },
        'LPUSH': { syntax: 'LPUSH key value [value ...]', description: 'Insert values at the head of the list. Returns the length of the list after the push.' },
        'ZADD': { syntax: 'ZADD key [NX|XX] [GT|LT] [CH] score member [score member ...]', description: 'Adds members with scores to a sorted set. Returns the number of elements added.' },
        'XADD': { syntax: 'XADD key [NOMKSTREAM] [MAXLEN|MINID [=|~] threshold] *|id field value [field value ...]', description: 'Appends an entry to a stream. Returns the ID of the added entry.' },
    };

    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
        const range = document.getWordRangeAtPosition(position);
        if (!range) return null;

        const word = document.getText(range).toUpperCase();
        const cmdInfo = this.commands[word];

        if (!cmdInfo) return null;

        const markdown = new vscode.MarkdownString();
        markdown.appendCodeblock(cmdInfo.syntax, 'ferriteql');
        markdown.appendMarkdown('\n\n' + cmdInfo.description);

        return new vscode.Hover(markdown, range);
    }
}

// Tree view provider for connections
class ConnectionsTreeProvider implements vscode.TreeDataProvider<ConnectionItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ConnectionItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: ConnectionItem): vscode.TreeItem {
        return element;
    }

    getChildren(): ConnectionItem[] {
        const config = vscode.workspace.getConfiguration('ferrite');
        const connections = config.get<any[]>('connections') || [];

        if (connections.length === 0) {
            return [new ConnectionItem('No connections configured', '', vscode.TreeItemCollapsibleState.None)];
        }

        return connections.map(conn => {
            const item = new ConnectionItem(
                conn.name || `${conn.host}:${conn.port}`,
                `${conn.host}:${conn.port}`,
                vscode.TreeItemCollapsibleState.None
            );
            item.contextValue = 'connection';
            item.iconPath = new vscode.ThemeIcon('database');
            return item;
        });
    }
}

class ConnectionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}
