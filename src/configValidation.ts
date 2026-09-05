import * as vscode from 'vscode';

// Validate config file content (exported for testing)
export function validateConfigFile(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection) {
    const text = document.getText();
    const problems: vscode.Diagnostic[] = [];
    const lines = text.split('\n');

    let currentSection = '';
    const foundKeys: Record<string, Set<string>> = {};

    const validSections = [
        'server', 'storage', 'persistence', 'logging', 'metrics',
        'tls', 'auth', 'acl', 'cluster', 'replication',
    ];

    // Known keys per section with expected types
    const sectionKeys: Record<string, Record<string, 'string' | 'number' | 'boolean'>> = {
        server: { bind: 'string', port: 'number', max_connections: 'number', tcp_keepalive: 'number', timeout: 'number', protected_mode: 'boolean' },
        storage: { databases: 'number', max_memory: 'number', eviction_policy: 'string', max_key_size: 'number', max_value_size: 'number' },
        persistence: { aof_enabled: 'boolean', aof_sync: 'string', aof_file: 'string', checkpoint_interval: 'number', rdb_filename: 'string' },
        logging: { level: 'string', format: 'string', file: 'string' },
        metrics: { enabled: 'boolean', port: 'number', bind: 'string' },
        tls: { enabled: 'boolean', cert_file: 'string', key_file: 'string', ca_file: 'string', require_client_cert: 'boolean', min_protocol_version: 'string' },
        acl: { enabled: 'boolean', users_file: 'string', log_enabled: 'boolean', log_max_len: 'number', default_user: 'string' },
        cluster: { enabled: 'boolean', node_id: 'string', announce_ip: 'string', announce_port: 'number', cluster_port: 'number' },
        replication: { role: 'string', primary_host: 'string', primary_port: 'number', repl_backlog_size: 'number' },
    };

    // Enum validations
    const enumValues: Record<string, string[]> = {
        'persistence.aof_sync': ['always', 'everysec', 'no'],
        'logging.level': ['trace', 'debug', 'info', 'warn', 'error'],
        'logging.format': ['json', 'pretty', 'compact'],
        'storage.eviction_policy': ['noeviction', 'allkeys-lru', 'volatile-lru', 'allkeys-lfu', 'volatile-lfu', 'allkeys-random', 'volatile-random', 'volatile-ttl'],
        'tls.min_protocol_version': ['1.2', '1.3'],
        'replication.role': ['primary', 'replica'],
    };

    // Numeric range validations
    const numericRanges: Record<string, [number, number]> = {
        'server.port': [1, 65535],
        'server.max_connections': [1, 1000000],
        'server.tcp_keepalive': [0, 7200],
        'server.timeout': [0, 86400],
        'storage.databases': [1, 128],
        'storage.max_memory': [1048576, Number.MAX_SAFE_INTEGER], // min 1MB
        'metrics.port': [1, 65535],
        'acl.log_max_len': [0, 10000],
        'cluster.announce_port': [1, 65535],
        'cluster.cluster_port': [1, 65535],
        'replication.primary_port': [1, 65535],
    };

    const typos: Record<string, string> = {
        'prot': 'port', 'hosr': 'host', 'databse': 'database', 'databses': 'databases',
        'pasword': 'password', 'enbled': 'enabled', 'persitence': 'persistence',
        'replciation': 'replication', 'loggin': 'logging', 'metics': 'metrics',
        'sever': 'server', 'stoage': 'storage', 'aof_enbled': 'aof_enabled',
    };

    lines.forEach((line, i) => {
        const trimmed = line.trim();

        // Skip comments and empty lines
        if (trimmed === '' || trimmed.startsWith('#')) return;

        // Check section headers
        const sectionMatch = trimmed.match(/^\[([^\]]+)\]/);
        if (sectionMatch) {
            currentSection = sectionMatch[1].split('.')[0];
            if (!foundKeys[currentSection]) {
                foundKeys[currentSection] = new Set();
            }
            if (!validSections.includes(currentSection)) {
                problems.push(new vscode.Diagnostic(
                    new vscode.Range(i, 0, i, line.length),
                    `Unknown section '${currentSection}'. Valid sections: ${validSections.join(', ')}`,
                    vscode.DiagnosticSeverity.Warning
                ));
            }
            return;
        }

        // Check key-value pairs
        const kvMatch = trimmed.match(/^([a-z_]+)\s*=\s*(.+)/);
        if (!kvMatch) return;

        const key = kvMatch[1];
        const rawValue = kvMatch[2].trim();

        // Track found keys
        if (currentSection && foundKeys[currentSection]) {
            foundKeys[currentSection].add(key);
        }

        // Typo detection
        if (typos[key]) {
            problems.push(new vscode.Diagnostic(
                new vscode.Range(i, 0, i, line.length),
                `Did you mean '${typos[key]}'?`,
                vscode.DiagnosticSeverity.Error
            ));
            return;
        }

        // Validate known key exists in section
        const knownKeys = sectionKeys[currentSection];
        if (knownKeys && !knownKeys[key]) {
            // Only warn, don't error — Ferrite may accept keys we don't know about
            problems.push(new vscode.Diagnostic(
                new vscode.Range(i, 0, i, line.length),
                `Unknown key '${key}' in [${currentSection}]`,
                vscode.DiagnosticSeverity.Hint
            ));
        }

        // Numeric range validation
        const rangeKey = `${currentSection}.${key}`;
        if (numericRanges[rangeKey]) {
            const numValue = parseInt(rawValue);
            if (!isNaN(numValue)) {
                const [min, max] = numericRanges[rangeKey];
                if (numValue < min || numValue > max) {
                    problems.push(new vscode.Diagnostic(
                        new vscode.Range(i, 0, i, line.length),
                        `Value ${numValue} out of range for ${key} (expected ${min}–${max})`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
        }

        // Enum validation
        const enumKey = `${currentSection}.${key}`;
        if (enumValues[enumKey]) {
            const strValue = rawValue.replace(/^["']|["']$/g, '');
            if (!enumValues[enumKey].includes(strValue)) {
                problems.push(new vscode.Diagnostic(
                    new vscode.Range(i, 0, i, line.length),
                    `Invalid value '${strValue}' for ${key}. Expected: ${enumValues[enumKey].join(', ')}`,
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }

        // Boolean validation
        if (knownKeys && knownKeys[key] === 'boolean') {
            if (!['true', 'false'].includes(rawValue)) {
                problems.push(new vscode.Diagnostic(
                    new vscode.Range(i, 0, i, line.length),
                    `Expected boolean (true/false) for ${key}, got '${rawValue}'`,
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }

        // TLS consistency: if enabled, cert and key must be present
        if (currentSection === 'tls' && key === 'enabled' && rawValue === 'true') {
            // We'll check after parsing all lines
        }
    });

    // Cross-field validation: TLS requires cert_file and key_file
    const tlsKeys = foundKeys['tls'];
    if (tlsKeys && tlsKeys.has('enabled')) {
        // Check in text directly since we tracked keys
        if (text.includes('[tls]') && text.match(/enabled\s*=\s*true/)) {
            if (!tlsKeys.has('cert_file')) {
                problems.push(new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 0),
                    '[tls] enabled=true requires cert_file to be set',
                    vscode.DiagnosticSeverity.Warning
                ));
            }
            if (!tlsKeys.has('key_file')) {
                problems.push(new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 0),
                    '[tls] enabled=true requires key_file to be set',
                    vscode.DiagnosticSeverity.Warning
                ));
            }
        }
    }

    diagnostics.set(document.uri, problems);

    if (problems.length === 0) {
        vscode.window.showInformationMessage('Configuration is valid');
    }
}
