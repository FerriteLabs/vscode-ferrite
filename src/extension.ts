// External dependencies (sorted alphabetically)
import Redis from 'ioredis';
import * as vscode from 'vscode';

// Local modules (sorted alphabetically)
import { ConnectionManager } from './connectionManager';
import { FerriteQLCompletionProvider } from './ferriteql-completions';
import { KeysTreeProvider } from './providers/keysTreeProvider';
import { ServerInfoTreeProvider } from './providers/serverInfoTreeProvider';

let client: Redis | null = null;
let outputChannel: vscode.OutputChannel;
let pubsubOutputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let keysTreeProvider: KeysTreeProvider;
let serverInfoProvider: ServerInfoTreeProvider;
let configDiagnostics: vscode.DiagnosticCollection;

// Pub/Sub state
let subscriberClient: Redis | null = null;
const activeSubscriptions = new Set<string>();

// Connection manager extracted for better modularity and testability
// Protocol parsing is delegated to parseCommand() utility
const connectionManager = new ConnectionManager();

// Status bar configuration for connected server info display
const STATUS_BAR_PRIORITY = 200;
const STATUS_BAR_CONNECTED_ICON = '$(database)';
const STATUS_BAR_DISCONNECTED_ICON = '$(debug-disconnect)';
const STATUS_BAR_CONNECTING_ICON = '$(sync~spin)';
const STATUS_BAR_REFRESH_INTERVAL_MS = 15000;

// Connection state enum for status bar indicator
enum ConnectionState {
    Disconnected = 'disconnected',
    Connecting = 'connecting',
    Connected = 'connected',
    Error = 'error',
}

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Ferrite');
    pubsubOutputChannel = vscode.window.createOutputChannel('Ferrite Pub/Sub');
    configDiagnostics = vscode.languages.createDiagnosticCollection('ferrite-config');
    context.subscriptions.push(configDiagnostics);

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'ferrite.connect';
    updateStatusBar(false);
    statusBarItem.show();

    // Register tree view providers
    const connectionsProvider = new ConnectionsTreeProvider();
    keysTreeProvider = new KeysTreeProvider(() => client, outputChannel);
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
        vscode.commands.registerCommand('ferrite.editKey', editKey),
        vscode.commands.registerCommand('ferrite.subscribe', subscribeToChannel),
        vscode.commands.registerCommand('ferrite.unsubscribe', unsubscribeFromChannel),
        vscode.commands.registerCommand('ferrite.unsubscribeAll', unsubscribeAll),
        vscode.commands.registerCommand('ferrite.clusterInfo', clusterInfo),
        vscode.commands.registerCommand('ferrite.clusterNodes', clusterNodes),
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
    if (subscriberClient) {
        subscriberClient.disconnect();
        subscriberClient = null;
        activeSubscriptions.clear();
    }
    if (client) {
        client.quit();
    }
    connectionManager?.dispose();
    statusBarItem?.dispose();
    outputChannel?.dispose();
    pubsubOutputChannel?.dispose();
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

