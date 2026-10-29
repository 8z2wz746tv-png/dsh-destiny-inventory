import type {
  InventoryAction,
  InventoryBucketView,
  InventoryCategoryFilter,
  InventoryFilters,
  InventoryItemView,
  InventoryPerkView,
  InventorySocketColumnView,
  InventorySocketGroupsView,
  InventorySort,
  InventoryStoreView,
} from "./types";


export const DEFAULT_INVENTORY_FILTERS: InventoryFilters = {
  typeName: "all",
  damage: "all",
  tier: "all",
  ammoType: "all",
  lockState: "all",
  duplicatesOnly: false,
};

const tierRank = { exotic: 4, legendary: 3, rare: 2, common: 1, unknown: 0 } as const;

export function inventoryItemCount(stores: InventoryStoreView[]): number {
  return stores.reduce((total, store) => total + store.items.length, 0);
}

export function isActionableItem(item: InventoryItemView): boolean {
  return /^\d+$/.test(item.id) && item.id !== "0";
}

export function isWeaponInventoryItem(item: InventoryItemView): boolean {
  return Boolean(item.ammoType) || ["kinetic", "energy", "power"].includes(item.bucketId);
}

export function isInventoryStoreCompatible(
  item: InventoryItemView,
  target: InventoryStoreView,
): boolean {
  if (target.kind === "vault") return item.bucketId !== "postmaster";
  if (target.classType === "unknown") return false;
  return item.classType === "unknown" || target.classType === item.classType;
}

export type InventoryMoveBlockReason =
  | "invalid-item"
  | "equipped"
  | "postmaster-owner-only"
  | "incompatible-class"
  | "not-transferable"
  | "same-owner";

export type InventoryDropBlockReason = InventoryMoveBlockReason | "bucket-full";

export function inventoryMoveBlockReason(
  item: InventoryItemView,
  owner: InventoryStoreView,
  target: InventoryStoreView,
): InventoryMoveBlockReason | null {
  if (!isActionableItem(item)) return "invalid-item";
  if (item.equipped) return "equipped";
  if (item.bucketId === "postmaster") {
    return target.kind === "character" && target.id === owner.id
      ? null
      : "postmaster-owner-only";
  }
  if (!isInventoryStoreCompatible(item, target)) return "incompatible-class";
  if (!item.transferable) return "not-transferable";
  if (target.id === owner.id) return "same-owner";
  return null;
}

export function canMoveItemToStore(
  item: InventoryItemView,
  owner: InventoryStoreView,
  target: InventoryStoreView,
): boolean {
  return inventoryMoveBlockReason(item, owner, target) === null;
}

export function inventoryMoveAction(
  item: InventoryItemView,
  owner: InventoryStoreView,
  target: InventoryStoreView,
): InventoryAction | null {
  if (!canMoveItemToStore(item, owner, target)) return null;
  if (item.bucketId === "postmaster") {
    if (target.kind !== "character" || target.classType === "unknown") return null;
    return {
      action: "pull_postmaster",
      itemId: item.id,
      target: target.classType,
      targetCharacterId: target.id,
    };
  }
  if (target.kind === "vault") {
    return { action: "transfer", itemId: item.id, target: "vault" };
  }
  if (target.classType === "unknown") return null;
  return {
    action: "transfer",
    itemId: item.id,
    target: target.classType,
    targetCharacterId: target.id,
  };
}

/**
 * Pick one safe-to-move item for every incoming item that would overflow a
 * character bucket. The returned array is aligned with `incoming`; `null`
 * means that item fits without first moving an existing copy to the vault.
 *
 * This mirrors DIM's least-surprising behavior: never displace equipped or
 * locked gear, and prefer low-power/unlocked copies when several are usable.
 * The server still re-validates every instance before mutating the account.
 */
