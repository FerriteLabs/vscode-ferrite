import * as vscode from 'vscode';
import Redis from 'ioredis';

/**
 * ConnectionManager handles the lifecycle of Ferrite server connections.
 * Extracted from extension.ts to improve modularity and testability.
 */
export class ConnectionManager {
    private client: Redis | null = null;
    private readonly _onDidConnect = new vscode.EventEmitter<{ host: string; port: number }>();
    private readonly _onDidDisconnect = new vscode.EventEmitter<void>();

    readonly onDidConnect = this._onDidConnect.event;
    readonly onDidDisconnect = this._onDidDisconnect.event;

    get isConnected(): boolean {
        return this.client !== null && this.client.status === 'ready';
    }

    getClient(): Redis | null {
        return this.client;
    }

    async connect(config: { host: string; port: number; password?: string; database?: number }): Promise<Redis> {
        if (this.client) {
            await this.disconnect();
        }

        this.client = new Redis({
            host: config.host,
            port: config.port,
            password: config.password,
            db: config.database || 0,
            lazyConnect: true,
            connectTimeout: 5000,
            retryStrategy(times: number) {
                if (times > 3) {
                    return null;
                }
                return Math.min(times * 200, 2000);
            },
        });

        await this.client.connect();
        this._onDidConnect.fire({ host: config.host, port: config.port });
        return this.client;
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.quit();
            this.client = null;
            this._onDidDisconnect.fire();
        }
    }

    dispose(): void {
        if (this.client) {
            this.client.disconnect();
            this.client = null;
        }
        this._onDidConnect.dispose();
        this._onDidDisconnect.dispose();
    }
}