async function editKey(key: string) {
    if (!client) {
        vscode.window.showErrorMessage('Not connected to Ferrite');
        return;
    }

    try {
        const type = await client.type(key);

        switch (type) {
            case 'string': {
                const currentValue = await client.get(key);
                const newValue = await vscode.window.showInputBox({
                    prompt: `Edit value for key: ${key}`,
                    value: currentValue || '',
                    placeHolder: 'Enter new value',
                });
                if (newValue !== undefined) {
                    const ttl = await client.ttl(key);
                    await client.set(key, newValue);
                    if (ttl > 0) {
                        await client.expire(key, ttl);
                    }
                    vscode.window.showInformationMessage(`Updated key: ${key}`);
                    keysTreeProvider.refresh();
                }
                break;
            }
            case 'hash': {
                const fields = await client.hgetall(key);
                const fieldNames = Object.keys(fields);
                if (fieldNames.length === 0) {
                    vscode.window.showInformationMessage('Hash is empty');
                    return;
                }
                const selectedField = await vscode.window.showQuickPick(
                    fieldNames.map(f => ({ label: f, description: fields[f] })),
                    { placeHolder: 'Select a field to edit' }
                );
                if (selectedField) {
                    const newValue = await vscode.window.showInputBox({
                        prompt: `Edit ${key} → ${selectedField.label}`,
                        value: fields[selectedField.label],
                        placeHolder: 'Enter new value',
                    });
                    if (newValue !== undefined) {
                        await client.hset(key, selectedField.label, newValue);
                        vscode.window.showInformationMessage(`Updated ${key} → ${selectedField.label}`);
                        keysTreeProvider.refresh();
                    }
                }
                break;
            }
            case 'list': {
                const items = await client.lrange(key, 0, -1);
                if (items.length === 0) {
                    vscode.window.showInformationMessage('List is empty');
                    return;
                }
                const action = await vscode.window.showQuickPick(
                    [
                        { label: 'Edit element', description: 'Modify an existing element' },
                        { label: 'Push element', description: 'Add a new element to the list' },
                    ],
                    { placeHolder: 'Choose action' }
                );
                if (action?.label === 'Edit element') {
                    const selected = await vscode.window.showQuickPick(
                        items.map((item, i) => ({ label: `[${i}]`, description: item })),
                        { placeHolder: 'Select element to edit' }
                    );
                    if (selected) {
                        const index = parseInt(selected.label.slice(1, -1), 10);
                        const newValue = await vscode.window.showInputBox({
                            prompt: `Edit ${key}[${index}]`,
                            value: selected.description,
                            placeHolder: 'Enter new value',
                        });
                        if (newValue !== undefined) {
                            await client.lset(key, index, newValue);
                            vscode.window.showInformationMessage(`Updated ${key}[${index}]`);
                            keysTreeProvider.refresh();
                        }
                    }
                } else if (action?.label === 'Push element') {
                    const newValue = await vscode.window.showInputBox({
                        prompt: `Add element to ${key}`,
                        placeHolder: 'Enter value',
                    });
                    if (newValue !== undefined) {
                        await client.rpush(key, newValue);
                        vscode.window.showInformationMessage(`Pushed element to ${key}`);
                        keysTreeProvider.refresh();
                    }
                }
                break;
            }
            default:
                vscode.window.showWarningMessage(
                    `Editing ${type} keys is not yet supported. Use the command line for this type.`
                );
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to edit key: ${err.message}`);
    }
}

async function subscribeToChannel() {
    if (!client) {
        vscode.window.showErrorMessage('Not connected to Ferrite');
        return;
    }

    const channel = await vscode.window.showInputBox({
        prompt: 'Enter channel name to subscribe to',
        placeHolder: 'my-channel',
    });

    if (!channel) {
        return;
    }

    if (activeSubscriptions.has(channel)) {
        vscode.window.showWarningMessage(`Already subscribed to '${channel}'`);
        return;
    }

    try {
        // Create a dedicated subscriber connection (ioredis requires separate connection for subscribe)
        if (!subscriberClient) {
            subscriberClient = client.duplicate();
            subscriberClient.on('error', (err: Error) => {
                pubsubOutputChannel.appendLine(`[${new Date().toISOString()}] Pub/Sub error: ${err.message}`);
            });
            subscriberClient.on('message', (ch: string, message: string) => {
                const timestamp = new Date().toISOString();
                pubsubOutputChannel.appendLine(`[${timestamp}] #${ch}: ${message}`);
            });
            subscriberClient.on('pmessage', (pattern: string, ch: string, message: string) => {
                const timestamp = new Date().toISOString();
                pubsubOutputChannel.appendLine(`[${timestamp}] ${pattern} → #${ch}: ${message}`);
            });
        }

        // Detect pattern subscriptions (contains * or ?)
        if (channel.includes('*') || channel.includes('?')) {
            await subscriberClient.psubscribe(channel);
        } else {
            await subscriberClient.subscribe(channel);
        }

        activeSubscriptions.add(channel);
        pubsubOutputChannel.show(true);
        pubsubOutputChannel.appendLine(`--- Subscribed to '${channel}' at ${new Date().toISOString()} ---`);
        vscode.window.showInformationMessage(`Subscribed to '${channel}' (${activeSubscriptions.size} active)`);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to subscribe: ${err.message}`);
    }
}

async function unsubscribeFromChannel() {
    if (activeSubscriptions.size === 0) {
        vscode.window.showInformationMessage('No active subscriptions');
        return;
    }

    const channel = await vscode.window.showQuickPick(
        Array.from(activeSubscriptions),
        { placeHolder: 'Select channel to unsubscribe from' }
    );

    if (!channel || !subscriberClient) {
        return;
    }

    try {
        if (channel.includes('*') || channel.includes('?')) {
            await subscriberClient.punsubscribe(channel);
        } else {
            await subscriberClient.unsubscribe(channel);
        }

        activeSubscriptions.delete(channel);
        pubsubOutputChannel.appendLine(`--- Unsubscribed from '${channel}' at ${new Date().toISOString()} ---`);
        vscode.window.showInformationMessage(`Unsubscribed from '${channel}' (${activeSubscriptions.size} active)`);

        if (activeSubscriptions.size === 0 && subscriberClient) {
            subscriberClient.disconnect();
            subscriberClient = null;
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to unsubscribe: ${err.message}`);
    }
}

