import * as vscode from 'vscode';

/**
 * FerriteQL completion provider for VS Code
 * Provides auto-completion for FerriteQL SQL-like syntax
 */
export class FerriteQLCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        const linePrefix = document.lineAt(position).text.substring(0, position.character).toUpperCase();
        const items: vscode.CompletionItem[] = [];

        // SQL keywords
        const keywords = [
            { label: 'SELECT', detail: 'Query keys and values', insertText: 'SELECT ' },
            { label: 'FROM', detail: 'Specify data source', insertText: 'FROM ' },
            { label: 'WHERE', detail: 'Filter condition', insertText: 'WHERE ' },
            { label: 'ORDER BY', detail: 'Sort results', insertText: 'ORDER BY ' },
            { label: 'LIMIT', detail: 'Limit results', insertText: 'LIMIT ' },
            { label: 'GROUP BY', detail: 'Group results', insertText: 'GROUP BY ' },
            { label: 'DELETE FROM', detail: 'Delete matching keys', insertText: 'DELETE FROM ' },
            { label: 'SET', detail: 'Set a value', insertText: 'SET ' },
            { label: 'AS OF', detail: 'Time-travel query', insertText: 'AS OF ' },
        ];

        // Ferrite-specific functions
        const functions = [
            { label: 'COUNT(*)', detail: 'Count matching rows', insertText: 'COUNT(*)' },
            { label: 'AVG(column)', detail: 'Average value', insertText: 'AVG(${1:column})' },
            { label: 'SUM(column)', detail: 'Sum values', insertText: 'SUM(${1:column})' },
            { label: 'MIN(column)', detail: 'Minimum value', insertText: 'MIN(${1:column})' },
            { label: 'MAX(column)', detail: 'Maximum value', insertText: 'MAX(${1:column})' },
        ];

        // Sources
        const sources = [
            { label: 'keys', detail: 'All keys in current database' },
            { label: 'keys:*', detail: 'All keys (explicit wildcard)' },
        ];

        // Column names
        const columns = [
            { label: 'key', detail: 'Key name' },
            { label: 'value', detail: 'Stored value' },
            { label: 'type', detail: 'Data type' },
            { label: 'ttl', detail: 'Time-to-live' },
            { label: 'size', detail: 'Memory usage' },
            { label: 'encoding', detail: 'Internal encoding' },
        ];

        // Context-aware completions
        if (linePrefix.includes('SELECT') && !linePrefix.includes('FROM')) {
            // After SELECT, suggest columns and functions
            columns.forEach(c => {
                const item = new vscode.CompletionItem(c.label, vscode.CompletionItemKind.Field);
                item.detail = c.detail;
                items.push(item);
            });
            functions.forEach(f => {
                const item = new vscode.CompletionItem(f.label, vscode.CompletionItemKind.Function);
                item.detail = f.detail;
                item.insertText = new vscode.SnippetString(f.insertText);
                items.push(item);
            });
        } else if (linePrefix.includes('FROM') && !linePrefix.includes('WHERE')) {
            // After FROM, suggest sources
            sources.forEach(s => {
                const item = new vscode.CompletionItem(s.label, vscode.CompletionItemKind.Module);
                item.detail = s.detail;
                items.push(item);
            });
        } else {
            // Default: suggest all keywords
            keywords.forEach(k => {
                const item = new vscode.CompletionItem(k.label, vscode.CompletionItemKind.Keyword);
                item.detail = k.detail;
                item.insertText = k.insertText;
                items.push(item);
            });
        }

        // Always include Redis commands
        const redisCommands = [
            'GET', 'SET', 'DEL', 'EXISTS', 'EXPIRE', 'TTL',
            'LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'LRANGE',
            'HSET', 'HGET', 'HDEL', 'HGETALL',
            'SADD', 'SREM', 'SMEMBERS',
            'ZADD', 'ZRANGE', 'ZSCORE',
            'VECTOR.CREATE', 'VECTOR.ADD', 'VECTOR.SEARCH',
            'SEMANTIC.SET', 'SEMANTIC.GET',
            'HISTORY', 'DIFF', 'RESTORE.FROM',
            'QUERY', 'WASM.EXEC',
        ];

        redisCommands.forEach(cmd => {
            const item = new vscode.CompletionItem(cmd, vscode.CompletionItemKind.Method);
            item.detail = 'Redis/Ferrite command';
            items.push(item);
        });

        return items;
    }
}
