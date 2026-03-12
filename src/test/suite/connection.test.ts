import * as assert from 'assert';
import { formatResult } from '../../extension';

/**
 * Integration-style tests for Ferrite connection and command execution.
 *
 * These tests validate the client logic independently of the VS Code
 * extension host.  They can run against a real Ferrite/Redis server when
 * FERRITE_TEST_HOST is set, or fall back to pure unit checks otherwise.
 *
 * To run against a server:
 *   FERRITE_TEST_HOST=127.0.0.1 FERRITE_TEST_PORT=6379 npm test
 */

const TEST_HOST = process.env.FERRITE_TEST_HOST;
const TEST_PORT = parseInt(process.env.FERRITE_TEST_PORT || '6379', 10);

suite('Connection Integration Tests', () => {

    if (TEST_HOST) {
        // ─── Live server tests (only when FERRITE_TEST_HOST is set) ────

        let Redis: typeof import('ioredis').default;
        let client: InstanceType<typeof Redis>;

        suiteSetup(async () => {
            Redis = (await import('ioredis')).default;
            client = new Redis({
                host: TEST_HOST,
                port: TEST_PORT,
                lazyConnect: true,
                connectTimeout: 3000,
                maxRetriesPerRequest: 1,
            });
            await client.connect();
        });

        suiteTeardown(async () => {
            if (client) {
                await client.quit();
            }
        });

        test('PING returns PONG', async () => {
            const result = await client.ping();
            assert.strictEqual(result, 'PONG');
        });

        test('SET and GET round-trip', async () => {
            const key = `__ferrite_vscode_test_${Date.now()}`;
            await client.set(key, 'hello');
            const value = await client.get(key);
            assert.strictEqual(value, 'hello');
            await client.del(key);
        });

        test('INFO returns server section', async () => {
            const info = await client.info('server');
            assert.ok(info.includes('ferrite_version') || info.includes('redis_version'),
                'INFO should contain version information');
        });

        test('DBSIZE returns integer', async () => {
            const size = await client.dbsize();
            assert.ok(typeof size === 'number', 'DBSIZE should return a number');
            assert.ok(size >= 0, 'DBSIZE should be non-negative');
        });

        test('Non-existent key returns null', async () => {
            const value = await client.get('__ferrite_nonexistent_key_test__');
            assert.strictEqual(value, null);
        });

        test('INCR on new key starts at 1', async () => {
            const key = `__ferrite_vscode_incr_${Date.now()}`;
            const result = await client.incr(key);
            assert.strictEqual(result, 1);
            await client.del(key);
        });

        test('TYPE command returns correct type', async () => {
            const key = `__ferrite_vscode_type_${Date.now()}`;
            await client.set(key, 'value');
            const type_ = await client.type(key);
            assert.strictEqual(type_, 'string');
            await client.del(key);
        });

        test('Connection error on wrong port', async () => {
            const badClient = new Redis({
                host: TEST_HOST,
                port: 1, // Unreachable port
                lazyConnect: true,
                connectTimeout: 500,
                maxRetriesPerRequest: 0,
                retryStrategy: () => null,
            });
            try {
                await badClient.connect();
                assert.fail('Should have thrown on unreachable port');
            } catch (e: any) {
                assert.ok(e.message.includes('connect') || e.message.includes('ECONNREFUSED'),
                    `Expected connection error, got: ${e.message}`);
            } finally {
                badClient.disconnect();
            }
        });

    } else {
        // ─── Offline tests (no server required) ────────────────────────

        test('formatResult handles string values', () => {
            const result = formatResult('OK');
            assert.ok(typeof result === 'string');
        });

        test('formatResult handles null', () => {
            const result = formatResult(null);
            assert.ok(typeof result === 'string');
        });

        test('formatResult handles arrays', () => {
            const result = formatResult(['a', 'b', 'c']);
            assert.ok(typeof result === 'string');
            assert.ok(result.includes('a'));
        });

        test('formatResult handles nested arrays', () => {
            const result = formatResult([['key1', 'val1'], ['key2', 'val2']]);
            assert.ok(typeof result === 'string');
        });

        test('formatResult handles integers', () => {
            const result = formatResult(42);
            assert.ok(result.includes('42'));
        });

        test('SKIP: Live server tests require FERRITE_TEST_HOST env var', () => {
            // This is intentionally a no-op to document how to run integration tests
            assert.ok(true, 'Set FERRITE_TEST_HOST=127.0.0.1 to run live tests');
        });
    }
});
