import * as vscode from 'vscode';

// Tree view provider for connections
export class ConnectionsTreeProvider implements vscode.TreeDataProvider<ConnectionItem> {
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
