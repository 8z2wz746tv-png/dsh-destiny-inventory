import { Archive, Boxes, CheckCircle2, CircleAlert, GitCompareArrows, LoaderCircle, PackageOpen, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, ErrorState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { useToast } from "../../components/ToastProvider";
import { userFacingError } from "../../lib/api";
import { useUiStore } from "../../store/ui";
import { InventoryItemDetails } from "./dim/InventoryItemDetails";
import { InventoryComparison } from "./dim/InventoryComparison";
import { InventoryStores, type InventoryDragEntry, type InventoryDragFeedback } from "./dim/InventoryStores";
import { InventoryFilterPanel } from "./dim/InventoryFilterPanel";
import {
  DEFAULT_INVENTORY_FILTERS,
  duplicateInventoryHashes,
  inventoryFilterCount,
  inventoryItemCount,
  inventoryItemMatches,
  inventoryOverflowPlan,
  inventoryMoveAction,
} from "./dim/model";
import { applySuccessfulInventoryAction, useInventoryAction, useInventoryOverview } from "./dim/queries";
import type {
  InventoryAction,
  InventoryCategoryFilter,
  InventoryFilters,
  InventoryItemView,
  InventorySort,
  InventoryStoreView,
} from "./dim/types";


type InventoryActionStatus = InventoryDragFeedback | {
  phase: "success" | "error";
  item: Pick<InventoryItemView, "name" | "iconUrl">;
  message?: string;
} | null;


const categories: Array<{ value: InventoryCategoryFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "weapons", label: "武器" },
  { value: "armor", label: "护甲" },
  { value: "general", label: "通用" },
  { value: "postmaster", label: "邮政官" },
];
const EMPTY_PENDING_ITEM_IDS = new Set<string>();

