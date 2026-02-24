import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Command Palette Integration Tests', () => {

    test('ferrite.connect command should be executable from palette', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('ferrite.connect'),
            'ferrite.connect should be available in command palette'
        );
    });

    test('ferrite.disconnect command should be executable from palette', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('ferrite.disconnect'),
            'ferrite.disconnect should be available in command palette'
        );
    });

    test('ferrite.showServerInfo command should be executable from palette', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('ferrite.showServerInfo'),
            'ferrite.showServerInfo should be available in command palette'
        );
    });

    test('ferrite.browseKeys command should be executable from palette', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('ferrite.browseKeys'),
            'ferrite.browseKeys should be available in command palette'
        );
    });

    test('ferrite.validateConfig command should be executable from palette', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('ferrite.validateConfig'),
            'ferrite.validateConfig should be available in command palette'
        );
    });

    test('ferrite.clusterInfo command should be executable from palette', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('ferrite.clusterInfo'),
            'ferrite.clusterInfo should be available in command palette'
        );
    });

    test('all palette commands should have proper titles in package.json', () => {
        const extension = vscode.extensions.getExtension('ferrite.ferrite');
        if (!extension) {
            assert.fail('Extension not found');
        }
        const contributes = extension.packageJSON.contributes;
        const commands = contributes.commands as Array<{ command: string; title: string }>;

        for (const cmd of commands) {
            assert.ok(cmd.title, `Command ${cmd.command} should have a title`);
            assert.ok(
                cmd.title.startsWith('Ferrite:'),
                `Command ${cmd.command} title should start with "Ferrite:"`
            );
        }
    });
});
