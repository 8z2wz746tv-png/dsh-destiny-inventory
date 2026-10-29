# Upstream notices

## Destiny Item Manager (DIM) v8.133.0

- Repository: <https://github.com/DestinyItemManager/DIM>
- Version: `v8.133.0`
- Commit: `028644e35f51a160f86d30192395d7ecc4b91c71`
- License: MIT (see [LICENSE-DIM.md](LICENSE-DIM.md))

The inventory interaction model comes from DIM: character/store buckets, item
cards, and the socket hierarchy where a weapon frame is separate from the perk
grid, each perk socket is one column, and every reusable plug option in that
socket stacks in the same column. Weapon mods and the masterwork form a
separate bottom row.

Relevant upstream modules:

- `src/app/item-popup/ItemSockets.tsx`
- `src/app/item-popup/ItemSocketsWeapons.tsx`
- `src/app/item-popup/ItemSocketsGeneral.tsx`
- `src/app/item-popup/Socket.tsx`
- `src/app/item-popup/ArchetypeSocket.tsx`
- `src/app/utils/socket-utils.ts`
- `src/app/inventory/store/sockets.ts`

The prior adaptation of this model lives in `Destiny_MCP/webui`
(`src/features/inventory/dim/`). This repository continues from that work
rather than from DIM directly; that module's `UPSTREAM.md` holds the
component-by-component mapping.

## Destiny 2 MCP

- Role: the only data source. Every account read and write crosses its tools.
  This plugin never calls Bungie directly and never holds its own Bungie token.
- Account data, Manifest data, and community data stay separate. The panel
  renders account data; anything Manifest-derived is labelled as such.

## Bungie

Destiny 2 and its artwork are property of Bungie, Inc. Emblem art is loaded
from `https://www.bungie.net` at render time; no Bungie asset is redistributed
in this repository.
