import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseCommand, formatResult, FerriteCompletionProvider } from '../../extension';

suite('parseCommand Test Suite', () => {
    test('Should parse simple command', () => {
        const parts = parseCommand('GET mykey');
        assert.deepStrictEqual(parts, ['GET', 'mykey']);
    });

    test('Should parse command with double-quoted string', () => {
        const parts = parseCommand('SET mykey "hello world"');
        assert.deepStrictEqual(parts, ['SET', 'mykey', 'hello world']);
    });

    test('Should parse command with single-quoted string', () => {
        const parts = parseCommand("SET mykey 'hello world'");
        assert.deepStrictEqual(parts, ['SET', 'mykey', 'hello world']);
    });

    test('Should parse command with escaped characters', () => {
        const parts = parseCommand('SET mykey hello\\ world');
        assert.deepStrictEqual(parts, ['SET', 'mykey', 'hello world']);
    });

    test('Should parse command with multiple arguments', () => {
        const parts = parseCommand('HSET user:1 name Alice email alice@test.com');
        assert.deepStrictEqual(parts, ['HSET', 'user:1', 'name', 'Alice', 'email', 'alice@test.com']);
    });

    test('Should handle empty string', () => {
        const parts = parseCommand('');
        assert.deepStrictEqual(parts, []);
    });

    test('Should handle command with no arguments', () => {
        const parts = parseCommand('PING');
        assert.deepStrictEqual(parts, ['PING']);
    });

    test('Should handle multiple spaces between arguments', () => {
        const parts = parseCommand('GET   mykey');
        assert.deepStrictEqual(parts, ['GET', 'mykey']);
    });

    test('Should handle SET with EX option', () => {
        const parts = parseCommand('SET session:abc "data" EX 3600');
        assert.deepStrictEqual(parts, ['SET', 'session:abc', 'data', 'EX', '3600']);
    });

    test('Should handle quoted empty string', () => {
        const parts = parseCommand('SET key ""');
        assert.deepStrictEqual(parts, ['SET', 'key', '']);
    });
});

suite('formatResult Test Suite', () => {
    test('Should format null as (nil)', () => {
        assert.strictEqual(formatResult(null, 'json'), '(nil)');
        assert.strictEqual(formatResult(null, 'table'), '(nil)');
        assert.strictEqual(formatResult(null, 'raw'), '(nil)');
    });

    test('Should format string result as JSON', () => {
        const result = formatResult('hello', 'json');
        assert.strictEqual(result, '"hello"');
    });

    test('Should format array result as JSON', () => {
        const result = formatResult(['a', 'b', 'c'], 'json');
        assert.strictEqual(result, JSON.stringify(['a', 'b', 'c'], null, 2));
    });

    test('Should format array as table', () => {
        const result = formatResult(['alice', 'bob', 'carol'], 'table');
        const expected = '1) "alice"\n2) "bob"\n3) "carol"';
        assert.strictEqual(result, expected);
    });

    test('Should format non-array as string in table mode', () => {
        const result = formatResult('hello', 'table');
        assert.strictEqual(result, 'hello');
    });

    test('Should format result as raw string', () => {
        const result = formatResult(42, 'raw');
        assert.strictEqual(result, '42');
    });

    test('Should format object as JSON', () => {
        const obj = { key: 'value' };
        const result = formatResult(obj, 'json');
        assert.strictEqual(result, JSON.stringify(obj, null, 2));
    });

    test('Should format number as raw string', () => {
        const result = formatResult(100, 'raw');
        assert.strictEqual(result, '100');
    });
});

suite('FerriteCompletionProvider Test Suite', () => {
    test('Should provide completion items', () => {
        const provider = new FerriteCompletionProvider();
        const items = provider.provideCompletionItems(
            {} as vscode.TextDocument,
            {} as vscode.Position
        );
        assert.ok(Array.isArray(items));
        assert.ok(items.length > 0, 'Should have completion items');
    });

    test('Should include common commands in completions', () => {
        const provider = new FerriteCompletionProvider();
        const items = provider.provideCompletionItems({} as vscode.TextDocument, {} as vscode.Position);
        const labels = items.map(i => (i.label as string));
        assert.ok(labels.includes('GET'), 'Should include GET');
        assert.ok(labels.includes('SET'), 'Should include SET');
        assert.ok(labels.includes('DEL'), 'Should include DEL');
        assert.ok(labels.includes('HSET'), 'Should include HSET');
        assert.ok(labels.includes('PING'), 'Should include PING');
    });

    test('Completion items should have documentation', () => {
        const provider = new FerriteCompletionProvider();
        const items = provider.provideCompletionItems({} as vscode.TextDocument, {} as vscode.Position);
        for (const item of items) {
            assert.ok(item.documentation, `${item.label} should have documentation`);
            assert.ok(item.detail !== undefined, `${item.label} should have detail`);
        }
    });
});