export function InventoryPage() {
  const inventory = useInventoryOverview();
  const action = useInventoryAction();
  const { notify } = useToast();
  const [category, setCategory] = useState<InventoryCategoryFilter>("weapons");
  const [search, setSearch] = useState("");
  const [storeScope, setStoreScope] = useState("all");
  const [filters, setFilters] = useState<InventoryFilters>({ ...DEFAULT_INVENTORY_FILTERS });
  const [sort, setSort] = useState<InventorySort>("power-desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [comparisonItemIds, setComparisonItemIds] = useState<string[]>([]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState<InventoryActionStatus>(null);
  const [latestQueuedItem, setLatestQueuedItem] = useState<Pick<InventoryItemView, "name" | "iconUrl"> | null>(null);
  const inventoryTileSize = useUiStore((state) => state.inventoryTileSize);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const assistantToggleRef = useRef<HTMLButtonElement>(null);
  const assistantPanelRef = useRef<HTMLElement>(null);
  const selectedTriggerRef = useRef<HTMLElement | null>(null);
  const [selection, setSelection] = useState<{
    itemId: string;
    storeId: string;
  } | null>(null);
  const pendingCount = action.pendingCount ?? (action.isPending ? 1 : 0);
  const pendingActions = action.pendingActions ?? [];
  const pendingTransferItemCount = action.pendingTransferItemCount ?? pendingCount;
  const pendingItemIds = action.pendingItemIds ?? EMPTY_PENDING_ITEM_IDS;
  const projectedInventory = useMemo(() => (
    inventory.data
      ? pendingActions.reduce(applySuccessfulInventoryAction, inventory.data)
      : undefined
  ), [inventory.data, pendingActions]);
  const displayedInventory = projectedInventory || inventory.data;

  useEffect(() => {
    if (!actionStatus || actionStatus.phase === "dragging" || actionStatus.phase === "moving") return;
    const timeout = window.setTimeout(
      () => setActionStatus(null),
      actionStatus.phase === "blocked" ? 3000 : 1800,
    );
    return () => window.clearTimeout(timeout);
  }, [actionStatus]);

  const selected = useMemo(() => {
    if (!displayedInventory || !selection) return null;
    const originalStore = displayedInventory.stores.find((entry) => entry.id === selection.storeId);
    const originalItem = originalStore?.items.find((entry) => entry.id === selection.itemId);
    if (originalStore && originalItem) return { store: originalStore, item: originalItem };
    for (const store of displayedInventory.stores) {
      const item = store.items.find((entry) => entry.id === selection.itemId);
      if (item) return { store, item };
    }
    return null;
  }, [displayedInventory, selection]);

  const duplicateHashes = useMemo(
    () => displayedInventory ? duplicateInventoryHashes(displayedInventory.stores) : new Set<number>(),
    [displayedInventory],
  );
  const scopedStores = useMemo(() => {
    if (!displayedInventory) return [];
    return storeScope === "all"
      ? displayedInventory.stores
      : displayedInventory.stores.filter((store) => store.id === storeScope);
  }, [displayedInventory, storeScope]);
  const scopedItems = useMemo(() => {
    if (!displayedInventory) return [];
    return scopedStores.flatMap((store) => store.items).filter((item) => {
      const bucket = displayedInventory.buckets.find((entry) => entry.id === item.bucketId);
      return bucket ? category === "all" || bucket.category === category : false;
    });
  }, [category, displayedInventory, scopedStores]);
  const typeNames = useMemo(
    () => [...new Set(scopedItems.map((item) => item.typeName).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "zh-CN")),
    [scopedItems],
  );
  const ammoTypes = useMemo(
    () => [...new Set(scopedItems.map((item) => item.ammoType).filter((type): type is string => Boolean(type)))]
      .sort((left, right) => left.localeCompare(right, "zh-CN")),
    [scopedItems],
  );
  const filteredItemCount = useMemo(() => {
    return scopedItems.filter((item) => inventoryItemMatches(item, search, filters, duplicateHashes)).length;
  }, [duplicateHashes, filters, scopedItems, search]);
  const activeFilterCount = inventoryFilterCount(filters);
  const comparisonItems = useMemo(() => {
    if (!displayedInventory) return [];
    const itemsById = new Map(displayedInventory.stores.flatMap((store) => store.items.map((item) => [item.id, item])));
    return comparisonItemIds.flatMap((itemId) => {
      const item = itemsById.get(itemId);
      return item ? [item] : [];
    });
  }, [comparisonItemIds, displayedInventory]);

  useEffect(() => {
    if (!displayedInventory) return;
    const itemIds = new Set(displayedInventory.stores.flatMap((store) => store.items.map((item) => item.id)));
    setComparisonItemIds((previous) => {
      const next = previous.filter((itemId) => itemIds.has(itemId));
      return next.length === previous.length ? previous : next;
    });
  }, [displayedInventory]);

  const runAction = async (command: InventoryAction, dragItem?: InventoryItemView) => {
    if (dragItem) setLatestQueuedItem({ name: dragItem.name, iconUrl: dragItem.iconUrl });
    try {
      const result = await action.mutateAsync(command);
      notify(result.message, "success");
      if (dragItem) setActionStatus({ phase: "success", item: dragItem, message: result.message });
    } catch (error) {
      const message = userFacingError(error, "装备操作失败");
      notify(message, "error");
      if (dragItem) setActionStatus({ phase: "error", item: dragItem, message });
      throw error;
    }
  };

  const description = displayedInventory
    ? `${displayedInventory.profile.displayName || "当前守护者"} · ${inventoryItemCount(displayedInventory.stores)} 件物品`
    : "查看并管理角色背包、仓库与邮政官物品。";
  const sidePanelOpen = !compareMode && Boolean(selected || assistantOpen);
  const activeQueuedItem = useMemo(() => {
    const activeItemId = pendingActions[0]?.itemId;
    if (!activeItemId || !displayedInventory) return latestQueuedItem;
    return displayedInventory.stores
      .flatMap((store) => store.items)
      .find((item) => item.id === activeItemId) || latestQueuedItem;
  }, [displayedInventory, latestQueuedItem, pendingActions]);
  const displayedActionStatus: InventoryActionStatus = (
    actionStatus?.phase === "dragging" || actionStatus?.phase === "blocked"
  )
    ? actionStatus
    : pendingCount > 0 && activeQueuedItem
      ? {
        phase: "moving",
        item: activeQueuedItem,
        message: pendingTransferItemCount > 1
          ? `正在处理 1 件，另有 ${pendingTransferItemCount - 1} 件排队`
          : "正在处理装备操作",
      }
      : actionStatus;

  useEffect(() => {
    if (assistantOpen && !selected) assistantPanelRef.current?.focus({ preventScroll: true });
  }, [assistantOpen, selected]);

  const closeAssistant = (restoreFocus = false) => {
    setAssistantOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => assistantToggleRef.current?.focus({ preventScroll: true }));
  };

  const resetFilterPanel = () => {
    setFilters({ ...DEFAULT_INVENTORY_FILTERS });
    setSort("power-desc");
  };

  const clearSearchAndFilters = () => {
    setSearch("");
    resetFilterPanel();
  };

  const closeComparison = () => {
    setCompareMode(false);
    setComparisonItemIds([]);
  };

  const toggleComparisonItem = (item: InventoryItemView) => {
    if (!item.hash) {
      notify("这件物品缺少可用于对比的武器定义。", "error");
      return;
    }
    if (comparisonItemIds.includes(item.id)) {
      setComparisonItemIds((previous) => previous.filter((itemId) => itemId !== item.id));
      return;
    }
    if (comparisonItems[0] && comparisonItems[0].hash !== item.hash) {
      notify("一次只能对比同一把武器的不同 Roll。", "error");
      return;
    }
    if (comparisonItemIds.length >= 3) {
      notify("一次最多对比 3 件装备。", "error");
      return;
    }
    setComparisonItemIds((previous) => [...previous, item.id]);
  };

  return (
    <section className={`feature-page inventory-page ${compareMode && comparisonItems.length ? "has-comparison" : ""}`}>
      <div className="inventory-page-header">
        <PageHeader
          title="装备仓库"
          description={description}
          actions={displayedActionStatus ? <InventoryActionStatus status={displayedActionStatus} /> : (
            <button className="icon-button" type="button" onClick={() => void inventory.refetch()} disabled={inventory.isFetching} aria-label="刷新仓库" title="刷新仓库">
              <RefreshCw size={17} className={inventory.isFetching ? "is-spinning" : ""} />
            </button>
          )}
        />
      </div>

      {inventory.isLoading ? <InventorySkeleton /> : null}
      {inventory.isError ? (
        <div className="inventory-state-wrap">
          <ErrorState message={userFacingError(inventory.error, "读取仓库失败")} retry={() => void inventory.refetch()} />
        </div>
      ) : null}
      {displayedInventory && !displayedInventory.stores.length ? (
        <EmptyState title="没有角色数据" detail="当前 Bungie 账号没有返回可用的 Destiny 2 角色。" />
      ) : null}

      {displayedInventory?.stores.length && inventory.data ? (
        <>
          <div className="inventory-toolbar">
            <label className="inventory-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">搜索装备</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、类型、Perk 或光能" />
            </label>
            <div className="inventory-categories" role="group" aria-label="装备分类">
              {categories.map((entry) => (
                <button key={entry.value} type="button" aria-pressed={category === entry.value} className={category === entry.value ? "active" : ""} onClick={() => setCategory(entry.value)}>
                  {entry.label}
                </button>
              ))}
            </div>
            <label className="inventory-store-scope">
              <Boxes size={15} aria-hidden="true" />
              <span className="sr-only">显示范围</span>
              <select value={storeScope} onChange={(event) => setStoreScope(event.target.value)}>
                <option value="all">全部位置</option>
                {displayedInventory.stores.map((store) => <option value={store.id} key={store.id}>{store.label}</option>)}
              </select>
            </label>
            <InventoryFilterPanel
              open={filtersOpen}
              filters={filters}
              sort={sort}
              typeNames={typeNames}
              ammoTypes={ammoTypes}
              activeCount={activeFilterCount}
              resultCount={filteredItemCount}
              onOpenChange={setFiltersOpen}
              onChange={setFilters}
              onSortChange={setSort}
              onReset={resetFilterPanel}
            />
            <button
              className={`button secondary inventory-compare-toggle ${compareMode ? "active" : ""}`}
              type="button"
              aria-pressed={compareMode}
              onClick={() => {
                if (compareMode) {
                  closeComparison();
                  return;
                }
                setSelection(null);
                closeAssistant();
                setCompareMode(true);
              }}
            >
              <GitCompareArrows size={15} aria-hidden="true" />
              {compareMode ? `结束对比 ${comparisonItems.length}/3` : "对比 Roll"}
            </button>
          </div>

          {compareMode && comparisonItems.length ? <InventoryComparison
            items={comparisonItems}
            onRemove={(itemId) => setComparisonItemIds((previous) => previous.filter((entry) => entry !== itemId))}
            onClose={closeComparison}
          /> : null}
          <div ref={workspaceRef} className={`inventory-workspace inventory-tile-size-${inventoryTileSize} ${sidePanelOpen ? "is-panel-open" : ""}`}>
            <InventoryStores
              inventory={displayedInventory}
              category={category}
              query={search}
              filters={filters}
              sort={sort}
              duplicateHashes={duplicateHashes}
              compareMode={compareMode}
              comparisonItemIds={comparisonItemIds}
              storeScope={storeScope}
              selectedItemId={selected?.item.id || ""}
              pendingItemIds={pendingItemIds}
              onDragFeedback={setActionStatus}
              onSelectItem={(item: InventoryItemView, store: InventoryStoreView, trigger: HTMLElement) => {
                selectedTriggerRef.current = trigger;
                setAssistantOpen(false);
                setSelection({ itemId: item.id, storeId: store.id });
              }}
              onToggleComparison={toggleComparisonItem}
              onRequestMove={(item, owner, target, additionalItems) => {
                const entries: InventoryDragEntry[] = [{ item, owner }, ...(additionalItems || [])];
                const firstCommand = inventoryMoveAction(item, owner, target);
                if (!firstCommand) {
                  setActionStatus(null);
                  return;
                }
                const commands = entries.map((entry) => inventoryMoveAction(entry.item, entry.owner, target));
                if (commands.some((command) => !command || command.action !== "transfer")) {
                  commands.forEach((command, index) => {
                    if (!command) return;
                    void runAction(command, entries[index].item).catch(() => undefined);
                  });
                  return;
                }
                const baseTarget = inventory.data.stores.find((store) => store.id === target.id) || target;
                const projectedTarget = projectedInventory?.stores.find((store) => store.id === target.id) || target;
                const capacityTarget = conservativeCapacityTarget(baseTarget, projectedTarget);
                const overflowPlan = inventoryOverflowPlan(
                  entries.map((entry) => entry.item),
                  capacityTarget,
                  inventory.data.buckets,
                  pendingItemIds,
                );
                if (overflowPlan.missingCount > 0) {
                  const message = `${target.label}的对应栏位已满，且没有可安全移至仓库的未装备、未锁定物品`;
                  setActionStatus({ phase: "blocked", item, message });
                  notify(message, "error");
                  return;
                }
                const overflowItemIds = overflowPlan.itemIds;
                if (entries.length === 1 && !overflowItemIds.some(Boolean)) {
                  void runAction(firstCommand, item).catch(() => undefined);
                  return;
                }
                const batchCommand = {
                  ...firstCommand,
                  itemIds: entries.map((entry) => entry.item.id),
                  overflowItemIds,
                };
                void runAction(batchCommand, item).catch(() => undefined);
              }}
              onClearSearchAndFilters={clearSearchAndFilters}
            />
            {sidePanelOpen ? <>{selected ? (
              <InventoryItemDetails
                item={selected.item}
                owner={selected.store}
                stores={displayedInventory.stores}
                equippable={Boolean(displayedInventory.buckets.find((bucket) => bucket.id === selected.item.bucketId)?.equippable)}
                busy={pendingItemIds.has(selected.item.id)}
                onClose={() => {
                  const trigger = selectedTriggerRef.current;
                  setSelection(null);
                  setAssistantOpen(false);
                  window.requestAnimationFrame(() => {
                    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
                  });
                }}
                onAction={runAction}
              />
            ) : (
                null
            )}</> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function conservativeCapacityTarget(
  current: InventoryStoreView,
  projected: InventoryStoreView,
): InventoryStoreView {
  if (current.id !== projected.id) return current;
  const bucketIds = new Set([
    ...current.items.map((item) => item.bucketId),
    ...projected.items.map((item) => item.bucketId),
  ]);
  const items = [...bucketIds].flatMap((bucketId) => {
    const currentItems = current.items.filter((item) => item.bucketId === bucketId);
    const projectedItems = projected.items.filter((item) => item.bucketId === bucketId);
    return projectedItems.length > currentItems.length ? projectedItems : currentItems;
  });
  return { ...current, items };
}

function InventoryActionStatus({ status }: { status: Exclude<InventoryActionStatus, null> }) {
  const phaseLabel = status.phase === "dragging"
    ? "正在拖动"
    : status.phase === "moving"
      ? "正在转移"
      : status.phase === "blocked"
        ? "无法放置"
        : status.phase === "success"
          ? "转移完成"
          : "转移失败";
  const statusMessage = "message" in status && status.message ? `，${status.message}` : "";
  const detail = "message" in status && status.message
    ? status.message
    : status.item.name;

  return (
    <div
      className={`inventory-action-status phase-${status.phase}`}
      role="status"
      aria-live="polite"
      aria-busy={status.phase === "moving"}
      aria-label={`${phaseLabel}：${status.item.name}${statusMessage}`}
      title={`${phaseLabel}：${status.item.name}${statusMessage}`}
    >
      <span className="inventory-action-status-visual" aria-hidden="true">
        {status.item.iconUrl ? <img src={status.item.iconUrl} alt="" /> : <PackageOpen className="inventory-action-status-fallback" size={15} />}
        {status.phase === "moving" ? <LoaderCircle className="is-spinning" size={13} /> : null}
        {status.phase === "success" ? <CheckCircle2 size={13} /> : null}
        {status.phase === "error" || status.phase === "blocked" ? <CircleAlert size={13} /> : null}
      </span>
      <span className="inventory-action-status-copy">
        <strong>{phaseLabel}</strong>
        <span>{detail}</span>
      </span>
    </div>
  );
}

function InventorySkeleton() {
  return (
    <div className="inventory-skeleton" aria-label="正在读取仓库">
      <div className="inventory-skeleton-toolbar" />
      <div className="inventory-skeleton-head"><span /><span /><span /><span /></div>
      {Array.from({ length: 4 }, (_, row) => (
        <div className="inventory-skeleton-row" key={row}>
          <strong />
          {Array.from({ length: 18 }, (_, tile) => <i key={tile} />)}
        </div>
      ))}
      <Archive className="sr-only" />
    </div>
  );
}
