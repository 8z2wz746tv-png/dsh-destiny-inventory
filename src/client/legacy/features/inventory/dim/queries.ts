import { useIsMutating, useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import type {
  InventoryAction,
  InventoryActionPayload,
  InventoryOverviewPayload,
  InventoryWeaponPerkPoolPayload,
} from "./types";


const INVENTORY_OVERVIEW_QUERY_KEY = ["destiny-inventory-overview"] as const;
const INVENTORY_ACTION_MUTATION_KEY = ["destiny-inventory-action"] as const;


export function useInventoryOverview() {
  const pendingActionCount = useIsMutating({ mutationKey: INVENTORY_ACTION_MUTATION_KEY });
  return useQuery({
    queryKey: INVENTORY_OVERVIEW_QUERY_KEY,
    queryFn: () => api<InventoryOverviewPayload>("/api/destiny/inventory/overview"),
    staleTime: 30_000,
    refetchInterval: pendingActionCount ? false : 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: pendingActionCount === 0,
  });
}

export function useInventoryPerkPool(itemHash: number, enabled: boolean) {
  const canonicalHash = itemHash >>> 0;
  return useQuery({
    queryKey: ["destiny-inventory-perk-pool", canonicalHash],
    queryFn: () => api<InventoryWeaponPerkPoolPayload>(
      `/api/destiny/inventory/perk-pool?item_hash=${encodeURIComponent(String(canonicalHash))}`,
    ),
    enabled: enabled && canonicalHash > 0,
    staleTime: 12 * 60 * 60 * 1_000,
    gcTime: 12 * 60 * 60 * 1_000,
  });
}

export function useInventoryAction() {
  const client = useQueryClient();
  const pendingActions = useMutationState<InventoryAction>({
    filters: { mutationKey: INVENTORY_ACTION_MUTATION_KEY, status: "pending" },
    select: (mutation) => mutation.state.variables as InventoryAction,
  });
  const mutation = useMutation({
    mutationKey: INVENTORY_ACTION_MUTATION_KEY,
    scope: { id: "destiny-inventory-actions" },
    mutationFn: (command: InventoryAction) => api<InventoryActionPayload>(
      "/api/destiny/inventory/action",
      { method: "POST", body: command },
    ),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: INVENTORY_OVERVIEW_QUERY_KEY });
    },
    onSuccess: (result, command) => {
      const confirmed = command.action === "transfer" && result.movedOverflowItemIds !== undefined
        ? { ...command, overflowItemIds: result.movedOverflowItemIds }
        : command;
      client.setQueryData<InventoryOverviewPayload>(
        INVENTORY_OVERVIEW_QUERY_KEY,
        (current) => current ? applySuccessfulInventoryAction(current, confirmed) : current,
      );
    },
    onSettled: () => {
      if (client.isMutating({ mutationKey: INVENTORY_ACTION_MUTATION_KEY }) !== 1) return;
      void client.invalidateQueries({ queryKey: INVENTORY_OVERVIEW_QUERY_KEY });
    },
  });
  const pendingItemIds = new Set(pendingActions.flatMap(inventoryActionItemIds));
  const pendingTransferItemCount = pendingActions.reduce(
    (count, command) => count + inventoryActionPrimaryItemIds(command).length,
    0,
  );
  return {
    ...mutation,
    pendingActions,
    pendingCount: pendingActions.length,
    pendingTransferItemCount,
    pendingItemIds,
  };
}


export function applySuccessfulInventoryAction(
  inventory: InventoryOverviewPayload,
  command: InventoryAction,
): InventoryOverviewPayload {
  const stores = inventory.stores.map((store) => ({ ...store, items: [...store.items] }));
  const findItem = (itemId: string) => {
    for (const store of stores) {
      const index = store.items.findIndex((item) => item.id === itemId);
      if (index >= 0) return { store, index, item: store.items[index] };
    }
    return null;
  };
  const moveItem = (itemId: string, targetId: string) => {
    const source = findItem(itemId);
    const target = stores.find((store) => store.id === targetId);
    if (!source || !target || source.store.id === target.id) return source?.item;
    source.store.items.splice(source.index, 1);
    const moved = {
      ...source.item,
      ownerId: target.id,
      locationId: target.id,
      equipped: false,
    };
    target.items.push(moved);
    return moved;
  };

  if (command.action === "lock") {
    const found = findItem(command.itemId);
    if (found) found.store.items[found.index] = { ...found.item, locked: command.locked };
    return { ...inventory, stores };
  }

  if (command.action === "pull_postmaster") {
    return inventory;
  }

  const target = command.target === "vault"
    ? stores.find((store) => store.kind === "vault")
    : stores.find((store) => (
      store.kind === "character"
      && (command.targetCharacterId ? store.id === command.targetCharacterId : store.classType === command.target)
    ));
  if (!target) return inventory;

  if (command.action === "equip") {
    const source = findItem(command.itemId);
    const bucketId = source?.item.bucketId;
    const moved = moveItem(command.itemId, target.id) || findItem(command.itemId)?.item;
    if (!moved || !bucketId) return inventory;
    target.items = target.items.map((item) => (
      item.bucketId === bucketId
        ? { ...item, equipped: item.id === command.itemId }
        : item
    ));
    return { ...inventory, stores };
  }

  for (const overflowId of command.overflowItemIds || []) {
    if (overflowId) {
      const vault = stores.find((store) => store.kind === "vault");
      if (vault) moveItem(overflowId, vault.id);
    }
  }
  for (const itemId of command.itemIds || [command.itemId]) moveItem(itemId, target.id);
  return { ...inventory, stores };
}


function inventoryActionItemIds(command: InventoryAction): string[] {
  return [
    ...inventoryActionPrimaryItemIds(command),
    ...(command.action === "transfer" ? (command.overflowItemIds || []).filter((itemId): itemId is string => Boolean(itemId)) : []),
  ];
}

function inventoryActionPrimaryItemIds(command: InventoryAction): string[] {
  if (command.action !== "transfer") return [command.itemId];
  return [
    ...(command.itemIds || [command.itemId]),
  ];
}