export function inventoryOverflowPlan(
  incoming: readonly InventoryItemView[],
  target: InventoryStoreView,
  buckets: readonly InventoryBucketView[],
  excludedItemIds: ReadonlySet<string> = new Set(),
): { itemIds: Array<string | null>; missingCount: number } {
  const itemIds = incoming.map(() => null as string | null);
  if (target.kind !== "character" || !incoming.length) {
    return { itemIds, missingCount: 0 };
  }

  const capacityByBucket = new Map(
    buckets
      .filter((bucket) => typeof bucket.capacity === "number" && bucket.capacity > 0)
      .map((bucket) => [bucket.id, bucket.capacity as number]),
  );
  const incomingByBucket = new Map<string, number>();
  let missingCount = 0;
  incoming.forEach((item) => incomingByBucket.set(item.bucketId, (incomingByBucket.get(item.bucketId) || 0) + 1));

  for (const [bucketId, incomingCount] of incomingByBucket) {
    const capacity = capacityByBucket.get(bucketId);
    if (!capacity) continue;
    const currentCount = target.items.filter((item) => item.bucketId === bucketId).length;
    const overflowCount = Math.max(0, currentCount + incomingCount - capacity);
    if (!overflowCount) continue;

    const incomingItemIds = new Set(incoming.map((item) => item.id));
    const candidates = target.items
      .filter((item) => (
        item.bucketId === bucketId
        && !incomingItemIds.has(item.id)
        && !excludedItemIds.has(item.id)
        && !item.equipped
        && !item.locked
        && item.transferable
        && isActionableItem(item)
      ))
      .sort((left, right) => (left.power || 0) - (right.power || 0) || left.name.localeCompare(right.name, "zh-CN"));
    const candidateIds = candidates.slice(0, overflowCount).map((item) => item.id);
    missingCount += Math.max(0, overflowCount - candidateIds.length);
    let candidateIndex = 0;
    incoming.forEach((item, index) => {
      if (item.bucketId !== bucketId || candidateIndex >= candidateIds.length) return;
      itemIds[index] = candidateIds[candidateIndex++];
    });
  }
  return { itemIds, missingCount };
}

export function inventoryOverflowItemIds(
  incoming: readonly InventoryItemView[],
  target: InventoryStoreView,
  buckets: readonly InventoryBucketView[],
  excludedItemIds: ReadonlySet<string> = new Set(),
): Array<string | null> {
  return inventoryOverflowPlan(incoming, target, buckets, excludedItemIds).itemIds;
}

export function inventoryDropBlockReason(
  item: InventoryItemView,
  owner: InventoryStoreView,
  target: InventoryStoreView,
  bucketCapacity?: number,
): InventoryDropBlockReason | null {
  const moveBlockReason = inventoryMoveBlockReason(item, owner, target);
  if (moveBlockReason) return moveBlockReason;
  if (
    target.kind === "character"
    && item.bucketId !== "postmaster"
    && typeof bucketCapacity === "number"
    && bucketCapacity > 0
    && target.items.filter((entry) => entry.bucketId === item.bucketId).length >= bucketCapacity
  ) {
    return "bucket-full";
  }
  return null;
}

export function isDraggableInventoryItem(item: InventoryItemView): boolean {
  return !item.equipped
    && isActionableItem(item)
    && (item.bucketId === "postmaster" || item.transferable);
}

export function currentInventoryPerks(item: InventoryItemView): InventoryPerkView[] {
  if (item.perks?.length) return item.perks;
  const groups = item.socketGroups;
  if (!groups) return [];
  const columns = [
    ...groups.intrinsics,
    ...groups.perkColumns,
    ...groups.socketRows.flatMap((row) => row.columns),
  ];
  const selected = columns.flatMap((column) => {
    const values = column.plugs.filter((plug) => plug.selected);
    return values.length ? values : column.plugs.length === 1 ? column.plugs : [];
  });
  const unique = new Map<string, InventoryPerkView>();
  selected.forEach((perk) => unique.set(`${perk.hash}:${perk.kind}`, perk));
  return [...unique.values()];
}

/**
 * Applies one inventory instance's selected and owned socket state to the
 * manifest-derived complete weapon pool. The pool remains authoritative for
 * every candidate; the instance remains authoritative for its current roll.
 */
