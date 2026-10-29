# dsh-destiny-inventory

A DeepSeek Harness (DSH) plugin scaffolded by [`dsh-plugin-dev new`](https://github.com/PerryLink/dsh-plugin-guide).

## Compatibility

| Surface | Status |
|---|---|
| Harness | DeepSeek Harness `0.2.1-alpha.2` (npm `alpha`); `latest`/`next` = `0.2.0-rc.2` |
| Node | `^22.19.0 || >=24.0.0` |
| Platforms | All (plain ESM; no native code, no network) |

## What it does

Registers the `destiny-inventory_echo` tool. Calling it replies with `<greeting>: <text>`, where `<greeting>` comes from the plugin config and `<text>` is the argument.

## Install

```sh
pnpm pack
dsh plugin --profile <name> add ./dsh-destiny-inventory-0.1.0.tgz
dsh --profile <name> --dump-config | grep 'dsh-destiny-inventory'
```

## Configuration

| Key | Type | Default | Description |
|---|---|---|---|
| `greeting` | string | `Hello` | Prefix for the echo reply |

Configuration is validated by the Schemastery `Config` schema in `src/config.ts`; no tunable is hardcoded.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

## License

[Apache License 2.0](LICENSE) © 2026 dsh-destiny-inventory contributors.
