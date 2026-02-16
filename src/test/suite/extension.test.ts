import * as assert from 'assert';
import * as vscode from 'vscode';

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