async function unsubscribeAll() {
    if (activeSubscriptions.size === 0) {
        vscode.window.showInformationMessage('No active subscriptions');
        return;
    }

    try {
        if (subscriberClient) {
            await subscriberClient.unsubscribe();
            await subscriberClient.punsubscribe();
            subscriberClient.disconnect();
            subscriberClient = null;
        }

        const count = activeSubscriptions.size;
        activeSubscriptions.clear();
        pubsubOutputChannel.appendLine(`--- Unsubscribed from all ${count} channels at ${new Date().toISOString()} ---`);
        vscode.window.showInformationMessage(`Unsubscribed from all ${count} channels`);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to unsubscribe: ${err.message}`);
    }
}

// Update status bar with connection state indicator
function updateStatusBar(connected: boolean, info?: string, state?: ConnectionState) {
    const connectionState = state || (connected ? ConnectionState.Connected : ConnectionState.Disconnected);

    switch (connectionState) {
        case ConnectionState.Connected:
            statusBarItem.text = `${STATUS_BAR_CONNECTED_ICON} Ferrite: ${info || 'Connected'}`;
            statusBarItem.tooltip = new vscode.MarkdownString(
                `**Ferrite Server**\n\nHost: ${info || 'unknown'}\n\nStatus: Connected\n\nClick to manage connection`
            );
            statusBarItem.backgroundColor = undefined;
            break;
        case ConnectionState.Connecting:
            statusBarItem.text = `${STATUS_BAR_CONNECTING_ICON} Ferrite: Connecting...`;
            statusBarItem.tooltip = 'Establishing connection to Ferrite server';
            statusBarItem.backgroundColor = undefined;
            break;
        case ConnectionState.Error:
            statusBarItem.text = `${STATUS_BAR_DISCONNECTED_ICON} Ferrite: Error`;
            statusBarItem.tooltip = 'Connection error - click to reconnect';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            break;
        case ConnectionState.Disconnected:
        default:
            statusBarItem.text = `${STATUS_BAR_DISCONNECTED_ICON} Ferrite: Disconnected`;
            statusBarItem.tooltip = 'Click to connect to Ferrite';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            break;
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
        const redisOptions: any = {
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
        };

        // Enable TLS if configured on the connection profile
        if (connectionConfig.tls) {
            const verifyCert = connectionConfig.tlsVerifyCertificate !== false;
            redisOptions.tls = { rejectUnauthorized: verifyCert };
        }

        client = new Redis(redisOptions);

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

    try {
        await executeCommandText(command);
    } catch (err: any) {
        outputChannel.appendLine(`Error: ${err.message || 'Unknown error'}`);
        vscode.window.showErrorMessage(`Command failed: ${err.message || 'Unknown error'}`);
    }
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
        try {
            await executeCommandText(command.trim());
        } catch (err: any) {
            outputChannel.appendLine(`Error executing '${command.trim()}': ${err.message || 'Unknown error'}`);
        }
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

        const config = vscode.workspace.getConfiguration('ferrite');
        const timeoutMs = (config.get<number>('commandTimeout') || 30) * 1000;

        const resultPromise = client.call(command, ...args);
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Command timed out after ${timeoutMs / 1000}s`)), timeoutMs)
        );

        const result = await Promise.race([resultPromise, timeoutPromise]);

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

    for (let i = 0; i < cmd.length; i++) {
        const char = cmd[i];

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
            // Handle case where quote immediately follows a token (e.g., key"value")
            // by splitting the current token first
            if (current) {
                parts.push(current);
                current = '';
            }
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

    if (inQuote) {
        throw new Error(`Unclosed ${quoteChar} quote in command`);
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

// Show cluster info
async function clusterInfo() {
    if (!client) {
        vscode.window.showErrorMessage('Not connected to Ferrite');
        return;
    }

    try {
        const info = await client.call('CLUSTER', 'INFO') as string;
        const doc = await vscode.workspace.openTextDocument({
            content: info,
            language: 'ini'
        });
        await vscode.window.showTextDocument(doc);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to get cluster info: ${err.message}`);
    }
}

// Show cluster nodes
async function clusterNodes() {
    if (!client) {
        vscode.window.showErrorMessage('Not connected to Ferrite');
        return;
    }

    try {
        const nodes = await client.call('CLUSTER', 'NODES') as string;
        const doc = await vscode.workspace.openTextDocument({
            content: nodes,
            language: 'plaintext'
        });
        await vscode.window.showTextDocument(doc);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to get cluster nodes: ${err.message}`);
    }
}

// Validate config file
async function validateConfig() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.fileName.endsWith('ferrite.toml')) {
        vscode.window.showErrorMessage('Please open a ferrite.toml file');
        return;
    }

    validateConfigFile(editor.document, configDiagnostics);
}