export function mergeInstancePerkState(
  pool: InventorySocketGroupsView,
  item: InventoryItemView,
): InventorySocketGroupsView {
  const instanceState = instancePlugState(item);
  const mergePlug = (plug: InventorySocketColumnView["plugs"][number]) => {
    const state = instanceState.get(plug.socketIndex);
    const hash = unsignedHash(plug.hash);
    const selected = state ? state.selected.has(hash) : Boolean(plug.selected);
    const owned = selected || (state ? state.owned.has(hash) : Boolean(plug.owned));
    return { ...plug, selected, owned };
  };
  const mergeColumn = (
    column: InventorySocketColumnView,
    fallback?: InventorySocketColumnView,
  ): InventorySocketColumnView => {
    const seen = new Set<number>();
    const plugs = column.plugs.map((plug) => {
      seen.add(unsignedHash(plug.hash));
      return mergePlug(plug);
    });
    for (const plug of fallback?.plugs || []) {
      if (seen.has(unsignedHash(plug.hash))) continue;
      seen.add(unsignedHash(plug.hash));
      plugs.push(mergePlug(plug));
    }
    return { ...column, plugs };
  };
  const mergeColumns = (
    columns: InventorySocketColumnView[],
    fallback: InventorySocketColumnView[],
  ): InventorySocketColumnView[] => {
    const fallbackByIndex = new Map(fallback.map((column) => [column.socketIndex, column]));
    const seen = new Set<number>();
    const merged = columns.map((column) => {
      seen.add(column.socketIndex);
      return mergeColumn(column, fallbackByIndex.get(column.socketIndex));
    });
    for (const column of fallback) {
      if (seen.has(column.socketIndex)) continue;
      seen.add(column.socketIndex);
      merged.push(mergeColumn(column));
    }
    return merged;
  };
  const fallback = item.socketGroups;
  const fallbackRowColumns = fallback?.socketRows.flatMap((row) => row.columns) || [];
  const usedFallbackRowColumns = new Set<number>();
  const socketRows = pool.socketRows.map((row) => {
    const fallbackColumns = fallbackRowColumns.filter((column) => (
      row.columns.some((poolColumn) => poolColumn.socketIndex === column.socketIndex)
    ));
    fallbackColumns.forEach((column) => usedFallbackRowColumns.add(column.socketIndex));
    return { ...row, columns: mergeColumns(row.columns, fallbackColumns) };
  });
  for (const row of fallback?.socketRows || []) {
    const remaining = row.columns.filter((column) => !usedFallbackRowColumns.has(column.socketIndex));
    if (!remaining.length) continue;
    remaining.forEach((column) => usedFallbackRowColumns.add(column.socketIndex));
    socketRows.push({ ...row, columns: mergeColumns([], remaining) });
  }
  return {
    intrinsics: mergeColumns(pool.intrinsics, fallback?.intrinsics || []),
    perkColumns: mergeColumns(pool.perkColumns, fallback?.perkColumns || []),
    socketRows,
  };
}

export function instancePlugState(item: InventoryItemView): Map<number, { selected: Set<number>; owned: Set<number> }> {
  const state = new Map<number, { selected: Set<number>; owned: Set<number> }>();
  const getState = (socketIndex: number) => {
    const existing = state.get(socketIndex);
    if (existing) return existing;
    const created = { selected: new Set<number>(), owned: new Set<number>() };
    state.set(socketIndex, created);
    return created;
  };
  const groups = item.socketGroups;
  const columns = groups ? [
    ...groups.intrinsics,
    ...groups.perkColumns,
    ...groups.socketRows.flatMap((row) => row.columns),
  ] : [];
  columns.forEach((column) => {
    const socketState = getState(column.socketIndex);
    column.plugs.forEach((plug) => {
      const hash = unsignedHash(plug.hash);
      if (plug.selected) socketState.selected.add(hash);
      if (plug.selected || plug.owned) socketState.owned.add(hash);
    });
  });
  Object.entries(item.ownedPlugHashesBySocket || {}).forEach(([socketIndex, hashes]) => {
    const parsedIndex = Number(socketIndex);
    if (!Number.isInteger(parsedIndex) || !Array.isArray(hashes)) return;
    const socketState = getState(parsedIndex);
    hashes.forEach((hash) => socketState.owned.add(unsignedHash(hash)));
  });
  return state;
}

