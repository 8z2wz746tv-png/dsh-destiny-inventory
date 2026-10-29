import { ArchiveRestore, ArrowUp, Check, ChevronDown, CircleDot, Crosshair, Hammer, LoaderCircle, LockKeyhole, LockKeyholeOpen, RefreshCw, ShieldCheck, Sparkles, Swords, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import { userFacingError } from "../../../lib/api";
import { formatTrackerCount, isWeaponGearTier, isWeaponTrackerCount } from "../../../lib/weapon";
import { DamageTypeBadge } from "./DamageTypeBadge";
import { inventoryMoveAction, isActionableItem, isWeaponInventoryItem, mergeInstancePerkState } from "./model";
import { useInventoryPerkPool } from "./queries";
import type {
  InventoryAction,
  InventoryItemView,
  InventoryPerkView,
  InventorySocketGroupsView,
  InventoryStoreView,
} from "./types";


interface InventoryItemDetailsProps {
  item: InventoryItemView;
  owner: InventoryStoreView;
  stores: InventoryStoreView[];
  equippable: boolean;
  busy: boolean;
  onClose: () => void;
  onAction: (command: InventoryAction) => Promise<void>;
}

type ActionIntent = { command: InventoryAction; title: string; detail: string };
type DetailView = "current" | "pool";

const PERK_TOOLTIP_CLOSE_DELAY_MS = 160;

const statLabels: Array<[keyof NonNullable<InventoryItemView["stats"]>, string]> = [
  ["weapons", "武器"],
  ["health", "生命"],
  ["classStat", "职业"],
  ["grenade", "手雷"],
  ["melee", "近战"],
  ["superStat", "超能"],
];

export function InventoryItemDetails({
  item,
  owner,
  stores,
  equippable,
  busy,
  onClose,
  onAction,
}: InventoryItemDetailsProps) {
  const [intent, setIntent] = useState<ActionIntent | null>(null);
  const [view, setView] = useState<DetailView>("current");
  const [actionError, setActionError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const confirmationRef = useRef<HTMLElement>(null);
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);
  const confirmationInFlightRef = useRef(false);
  const weapon = isWeaponInventoryItem(item);
  const perkPool = useInventoryPerkPool(item.hash, weapon);

  const moveTabFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(currentIndex + direction + tabs.length) % tabs.length];
    const nextView = next.dataset.view as DetailView | undefined;
    if (!nextView) return;
    setView(nextView);
    next.focus();
  };

  useEffect(() => {
    setIntent(null);
    setView("current");
    setActionError("");
    confirmationTriggerRef.current = null;
    panelRef.current?.focus({ preventScroll: true });
  }, [item.id, owner.id]);

  useEffect(() => {
    if (!intent || !confirmationRef.current) return;
    confirmationRef.current.focus({ preventScroll: true });
    confirmationRef.current.scrollIntoView?.({ block: "nearest" });
  }, [intent]);

  const actionable = isActionableItem(item);
  const moveTargets = stores.filter((target) => inventoryMoveAction(item, owner, target));
  const canEquipOwner = actionable
    && equippable
    && item.bucketId !== "postmaster"
    && owner.kind === "character"
    && owner.classType !== "unknown"
    && !item.equipped;
  const armorStatTotal = item.stats
    ? statLabels.reduce((sum, [key]) => sum + (item.stats?.[key] || 0), 0)
    : 0;
  const fullPool = perkPool.data && unsignedHash(perkPool.data.itemHash) === unsignedHash(item.hash)
    ? mergeInstancePerkState(perkPool.data.socketGroups, item)
    : undefined;
  const currentPerkColumns = currentItemPerkColumns(item, fullPool);
  const perkPoolLayout = weaponPerkLayout(fullPool || item.socketGroups, item.perks);
  const perkPoolColumns = flattenPerkLayout(perkPoolLayout);
  const hasSelectionRates = perkPoolColumns.some((column) => column.plugs.some(hasSelectionRate));

  const requestOwnerEquip = (trigger: HTMLElement) => {
    if (owner.kind !== "character" || owner.classType === "unknown" || !canEquipOwner) return;
    confirmationTriggerRef.current = trigger;
    setActionError("");
    setIntent({
      command: {
        action: "equip",
        itemId: item.id,
        target: owner.classType,
        targetCharacterId: owner.id,
      },
      title: `在${owner.label}上装备`,
      detail: `立即装备“${item.name}”。`,
    });
  };

  const requestMove = (target: InventoryStoreView, trigger: HTMLElement) => {
    const command = inventoryMoveAction(item, owner, target);
    if (!command) return;
    const postmaster = command.action === "pull_postmaster";
    confirmationTriggerRef.current = trigger;
    setActionError("");
    setIntent({
      command,
      title: postmaster ? `取回到${target.label}` : `移动到${target.label}`,
      detail: postmaster
        ? `从邮政官取回“${item.name}”到${target.label}。`
        : `将“${item.name}”从${owner.label}移动到${target.label}。`,
    });
  };

  const requestLock = (trigger: HTMLElement) => {
    confirmationTriggerRef.current = trigger;
    setActionError("");
    setIntent({
      command: { action: "lock", itemId: item.id, locked: !item.locked },
      title: item.locked ? "解除锁定" : "锁定物品",
      detail: `${item.locked ? "解除" : "设置"}“${item.name}”的游戏内锁定状态。`,
    });
  };

  const dismissIntent = () => {
    const trigger = confirmationTriggerRef.current;
    confirmationTriggerRef.current = null;
    setIntent(null);
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  };

  const confirm = async () => {
    if (!intent || busy || confirmationInFlightRef.current) return;
    confirmationInFlightRef.current = true;
    setConfirming(true);
    setActionError("");
    try {
      await onAction(intent.command);
      dismissIntent();
    } catch (error) {
      setActionError(userFacingError(error, "操作失败，请重试"));
    } finally {
      confirmationInFlightRef.current = false;
      setConfirming(false);
    }
  };

  const confirmationBusy = busy || confirming;

  return (
    <aside
      id="inventory-side-panel"
      className="inventory-detail inventory-item-sidebar"
      aria-label={`${item.name}详情`}
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !intent) onClose();
      }}
    >
      <header>
        <div className={`inventory-detail-icon tier-${item.tier}`}>
          {item.iconUrl ? <img src={item.iconUrl} alt="" /> : null}
        </div>
        <div>
          <div className="inventory-detail-heading-meta">
            <span>{item.typeName}</span>
            <DamageTypeBadge damageType={item.damageType} />
          </div>
          <h2>{item.name}</h2>
          <p>{owner.label} · {item.power || "-"} 光能 · {tierLabel(item.tier)}{item.equipped ? " · 已装备" : ""}{item.locked ? " · 已锁定" : ""}</p>
          {weapon ? <WeaponInstanceMetadata item={item} /> : null}
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭物品详情" title="关闭">
          <X size={18} />
        </button>
      </header>

      <div className="inventory-detail-tabs" role="tablist" aria-label={`${item.name}详情视图`} onKeyDown={moveTabFocus}>
        <button
          id="inventory-detail-current-tab"
          data-view="current"
          type="button"
          role="tab"
          aria-selected={view === "current"}
          aria-controls="inventory-detail-current-panel"
          tabIndex={view === "current" ? 0 : -1}
          onClick={() => setView("current")}
        >
          当前配置
        </button>
        {weapon ? (
          <button
            id="inventory-detail-pool-tab"
            data-view="pool"
            type="button"
            role="tab"
            aria-selected={view === "pool"}
            aria-controls="inventory-detail-pool-panel"
            tabIndex={view === "pool" ? 0 : -1}
            onClick={() => setView("pool")}
          >
            完整 Perk 池
          </button>
        ) : null}
      </div>

      <section
        id="inventory-detail-current-panel"
        className="inventory-detail-view inventory-current-view"
        role="tabpanel"
        aria-labelledby="inventory-detail-current-tab"
        hidden={view !== "current"}
      >
        {currentPerkColumns.length ? (
          <section className="inventory-current-perks" aria-label={weapon ? "当前武器配置" : "当前护甲配置"}>
            <header className="inventory-detail-perks-heading">
              <h3>当前配置</h3>
              <span><Check size={12} aria-hidden="true" />已启用</span>
            </header>
            <div className="inventory-current-perk-columns">
              {currentPerkColumns.map((column) => (
                <section className="inventory-current-perk-column" key={`${column.label}:${column.socketIndex}`} aria-label={`${column.label} 当前配置`}>
                  <h4>{column.label}</h4>
                  <div className="inventory-current-perk-list" role="list">
                    {column.plugs.map((perk, index) => (
                      <DetailPerk
                        compact
                        key={`${perk.hash}:${index}`}
                        perk={perk}
                        pair={pairedPerkEffects(perk, column.pairSource || column.plugs)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        ) : null}

        {item.weaponStats?.length ? (
          <details className="inventory-detail-data">
            <summary><span>武器属性</span><small>{item.weaponStats.length} 项</small><ChevronDown size={16} aria-hidden="true" /></summary>
            <section className="inventory-detail-weapon-stats" aria-label="武器属性">
              <div>
                {item.weaponStats.map((stat) => (
                  <div key={stat.hash}>
                    <span>{stat.name}</span><strong>{stat.value}</strong>
                    {stat.display === "bar" ? <i><b style={{ width: `${Math.min(stat.value, 100)}%` }} /></i> : null}
                  </div>
                ))}
              </div>
            </section>
          </details>
        ) : null}

        {item.stats ? (
          <section className="inventory-stats">
            <header><h3>护甲属性</h3><strong>{armorStatTotal}</strong></header>
            {statLabels.map(([key, label]) => {
              const value = item.stats?.[key] || 0;
              return <div key={key}><span>{label}</span><i><b style={{ width: `${Math.min(value, 100)}%` }} /></i><strong>{value}</strong></div>;
            })}
          </section>
        ) : null}

        {actionable ? (
          <section className="inventory-actions" aria-label="物品操作">
            <div className="inventory-direct-actions">
              {moveTargets.length ? (
                <details className="inventory-move-menu">
                  <summary className="button secondary"><ArchiveRestore size={16} />移动</summary>
                  <div>
                    {moveTargets.map((target) => (
                      <button
                        className="button secondary"
                        type="button"
                        disabled={busy}
                        key={target.id}
                        onClick={(event) => {
                          const details = event.currentTarget.closest("details");
                          const returnTarget = details?.querySelector<HTMLElement>("summary") || event.currentTarget;
                          if (details) details.open = false;
                          requestMove(target, returnTarget);
                        }}
                      >
                        {item.bucketId === "postmaster" ? `取回到${target.label}` : `移动到${target.label}`}
                      </button>
                    ))}
                  </div>
                </details>
              ) : null}
              {canEquipOwner ? (
                <button className="button primary inventory-owner-equip" type="button" disabled={busy} onClick={(event) => requestOwnerEquip(event.currentTarget)}>
                  <ShieldCheck size={16} />装备
                </button>
              ) : null}
              <button className="button secondary" type="button" disabled={busy} onClick={(event) => requestLock(event.currentTarget)}>
                {item.locked ? <LockKeyholeOpen size={16} /> : <LockKeyhole size={16} />}
                {item.locked ? "解除锁定" : "锁定物品"}
              </button>
            </div>
          </section>
        ) : <p className="inventory-not-actionable">堆叠物品和非实例物品目前只支持查看。</p>}
      </section>

      {weapon ? (
        <section
          id="inventory-detail-pool-panel"
          className="inventory-detail-view inventory-pool-view"
          role="tabpanel"
          aria-labelledby="inventory-detail-pool-tab"
          hidden={view !== "pool"}
        >
          <header className="inventory-detail-perks-heading inventory-pool-heading">
            <div>
              <h3>完整 Perk 池</h3>
              <p>按栏位查看候选、拥有与强化版本</p>
            </div>
            {hasSelectionRates ? <span>选取率</span> : null}
          </header>
          {perkPool.isLoading ? (
            <div className="inventory-detail-perk-status is-loading" role="status">
              <LoaderCircle className="is-spinning" size={14} aria-hidden="true" />
              <span>正在读取完整 Perk 池</span>
            </div>
          ) : null}
          {perkPool.isError ? (
            <div className="inventory-detail-perk-status is-error" role="alert">
              <span>{userFacingError(perkPool.error, "完整 Perk 池读取失败，当前配置仍可查看")}</span>
              <button className="button secondary" type="button" disabled={perkPool.isFetching} onClick={() => void perkPool.refetch()}>
                <RefreshCw className={perkPool.isFetching ? "is-spinning" : ""} size={13} aria-hidden="true" />重试
              </button>
            </div>
          ) : null}
          {perkPoolLayout.intrinsics.length ? (
            <section className="inventory-perk-section inventory-perk-aux-section" aria-label="框架与固有特性">
              <h4>框架与固有特性</h4>
              <div className="inventory-perk-aux-grid">
                {perkPoolLayout.intrinsics.map((column) => <PerkPoolColumn column={column} key={`${column.label}:${column.socketIndex}`} />)}
              </div>
            </section>
          ) : null}
          {perkPoolLayout.perkColumns.length ? (
            <section className="inventory-perk-section inventory-perk-main-section" aria-label="主要 Perk 栏位">
              <h4>Perk 栏位</h4>
              <div
                className="inventory-perk-slots"
                style={{ "--inventory-perk-columns": Math.min(perkPoolLayout.perkColumns.length, 5) } as CSSProperties}
              >
                {perkPoolLayout.perkColumns.map((column) => <PerkPoolColumn column={column} key={`${column.label}:${column.socketIndex}`} />)}
              </div>
            </section>
          ) : null}
          {perkPoolLayout.socketRows.map((row) => (
            <section className="inventory-perk-section inventory-perk-aux-section" aria-label={row.label} key={row.id}>
              <h4>{row.label}</h4>
              <div className="inventory-perk-aux-grid">
                {row.columns.map((column) => <PerkPoolColumn column={column} key={`${column.label}:${column.socketIndex}`} />)}
              </div>
            </section>
          ))}
        </section>
      ) : null}

      {intent ? (
        <section
          className="inventory-action-confirm"
          role="alertdialog"
          aria-label={intent.title}
          aria-busy={confirmationBusy}
          ref={confirmationRef}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || confirmationBusy) return;
            event.stopPropagation();
            dismissIntent();
          }}
        >
          <strong>{intent.title}</strong>
          <p>{intent.detail}</p>
          {actionError ? <p className="inventory-action-error" role="alert">{actionError}</p> : null}
          <div>
            <button className="button secondary" type="button" disabled={confirmationBusy} onClick={dismissIntent}>取消</button>
            <button className="button primary" type="button" disabled={confirmationBusy} onClick={() => void confirm()}>{confirmationBusy ? "处理中" : "确认"}</button>
          </div>
        </section>
      ) : null}
    </aside>
  );
}

function tierLabel(tier: InventoryItemView["tier"]): string {
  return { exotic: "异域", legendary: "传说", rare: "稀有", common: "普通", unknown: "未知" }[tier];
}

interface PerkColumnView {
  socketIndex: number;
  label: string;
  plugs: InventoryPerkView[];
  pairSource?: InventoryPerkView[];
}

interface PerkPoolLayout {
  intrinsics: PerkColumnView[];
  perkColumns: PerkColumnView[];
  socketRows: Array<{ id: string; label: string; columns: PerkColumnView[] }>;
}

function weaponPerkLayout(
  groups?: InventorySocketGroupsView,
  fallback?: InventoryPerkView[],
): PerkPoolLayout {
  if (!groups) {
    return {
      intrinsics: [],
      perkColumns: fallback?.length
        ? [{ socketIndex: -1, label: "当前配置", plugs: fallback.map((perk) => ({ ...perk, owned: true })) }]
        : [],
      socketRows: [],
    };
  }

  const columns = (source: typeof groups.perkColumns, fallbackLabel = "特性"): PerkColumnView[] => source.flatMap((column) => (
    column.plugs.length
      ? [{ socketIndex: column.socketIndex, label: column.label || fallbackLabel, plugs: column.plugs }]
      : []
  ));
  const layout: PerkPoolLayout = {
    intrinsics: columns(groups.intrinsics),
    perkColumns: columns(groups.perkColumns),
    socketRows: groups.socketRows.flatMap((row) => {
      const rowColumns = columns(row.columns, row.label || "模组与强化");
      return rowColumns.length ? [{ id: row.id, label: row.label || "模组与强化", columns: rowColumns }] : [];
    }),
  };
  if (flattenPerkLayout(layout).length || !fallback?.length) return layout;
  return {
    ...layout,
    perkColumns: [{ socketIndex: -1, label: "当前配置", plugs: fallback.map((perk) => ({ ...perk, owned: true })) }],
  };
}

function flattenPerkLayout(layout: PerkPoolLayout): PerkColumnView[] {
  return [
    ...layout.intrinsics,
    ...layout.perkColumns,
    ...layout.socketRows.flatMap((row) => row.columns),
  ];
}

function weaponPerkColumns(
  groups?: InventorySocketGroupsView,
  fallback?: InventoryPerkView[],
): PerkColumnView[] {
  return flattenPerkLayout(weaponPerkLayout(groups, fallback));
}

function currentItemPerkColumns(item: InventoryItemView, fullPool?: InventorySocketGroupsView): PerkColumnView[] {
  const columns = weaponPerkColumns(fullPool || item.socketGroups, item.perks);
  return columns.flatMap((column) => {
    const current = column.plugs.filter(isSelected);
    const plugs = current.length
      ? current
      : column.plugs.length === 1 || !item.socketGroups
        ? column.plugs
        : [];
    return plugs.length ? [{
      ...column,
      plugs,
      pairSource: column.plugs,
    }] : [];
  });
}

function unsignedHash(value: number): number {
  return value >>> 0;
}

function WeaponInstanceMetadata({ item }: { item: InventoryItemView }) {
  const gearTier = isWeaponGearTier(item.gearTier) ? item.gearTier : undefined;
  const weaponLevel = isWeaponTrackerCount(item.weaponLevel) ? item.weaponLevel : undefined;
  const pve = item.killTrackers?.pve;
  const pvp = item.killTrackers?.pvp;
  const hasTrackers = isWeaponTrackerCount(pve) || isWeaponTrackerCount(pvp);
  if (!gearTier && !item.crafted && !item.enhanced && !item.enhanceable && weaponLevel === undefined && !hasTrackers) return null;
  return (
    <div className="inventory-detail-instance-meta" aria-label="武器状态与击杀追踪">
      {gearTier ? <span title="装备等级"><CircleDot size={12} aria-hidden="true" />T{gearTier}</span> : null}
      {item.crafted ? <span title="已锻造"><Hammer size={12} aria-hidden="true" />已锻造</span> : null}
      {item.enhanced ? <span title="已强化"><ArrowUp size={12} aria-hidden="true" />已强化</span> : null}
      {!item.enhanced && item.enhanceable ? <span title="可强化"><ArrowUp size={12} aria-hidden="true" />可强化</span> : null}
      {weaponLevel !== undefined ? <span title="武器等级"><Sparkles size={12} aria-hidden="true" />等级 {weaponLevel}</span> : null}
      {isWeaponTrackerCount(pve) ? <span title="PvE 击杀"><Swords size={12} aria-hidden="true" />PvE {formatTrackerCount(pve)}</span> : null}
      {isWeaponTrackerCount(pvp) ? <span title="PvP 击杀"><Crosshair size={12} aria-hidden="true" />PvP {formatTrackerCount(pvp)}</span> : null}
    </div>
  );
}

function hasSelectionRate(perk: InventoryPerkView): perk is InventoryPerkView & { selectionRate: number } {
  return typeof perk.selectionRate === "number" && Number.isFinite(perk.selectionRate);
}

function isSelected(perk: InventoryPerkView): boolean {
  return "selected" in perk && Boolean(perk.selected);
}

interface PerkEffectPair {
  normal?: InventoryPerkView;
  enhanced?: InventoryPerkView;
}

function pairedPerkEffects(perk: InventoryPerkView, siblings: InventoryPerkView[]): PerkEffectPair {
  const byHash = (hash: number | undefined) => (
    typeof hash === "number"
      ? siblings.find((candidate) => unsignedHash(candidate.hash) === unsignedHash(hash))
      : undefined
  );
  const sameNameVariant = (isEnhanced: boolean) => {
    const nameKey = normalizePerkName(perk.name);
    if (!nameKey) return undefined;
    const matches = siblings.filter((candidate) => (
      candidate !== perk
      && normalizePerkName(candidate.name) === nameKey
      && Boolean(candidate.isEnhanced) === isEnhanced
    ));
    return matches.length === 1 ? matches[0] : undefined;
  };
  if (perk.isEnhanced) {
    return {
      normal: byHash(perk.basePerkHash) || sameNameVariant(false),
      enhanced: perk,
    };
  }
  return {
    normal: perk,
    enhanced: byHash(perk.enhancedPerkHash) || sameNameVariant(true),
  };
}

function normalizePerkName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function PerkPoolColumn({ column }: { column: PerkColumnView }) {
  const active = column.plugs.find(isSelected);
  const ownedCount = column.plugs.filter((perk) => perk.owned || isSelected(perk)).length;
  return (
    <section className="inventory-perk-slot" aria-label={`${column.label} Perk 池`}>
      <header className="inventory-perk-slot-heading">
        <span>
          <strong>{column.label}</strong>
          <small>{active ? `当前：${active.name}` : `${ownedCount ? `拥有 ${ownedCount} 个 · ` : ""}${column.plugs.length} 个候选`}</small>
        </span>
      </header>
      <div className="inventory-detail-perk-list" role="list">
        {column.plugs.map((perk, index) => (
          <DetailPerk
            key={`${perk.hash}:${index}`}
            perk={perk}
            pair={pairedPerkEffects(perk, column.plugs)}
          />
        ))}
      </div>
    </section>
  );
}

function DetailPerk({ perk, pair, compact = false }: { perk: InventoryPerkView; pair: PerkEffectPair; compact?: boolean }) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const active = isSelected(perk);
  const owned = Boolean(perk.owned || active);
  const rate = hasSelectionRate(perk)
    ? `${perk.selectionRate.toFixed(1).replace(/\.0$/, "")}%`
    : undefined;
  const ownershipLabel = active ? "当前启用" : owned ? "这把拥有" : "候选";
  const stateLabel = [
    perk.name,
    ownershipLabel,
    perk.isEnhanced ? "强化" : "",
    rate ? `选取率${rate}` : "",
  ].filter(Boolean).join("，");
  const clearCloseTimer = () => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const openTooltip = () => {
    clearCloseTimer();
    setTooltipOpen(true);
  };
  const closeTooltip = () => {
    clearCloseTimer();
    setTooltipOpen(false);
  };
  const scheduleTooltipClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setTooltipOpen(false);
    }, PERK_TOOLTIP_CLOSE_DELAY_MS);
  };

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <div
      className={`inventory-detail-perk ${compact ? "is-compact" : ""} ${owned ? "is-owned" : ""} ${active ? "is-active" : ""} ${perk.enabled ? "" : "is-disabled"}`}
      aria-label={stateLabel}
      role="listitem"
    >
      <button
        ref={triggerRef}
        className="inventory-detail-perk-icon-trigger"
        type="button"
        aria-label={`查看${perk.name}效果`}
        aria-describedby={tooltipOpen ? tooltipId : undefined}
        onPointerEnter={openTooltip}
        onPointerLeave={scheduleTooltipClose}
        onFocus={openTooltip}
        onBlur={closeTooltip}
        onClick={openTooltip}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          closeTooltip();
        }}
      >
        <span className={`inventory-detail-perk-icon${perk.isEnhanced ? " is-enhanced" : ""}`}>
          {perk.iconUrl ? <img src={perk.iconUrl} alt="" loading="lazy" /> : <Sparkles size={15} aria-hidden="true" />}
          {perk.isEnhanced ? <ArrowUp className="inventory-detail-perk-enhanced-arrow" size={16} strokeWidth={3} aria-hidden="true" /> : null}
          {owned ? <Check className="inventory-detail-perk-check" size={11} strokeWidth={3} aria-hidden="true" /> : null}
        </span>
      </button>
      <span className="inventory-detail-perk-copy">
        <strong>{perk.name}</strong>
        <span className="inventory-detail-perk-tags">
          {!compact && owned ? <small>{active ? "当前启用" : "这把拥有"}</small> : null}
        </span>
      </span>
      {rate ? <span className="inventory-detail-perk-rate" title={`选取率 ${rate}`}>{rate}</span> : null}
      {tooltipOpen && triggerRef.current ? (
        <PerkEffectTooltip
          id={tooltipId}
          anchor={triggerRef.current}
          perk={perk}
          normalPerk={pair.normal}
          enhancedPerk={pair.enhanced}
          ownershipLabel={ownershipLabel}
          rate={rate}
          onPointerEnter={openTooltip}
          onPointerLeave={scheduleTooltipClose}
        />
      ) : null}
    </div>
  );
}

