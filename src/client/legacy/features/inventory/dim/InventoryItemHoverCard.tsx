import { ArrowUp, Check, CircleDot, Crosshair, Diamond, Hammer, LockKeyhole, ShieldCheck, Sparkles, Swords } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DamageTypeBadge } from "./DamageTypeBadge";
import { formatTrackerCount, isWeaponGearTier, isWeaponTrackerCount } from "../../../lib/weapon";
import type {
  CSSProperties,
} from "react";
import type {
  InventoryItemView,
  InventoryPerkView,
  InventorySocketColumnView,
  InventorySocketPlugView,
  InventorySocketRowView,
  InventoryStoreView,
  InventoryTier,
} from "./types";


interface InventoryItemHoverCardProps {
  item: InventoryItemView;
  owner: InventoryStoreView;
  anchor: HTMLElement;
  pinned?: boolean;
  onRequestClose?: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

interface HoverCardPosition {
  left: number;
  top: number;
  arrowTop: number;
  placement: "left" | "right";
}

const armorStats: Array<[keyof NonNullable<InventoryItemView["stats"]>, string]> = [
  ["weapons", "武器"],
  ["health", "生命"],
  ["classStat", "职业"],
  ["grenade", "手雷"],
  ["melee", "近战"],
  ["superStat", "超能"],
];

export function calculateHoverCardPosition(
  anchor: Box,
  card: Pick<Box, "width" | "height">,
  viewport: Pick<Box, "width" | "height">,
  gap = 12,
  margin = 12,
): HoverCardPosition {
  const fitsRight = anchor.right + gap + card.width <= viewport.width - margin;
  const fitsLeft = anchor.left - gap - card.width >= margin;
  const placement = fitsRight || !fitsLeft ? "right" : "left";
  const preferredLeft = placement === "right"
    ? anchor.right + gap
    : anchor.left - gap - card.width;
  const left = clamp(preferredLeft, margin, Math.max(margin, viewport.width - card.width - margin));
  const preferredTop = anchor.top - 28;
  const top = clamp(preferredTop, margin, Math.max(margin, viewport.height - card.height - margin));
  const arrowTop = clamp(anchor.top + anchor.height / 2 - top, 20, Math.max(20, card.height - 20));

  return { left, top, arrowTop, placement };
}

export function InventoryItemHoverCard({
  item,
  owner,
  anchor,
  pinned = false,
  onRequestClose,
  onPointerEnter,
  onPointerLeave,
}: InventoryItemHoverCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const tooltipId = useId();
  const titleId = `${tooltipId}-title`;
  const [position, setPosition] = useState<HoverCardPosition | null>(null);
  // The overview payload intentionally contains only this instance's equipped
  // plugs. The complete manifest pool belongs in the pinned detail sidebar.
  const intrinsics = currentColumns(item.socketGroups?.intrinsics);
  const perkColumns = currentColumns(item.socketGroups?.perkColumns);
  const socketRows = (item.socketGroups?.socketRows || []).flatMap((row) => {
    const columns = currentColumns(row.columns);
    return columns.length ? [{ ...row, columns }] : [];
  });
  const structuredPlugCount = [
    ...intrinsics,
    ...perkColumns,
    ...socketRows.flatMap((row) => row.columns),
  ].reduce((total, column) => total + column.plugs.length, 0);
  const hasStructuredSockets = structuredPlugCount > 0;
  const hasFlatPerks = !hasStructuredSockets && Boolean(item.perks?.length);

  useLayoutEffect(() => {
    const update = () => {
      const card = cardRef.current;
      if (!card || !anchor.isConnected) return;
      setPosition(calculateHoverCardPosition(
        anchor.getBoundingClientRect(),
        card.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
      ));
    };
    update();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (cardRef.current) resizeObserver?.observe(cardRef.current);
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      update();
      secondFrame = window.requestAnimationFrame(update);
    });
    const settleTimer = window.setTimeout(update, 150);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(settleTimer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, item.id]);

