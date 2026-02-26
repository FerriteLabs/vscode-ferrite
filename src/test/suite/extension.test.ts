import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseCommand, formatResult } from '../../extension';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('ferrite.ferrite');
        assert.ok(extension, 'Extension should be registered');
    });

    test('All commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const ferriteCommands = [
            'ferrite.connect',
            'ferrite.disconnect',
            'ferrite.executeCommand',
            'ferrite.executeSelection',
            'ferrite.showServerInfo',
            'ferrite.browseKeys',
            'ferrite.flushDb',
            'ferrite.validateConfig',
            'ferrite.refreshKeys',
            'ferrite.refreshInfo',
            'ferrite.inspectKey',
        ];

        for (const cmd of ferriteCommands) {
            assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
        }
    });

    test('Extension should contribute FerriteQL language', () => {
        const extension = vscode.extensions.getExtension('ferrite.ferrite');
        if (!extension) {
            assert.fail('Extension not found');
        }
        const contributes = extension.packageJSON.contributes;
        const languages = contributes.languages as Array<{ id: string }>;
        const ferriteql = languages.find(l => l.id === 'ferriteql');
        assert.ok(ferriteql, 'FerriteQL language should be contributed');
    });

    test('Extension should contribute ferrite-config language', () => {
        const extension = vscode.extensions.getExtension('ferrite.ferrite');
        if (!extension) {
            assert.fail('Extension not found');
        }
        const contributes = extension.packageJSON.contributes;
        const languages = contributes.languages as Array<{ id: string }>;
        const ferriteConfig = languages.find(l => l.id === 'ferrite-config');
        assert.ok(ferriteConfig, 'Ferrite Config language should be contributed');
    });
});

suite('Snippet Variable Expansion Tests', () => {
    test('parseCommand should handle simple command', () => {
        const result = parseCommand('GET mykey');
        assert.deepStrictEqual(result, ['GET', 'mykey']);
    });

    test('parseCommand should handle quoted strings with spaces', () => {
        const result = parseCommand('SET mykey "hello world"');
        assert.deepStrictEqual(result, ['SET', 'mykey', 'hello world']);
    });

    test('parseCommand should handle single-quoted strings', () => {
        const result = parseCommand("SET mykey 'hello world'");
        assert.deepStrictEqual(result, ['SET', 'mykey', 'hello world']);
    });

    test('parseCommand should handle escaped characters in values', () => {
        const result = parseCommand('SET mykey "hello\\"world"');
        assert.deepStrictEqual(result, ['SET', 'mykey', 'hello"world']);
    });

    test('parseCommand should handle dotted subcommands like VECTOR.SEARCH', () => {
        const result = parseCommand('VECTOR.SEARCH idx [0.1,0.2] TOP_K 10');
        assert.deepStrictEqual(result, ['VECTOR.SEARCH', 'idx', '[0.1,0.2]', 'TOP_K', '10']);
    });

    test('parseCommand should handle token immediately followed by quote', () => {
        const result = parseCommand('SET key"value"');
        assert.deepStrictEqual(result, ['SET', 'key', 'value']);
    });

    test('parseCommand should handle empty input', () => {
        const result = parseCommand('');
        assert.deepStrictEqual(result, []);
    });

    test('formatResult should return (nil) for null', () => {
        assert.strictEqual(formatResult(null, 'json'), '(nil)');
    });

    test('formatResult should format arrays in table mode', () => {
        const result = formatResult(['a', 'b', 'c'], 'table');
        assert.ok(result.includes('1) "a"'));
        assert.ok(result.includes('2) "b"'));
        assert.ok(result.includes('3) "c"'));
    });

    test('formatResult should return raw string in raw mode', () => {
        assert.strictEqual(formatResult('OK', 'raw'), 'OK');
    });
});
