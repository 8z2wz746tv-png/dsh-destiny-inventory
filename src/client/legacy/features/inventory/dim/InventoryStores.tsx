import { Archive, Check, LockKeyhole, PackageOpen } from "lucide-react";
import { formatTrackerCount, isWeaponGearTier, isWeaponTrackerCount } from "../../../lib/weapon";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import { InventoryItemHoverCard } from "./InventoryItemHoverCard";
import {
  DEFAULT_INVENTORY_FILTERS,
  inventoryDropBlockReason,
  inventoryFiltersActive,
  isActionableItem,
  isDraggableInventoryItem,
  itemsForBucket,
  visibleInventoryBuckets,
} from "./model";
import type { InventoryDropBlockReason } from "./model";
import type {
  InventoryCategoryFilter,
  InventoryFilters,
  InventoryItemView,
  InventoryOverviewPayload,
  InventorySort,
  InventoryStoreView,
} from "./types";


interface InventoryStoresProps {
  inventory: InventoryOverviewPayload;
  category: InventoryCategoryFilter;
  query: string;
  filters?: InventoryFilters;
  sort?: InventorySort;
  duplicateHashes?: ReadonlySet<number>;
  compareMode?: boolean;
  comparisonItemIds?: readonly string[];
  storeScope: string;
  selectedItemId: string;
  pendingItemIds?: ReadonlySet<string>;
  onDragFeedback?: (feedback: InventoryDragFeedback | null) => void;
  onSelectItem: (item: InventoryItemView, store: InventoryStoreView, trigger: HTMLElement) => void;
  onRequestMove: (
    item: InventoryItemView,
    owner: InventoryStoreView,
    target: InventoryStoreView,
    additionalItems?: InventoryDragEntry[],
  ) => void;
  onClearSearchAndFilters?: () => void;
  onToggleComparison?: (item: InventoryItemView, owner: InventoryStoreView) => void;
}

export interface InventoryDragEntry {
  item: InventoryItemView;
  owner: InventoryStoreView;
}

export type InventoryDragFeedback = {
  phase: "dragging" | "moving";
  item: Pick<InventoryItemView, "name" | "iconUrl">;
  message?: string;
} | {
  phase: "blocked";
  item: Pick<InventoryItemView, "name" | "iconUrl">;
  message: string;
};

interface ItemPreview {
  item: InventoryItemView;
  owner: InventoryStoreView;
  anchor: HTMLElement;
}

