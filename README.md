# pproxy-ts

A simple and modular HTTP proxy server with upstream proxy support.

## Installation

Install dependencies using pnpm:

```bash
pnpm install
```

## Usage

Run the proxy server:

```bash
pnpm start
```

Or with Node directly:

```bash
node --import tsx src/index.ts
```

### CLI Options

```
pproxy-ts [OPTIONS]

Options:
  -l, --listen <address>   HTTP proxy server listen address (default: "0.0.0.0:3080")
  -r, --rserver <uri>      Upstream proxy server URI (default: "direct")
  -d, --direct <file>      Path to direct file with domains to bypass proxy
  -h, --help               Show help message
```

### Examples

Start proxy on default port (3080):

```bash
pnpm start
```

Start proxy on custom port:

```bash
pnpm start -- -l 8080
```

Start proxy with HTTP upstream:

```bash
pnpm start -- -r http://127.0.0.1:4080
```

Start proxy with SOCKS5 upstream:

```bash
pnpm start -- -r socks5://127.0.0.1:1080
```

Start proxy with direct bypass file:

```bash
pnpm start -- -r http://127.0.0.1:4080 -d pproxy.direct
```

## Direct Bypass Feature

The direct bypass feature allows you to specify domains that should bypass the upstream proxy and connect directly. This is useful for:

- Local network hosts
- Domains that don't require proxy access
- Performance optimization for certain domains

### Direct File Format

Create a file named `pproxy.direct` (or any name you prefer) with one pattern per line:

```
# Exact domain match
foo.bar.com
google.com

# Wildcard subdomain match (matches any subdomain)
*.example.com
*.github.com

# Wildcard TLD match (matches any domain with this TLD)
*.net
*.local

# Partial keyword match (matches anywhere in hostname)
localhost
foobar
```

### Pattern Types

1. **Exact match**: `foo.bar.com` - Matches only `foo.bar.com`
2. **Wildcard subdomain**: `*.example.com` - Matches `foo.example.com`, `bar.example.com`, and `example.com` itself
3. **Wildcard TLD**: `*.net` - Matches any domain ending with `.net`
4. **Partial match**: `localhost` or `foobar` - Matches any hostname containing this keyword

### Usage Example

```bash
# Create your direct file
cat > pproxy.direct << EOF
localhost
*.local
*.example.com
foo.bar.com
EOF

# Run with direct bypass
pnpm start -- -r socks5://127.0.0.1:1080 -d pproxy.direct
```

When a request is made, the proxy will check if the hostname matches any pattern in the direct file. If it matches, the connection goes direct; otherwise, it uses the upstream proxy.

## Architecture

The project is organized into modular components:

- **src/index.ts** - Main entry point
- **src/cli.ts** - CLI argument parsing with Commander
- **src/proxy.ts** - Proxy server logic using proxy-chain
- **src/direct.ts** - Direct bypass list parsing and matching
- **src/types.ts** - Type definitions and Zod schemas
- **src/logger.ts** - Structured logging with TTY support

## Development

Run in watch mode:

```bash
pnpm dev
```

Build:

```bash
pnpm build
```

Format code:

```bash
pnpm format
```
