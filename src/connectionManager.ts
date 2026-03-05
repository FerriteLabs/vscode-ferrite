import * as vscode from 'vscode';
import Redis from 'ioredis';

/**
 * ConnectionManager handles the lifecycle of Ferrite server connections,
 * including auto-reconnect with exponential backoff and periodic heartbeat.
 */
export class ConnectionManager {
    private client: Redis | null = null;
    private readonly _onDidConnect = new vscode.EventEmitter<{ host: string; port: number }>();
    private readonly _onDidDisconnect = new vscode.EventEmitter<void>();
    private readonly _onDidReconnect = new vscode.EventEmitter<void>();
    private readonly outputChannel: vscode.OutputChannel;

    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    private lastConfig: { host: string; port: number; password?: string; database?: number } | null = null;
    private reconnecting = false;

    readonly onDidConnect = this._onDidConnect.event;
    readonly onDidDisconnect = this._onDidDisconnect.event;
    readonly onDidReconnect = this._onDidReconnect.event;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Ferrite');
    }

    get isConnected(): boolean {
        return this.client !== null && this.client.status === 'ready';
    }

    getClient(): Redis | null {
        return this.client;
    }

    private getConfig() {
        const config = vscode.workspace.getConfiguration('ferrite');
        return {
            connectTimeout: config.get<number>('connectTimeout', 5000),
            maxRetries: config.get<number>('maxRetries', 3),
            autoReconnect: config.get<boolean>('autoReconnect', true),
            heartbeatInterval: config.get<number>('heartbeatInterval', 30000),
        };
    }

    async connect(config: { host: string; port: number; password?: string; database?: number }): Promise<Redis> {
        if (this.client) {
            await this.disconnect();
        }

        this.lastConfig = config;
        const settings = this.getConfig();

        this.client = new Redis({
            host: config.host,
            port: config.port,
            password: config.password,
            db: config.database || 0,
            lazyConnect: true,
            connectTimeout: settings.connectTimeout,
            retryStrategy: (times: number) => {
                if (times > settings.maxRetries) {
                    this.outputChannel.appendLine(`[${new Date().toISOString()}] Connection failed after ${settings.maxRetries} retries`);
                    return null;
                }
                const delay = Math.min(times * 200, 2000);
                this.outputChannel.appendLine(`[${new Date().toISOString()}] Retry ${times}/${settings.maxRetries} in ${delay}ms`);
                return delay;
            },
        });

        this.client.on('error', (err) => {
            this.outputChannel.appendLine(`[${new Date().toISOString()}] Connection error: ${err.message}`);
        });

        this.client.on('close', () => {
            this.outputChannel.appendLine(`[${new Date().toISOString()}] Connection closed`);
            this.stopHeartbeat();
            if (settings.autoReconnect && this.lastConfig && !this.reconnecting) {
                this.attemptReconnect();
            }
        });

        try {
            await this.client.connect();
            this.outputChannel.appendLine(`[${new Date().toISOString()}] Connected to ${config.host}:${config.port}`);
            this._onDidConnect.fire({ host: config.host, port: config.port });
            this.startHeartbeat();
            return this.client;
        } catch (err) {
            this.client = null;
            throw err;
        }
    }

    private async attemptReconnect(): Promise<void> {
        if (!this.lastConfig || this.reconnecting) {
            return;
        }

        this.reconnecting = true;
        const maxAttempts = 10;
        const baseDelay = 1000;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 30000);
            this.outputChannel.appendLine(`[${new Date().toISOString()}] Auto-reconnect attempt ${attempt}/${maxAttempts} in ${delay}ms`);

            await new Promise(resolve => setTimeout(resolve, delay));

            if (!this.lastConfig) {
                break; // User disconnected during wait
            }

            try {
                await this.connect(this.lastConfig);
                this.outputChannel.appendLine(`[${new Date().toISOString()}] Auto-reconnect succeeded`);
                this._onDidReconnect.fire();
                this.reconnecting = false;
                return;
            } catch {
                // Will retry
            }
        }

        this.reconnecting = false;
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Auto-reconnect exhausted — manual reconnect required`);
        this._onDidDisconnect.fire();
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        const interval = this.getConfig().heartbeatInterval;
        if (interval <= 0) {
            return;
        }
        this.heartbeatInterval = setInterval(async () => {
            if (this.client && this.client.status === 'ready') {
                try {
                    await this.client.ping();
                } catch {
                    this.outputChannel.appendLine(`[${new Date().toISOString()}] Heartbeat failed`);
                }
            }
        }, interval);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    async disconnect(): Promise<void> {
        this.lastConfig = null;
        this.reconnecting = false;
        this.stopHeartbeat();
        if (this.client) {
            try {
                await this.client.quit();
            } catch {
                this.client.disconnect();
            }
            this.client = null;
            this._onDidDisconnect.fire();
        }
    }

    dispose(): void {
        this.lastConfig = null;
        this.reconnecting = false;
        this.stopHeartbeat();
        if (this.client) {
            this.client.disconnect();
            this.client = null;
        }
        this._onDidConnect.dispose();
        this._onDidDisconnect.dispose();
        this._onDidReconnect.dispose();
        this.outputChannel.dispose();
    }
}