interface ItemClickModifiers {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

const MAX_VISIBLE_UNEQUIPPED_WEAPONS = 9;
const INITIAL_VAULT_ITEM_BUDGET = 180;
const EMPTY_PENDING_ITEM_IDS = new Set<string>();
type DragBlockReason = InventoryDropBlockReason | "pending";

function visibleUnequippedItems(
  items: InventoryItemView[],
  limitToNine: boolean,
  query: string,
): InventoryItemView[] {
  const unequipped = items.filter((item) => !item.equipped);
  return limitToNine && !query.trim()
    ? unequipped.slice(0, MAX_VISIBLE_UNEQUIPPED_WEAPONS)
    : unequipped;
}

export function InventoryStores({
  inventory,
  category,
  query,
  filters = DEFAULT_INVENTORY_FILTERS,
  sort = "power-desc",
  duplicateHashes,
  compareMode = false,
  comparisonItemIds = [],
  storeScope,
  selectedItemId,
  pendingItemIds = EMPTY_PENDING_ITEM_IDS,
  onDragFeedback,
  onSelectItem,
  onRequestMove,
  onClearSearchAndFilters,
  onToggleComparison,
}: InventoryStoresProps) {
  const previewTimer = useRef<number | null>(null);
  const dismissTimer = useRef<number | null>(null);
  const feedbackDismissTimer = useRef<number | null>(null);
  const draggedRef = useRef<{ items: InventoryDragEntry[] } | null>(null);
  const dropRequestedRef = useRef(false);
  const dragFeedbackKeyRef = useRef<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<ItemPreview | null>(null);
  const [dragSourceKey, setDragSourceKey] = useState<string | null>(null);
  const [draggedItemKeys, setDraggedItemKeys] = useState<Set<string>>(() => new Set());
  const [moveSelectionKeys, setMoveSelectionKeys] = useState<Set<string>>(() => new Set());
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [expandedVaultBuckets, setExpandedVaultBuckets] = useState<Set<string>>(() => new Set());
  const stores = storeScope === "all"
    ? inventory.stores
    : inventory.stores.filter((store) => store.id === storeScope);
  const buckets = visibleInventoryBuckets(inventory.buckets, stores, category, query, filters, duplicateHashes);
  const currentStore = stores.find((store) => store.current) || stores[0];
  const onlineStore = inventory.stores.find((store) => store.kind === "character" && store.current);
  const secondaryStores = currentStore
    ? [
      ...stores.filter((store) => store.id !== currentStore.id && store.kind === "character"),
      ...stores.filter((store) => store.id !== currentStore.id && store.kind === "vault"),
    ]
    : [];
  const characterStoreCount = Math.max(stores.filter((store) => store.kind === "character").length, 1);
  const hasVaultStore = currentStore?.kind === "character" && secondaryStores.some((store) => store.kind === "vault");
  const gridStyle = {
    "--inventory-store-count": Math.max(stores.length, 1),
    "--inventory-character-store-count": characterStoreCount,
  } as CSSProperties;
  const gridClass = `inventory-grid ${hasVaultStore ? "has-vault-store" : ""}`;
  const showAllMatches = Boolean(query.trim()) || inventoryFiltersActive(filters);
  const vaultItemLimit = Math.max(18, Math.floor(INITIAL_VAULT_ITEM_BUDGET / Math.max(buckets.length, 1)));

  useEffect(() => () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    if (feedbackDismissTimer.current !== null) window.clearTimeout(feedbackDismissTimer.current);
    draggedRef.current = null;
    dropRequestedRef.current = false;
    dragFeedbackKeyRef.current = null;
  }, []);

  useEffect(() => {
    const available = new Set(inventory.stores.flatMap((store) => store.items.map((item) => `${store.id}:${item.id}`)));
    setMoveSelectionKeys((previous) => {
      const next = new Set([...previous].filter((key) => available.has(key)));
      return next.size === previous.size ? previous : next;
    });
  }, [inventory.stores]);

  const keepPreview = () => {
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
  };

