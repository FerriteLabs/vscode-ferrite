# Ferrite for Visual Studio Code

Official VS Code extension for [Ferrite](https://ferrite.dev) - a high-performance, tiered-storage key-value store.

## Features

### Syntax Highlighting

- **FerriteQL**: Full syntax highlighting for Ferrite commands and queries
- **Configuration**: Syntax highlighting for `ferrite.toml` configuration files

### Code Snippets

Snippets for common operations in multiple languages:

- **FerriteQL**: Redis-compatible commands and Ferrite extensions
- **JavaScript/TypeScript**: Client setup, CRUD operations, caching patterns
- **Python**: Sync and async clients, decorators, pipelines
- **Rust**: Client setup, connection pools, derive macros

### Connection Management

- Connect to local or remote Ferrite servers
- Save multiple connection profiles
- Status bar indicator showing connection state
- Auto-connect on startup (optional)

### Interactive Features

- **Execute Commands**: Run FerriteQL commands directly from the editor
- **Browse Keys**: Explore keys with pattern matching
- **View Server Info**: Display server statistics and configuration
- **Output Formatting**: JSON, table, or raw output modes

### Configuration Validation

- Real-time validation of `ferrite.toml` files
- Typo detection with suggestions
- Range validation for numeric values

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Ferrite"
4. Click Install

### From VSIX

```bash
code --install-extension ferrite-1.0.0.vsix
```

## Quick Start

1. **Connect to Ferrite**
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
   - Run "Ferrite: Connect to Server"
   - Enter your server details

2. **Create a FerriteQL file**
   - Create a new file with `.fql` or `.ferriteql` extension
   - Start writing commands

3. **Execute Commands**
   - Place cursor on a command line
   - Press `Ctrl+Enter` (or `Cmd+Enter` on macOS)
   - View results in the output panel

## Usage

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` / `Cmd+Enter` | Execute current line |
| `Ctrl+Shift+Enter` / `Cmd+Shift+Enter` | Execute selection |

### Commands

Access via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **Ferrite: Connect to Server** - Connect to a Ferrite instance
- **Ferrite: Disconnect** - Disconnect from current server
- **Ferrite: Execute Command** - Run command at cursor
- **Ferrite: Execute Selection** - Run selected commands
- **Ferrite: Show Server Info** - Display server information
- **Ferrite: Browse Keys** - Explore keys with pattern
- **Ferrite: Flush Database** - Clear current database
- **Ferrite: Validate Configuration** - Check ferrite.toml

### Snippets

Type a prefix and press `Tab` to insert a snippet:

#### FerriteQL Snippets

| Prefix | Description |
|--------|-------------|
| `get` | GET key |
| `set` | SET key value |
| `setex` | SET with expiration |
| `hset` | Hash set |
| `hgetall` | Hash get all |
| `lpush` | List push |
| `zadd` | Sorted set add |
| `xadd` | Stream add |
| `vectorsearch` | Vector search |
| `tsadd` | Time series add |

#### JavaScript/TypeScript Snippets

| Prefix | Description |
|--------|-------------|
| `ferrite-client` | Create client |
| `ferrite-get` | Get value |
| `ferrite-set` | Set value |
| `ferrite-pipeline` | Execute pipeline |
| `ferrite-cache` | Cache-aside pattern |

#### Python Snippets

| Prefix | Description |
|--------|-------------|
| `ferrite-client` | Create client |
| `ferrite-async-client` | Create async client |
| `ferrite-pipeline` | Pipeline context manager |
| `ferrite-cache-decorator` | Caching decorator |

#### Rust Snippets

| Prefix | Description |
|--------|-------------|
| `ferrite-client` | Create client |
| `ferrite-pool` | Connection pool |
| `ferrite-cmd` | Raw command |
| `ferrite-model` | Derive model |

## Configuration

### Settings

Configure via VS Code Settings (`Ctrl+,`):

```json
{
  "ferrite.connections": [
    {
      "name": "Local",
      "host": "localhost",
      "port": 6379
    },
    {
      "name": "Production",
      "host": "ferrite.example.com",
      "port": 6379,
      "password": "secret",
      "tls": true
    }
  ],
  "ferrite.defaultConnection": "Local",
  "ferrite.autoConnect": true,
  "ferrite.maxKeys": 1000,
  "ferrite.outputFormat": "json",
  "ferrite.validateConfigOnSave": true
}
```

### Connection Options

| Option | Type | Description |
|--------|------|-------------|
| `name` | string | Display name |
| `host` | string | Server hostname |
| `port` | number | Server port (default: 6379) |
| `password` | string | Authentication password |
| `database` | number | Database number (default: 0) |
| `tls` | boolean | Use TLS connection |

> **⚠️ Password Security:** Connection passwords stored in VS Code settings are saved in plain text in your `settings.json` file. For production environments, consider using environment variables or a secrets manager. Avoid committing `settings.json` files containing passwords to version control. VS Code's `machine`-scoped settings keep connection passwords local to each machine and prevent them from being synced via Settings Sync.

## Ferrite Explorer

The extension adds a Ferrite panel to the Activity Bar with:

- **Connections**: View and manage saved connections
- **Keys**: Browse keys when connected
- **Server Info**: View server statistics

## Examples

### FerriteQL File

```fql
# Set some values
SET user:1:name "Alice"
SET user:1:email "alice@example.com" EX 3600

# Get values
GET user:1:name
GET user:1:email

# Hash operations
HSET user:1 name "Alice" email "alice@example.com" age 30
HGETALL user:1

# List operations
LPUSH notifications "New message" "Friend request"
LRANGE notifications 0 -1

# Sorted set (leaderboard)
ZADD leaderboard 100 "alice" 95 "bob" 110 "carol"
ZREVRANGE leaderboard 0 9 WITHSCORES

# Vector search
VECTOR.SEARCH embeddings [0.1, 0.2, 0.3, ...] TOP_K 10

# Time series
TS.ADD temperature:room1 * 23.5
TS.RANGE temperature:room1 - + AGGREGATION avg 60000
```

### Configuration File (ferrite.toml)

```toml
[server]
bind = "0.0.0.0"
port = 6379

[storage]
databases = 16
max_memory = 4294967296

[persistence]
aof_enabled = true
aof_sync = "everysec"

[logging]
level = "info"
format = "json"
```

## Troubleshooting

### Connection Issues

1. Verify Ferrite server is running
2. Check host and port settings
3. Ensure firewall allows connection
4. If using TLS, verify certificate configuration

### Extension Not Working

1. Reload VS Code window (`Ctrl+Shift+P` → "Reload Window")
2. Check Output panel for errors (View → Output → Ferrite)
3. Verify extension is enabled

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](https://github.com/ferritelabs/ferrite/blob/main/CONTRIBUTING.md).

## License

Apache 2.0 - See [LICENSE](https://github.com/ferritelabs/ferrite/blob/main/LICENSE) for details.

## Resources

- [Ferrite Documentation](https://ferrite.dev/docs)
- [GitHub Repository](https://github.com/ferritelabs/ferrite)
- [Issue Tracker](https://github.com/ferritelabs/ferrite/issues)
