import * as vscode from 'vscode';
import Redis from 'ioredis';

/**
 * Tree view provider for browsing keys in connected Ferrite instance.
 * Displays keys grouped by prefix (namespace) with type and TTL info.
 */
export class KeysTreeProvider implements vscode.TreeDataProvider<KeyItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<KeyItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private getClient: () => Redis | null) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: KeyItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: KeyItem): Promise<KeyItem[]> {
        const client = this.getClient();
        if (!client) {
            return [new KeyItem('Connect to browse keys', '', 'none', vscode.TreeItemCollapsibleState.None)];
        }

        try {
            if (!element) {
                // Root level: show namespaces (prefixes) and ungrouped keys
                const keys = await this.scanKeys(client, '*', 500);
                return this.groupByPrefix(keys);
            }

            if (element.contextValue === 'namespace') {
                // Namespace level: show keys under this prefix
                const keys = await this.scanKeys(client, `${element.prefix}*`, 200);
                const items: KeyItem[] = [];

                for (const key of keys) {
                    const type = await client.type(key);
                    const ttl = await client.ttl(key);
                    const item = new KeyItem(
                        key.substring(element.prefix.length),
                        this.formatTtl(ttl),
                        type,
                        vscode.TreeItemCollapsibleState.None
                    );
                    item.contextValue = 'key';
                    item.fullKey = key;
                    item.command = {
                        command: 'ferrite.inspectKey',
                        title: 'Inspect Key',
                        arguments: [key]
                    };
                    item.iconPath = this.getTypeIcon(type);
                    items.push(item);
                }

                return items;
            }

            return [];
        } catch {
            return [new KeyItem('Error loading keys', '', 'none', vscode.TreeItemCollapsibleState.None)];
        }
    }

    private async scanKeys(client: Redis, pattern: string, limit: number): Promise<string[]> {
        const keys: string[] = [];
        let cursor = '0';
        do {
            const [nextCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = nextCursor;
            keys.push(...batch);
        } while (cursor !== '0' && keys.length < limit);
        return keys.slice(0, limit).sort();
    }

    private groupByPrefix(keys: string[]): KeyItem[] {
        const groups = new Map<string, string[]>();
        const ungrouped: string[] = [];

        for (const key of keys) {
            const colonIdx = key.indexOf(':');
            if (colonIdx > 0 && colonIdx < key.length - 1) {
                const prefix = key.substring(0, colonIdx + 1);
                if (!groups.has(prefix)) {
                    groups.set(prefix, []);
                }
                groups.get(prefix)!.push(key);
            } else {
                ungrouped.push(key);
            }
        }

        const items: KeyItem[] = [];

        // Add namespace groups (only if >1 key in group)
        for (const [prefix, groupKeys] of groups) {
            if (groupKeys.length > 1) {
                const item = new KeyItem(
                    `${prefix}  (${groupKeys.length})`,
                    '',
                    'namespace',
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                item.contextValue = 'namespace';
                item.prefix = prefix;
                item.iconPath = new vscode.ThemeIcon('symbol-namespace');
                items.push(item);
            } else {
                ungrouped.push(...groupKeys);
            }
        }

        // Add ungrouped keys
        for (const key of ungrouped) {
            const item = new KeyItem(key, '', 'key', vscode.TreeItemCollapsibleState.None);
            item.contextValue = 'key';
            item.fullKey = key;
            item.command = {
                command: 'ferrite.inspectKey',
                title: 'Inspect Key',
                arguments: [key]
            };
            item.iconPath = new vscode.ThemeIcon('key');
            items.push(item);
        }

        return items;
    }

    private getTypeIcon(type: string): vscode.ThemeIcon {
        switch (type) {
            case 'string': return new vscode.ThemeIcon('symbol-string');
            case 'list': return new vscode.ThemeIcon('symbol-array');
            case 'hash': return new vscode.ThemeIcon('symbol-object');
            case 'set': return new vscode.ThemeIcon('symbol-enum');
            case 'zset': return new vscode.ThemeIcon('symbol-enum-member');
            case 'stream': return new vscode.ThemeIcon('symbol-event');
            default: return new vscode.ThemeIcon('key');
        }
    }

    private formatTtl(ttl: number): string {
        if (ttl === -1) return 'persistent';
        if (ttl === -2) return 'expired';
        if (ttl < 60) return `${ttl}s`;
        if (ttl < 3600) return `${Math.floor(ttl / 60)}m`;
        return `${Math.floor(ttl / 3600)}h`;
    }
}

export class KeyItem extends vscode.TreeItem {
    public fullKey?: string;
    public prefix: string = '';

    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly keyType: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = `${label} (${keyType})`;
    }
}
