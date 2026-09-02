export function parseCommand(cmd: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    let escape = false;
    let tokenStarted = false;

    for (let i = 0; i < cmd.length; i++) {
        const char = cmd[i];

        if (escape) {
            current += char;
            escape = false;
            tokenStarted = true;
            continue;
        }

        if (char === '\\') {
            escape = true;
            continue;
        }

        if ((char === '"' || char === "'") && !inQuote) {
            if (current) {
                parts.push(current);
                current = '';
                tokenStarted = false;
            }
            inQuote = true;
            quoteChar = char;
            tokenStarted = true;
            continue;
        }

        if (char === quoteChar && inQuote) {
            inQuote = false;
            quoteChar = '';
            continue;
        }

        if (char === ' ' && !inQuote) {
            if (tokenStarted) {
                parts.push(current);
                current = '';
                tokenStarted = false;
            }
            continue;
        }

        current += char;
        tokenStarted = true;
    }

    if (tokenStarted) {
        parts.push(current);
    }

    if (inQuote) {
        throw new Error(`Unclosed ${quoteChar} quote in command`);
    }

    return parts;
}

export function formatResult(result: any, format: string): string {
    if (result === null) {
        return '(nil)';
    }

    if (format === 'json') {
        return JSON.stringify(result, null, 2);
    }

    if (format === 'table' && Array.isArray(result)) {
        return result.map((item, i) => `${i + 1}) ${JSON.stringify(item)}`).join('\n');
    }

    return String(result);
}
