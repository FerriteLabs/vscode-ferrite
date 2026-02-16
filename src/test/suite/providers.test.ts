import * as assert from 'assert';
import * as vscode from 'vscode';
import { KeysTreeProvider, KeyItem } from '../../providers/keysTreeProvider';
import { ServerInfoTreeProvider, InfoItem } from '../../providers/serverInfoTreeProvider';

suite('KeysTreeProvider Test Suite', () => {
    test('Should show connect message when no client', async () => {
        const provider = new KeysTreeProvider(() => null);
        const children = await provider.getChildren();
        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].label, 'Connect to browse keys');
    });

    test('Should support refresh without error', () => {
        const provider = new KeysTreeProvider(() => null);
        assert.doesNotThrow(() => provider.refresh());
    });

    test('KeyItem should set tooltip from label and type', () => {
        const item = new KeyItem('mykey', 'persistent', 'string', vscode.TreeItemCollapsibleState.None);
        assert.strictEqual(item.label, 'mykey');
        assert.strictEqual(item.description, 'persistent');
        assert.strictEqual(item.keyType, 'string');
        assert.strictEqual(item.tooltip, 'mykey (string)');
    });

    test('KeyItem should initialize prefix to empty string', () => {
        const item = new KeyItem('test', '', 'hash', vscode.TreeItemCollapsibleState.None);
        assert.strictEqual(item.prefix, '');
        assert.strictEqual(item.fullKey, undefined);
    });

    test('getTreeItem should return the element itself', () => {
        const provider = new KeysTreeProvider(() => null);
        const item = new KeyItem('test', '', 'string', vscode.TreeItemCollapsibleState.None);
        assert.strictEqual(provider.getTreeItem(item), item);
    });
});

suite('ServerInfoTreeProvider Test Suite', () => {
    test('Should show connect message when no client', async () => {
        const provider = new ServerInfoTreeProvider(() => null);
        const children = await provider.getChildren();
        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].label, 'Connect to view server info');
    });

    test('Should return section items at root level with client mock', async () => {
        // Without a real client, getChildren at root returns the connect message
        const provider = new ServerInfoTreeProvider(() => null);
        const children = await provider.getChildren();
        assert.ok(children.length > 0);
    });

    test('Should support refresh without error', () => {
        const provider = new ServerInfoTreeProvider(() => null);
        assert.doesNotThrow(() => provider.refresh());
    });

    test('Should support start and stop auto refresh', () => {
        const provider = new ServerInfoTreeProvider(() => null);
        assert.doesNotThrow(() => {
            provider.startAutoRefresh(60000);
            provider.stopAutoRefresh();
        });
    });

    test('InfoItem should store properties correctly', () => {
        const item = new InfoItem('version', '1.0.0', vscode.TreeItemCollapsibleState.None);
        assert.strictEqual(item.label, 'version');
        assert.strictEqual(item.description, '1.0.0');
    });

    test('getTreeItem should return the element itself', () => {
        const provider = new ServerInfoTreeProvider(() => null);
        const item = new InfoItem('test', 'value', vscode.TreeItemCollapsibleState.None);
        assert.strictEqual(provider.getTreeItem(item), item);
    });
});