  useEffect(() => {
    if (!pinned || !onRequestClose) return;

    const handlePointerDown = (event: PointerEvent) => {
      const card = cardRef.current;
      const path = event.composedPath();
      if (path.includes(anchor) || (card && path.includes(card))) return;
      onRequestClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onRequestClose();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchor, onRequestClose, pinned]);

  const tier = tierLabel(item.tier);
  const damage = item.damageType || "unknown";
  const headerStyle = item.watermarkUrl
    ? { backgroundImage: `linear-gradient(90deg, var(--inventory-watermark-overlay-start, rgba(14,12,16,.08)), var(--inventory-watermark-overlay-end, rgba(14,12,16,.42))), url("${item.watermarkUrl}")` }
    : undefined;
  const cardStyle = position
    ? {
        left: position.left,
        top: position.top,
        "--inventory-hover-arrow-top": `${position.arrowTop}px`,
      } as CSSProperties
    : undefined;
  const portalRoot = document.querySelector<HTMLElement>(".app-shell") || document.body;

  return createPortal(
    <aside
      ref={cardRef}
      id={tooltipId}
      className={`inventory-hover-card tier-${item.tier} ${pinned ? "is-pinned" : ""} ${structuredPlugCount > 6 || (item.perks?.length || 0) > 6 ? "has-multiline-perks" : ""} ${position ? `is-${position.placement}` : "is-measuring"}`}
      style={cardStyle}
      role={pinned ? "dialog" : "tooltip"}
      aria-labelledby={pinned ? titleId : undefined}
      data-inventory-item-card
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <header className="inventory-hover-header" style={headerStyle}>
        <span>{tier}{item.equipped ? " · 已装备" : ""}</span>
        <h2 id={titleId}>{item.name}</h2>
        <div>
          <strong>{item.typeName}{item.ammoType ? ` · ${item.ammoType}` : ""}</strong>
          {item.power ? (
            <b className={`damage-${damage}`}>
              <Diamond size={14} fill="currentColor" aria-hidden="true" />
              {item.power}
            </b>
          ) : null}
        </div>
      </header>

      <div className="inventory-hover-body" tabIndex={pinned ? 0 : undefined}>
        <div className="inventory-hover-meta">
          <span><CircleDot size={13} aria-hidden="true" />{owner.label}</span>
          {item.locked ? <span><LockKeyhole size={13} aria-hidden="true" />已锁定</span> : null}
          {item.equipped ? <span><ShieldCheck size={13} aria-hidden="true" />当前装备</span> : null}
          <DamageTypeBadge damageType={item.damageType} />
        </div>
        <ItemInstanceStatus item={item} />
        <KillTrackerRows item={item} />

        {item.description || item.flavorText ? (
          <p className="inventory-hover-description">{item.description || item.flavorText}</p>
        ) : null}

        {item.weaponStats?.length ? <WeaponStats item={item} /> : null}
        {item.stats ? <ArmorStats item={item} /> : null}
        {intrinsics.length ? <IntrinsicSockets columns={intrinsics} /> : null}
        {perkColumns.length ? <PerkColumns columns={perkColumns} /> : null}
        {socketRows.map((row) => <SocketRow row={row} key={row.id} />)}
        {hasFlatPerks ? <FlatPerks perks={item.perks || []} /> : null}

        {!item.weaponStats?.length && !item.stats && !hasStructuredSockets && !item.perks?.length ? (
          <p className="inventory-hover-empty">该物品没有可显示的实例属性。</p>
        ) : null}
      </div>
    </aside>,
    portalRoot,
  );
}

function WeaponStats({ item }: { item: InventoryItemView }) {
  return (
    <section className="inventory-hover-stats" aria-label="武器属性">
      <h3>武器属性</h3>
      {item.weaponStats?.map((stat) => (
        <div key={stat.hash}>
          <span>{stat.name}</span>
          <strong>{stat.value}</strong>
          {stat.display === "bar" ? <i><b style={{ width: `${Math.min(stat.value, 100)}%` }} /></i> : <i className="is-number" />}
        </div>
      ))}
    </section>
  );
}

function ArmorStats({ item }: { item: InventoryItemView }) {
  const total = armorStats.reduce((sum, [key]) => sum + (item.stats?.[key] || 0), 0);
  return (
    <section className="inventory-hover-stats" aria-label="护甲属性">
      <h3>护甲属性 <strong>{total}</strong></h3>
      {armorStats.map(([key, label]) => {
        const value = item.stats?.[key] || 0;
        return (
          <div key={key}>
            <span>{label}</span>
            <strong>{value}</strong>
            <i><b style={{ width: `${Math.min(value, 100)}%` }} /></i>
          </div>
        );
      })}
    </section>
  );
}

function IntrinsicSockets({ columns }: { columns: InventorySocketColumnView[] }) {
  return (
    <section className="inventory-hover-intrinsics" aria-label="框架与固有特性">
      {columns.flatMap((column) => column.plugs.map((plug) => (
        <div className="inventory-hover-intrinsic" key={`${column.socketIndex}:${plug.hash}`}>
          <PlugIcon plug={plug} />
          <div>
            <strong>{plug.name}</strong>
            {plug.description ? <span>{plug.description}</span> : <span>{column.label}</span>}
          </div>
        </div>
      )))}
    </section>
  );
}

function PerkColumns({ columns }: { columns: InventorySocketColumnView[] }) {
  const style = { "--inventory-hover-socket-columns": columns.length } as CSSProperties;
  return (
    <section className="inventory-hover-sockets inventory-hover-perks" aria-label="武器特性">
      <h3>武器特性</h3>
      <div className="inventory-hover-socket-columns" style={style}>
        {columns.map((column) => (
          <div className="inventory-hover-socket-column" key={column.socketIndex} data-socket-index={column.socketIndex}>
            <span className="inventory-hover-socket-label">{column.label}</span>
            {column.plugs.map((plug) => <SocketPlug plug={plug} key={`${column.socketIndex}:${plug.hash}`} />)}
          </div>
        ))}
      </div>
    </section>
  );
}

function SocketRow({ row }: { row: InventorySocketRowView }) {
  const columns = currentColumns(row.columns);
  const style = { "--inventory-hover-socket-columns": columns.length } as CSSProperties;
  return (
    <section className="inventory-hover-sockets inventory-hover-socket-row" aria-label={row.label}>
      <h3>{row.label}</h3>
      <div className="inventory-hover-socket-columns" style={style}>
        {columns.map((column) => (
          <div className="inventory-hover-socket-column" key={column.socketIndex} data-socket-index={column.socketIndex}>
            {column.plugs.map((plug) => <SocketPlug plug={plug} key={`${column.socketIndex}:${plug.hash}`} />)}
          </div>
        ))}
      </div>
    </section>
  );
}

function FlatPerks({ perks }: { perks: InventoryPerkView[] }) {
  return (
    <section className="inventory-hover-sockets inventory-hover-perks is-flat" aria-label="已装备特性">
      <h3>已装备特性</h3>
      <div className="inventory-hover-flat-grid">
        {perks.map((perk, index) => <SocketPlug plug={perk} key={`${perk.hash}:${index}`} />)}
      </div>
    </section>
  );
}

function SocketPlug({ plug }: { plug: InventoryPerkView | InventorySocketPlugView }) {
  const selected = "selected" in plug && plug.selected;
  const owned = Boolean(plug.owned || selected);
  const stateLabel = `${plug.name}${selected ? "，当前已选" : owned ? "，这把拥有" : ""}${plug.enabled ? "" : "，不可用"}`;
  return (
    <div
      className={`inventory-hover-perk kind-${plug.kind} ${selected ? "is-selected" : ""} ${owned ? "is-owned" : ""} ${plug.enabled ? "" : "is-disabled"}`}
      title={plug.description || stateLabel}
      aria-label={stateLabel}
    >
      <PlugIcon plug={plug} selected={selected} owned={owned} />
      <strong>{plug.name}</strong>
    </div>
  );
}

function PlugIcon({
  plug,
  selected = false,
  owned = false,
}: {
  plug: InventoryPerkView;
  selected?: boolean;
  owned?: boolean;
}) {
  return (
    <span className="inventory-hover-perk-icon">
      {plug.iconUrl ? <img src={plug.iconUrl} alt="" loading="lazy" /> : <Sparkles size={20} aria-hidden="true" />}
      {owned ? <Check className="inventory-hover-perk-selected" size={11} strokeWidth={3} aria-hidden="true" /> : null}
    </span>
  );
}

function ItemInstanceStatus({ item }: { item: InventoryItemView }) {
  const gearTier = isWeaponGearTier(item.gearTier) ? item.gearTier : undefined;
  const weaponLevel = isWeaponTrackerCount(item.weaponLevel) ? item.weaponLevel : undefined;
  if (!gearTier && !item.crafted && !item.enhanced && !item.enhanceable && weaponLevel === undefined) return null;
  return (
    <div className="inventory-hover-meta" aria-label="物品状态">
      {gearTier ? <span title="装备等级"><CircleDot size={13} aria-hidden="true" />T{gearTier}</span> : null}
      {item.crafted ? <span title="已锻造"><Hammer size={13} aria-hidden="true" />已锻造</span> : null}
      {item.enhanced ? <span title="已强化"><ArrowUp size={13} aria-hidden="true" />已强化</span> : null}
      {!item.enhanced && item.enhanceable ? <span title="可强化"><ArrowUp size={13} aria-hidden="true" />可强化</span> : null}
      {weaponLevel !== undefined ? <span title="武器等级"><Sparkles size={13} aria-hidden="true" />等级 {weaponLevel}</span> : null}
    </div>
  );
}

function KillTrackerRows({ item }: { item: InventoryItemView }) {
  const pve = item.killTrackers?.pve;
  const pvp = item.killTrackers?.pvp;
  if (!isWeaponTrackerCount(pve) && !isWeaponTrackerCount(pvp)) return null;
  return (
    <div className="inventory-hover-meta" aria-label="击杀追踪">
      {isWeaponTrackerCount(pve) ? <span><Swords size={13} aria-hidden="true" />PvE {formatTrackerCount(pve)}</span> : null}
      {isWeaponTrackerCount(pvp) ? <span><Crosshair size={13} aria-hidden="true" />PvP {formatTrackerCount(pvp)}</span> : null}
    </div>
  );
}

function currentColumns(columns: InventorySocketColumnView[] | undefined): InventorySocketColumnView[] {
  return populatedColumns(columns).flatMap((column) => {
    const selected = column.plugs.filter((plug) => plug.selected);
    // Always show columns with a selected plug (overrides server-side visibility,
    // e.g. a T5 perk that lives in a hidden socket).
    if (selected.length) return [{ ...column, plugs: selected }];
    // Respect the server's intent to hide this column when no plug is active.
    if (column.visible === false) return [];
    const plugs = column.plugs.length === 1 ? column.plugs : [];
    return plugs.length ? [{ ...column, plugs }] : [];
  });
}

function populatedColumns(columns: InventorySocketColumnView[] | undefined): InventorySocketColumnView[] {
  return (columns || []).filter((column) => column.plugs.length > 0);
}

function tierLabel(tier: InventoryTier): string {
  return { exotic: "异域", legendary: "传说", rare: "稀有", common: "普通", unknown: "未知" }[tier];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
