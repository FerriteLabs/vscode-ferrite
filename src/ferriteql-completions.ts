import * as vscode from 'vscode';

/**
 * FerriteQL completion provider for VS Code.
 * Provides context-aware auto-completion for FerriteQL SQL-like syntax,
 * Ferrite-specific commands, and standard Redis commands.
 */
export class FerriteQLCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        // Build context from the full query (multi-line aware)
        const context = this.getQueryContext(document, position);
        const items: vscode.CompletionItem[] = [];

        // SQL keywords
        const keywords = [
            { label: 'SELECT', detail: 'Query keys and values', insertText: 'SELECT ' },
            { label: 'FROM', detail: 'Specify data source', insertText: 'FROM ' },
            { label: 'WHERE', detail: 'Filter condition', insertText: 'WHERE ' },
            { label: 'ORDER BY', detail: 'Sort results', insertText: 'ORDER BY ' },
            { label: 'LIMIT', detail: 'Limit results', insertText: 'LIMIT ' },
            { label: 'GROUP BY', detail: 'Group results', insertText: 'GROUP BY ' },
            { label: 'HAVING', detail: 'Filter grouped results', insertText: 'HAVING ' },
            { label: 'JOIN', detail: 'Join data sources', insertText: 'JOIN ' },
            { label: 'ON', detail: 'Join condition', insertText: 'ON ' },
            { label: 'DELETE FROM', detail: 'Delete matching keys', insertText: 'DELETE FROM ' },
            { label: 'SET', detail: 'Set a value', insertText: 'SET ' },
            { label: 'AS OF', detail: 'Time-travel query', insertText: 'AS OF ' },
            { label: 'MATERIALIZE', detail: 'Create materialized view', insertText: 'MATERIALIZE ' },
        ];

        // Aggregate and scalar functions
        const functions = [
            { label: 'COUNT(*)', detail: 'Count matching rows', insertText: 'COUNT(*)' },
            { label: 'AVG(column)', detail: 'Average value', insertText: 'AVG(${1:column})' },
            { label: 'SUM(column)', detail: 'Sum values', insertText: 'SUM(${1:column})' },
            { label: 'MIN(column)', detail: 'Minimum value', insertText: 'MIN(${1:column})' },
            { label: 'MAX(column)', detail: 'Maximum value', insertText: 'MAX(${1:column})' },
            { label: 'DISTINCT', detail: 'Unique values', insertText: 'DISTINCT ' },
            { label: 'COALESCE(a, b)', detail: 'First non-null value', insertText: 'COALESCE(${1:a}, ${2:b})' },
            { label: 'NOW()', detail: 'Current timestamp', insertText: 'NOW()' },
            { label: 'INTERVAL', detail: 'Time interval', insertText: "INTERVAL '${1:1 hour}'" },
        ];

        // Sources / key patterns
        const sources = [
            { label: 'keys', detail: 'All keys in current database' },
            { label: 'keys:*', detail: 'All keys (explicit wildcard)' },
            { label: 'users:*', detail: 'User keys pattern' },
            { label: 'sessions:*', detail: 'Session keys pattern' },
            { label: 'cache:*', detail: 'Cache keys pattern' },
        ];

        // Column names
        const columns = [
            { label: 'key', detail: 'Key name' },
            { label: 'value', detail: 'Stored value' },
            { label: 'type', detail: 'Data type' },
            { label: 'ttl', detail: 'Time-to-live' },
            { label: 'size', detail: 'Memory usage' },
            { label: 'encoding', detail: 'Internal encoding' },
            { label: 'idle', detail: 'Idle time since last access' },
            { label: 'freq', detail: 'Access frequency' },
        ];

        // WHERE clause operators
        const operators = [
            { label: 'AND', detail: 'Logical AND', insertText: 'AND ' },
            { label: 'OR', detail: 'Logical OR', insertText: 'OR ' },
            { label: 'NOT', detail: 'Logical NOT', insertText: 'NOT ' },
            { label: 'LIKE', detail: 'Pattern match', insertText: "LIKE '${1:pattern}'" },
            { label: 'IN', detail: 'Set membership', insertText: 'IN (${1:values})' },
            { label: 'BETWEEN', detail: 'Range check', insertText: 'BETWEEN ${1:low} AND ${2:high}' },
            { label: 'IS NULL', detail: 'Null check', insertText: 'IS NULL' },
            { label: 'IS NOT NULL', detail: 'Non-null check', insertText: 'IS NOT NULL' },
        ];

        // Context-aware completions based on full query analysis
        if (context.hasSelect && !context.hasFrom) {
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
            // Suggest FROM as next keyword
            const fromItem = new vscode.CompletionItem('FROM', vscode.CompletionItemKind.Keyword);
            fromItem.detail = 'Specify data source';
            fromItem.insertText = 'FROM ';
            fromItem.sortText = '0'; // Sort first
            items.push(fromItem);
        } else if (context.hasFrom && !context.hasWhere) {
            // After FROM, suggest sources and WHERE
            sources.forEach(s => {
                const item = new vscode.CompletionItem(s.label, vscode.CompletionItemKind.Module);
                item.detail = s.detail;
                items.push(item);
            });
            const whereItem = new vscode.CompletionItem('WHERE', vscode.CompletionItemKind.Keyword);
            whereItem.detail = 'Filter condition';
            whereItem.insertText = 'WHERE ';
            items.push(whereItem);
        } else if (context.hasWhere && !context.hasOrderBy) {
            // In WHERE clause, suggest operators and column names
            operators.forEach(o => {
                const item = new vscode.CompletionItem(o.label, vscode.CompletionItemKind.Operator);
                item.detail = o.detail;
                item.insertText = o.insertText;
                items.push(item);
            });
            columns.forEach(c => {
                const item = new vscode.CompletionItem(c.label, vscode.CompletionItemKind.Field);
                item.detail = c.detail;
                items.push(item);
            });
            // Suggest next clauses
            ['ORDER BY', 'GROUP BY', 'LIMIT'].forEach(kw => {
                const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
                item.insertText = kw + ' ';
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

        // Always include Ferrite and Redis commands
        const ferriteCommands: Array<{ cmd: string; detail: string }> = [
            // Core Redis
            { cmd: 'GET', detail: 'Get string value' },
            { cmd: 'SET', detail: 'Set string value' },
            { cmd: 'DEL', detail: 'Delete keys' },
            { cmd: 'EXISTS', detail: 'Check key existence' },
            { cmd: 'EXPIRE', detail: 'Set key TTL' },
            { cmd: 'TTL', detail: 'Get remaining TTL' },
            { cmd: 'KEYS', detail: 'Find keys by pattern' },
            { cmd: 'SCAN', detail: 'Iterate keys incrementally' },
            { cmd: 'MGET', detail: 'Get multiple values' },
            { cmd: 'MSET', detail: 'Set multiple values' },
            // Lists
            { cmd: 'LPUSH', detail: 'Prepend to list' },
            { cmd: 'RPUSH', detail: 'Append to list' },
            { cmd: 'LPOP', detail: 'Pop from head' },
            { cmd: 'RPOP', detail: 'Pop from tail' },
            { cmd: 'LRANGE', detail: 'Get list range' },
            // Hashes
            { cmd: 'HSET', detail: 'Set hash field' },
            { cmd: 'HGET', detail: 'Get hash field' },
            { cmd: 'HDEL', detail: 'Delete hash field' },
            { cmd: 'HGETALL', detail: 'Get all hash fields' },
            // Sets
            { cmd: 'SADD', detail: 'Add to set' },
            { cmd: 'SREM', detail: 'Remove from set' },
            { cmd: 'SMEMBERS', detail: 'Get set members' },
            { cmd: 'SINTER', detail: 'Set intersection' },
            // Sorted Sets
            { cmd: 'ZADD', detail: 'Add to sorted set' },
            { cmd: 'ZRANGE', detail: 'Get sorted set range' },
            { cmd: 'ZSCORE', detail: 'Get member score' },
            { cmd: 'ZRANK', detail: 'Get member rank' },
            // Streams
            { cmd: 'XADD', detail: 'Add to stream' },
            { cmd: 'XREAD', detail: 'Read from stream' },
            { cmd: 'XRANGE', detail: 'Get stream range' },
            // Pub/Sub
            { cmd: 'PUBLISH', detail: 'Publish message' },
            { cmd: 'SUBSCRIBE', detail: 'Subscribe to channel' },
            // Vector Search
            { cmd: 'VECTOR.CREATE', detail: 'Create vector index' },
            { cmd: 'VECTOR.ADD', detail: 'Add vector to index' },
            { cmd: 'VECTOR.SEARCH', detail: 'KNN vector search' },
            { cmd: 'VECTOR.DELETE', detail: 'Delete vector from index' },
            { cmd: 'VECTOR.INFO', detail: 'Get index info' },
            // Semantic Cache
            { cmd: 'SEMANTIC.SET', detail: 'Store with semantic key' },
            { cmd: 'SEMANTIC.GET', detail: 'Retrieve by semantic similarity' },
            { cmd: 'SEMANTIC.DEL', detail: 'Delete semantic entry' },
            { cmd: 'SEMANTIC.STATS', detail: 'Cache statistics' },
            // Time Series
            { cmd: 'TS.ADD', detail: 'Add time-series data point' },
            { cmd: 'TS.RANGE', detail: 'Query time range' },
            { cmd: 'TS.GET', detail: 'Get latest value' },
            { cmd: 'TS.CREATE', detail: 'Create time-series key' },
            // Documents
            { cmd: 'DOC.INSERT', detail: 'Insert JSON document' },
            { cmd: 'DOC.FIND', detail: 'Query documents' },
            { cmd: 'DOC.GET', detail: 'Get document by ID' },
            { cmd: 'DOC.DELETE', detail: 'Delete document' },
            // Graph
            { cmd: 'GRAPH.QUERY', detail: 'Execute graph query' },
            { cmd: 'GRAPH.CREATE', detail: 'Create graph' },
            // FerriteQL & Time-Travel
            { cmd: 'QUERY', detail: 'Execute FerriteQL query' },
            { cmd: 'HISTORY', detail: 'View key history' },
            { cmd: 'DIFF', detail: 'Compare key versions' },
            { cmd: 'RESTORE.FROM', detail: 'Restore from snapshot' },
            // WASM
            { cmd: 'WASM.EXEC', detail: 'Execute WASM function' },
            // Automatic Index Management
            { cmd: 'AUTOINDEX.RECORD', detail: 'Record access pattern for index analysis' },
            { cmd: 'AUTOINDEX.ANALYZE', detail: 'Analyze recorded patterns for index recommendations' },
            { cmd: 'AUTOINDEX.RECOMMEND', detail: 'Get index recommendations' },
            { cmd: 'AUTOINDEX.APPLY', detail: 'Apply a recommended index' },
            { cmd: 'AUTOINDEX.LIST', detail: 'List active auto-indexes' },
            { cmd: 'AUTOINDEX.REMOVE', detail: 'Remove an auto-index' },
            { cmd: 'AUTOINDEX.STATS', detail: 'Get auto-indexing statistics' },
            { cmd: 'AUTOINDEX.INFO', detail: 'Get auto-index information' },
            { cmd: 'AUTOINDEX.CLEANUP', detail: 'Clean up unused indexes' },
            // Conversation Memory
            { cmd: 'CONV.CREATE', detail: 'Create conversation session' },
            { cmd: 'CONV.DELETE', detail: 'Delete conversation' },
            { cmd: 'CONV.MESSAGE', detail: 'Add message to conversation' },
            { cmd: 'CONV.CONTEXT', detail: 'Get conversation context window' },
            { cmd: 'CONV.LIST', detail: 'List conversations for user' },
            { cmd: 'CONV.INFO', detail: 'Get conversation info' },
            { cmd: 'CONV.CLEAR', detail: 'Clear conversation messages' },
            { cmd: 'CONV.SYSTEM', detail: 'Set system prompt' },
            { cmd: 'CONV.STATS', detail: 'Get conversation statistics' },
            // Cost Optimization
            { cmd: 'COST.ESTIMATE', detail: 'Estimate infrastructure costs' },
            { cmd: 'COST.OPTIMIZE', detail: 'Get cost optimization suggestions' },
            { cmd: 'COST.HINTS', detail: 'Get cost-saving hints' },
            { cmd: 'COST.STATS', detail: 'Get cost statistics' },
            { cmd: 'COST.BUDGET', detail: 'Set or get budget limits' },
            // Multi-cloud Management
            { cmd: 'MULTICLOUD.PROVIDER.ADD', detail: 'Add cloud provider' },
            { cmd: 'MULTICLOUD.PROVIDER.LIST', detail: 'List cloud providers' },
            { cmd: 'MULTICLOUD.REGION.ADD', detail: 'Add cloud region' },
            { cmd: 'MULTICLOUD.REGION.LIST', detail: 'List cloud regions' },
            { cmd: 'MULTICLOUD.SYNC', detail: 'Trigger cloud sync' },
            { cmd: 'MULTICLOUD.STATUS', detail: 'Get multi-cloud status' },
            { cmd: 'MULTICLOUD.HEALTH', detail: 'Check cloud health' },
            // Data Access Policy
            { cmd: 'POLICY.CREATE', detail: 'Create access policy' },
            { cmd: 'POLICY.DELETE', detail: 'Delete access policy' },
            { cmd: 'POLICY.GET', detail: 'Get policy definition' },
            { cmd: 'POLICY.LIST', detail: 'List all policies' },
            { cmd: 'POLICY.EVALUATE', detail: 'Evaluate policy against context' },
            { cmd: 'POLICY.STATS', detail: 'Get policy statistics' },
            // S3-Compatible Object Storage
            { cmd: 'S3.BUCKET.CREATE', detail: 'Create S3 bucket' },
            { cmd: 'S3.BUCKET.DELETE', detail: 'Delete S3 bucket' },
            { cmd: 'S3.BUCKET.LIST', detail: 'List S3 buckets' },
            { cmd: 'S3.PUT', detail: 'Put object into bucket' },
            { cmd: 'S3.GET', detail: 'Get object from bucket' },
            { cmd: 'S3.DELETE', detail: 'Delete object from bucket' },
            { cmd: 'S3.LIST', detail: 'List objects in bucket' },
            { cmd: 'S3.STATS', detail: 'Get S3 storage statistics' },
            // Slot Management
            { cmd: 'SLOT.CREATE', detail: 'Create data slot' },
            { cmd: 'SLOT.DROP', detail: 'Drop data slot' },
            { cmd: 'SLOT.LIST', detail: 'List data slots' },
            { cmd: 'SLOT.START', detail: 'Start slot migration' },
            { cmd: 'SLOT.STOP', detail: 'Stop slot migration' },
            { cmd: 'SLOT.STATS', detail: 'Get slot statistics' },
            // Vector Bulk Ingest
            { cmd: 'VECTOR.INGEST.START', detail: 'Start bulk vector ingest pipeline' },
            { cmd: 'VECTOR.INGEST.STOP', detail: 'Stop ingest pipeline' },
            { cmd: 'VECTOR.INGEST.PAUSE', detail: 'Pause ingest pipeline' },
            { cmd: 'VECTOR.INGEST.RESUME', detail: 'Resume ingest pipeline' },
            { cmd: 'VECTOR.INGEST.STATUS', detail: 'Get ingest pipeline status' },
            { cmd: 'VECTOR.INGEST.LIST', detail: 'List ingest pipelines' },
            // Server & Admin
            { cmd: 'INFO', detail: 'Get server information' },
            { cmd: 'PING', detail: 'Test connection' },
            { cmd: 'DBSIZE', detail: 'Get key count in database' },
            { cmd: 'FLUSHDB', detail: 'Flush current database' },
            { cmd: 'FLUSHALL', detail: 'Flush all databases' },
            { cmd: 'CONFIG GET', detail: 'Get config parameter' },
            { cmd: 'CONFIG SET', detail: 'Set config parameter' },
            { cmd: 'CONFIG REWRITE', detail: 'Rewrite config file' },
            { cmd: 'CONFIG RESETSTAT', detail: 'Reset statistics' },
            { cmd: 'CLIENT LIST', detail: 'List connected clients' },
            { cmd: 'CLIENT SETNAME', detail: 'Set connection name' },
            { cmd: 'CLIENT INFO', detail: 'Current client info' },
            { cmd: 'CLIENT ID', detail: 'Get client ID' },
            { cmd: 'SLOWLOG GET', detail: 'Get slow queries' },
            { cmd: 'SLOWLOG LEN', detail: 'Count slow queries' },
            { cmd: 'SLOWLOG RESET', detail: 'Clear slow log' },
            { cmd: 'MONITOR', detail: 'Stream all commands' },
            { cmd: 'SHUTDOWN', detail: 'Shutdown server' },
            // Transactions
            { cmd: 'MULTI', detail: 'Start transaction' },
            { cmd: 'EXEC', detail: 'Execute transaction' },
            { cmd: 'DISCARD', detail: 'Discard transaction' },
            { cmd: 'WATCH', detail: 'Watch keys for changes' },
            { cmd: 'UNWATCH', detail: 'Unwatch all keys' },
            // Scripting
            { cmd: 'EVAL', detail: 'Execute Lua script' },
            { cmd: 'EVALSHA', detail: 'Execute cached script' },
            { cmd: 'SCRIPT LOAD', detail: 'Load Lua script' },
            { cmd: 'SCRIPT EXISTS', detail: 'Check script exists' },
            { cmd: 'SCRIPT FLUSH', detail: 'Clear script cache' },
            // Cluster
            { cmd: 'CLUSTER INFO', detail: 'Cluster state info' },
            { cmd: 'CLUSTER NODES', detail: 'List cluster nodes' },
        ];

        ferriteCommands.forEach(({ cmd, detail }) => {
            const item = new vscode.CompletionItem(cmd, vscode.CompletionItemKind.Method);
            item.detail = detail;
            items.push(item);
        });

        return items;
    }

    /**
     * Analyzes the query context by scanning backward from the cursor position
     * to find the start of the current statement, supporting multi-line queries.
     */
    private getQueryContext(document: vscode.TextDocument, position: vscode.Position): QueryContext {
        let text = '';

        // Scan backward to find the start of the query (empty line or start of file)
        for (let line = position.line; line >= 0; line--) {
            const lineText = document.lineAt(line).text;
            if (line < position.line && lineText.trim() === '') {
                break;
            }
            if (line === position.line) {
                text = lineText.substring(0, position.character) + '\n' + text;
            } else {
                text = lineText + '\n' + text;
            }
        }

        const upper = text.toUpperCase();
        return {
            hasSelect: /\bSELECT\b/.test(upper),
            hasFrom: /\bFROM\b/.test(upper),
            hasWhere: /\bWHERE\b/.test(upper),
            hasOrderBy: /\bORDER\s+BY\b/.test(upper),
            hasGroupBy: /\bGROUP\s+BY\b/.test(upper),
            hasLimit: /\bLIMIT\b/.test(upper),
            hasJoin: /\bJOIN\b/.test(upper),
        };
    }
}

interface QueryContext {
    hasSelect: boolean;
    hasFrom: boolean;
    hasWhere: boolean;
    hasOrderBy: boolean;
    hasGroupBy: boolean;
    hasLimit: boolean;
    hasJoin: boolean;
}
