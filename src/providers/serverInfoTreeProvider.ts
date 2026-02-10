import * as vscode from 'vscode';
import Redis from 'ioredis';

/**
 * Tree view provider for displaying Ferrite server information.
 * Shows server stats, memory usage, clients, and persistence info.
 */
export class ServerInfoTreeProvider implements vscode.TreeDataProvider<InfoItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<InfoItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private refreshInterval: NodeJS.Timeout | undefined;

    constructor(private getClient: () => Redis | null) {}

    startAutoRefresh(intervalMs: number = 5000): void {
        this.stopAutoRefresh();
        this.refreshInterval = setInterval(() => this.refresh(), intervalMs);
    }

    stopAutoRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = undefined;
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: InfoItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: InfoItem): Promise<InfoItem[]> {
        const client = this.getClient();
        if (!client) {
            return [new InfoItem('Connect to view server info', '', vscode.TreeItemCollapsibleState.None)];
        }

        try {
            if (!element) {
                // Root level: show sections
                return [
                    this.createSection('Server', 'server'),
                    this.createSection('Memory', 'memory'),
                    this.createSection('Clients', 'clients'),
                    this.createSection('Stats', 'stats'),
                    this.createSection('Keyspace', 'keyspace'),
                    this.createSection('Persistence', 'persistence'),
                ];
            }

            // Section level: show key-value pairs
            const info = await client.info(element.section || '');
            return this.parseInfoSection(info, element.section || '');
        } catch {
            return [new InfoItem('Error fetching info', '', vscode.TreeItemCollapsibleState.None)];
        }
    }

    private createSection(label: string, section: string): InfoItem {
        const item = new InfoItem(label, '', vscode.TreeItemCollapsibleState.Collapsed);
        item.section = section;
        item.iconPath = this.getSectionIcon(section);
        return item;
    }

    private getSectionIcon(section: string): vscode.ThemeIcon {
        switch (section) {
            case 'server': return new vscode.ThemeIcon('server');
            case 'memory': return new vscode.ThemeIcon('circuit-board');
            case 'clients': return new vscode.ThemeIcon('person');
            case 'stats': return new vscode.ThemeIcon('graph');
            case 'keyspace': return new vscode.ThemeIcon('database');
            case 'persistence': return new vscode.ThemeIcon('save');
            default: return new vscode.ThemeIcon('info');
        }
    }

    private parseInfoSection(info: string, section: string): InfoItem[] {
        const items: InfoItem[] = [];
        const lines = info.split('\n');
        let inSection = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith(`# ${section}`) || trimmed.toLowerCase().startsWith(`# ${section}`)) {
                inSection = true;
                continue;
            }
            if (trimmed.startsWith('#') && inSection) {
                break;
            }
            if (inSection && trimmed.includes(':')) {
                const [key, value] = trimmed.split(':', 2);
                if (key && value !== undefined) {
                    const item = new InfoItem(key.trim(), this.formatValue(key.trim(), value.trim()), vscode.TreeItemCollapsibleState.None);
                    items.push(item);
                }
            }
        }

        return items;
    }

    private formatValue(key: string, value: string): string {
        // Format memory values
        if (key.includes('memory') && /^\d+$/.test(value)) {
            const bytes = parseInt(value);
            if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
            if (bytes > 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
            if (bytes > 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        }

        // Format uptime
        if (key === 'uptime_in_seconds') {
            const secs = parseInt(value);
            if (secs > 86400) return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
            if (secs > 3600) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
            return `${Math.floor(secs / 60)}m ${secs % 60}s`;
        }

        return value;
    }
}

export class InfoItem extends vscode.TreeItem {
    public section?: string;

    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}