function unsignedHash(value: number): number {
  return value >>> 0;
}

export function duplicateInventoryHashes(stores: InventoryStoreView[]): Set<number> {
  const counts = new Map<number, number>();
  stores.forEach((store) => store.items.forEach((item) => {
    if (item.hash !== 0) counts.set(item.hash, (counts.get(item.hash) || 0) + 1);
  }));
  return new Set([...counts].filter(([, count]) => count > 1).map(([hash]) => hash));
}

export function inventoryFiltersActive(filters: InventoryFilters): boolean {
  return inventoryFilterCount(filters) > 0;
}

export function inventoryFilterCount(filters: InventoryFilters): number {
  return [
    filters.typeName !== "all",
    filters.damage !== "all",
    filters.tier !== "all",
    filters.ammoType !== "all",
    filters.lockState !== "all",
    filters.duplicatesOnly,
  ].filter(Boolean).length;
}

export function inventoryItemMatches(
  item: InventoryItemView,
  rawQuery: string,
  filters: InventoryFilters = DEFAULT_INVENTORY_FILTERS,
  duplicateHashes?: ReadonlySet<number>,
): boolean {
  if (filters.typeName !== "all" && item.typeName !== filters.typeName) return false;
  if (filters.damage !== "all" && item.damageType !== filters.damage) return false;
  if (filters.tier !== "all" && item.tier !== filters.tier) return false;
  if (filters.ammoType !== "all" && item.ammoType !== filters.ammoType) return false;
  if (filters.lockState === "locked" && !item.locked) return false;
  if (filters.lockState === "unlocked" && item.locked) return false;
  if (filters.duplicatesOnly && !duplicateHashes?.has(item.hash)) return false;

  const query = rawQuery.trim().toLocaleLowerCase("zh-CN");
  if (!query) return true;
  return [
    item.name,
    item.typeName,
    item.power,
    item.quantity,
    item.ammoType,
    ...currentInventoryPerks(item).map((perk) => perk.name),
  ]
    .filter((value) => value !== null && value !== undefined)
    .some((value) => String(value).toLocaleLowerCase("zh-CN").includes(query));
}

export function visibleInventoryBuckets(
  buckets: InventoryBucketView[],
  stores: InventoryStoreView[],
  category: InventoryCategoryFilter,
  query: string,
  filters: InventoryFilters = DEFAULT_INVENTORY_FILTERS,
  duplicateHashes?: ReadonlySet<number>,
): InventoryBucketView[] {
  return buckets.filter((bucket) => {
    if (category !== "all" && bucket.category !== category) return false;
    return stores.some((store) =>
      store.items.some(
        (item) => item.bucketId === bucket.id && inventoryItemMatches(item, query, filters, duplicateHashes),
      ),
    );
  });
}

export function itemsForBucket(
  store: InventoryStoreView,
  bucketId: string,
  query: string,
  filters: InventoryFilters = DEFAULT_INVENTORY_FILTERS,
  duplicateHashes?: ReadonlySet<number>,
  sort: InventorySort = "power-desc",
): InventoryItemView[] {
  return store.items
    .filter((item) => item.bucketId === bucketId && inventoryItemMatches(item, query, filters, duplicateHashes))
    .sort((left, right) => {
      if (left.equipped !== right.equipped) return left.equipped ? -1 : 1;
      if (sort === "name-asc") return left.name.localeCompare(right.name, "zh-CN");
      if (sort === "type-asc") {
        return left.typeName.localeCompare(right.typeName, "zh-CN")
          || left.name.localeCompare(right.name, "zh-CN");
      }
      if (sort === "tier-desc") {
        return tierRank[right.tier] - tierRank[left.tier]
          || (right.power || 0) - (left.power || 0)
          || left.name.localeCompare(right.name, "zh-CN");
      }
      return (right.power || 0) - (left.power || 0)
        || left.name.localeCompare(right.name, "zh-CN");
    });
}