interface PerkTooltipPosition {
  left: number;
  top: number;
  placement: "above" | "below";
}

function PerkEffectTooltip({
  id,
  anchor,
  perk,
  normalPerk,
  enhancedPerk,
  ownershipLabel,
  rate,
  onPointerEnter,
  onPointerLeave,
}: {
  id: string;
  anchor: HTMLElement;
  perk: InventoryPerkView;
  normalPerk?: InventoryPerkView;
  enhancedPerk?: InventoryPerkView;
  ownershipLabel: string;
  rate?: string;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const tooltipRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<PerkTooltipPosition | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const tooltip = tooltipRef.current;
      if (!tooltip || !anchor.isConnected) return;
      const anchorRect = anchor.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const maxLeft = Math.max(margin, window.innerWidth - tooltipRect.width - margin);
      const left = Math.min(
        maxLeft,
        Math.max(margin, anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2),
      );
      const fitsAbove = anchorRect.top - tooltipRect.height - gap >= margin;
      const preferredTop = fitsAbove
        ? anchorRect.top - tooltipRect.height - gap
        : anchorRect.bottom + gap;
      const top = Math.min(
        Math.max(margin, window.innerHeight - tooltipRect.height - margin),
        Math.max(margin, preferredTop),
      );
      setPosition({ left, top, placement: fitsAbove ? "above" : "below" });
    };

    update();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (tooltipRef.current) resizeObserver?.observe(tooltipRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor]);

  if (typeof document === "undefined") return null;
  const portalRoot = document.querySelector<HTMLElement>(".app-shell") || document.body;
  return createPortal(
    <aside
      ref={tooltipRef}
      id={id}
      className={`inventory-perk-tooltip ${position ? `is-${position.placement}` : "is-measuring"}`}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
      role="tooltip"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <header>
        <span className={`inventory-perk-tooltip-icon${perk.isEnhanced ? " is-enhanced" : ""}`}>
          {perk.iconUrl ? <img src={perk.iconUrl} alt="" /> : <Sparkles size={18} aria-hidden="true" />}
          {perk.isEnhanced ? <ArrowUp className="inventory-detail-perk-enhanced-arrow" size={16} strokeWidth={3} aria-hidden="true" /> : null}
        </span>
        <div>
          <strong>{perk.name}</strong>
          <span>{ownershipLabel}{rate ? ` · 选取率 ${rate}` : ""}</span>
        </div>
      </header>
      <div className="inventory-perk-tooltip-effects">
        <section>
          <strong>普通效果</strong>
          <p>{effectDescription(normalPerk, "未返回普通版本说明")}</p>
        </section>
        <section className="is-enhanced">
          <strong>强化效果</strong>
          <p>{effectDescription(enhancedPerk, "未返回强化版本说明")}</p>
        </section>
      </div>
    </aside>,
    portalRoot,
  );
}

function effectDescription(perk: InventoryPerkView | undefined, missing: string): string {
  if (!perk) return missing;
  return perk.description?.trim() || "暂无效果说明";
}