  const hidePreview = (immediate = false) => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    keepPreview();
    if (immediate) setHoverPreview(null);
    else dismissTimer.current = window.setTimeout(() => setHoverPreview(null), 120);
  };

  const showPreview = (
    item: InventoryItemView,
    owner: InventoryStoreView,
    anchor: HTMLElement,
    immediate = false,
  ) => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    keepPreview();
    const commit = () => {
      previewTimer.current = null;
      setHoverPreview({ item, owner, anchor });
    };
    if (immediate) commit();
    else previewTimer.current = window.setTimeout(commit, 160);
  };

  const closeAllPreviews = () => {
    hidePreview(true);
  };

  const clearDrag = (notify = true) => {
    draggedRef.current = null;
    setDragSourceKey(null);
    setDraggedItemKeys(new Set());
    setDropTargetKey(null);
    if (notify) {
      dragFeedbackKeyRef.current = null;
      onDragFeedback?.(null);
    }
  };

  const reportDragFeedback = (feedback: InventoryDragFeedback, key: string) => {
    if (feedbackDismissTimer.current !== null) {
      window.clearTimeout(feedbackDismissTimer.current);
      feedbackDismissTimer.current = null;
    }
    if (dragFeedbackKeyRef.current === key) return;
    dragFeedbackKeyRef.current = key;
    onDragFeedback?.(feedback);
  };

  const scheduleBlockedFeedbackDismiss = () => {
    if (feedbackDismissTimer.current !== null) window.clearTimeout(feedbackDismissTimer.current);
    feedbackDismissTimer.current = window.setTimeout(() => {
      feedbackDismissTimer.current = null;
      onDragFeedback?.(null);
    }, 3000);
  };

  const endDrag = () => {
    const blocked = Boolean(dragFeedbackKeyRef.current?.startsWith("blocked:"));
    const preserveFeedback = dropRequestedRef.current || blocked;
    dropRequestedRef.current = false;
    clearDrag(false);
    dragFeedbackKeyRef.current = null;
    if (blocked) scheduleBlockedFeedbackDismiss();
    else if (!preserveFeedback) onDragFeedback?.(null);
  };

  const nativeDragEnabled = typeof window === "undefined"
    || typeof window.matchMedia !== "function"
    || !window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const dragged = dragSourceKey ? draggedRef.current : null;
  const preview = hoverPreview;

  const dropBlockReason = (target: InventoryStoreView): DragBlockReason | null => {
    const payload = draggedRef.current;
    if (!payload) return null;
    for (const entry of payload.items) {
      if (pendingItemIds.has(entry.item.id)) return "pending";
      const sourceBucket = inventory.buckets.find((bucket) => bucket.id === entry.item.bucketId);
      const reason = inventoryDropBlockReason(entry.item, entry.owner, target, sourceBucket?.capacity);
      // A full character bucket is recoverable: the request carries the
      // overflow instances that should be moved to the vault first.
      if (reason && reason !== "bucket-full") return reason;
    }
    return null;
  };

  const blockedMessage = (
    reason: DragBlockReason,
    target: InventoryStoreView,
    firstEntry?: InventoryDragEntry,
  ): string => {
    const payload = draggedRef.current;
    const first = firstEntry || payload?.items[0];
    if (!first) return "当前物品无法转移";
    const { item } = first;
    const sourceBucket = inventory.buckets.find((entry) => entry.id === item.bucketId);
    const bucketLabel = sourceBucket?.label || "对应装备";
    switch (reason) {
      case "pending":
        return `「${item.name}」已经在操作队列中`;
      case "invalid-item":
        return "该物品缺少可操作的实例信息";
      case "equipped":
        return `先换下「${item.name}」，再进行转移`;
      case "postmaster-owner-only":
        return "邮政长物品只能提取到所属角色";
      case "incompatible-class":
        return `「${item.name}」与${target.label}职业不匹配`;
      case "not-transferable":
        return "Bungie 标记该物品不可转移";
      case "same-owner":
        return `「${item.name}」已经在${target.label}中`;
      case "bucket-full": {
        const count = target.items.filter((entry) => entry.bucketId === item.bucketId).length;
        const capacity = sourceBucket?.capacity;
        return `${target.label}的${bucketLabel}栏位已满${capacity ? `（${count}/${capacity}）` : ""}`;
      }
    }
  };

  const reportBlockedTarget = (
    reason: DragBlockReason,
    target: InventoryStoreView,
    targetKey: string,
  ) => {
    const payload = draggedRef.current;
    if (!payload) return;
    const first = payload.items[0];
    if (!first) return;
    reportDragFeedback(
      { phase: "blocked", item: first.item, message: blockedMessage(reason, target) },
      `blocked:${targetKey}:${reason}`,
    );
  };

  const selectedDragEntries = (item: InventoryItemView, owner: InventoryStoreView): InventoryDragEntry[] => {
    const sourceKey = `${owner.id}:${item.id}`;
    if (!moveSelectionKeys.has(sourceKey)) return [{ item, owner }];
    const entries = inventory.stores.flatMap((store) => store.items
      .filter((candidate) => moveSelectionKeys.has(`${store.id}:${candidate.id}`))
      .map((candidate) => ({ item: candidate, owner: store })));
    const rest = entries.filter((entry) => entry.item.id !== item.id);
    return [{ item, owner }, ...rest];
  };

  const activateDropTarget = (
    event: DragEvent<HTMLElement>,
    target: InventoryStoreView,
    targetKey: string,
  ) => {
    const payload = draggedRef.current;
    if (!payload?.items.length) return;
    event.preventDefault();
    const reason = dropBlockReason(target);
    if (reason) {
      event.dataTransfer.dropEffect = "none";
      setDropTargetKey(null);
      reportBlockedTarget(reason, target, targetKey);
      return;
    }
    event.dataTransfer.dropEffect = "move";
    setDropTargetKey(targetKey);
    reportDragFeedback({ phase: "dragging", item: payload.items[0].item }, `target:${targetKey}`);
  };

  const leaveDropTarget = (event: DragEvent<HTMLElement>, targetKey: string) => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget && event.currentTarget.contains(relatedTarget as Node)) return;
    setDropTargetKey((current) => current === targetKey ? null : current);
    const payload = draggedRef.current;
    if (payload?.items[0]) reportDragFeedback({ phase: "dragging", item: payload.items[0].item }, "dragging");
  };

  const dropOnTarget = (
    event: DragEvent<HTMLElement>,
    target: InventoryStoreView,
    bucketId?: string,
  ) => {
    const payload = draggedRef.current;
    if (!payload) return;
    event.preventDefault();
    dropRequestedRef.current = true;
    const reason = dropBlockReason(target);
    if (reason) {
      reportBlockedTarget(reason, target, `drop:${target.id}:${bucketId || "heading"}`);
      scheduleBlockedFeedbackDismiss();
      clearDrag(false);
      return;
    }
    const [first, ...rest] = payload.items;
    reportDragFeedback({ phase: "moving", item: first.item, message: rest.length ? `正在处理 ${payload.items.length} 件装备` : undefined }, "moving");
    if (rest.length) onRequestMove(first.item, first.owner, target, rest);
    else onRequestMove(first.item, first.owner, target);
    setMoveSelectionKeys(new Set());
    clearDrag(false);
  };

  const quickMoveToOnlineStore = (item: InventoryItemView, owner: InventoryStoreView) => {
    if (
      compareMode
      || !onlineStore
      || (onlineStore.id === owner.id && item.bucketId !== "postmaster")
    ) return;
    const sourceBucket = inventory.buckets.find((bucket) => bucket.id === item.bucketId);
    const reason = pendingItemIds.has(item.id)
      ? "pending"
      : inventoryDropBlockReason(item, owner, onlineStore, sourceBucket?.capacity);
    if (reason && reason !== "bucket-full") {
      reportDragFeedback(
        { phase: "blocked", item, message: blockedMessage(reason, onlineStore, { item, owner }) },
        `quick-blocked:${item.id}:${reason}`,
      );
      scheduleBlockedFeedbackDismiss();
      return;
    }
    reportDragFeedback({ phase: "moving", item, message: `正在移至${onlineStore.label}` }, `quick:${item.id}`);
    onRequestMove(item, owner, onlineStore);
  };

  const renderItemTile = (
    item: InventoryItemView,
    store: InventoryStoreView,
    isWeaponBucket: boolean,
  ) => {
    const comparisonIndex = comparisonItemIds.indexOf(item.id);
    const itemKey = `${store.id}:${item.id}`;
    const moveSelected = moveSelectionKeys.has(itemKey);
    const pending = pendingItemIds.has(item.id);
    const dragDisabledReason = compareMode
      ? comparisonIndex >= 0
        ? `已选择为对比副本 ${comparisonIndex + 1}`
        : "对比选择中，点击装备即可选择"
      : !nativeDragEnabled
      ? "当前设备不支持拖放，请点击物品查看详情"
      : pending
        ? "这件装备正在处理中"
        : item.equipped
          ? `先换下「${item.name}」，再进行转移`
          : !isActionableItem(item)
            ? "该物品缺少可操作的实例信息"
            : !isDraggableInventoryItem(item)
              ? "Bungie 标记该物品不可转移"
              : null;
    return <ItemTile
      key={item.id}
      item={item}
      selected={compareMode ? comparisonIndex >= 0 : selectedItemId === item.id || moveSelected}
      comparisonIndex={comparisonIndex}
      compareMode={compareMode}
      isWeapon={isWeaponBucket}
      draggable={!compareMode && nativeDragEnabled && !pending && isDraggableInventoryItem(item)}
      dragDisabledReason={dragDisabledReason}
      quickMoveLabel={
        !compareMode && onlineStore && (onlineStore.id !== store.id || item.bucketId === "postmaster")
          ? onlineStore.label
          : undefined
      }
      dragging={draggedItemKeys.has(itemKey) || dragSourceKey === itemKey}
      onClick={(anchor, modifiers) => {
        closeAllPreviews();
        if (!compareMode && (modifiers.shiftKey || modifiers.metaKey || modifiers.ctrlKey) && isDraggableInventoryItem(item)) {
          setMoveSelectionKeys((previous) => {
            const next = new Set(previous);
            if (next.has(itemKey)) next.delete(itemKey);
            else next.add(itemKey);
            return next;
          });
          return;
        }
        if (!compareMode) setMoveSelectionKeys(new Set());
        if (compareMode) onToggleComparison?.(item, store);
        else onSelectItem(item, store, anchor);
      }}
      onDragStart={(event) => {
        closeAllPreviews();
        const entries = selectedDragEntries(item, store).filter((entry) => (
          !pendingItemIds.has(entry.item.id) && isDraggableInventoryItem(entry.item)
        ));
        if (!entries.length) {
          event.preventDefault();
          return;
        }
        draggedRef.current = { items: entries };
        dropRequestedRef.current = false;
        setDragSourceKey(itemKey);
        setDraggedItemKeys(new Set(entries.map((entry) => `${entry.owner.id}:${entry.item.id}`)));
        reportDragFeedback({ phase: "dragging", item: entries[0].item, message: entries.length > 1 ? `已选择 ${entries.length} 件装备` : undefined }, "dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        event.dataTransfer.setData("application/json", JSON.stringify(entries.map((entry) => entry.item.id)));
      }}
      onDoubleClick={() => quickMoveToOnlineStore(item, store)}
      onDragEnd={endDrag}
      onPreview={(anchor, immediate) => showPreview(item, store, anchor, immediate)}
      onPreviewEnd={hidePreview}
    />
  };

  const visibleVaultItems = (items: InventoryItemView[], key: string) => {
    if (showAllMatches || expandedVaultBuckets.has(key)) return items;
    return items.slice(0, vaultItemLimit);
  };

  const toggleVaultBucket = (key: string) => {
    setExpandedVaultBuckets((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!buckets.length || !currentStore) {
    return (
      <div className="inventory-no-results">
        <PackageOpen size={28} aria-hidden="true" />
        <strong>没有符合条件的物品</strong>
        <span>调整搜索、分类或角色范围后再试。</span>
        {onClearSearchAndFilters ? <button className="button secondary" type="button" onClick={onClearSearchAndFilters}>清除搜索和筛选</button> : null}
      </div>
    );
  }

  return (
    <div className="inventory-scroll" style={gridStyle}>
      <div className={`${gridClass} inventory-store-headings`}>
        <StoreHeading
          store={currentStore}
          pinned
          canDrop={Boolean(dragged && dropBlockReason(currentStore) === null)}
          active={Boolean(dragged && dropBlockReason(currentStore) === null && dropTargetKey === `heading:${currentStore.id}`)}
          onDragEnter={(event) => activateDropTarget(event, currentStore, `heading:${currentStore.id}`)}
          onDragOver={(event) => activateDropTarget(event, currentStore, `heading:${currentStore.id}`)}
          onDragLeave={(event) => leaveDropTarget(event, `heading:${currentStore.id}`)}
          onDrop={(event) => dropOnTarget(event, currentStore)}
        />
        {secondaryStores.map((store) => {
          const targetKey = `heading:${store.id}`;
          const canDrop = Boolean(dragged && dropBlockReason(store) === null);
          return (
            <StoreHeading
              key={store.id}
              store={store}
              pinned={false}
              canDrop={canDrop}
              active={canDrop && dropTargetKey === targetKey}
              onDragEnter={(event) => activateDropTarget(event, store, targetKey)}
              onDragOver={(event) => activateDropTarget(event, store, targetKey)}
              onDragLeave={(event) => leaveDropTarget(event, targetKey)}
              onDrop={(event) => dropOnTarget(event, store)}
            />
          );
        })}
      </div>

      <div className="inventory-bucket-list">
        {buckets.map((bucket) => {
          const isWeaponBucket = bucket.category === "weapons";
          const currentUsesCharacterWeaponGrid = isWeaponBucket && currentStore.kind === "character";
          const currentItems = itemsForBucket(currentStore, bucket.id, query, filters, duplicateHashes, sort);
          const currentEquipped = currentStore.kind === "character"
            ? currentItems.filter((item) => item.equipped)
            : [];
          const currentUnequipped = currentStore.kind === "character"
            ? visibleUnequippedItems(currentItems, currentUsesCharacterWeaponGrid && !showAllMatches, query)
            : [];
          const currentVaultKey = `${bucket.id}:${currentStore.id}`;
          const currentVisibleItems = currentStore.kind === "character"
            ? [...currentEquipped, ...currentUnequipped]
            : visibleVaultItems(currentItems, currentVaultKey);
          const currentHiddenItemCount = currentStore.kind === "vault"
            ? currentItems.length - currentVisibleItems.length
            : 0;
          const currentTargetKey = `bucket:${bucket.id}:${currentStore.id}`;
          const currentCanDrop = Boolean(
            dragged
            && dropBlockReason(currentStore) === null,
          );
          return (
            <section className={`${gridClass} inventory-bucket-row`} key={bucket.id} aria-labelledby={`bucket-${bucket.id}`}>
              <div
                className={`inventory-store-bucket ${currentStore.kind === "character" ? "inventory-current-store-bucket" : "is-vault-store"} ${currentUsesCharacterWeaponGrid ? "is-weapon-bucket" : ""} ${currentCanDrop ? "is-drop-target" : ""} ${currentCanDrop && dropTargetKey === currentTargetKey ? "is-drop-active" : ""}`}
                data-store={currentStore.label}
                onDragEnter={(event) => activateDropTarget(event, currentStore, currentTargetKey)}
                onDragOver={(event) => activateDropTarget(event, currentStore, currentTargetKey)}
                onDragLeave={(event) => leaveDropTarget(event, currentTargetKey)}
                onDrop={(event) => dropOnTarget(event, currentStore, bucket.id)}
              >
                <header className="inventory-current-bucket-heading" id={`bucket-${bucket.id}`}>
                  <strong>{bucket.label}</strong>
                  <span>{bucket.category === "postmaster" ? "21 格" : bucket.equippable ? "已装备" : "物品"}</span>
                </header>
                {currentStore.kind === "character" ? <>
                  {currentEquipped.length ? <div className="inventory-current-equipped">
                    {currentEquipped.map((item) => renderItemTile(item, currentStore, isWeaponBucket))}
                  </div> : null}
                  {currentUnequipped.length ? <div className={`inventory-current-unequipped ${currentUsesCharacterWeaponGrid ? "is-weapon-bucket" : ""}`}>
                    {currentUnequipped.map((item) => renderItemTile(item, currentStore, isWeaponBucket))}
                  </div> : null}
                </> : currentVisibleItems.map((item) => renderItemTile(item, currentStore, isWeaponBucket))}
                {currentHiddenItemCount > 0 ? <VaultMoreButton
                  hiddenItemCount={currentHiddenItemCount}
                  expanded={expandedVaultBuckets.has(currentVaultKey)}
                  onClick={() => toggleVaultBucket(currentVaultKey)}
                /> : null}
                {!currentVisibleItems.length ? <span className="inventory-empty-cell" aria-label={`${currentStore.label}${bucket.label}为空`} /> : null}
              </div>
              {secondaryStores.map((store) => {
              const items = itemsForBucket(store, bucket.id, query, filters, duplicateHashes, sort);
              const usesCharacterWeaponGrid = isWeaponBucket && store.kind === "character";
              const equipped = store.kind === "character" ? items.filter((item) => item.equipped) : [];
              const unequipped = store.kind === "character"
                ? visibleUnequippedItems(items, usesCharacterWeaponGrid && !showAllMatches, query)
                : [];
              const vaultKey = `${bucket.id}:${store.id}`;
              const visibleItems = store.kind === "character"
                ? [...equipped, ...unequipped]
                : visibleVaultItems(items, vaultKey);
              const hiddenItemCount = store.kind === "vault" ? items.length - visibleItems.length : 0;
              const targetKey = `bucket:${bucket.id}:${store.id}`;
              const canDrop = Boolean(
                dragged
                && dropBlockReason(store) === null,
              );
              return (
                <div
                  className={`inventory-store-bucket ${usesCharacterWeaponGrid ? "is-weapon-bucket" : ""} ${store.kind === "vault" ? "is-vault-store" : ""} ${canDrop ? "is-drop-target" : ""} ${canDrop && dropTargetKey === targetKey ? "is-drop-active" : ""}`}
                  key={`${bucket.id}:${store.id}`}
                  data-store={store.label}
                  onDragEnter={(event) => activateDropTarget(event, store, targetKey)}
                  onDragOver={(event) => activateDropTarget(event, store, targetKey)}
                  onDragLeave={(event) => leaveDropTarget(event, targetKey)}
                  onDrop={(event) => dropOnTarget(event, store, bucket.id)}
                >
                  {visibleItems.map((item) => renderItemTile(item, store, isWeaponBucket))}
                  {hiddenItemCount > 0 ? <VaultMoreButton
                    hiddenItemCount={hiddenItemCount}
                    expanded={expandedVaultBuckets.has(vaultKey)}
                    onClick={() => toggleVaultBucket(vaultKey)}
                  /> : null}
                  {!visibleItems.length ? <span className="inventory-empty-cell" aria-label={`${store.label}${bucket.label}为空`} /> : null}
                </div>
              );
              })}
            </section>
          );
        })}
      </div>
      {preview ? (
        <InventoryItemHoverCard
          key={`${preview.owner.id}:${preview.item.id}`}
          item={preview.item}
          owner={preview.owner}
          anchor={preview.anchor}
          onPointerEnter={keepPreview}
          onPointerLeave={() => hidePreview()}
        />
      ) : null}
    </div>
  );
}

function VaultMoreButton({
  hiddenItemCount,
  expanded,
  onClick,
}: {
  hiddenItemCount: number;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="inventory-vault-more"
      type="button"
      aria-expanded={expanded}
      onClick={onClick}
    >
      显示其余 {hiddenItemCount} 件
    </button>
  );
}

function StoreHeading({
  store,
  pinned,
  canDrop,
  active,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  store: InventoryStoreView;
  pinned: boolean;
  canDrop: boolean;
  active: boolean;
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  const style = store.backgroundUrl
    ? { backgroundImage: `linear-gradient(90deg, var(--inventory-store-overlay-start, rgba(8,10,12,.28)), var(--inventory-store-overlay-end, rgba(8,10,12,.78))), url("${store.backgroundUrl}")` }
    : undefined;
  return (
    <header
      className={`inventory-store-heading ${pinned ? "is-current-store" : ""} ${store.kind === "vault" ? "is-vault" : ""} ${canDrop ? "is-drop-target" : ""} ${active ? "is-drop-active" : ""}`}
      style={style}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {store.emblemUrl ? <img src={store.emblemUrl} alt="" aria-hidden="true" /> : <Archive size={24} aria-hidden="true" />}
      <div>
        <strong>{store.label}</strong>
        <span>
          {store.power ? `光能 ${store.power}` : `${store.items.length} 件`}
          {store.current ? " · 当前" : ""}
        </span>
      </div>
    </header>
  );
}

function ItemTile({
  item,
  selected,
  comparisonIndex,
  compareMode,
  isWeapon,
  draggable,
  dragDisabledReason,
  quickMoveLabel,
  dragging,
  onClick,
  onDragStart,
  onDoubleClick,
  onDragEnd,
  onPreview,
  onPreviewEnd,
}: {
  item: InventoryItemView;
  selected: boolean;
  comparisonIndex: number;
  compareMode: boolean;
  isWeapon: boolean;
  draggable: boolean;
  dragDisabledReason: string | null;
  quickMoveLabel?: string;
  dragging: boolean;
  onClick: (anchor: HTMLElement, modifiers: ItemClickModifiers) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDoubleClick: () => void;
  onDragEnd: () => void;
  onPreview: (anchor: HTMLElement, immediate: boolean) => void;
  onPreviewEnd: () => void;
}) {
  const clickTimerRef = useRef<number | null>(null);
  const gearTier = isWeapon && isWeaponGearTier(item.gearTier) ? item.gearTier : undefined;
  const instanceMetadata = weaponInstanceMetadataLabel(item, isWeapon, gearTier);
  const comparisonLabel = compareMode
    ? comparisonIndex >= 0
      ? `，对比副本 ${comparisonIndex + 1}`
      : "，可选择用于 Roll 对比"
    : "";
  const label = `${item.name}，${item.typeName}${item.power ? `，光能 ${item.power}` : ""}${item.equipped ? "，已装备" : ""}${instanceMetadata}${comparisonLabel}${dragDisabledReason ? `，${dragDisabledReason}` : ""}`;
  const title = quickMoveLabel && !dragDisabledReason
    ? `${label}；双击移至${quickMoveLabel}`
    : label;
  const clearClickTimer = () => {
    if (clickTimerRef.current === null) return;
    window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  };
  useEffect(() => () => clearClickTimer(), []);
  return (
    <button
      type="button"
      className={`inventory-item-tile tier-${item.tier} damage-${item.damageType || "unknown"} ${item.equipped ? "is-equipped" : ""} ${item.equipped && isWeapon ? "is-equipped-weapon" : ""} ${selected ? "is-selected" : ""} ${compareMode ? "is-comparison-mode" : ""} ${comparisonIndex >= 0 ? "is-comparison-selected" : ""} ${draggable ? "is-draggable" : ""} ${dragging ? "is-dragging" : ""}`}
      draggable={draggable}
      onClick={(event) => {
        const anchor = event.currentTarget;
        const modifiers = {
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
        };
        clearClickTimer();
        if (!quickMoveLabel || event.detail === 0) {
          onClick(anchor, modifiers);
          return;
        }
        clickTimerRef.current = window.setTimeout(() => {
          clickTimerRef.current = null;
          onClick(anchor, modifiers);
        }, 220);
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        clearClickTimer();
        onDoubleClick();
      }}
      onDragStart={(event) => {
        clearClickTimer();
        if (!draggable) {
          event.preventDefault();
          return;
        }
        onDragStart(event);
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={(event) => onPreview(event.currentTarget, false)}
      onMouseLeave={onPreviewEnd}
      onFocus={(event) => onPreview(event.currentTarget, true)}
      onBlur={onPreviewEnd}
      aria-pressed={selected}
      aria-label={label}
      title={title}
      style={dragDisabledReason && !compareMode ? { cursor: "not-allowed" } : undefined}
    >
      <span className="inventory-item-visual" aria-hidden="true">
        {item.iconUrl ? <img src={item.iconUrl} alt="" loading="lazy" /> : <PackageOpen size={22} />}
        <span className="inventory-item-power">{item.power || ""}</span>
        {item.quantity > 1 ? <span className="inventory-item-quantity">{item.quantity}</span> : null}
        {gearTier ? <span className="inventory-item-gear-tier">T{gearTier}</span> : null}
        {item.locked ? <LockKeyhole className={`inventory-item-lock ${gearTier ? "has-gear-tier" : ""}`} size={12} /> : null}
        {comparisonIndex >= 0 ? <span className="inventory-comparison-order" aria-hidden="true">{comparisonIndex + 1}</span> : null}
        {item.equipped && isWeapon ? <span className="inventory-equipped-badge" aria-hidden="true"><Check size={9} strokeWidth={3} />已装备</span> : null}
        {item.equipped ? <span className="inventory-equipped-mark" /> : null}
      </span>
      <span className="inventory-item-name">{item.name}</span>
    </button>
  );
}

function weaponInstanceMetadataLabel(
  item: InventoryItemView,
  isWeapon: boolean,
  gearTier?: number,
): string {
  if (!isWeapon) return "";
  const labels: string[] = [];
  if (gearTier) labels.push(`T${gearTier}`);
  if (item.crafted) labels.push("已锻造");
  if (item.enhanced) labels.push("已强化");
  else if (item.enhanceable) labels.push("可强化");
  if (isWeaponTrackerCount(item.weaponLevel)) labels.push(`等级 ${item.weaponLevel}`);
  if (isWeaponTrackerCount(item.killTrackers?.pve)) labels.push(`PvE ${formatTrackerCount(item.killTrackers.pve)}`);
  if (isWeaponTrackerCount(item.killTrackers?.pvp)) labels.push(`PvP ${formatTrackerCount(item.killTrackers.pvp)}`);
  return labels.length ? `，${labels.join("，")}` : "";
}
