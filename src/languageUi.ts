import * as vscode from 'vscode';

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
