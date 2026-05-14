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

## Architecture

The project is organized into modular components:

- **src/index.ts** - Main entry point
- **src/cli.ts** - CLI argument parsing with Commander
- **src/proxy.ts** - Proxy server logic using proxy-chain
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