// Validate config file content (exported for testing)
export function validateConfigFile(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection) {
    const text = document.getText();
    const problems: vscode.Diagnostic[] = [];
    const lines = text.split('\n');

    let currentSection = '';
    const foundKeys: Record<string, Set<string>> = {};

    const validSections = [
        'server', 'storage', 'persistence', 'logging', 'metrics',
        'tls', 'auth', 'acl', 'cluster', 'replication',
    ];

    // Known keys per section with expected types
    const sectionKeys: Record<string, Record<string, 'string' | 'number' | 'boolean'>> = {
        server: { bind: 'string', port: 'number', max_connections: 'number', tcp_keepalive: 'number', timeout: 'number', protected_mode: 'boolean' },
        storage: { databases: 'number', max_memory: 'number', eviction_policy: 'string', max_key_size: 'number', max_value_size: 'number' },
        persistence: { aof_enabled: 'boolean', aof_sync: 'string', aof_file: 'string', checkpoint_interval: 'number', rdb_filename: 'string' },
        logging: { level: 'string', format: 'string', file: 'string' },
        metrics: { enabled: 'boolean', port: 'number', bind: 'string' },
        tls: { enabled: 'boolean', cert_file: 'string', key_file: 'string', ca_file: 'string', require_client_cert: 'boolean', min_protocol_version: 'string' },
        acl: { enabled: 'boolean', users_file: 'string', log_enabled: 'boolean', log_max_len: 'number', default_user: 'string' },
        cluster: { enabled: 'boolean', node_id: 'string', announce_ip: 'string', announce_port: 'number', cluster_port: 'number' },
        replication: { role: 'string', primary_host: 'string', primary_port: 'number', repl_backlog_size: 'number' },
    };

    // Enum validations
    const enumValues: Record<string, string[]> = {
        'persistence.aof_sync': ['always', 'everysec', 'no'],
        'logging.level': ['trace', 'debug', 'info', 'warn', 'error'],
        'logging.format': ['json', 'pretty', 'compact'],
        'storage.eviction_policy': ['noeviction', 'allkeys-lru', 'volatile-lru', 'allkeys-lfu', 'volatile-lfu', 'allkeys-random', 'volatile-random', 'volatile-ttl'],
        'tls.min_protocol_version': ['1.2', '1.3'],
        'replication.role': ['primary', 'replica'],
    };

    // Numeric range validations
    const numericRanges: Record<string, [number, number]> = {
        'server.port': [1, 65535],
        'server.max_connections': [1, 1000000],
        'server.tcp_keepalive': [0, 7200],
        'server.timeout': [0, 86400],
        'storage.databases': [1, 128],
        'storage.max_memory': [1048576, Number.MAX_SAFE_INTEGER], // min 1MB
        'metrics.port': [1, 65535],
        'acl.log_max_len': [0, 10000],
        'cluster.announce_port': [1, 65535],
        'cluster.cluster_port': [1, 65535],
        'replication.primary_port': [1, 65535],
    };

    const typos: Record<string, string> = {
        'prot': 'port', 'hosr': 'host', 'databse': 'database', 'databses': 'databases',
        'pasword': 'password', 'enbled': 'enabled', 'persitence': 'persistence',
        'replciation': 'replication', 'loggin': 'logging', 'metics': 'metrics',
        'sever': 'server', 'stoage': 'storage', 'aof_enbled': 'aof_enabled',
    };

    lines.forEach((line, i) => {
        const trimmed = line.trim();

        // Skip comments and empty lines
        if (trimmed === '' || trimmed.startsWith('#')) return;

        // Check section headers
        const sectionMatch = trimmed.match(/^\[([^\]]+)\]/);
        if (sectionMatch) {
            currentSection = sectionMatch[1].split('.')[0];
            if (!foundKeys[currentSection]) {
                foundKeys[currentSection] = new Set();
            }
            if (!validSections.includes(currentSection)) {
                problems.push(new vscode.Diagnostic(
                    new vscode.Range(i, 0, i, line.length),
                    `Unknown section '${currentSection}'. Valid sections: ${validSections.join(', ')}`,
                    vscode.DiagnosticSeverity.Warning
                ));
            }
            return;
        }

        // Check key-value pairs
        const kvMatch = trimmed.match(/^([a-z_]+)\s*=\s*(.+)/);
        if (!kvMatch) return;

        const key = kvMatch[1];
        const rawValue = kvMatch[2].trim();

        // Track found keys
        if (currentSection && foundKeys[currentSection]) {
            foundKeys[currentSection].add(key);
        }

        // Typo detection
        if (typos[key]) {
            problems.push(new vscode.Diagnostic(
                new vscode.Range(i, 0, i, line.length),
                `Did you mean '${typos[key]}'?`,
                vscode.DiagnosticSeverity.Error
            ));
            return;
        }

        // Validate known key exists in section
        const knownKeys = sectionKeys[currentSection];
        if (knownKeys && !knownKeys[key]) {
            // Only warn, don't error — Ferrite may accept keys we don't know about
            problems.push(new vscode.Diagnostic(
                new vscode.Range(i, 0, i, line.length),
                `Unknown key '${key}' in [${currentSection}]`,
                vscode.DiagnosticSeverity.Hint
            ));
        }

        // Numeric range validation
        const rangeKey = `${currentSection}.${key}`;
        if (numericRanges[rangeKey]) {
            const numValue = parseInt(rawValue);
            if (!isNaN(numValue)) {
                const [min, max] = numericRanges[rangeKey];
                if (numValue < min || numValue > max) {
                    problems.push(new vscode.Diagnostic(
                        new vscode.Range(i, 0, i, line.length),
                        `Value ${numValue} out of range for ${key} (expected ${min}–${max})`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
        }

        // Enum validation
        const enumKey = `${currentSection}.${key}`;
        if (enumValues[enumKey]) {
            const strValue = rawValue.replace(/^["']|["']$/g, '');
            if (!enumValues[enumKey].includes(strValue)) {
                problems.push(new vscode.Diagnostic(
                    new vscode.Range(i, 0, i, line.length),
                    `Invalid value '${strValue}' for ${key}. Expected: ${enumValues[enumKey].join(', ')}`,
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }

        // Boolean validation
        if (knownKeys && knownKeys[key] === 'boolean') {
            if (!['true', 'false'].includes(rawValue)) {
                problems.push(new vscode.Diagnostic(
                    new vscode.Range(i, 0, i, line.length),
                    `Expected boolean (true/false) for ${key}, got '${rawValue}'`,
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }

        // TLS consistency: if enabled, cert and key must be present
        if (currentSection === 'tls' && key === 'enabled' && rawValue === 'true') {
            // We'll check after parsing all lines
        }
    });

    // Cross-field validation: TLS requires cert_file and key_file
    const tlsKeys = foundKeys['tls'];
    if (tlsKeys && tlsKeys.has('enabled')) {
        // Check in text directly since we tracked keys
        if (text.includes('[tls]') && text.match(/enabled\s*=\s*true/)) {
            if (!tlsKeys.has('cert_file')) {
                problems.push(new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 0),
                    '[tls] enabled=true requires cert_file to be set',
                    vscode.DiagnosticSeverity.Warning
                ));
            }
            if (!tlsKeys.has('key_file')) {
                problems.push(new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 0),
                    '[tls] enabled=true requires key_file to be set',
                    vscode.DiagnosticSeverity.Warning
                ));
            }
        }
    }

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
        'HSET': { syntax: 'HSET key field value [field value ...] [field value ...]', description: 'Sets field in the hash stored at key to value. Returns the number of fields added.' },
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
