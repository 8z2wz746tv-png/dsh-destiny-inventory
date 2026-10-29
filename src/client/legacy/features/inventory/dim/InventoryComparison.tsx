import { Check, Diamond, LockKeyhole, ShieldCheck, Sparkles, X } from "lucide-react";
import type { CSSProperties } from "react";
import type { InventoryItemView, InventorySocketColumnView, InventorySocketPlugView } from "./types";


interface InventoryComparisonProps {
  items: InventoryItemView[];
  onRemove: (itemId: string) => void;
  onClose: () => void;
}

interface AlignedSocket {
  socketIndex: number;
  label: string;
  columns: Array<InventorySocketColumnView | undefined>;
}


export function InventoryComparison({ items, onRemove, onClose }: InventoryComparisonProps) {
  if (!isComparableSet(items)) return null;

  const sockets = alignedPerkSockets(items);
  const gridStyle = { "--inventory-comparison-columns": items.length } as CSSProperties;

  return (
    <section className="inventory-comparison" aria-label={`${items[0].name} Roll 对比`}>
      <header className="inventory-comparison-header">
        <div>
          <span>已选择 {items.length}/3 个副本</span>
          <h2>{items[0].name} Roll 对比</h2>
          <p>同一栏位纵向对齐，勾选项是各副本当前使用的 Perk。</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭 Roll 对比" title="关闭对比">
          <X size={18} />
        </button>
      </header>

      <div className="inventory-comparison-items" style={gridStyle}>
        {items.map((item, index) => (
          <article className={`inventory-comparison-item tier-${item.tier}`} aria-label={`副本 ${index + 1}，${item.name}`} key={item.id}>
            <div className="inventory-comparison-item-icon">
              {item.iconUrl ? <img src={item.iconUrl} alt="" loading="lazy" /> : <Sparkles size={22} aria-hidden="true" />}
            </div>
            <div>
              <span>副本 {index + 1}</span>
              <strong>{item.typeName}</strong>
              <small>
                {item.power ? <span><Diamond size={12} fill="currentColor" aria-hidden="true" />{item.power}</span> : null}
                {item.locked ? <span><LockKeyhole size={12} aria-hidden="true" />已锁定</span> : null}
                {item.equipped ? <span><ShieldCheck size={12} aria-hidden="true" />已装备</span> : null}
              </small>
            </div>
            <button
              className="icon-button inventory-comparison-remove"
              type="button"
              onClick={() => onRemove(item.id)}
              aria-label={`从对比中移除副本 ${index + 1}`}
              title="移出对比"
            >
              <X size={15} />
            </button>
          </article>
        ))}
      </div>

      {sockets.length ? (
        <div className="inventory-comparison-sockets">
          {sockets.map((socket) => (
            <section
              className="inventory-comparison-slot"
              aria-label={`${socket.label}，栏位 ${socket.socketIndex}`}
              data-socket-index={socket.socketIndex}
              key={socket.socketIndex}
            >
              <header>
                <strong>{socket.label}</strong>
                <span>栏位 {socket.socketIndex}</span>
              </header>
              <div className="inventory-comparison-rolls" style={gridStyle}>
                {socket.columns.map((column, itemIndex) => (
                  <div className="inventory-comparison-roll" key={items[itemIndex].id}>
                    {column ? column.plugs.map((plug, plugIndex) => (
                      <ComparisonPlug plug={plug} key={`${plug.hash}:${plugIndex}`} />
                    )) : <p className="inventory-comparison-empty">此副本无该栏位</p>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="inventory-comparison-empty is-overall">这些副本没有可对比的 Perk 栏位。</p>
      )}
    </section>
  );
}


function ComparisonPlug({ plug }: { plug: InventorySocketPlugView }) {
  const stateLabel = `${plug.name}${plug.selected ? "，当前已选" : ""}${plug.enabled ? "" : "，不可用"}`;
  return (
    <div
      className={`inventory-comparison-plug kind-${plug.kind} ${plug.selected ? "is-selected" : ""} ${plug.enabled ? "" : "is-disabled"}`}
      aria-label={stateLabel}
      title={plug.description || stateLabel}
    >
      <span className="inventory-comparison-plug-icon">
        {plug.iconUrl ? <img src={plug.iconUrl} alt="" loading="lazy" /> : <Sparkles size={18} aria-hidden="true" />}
      </span>
      <div>
        <strong>{plug.name}</strong>
        {plug.selected ? <span className="inventory-comparison-selected"><Check size={11} strokeWidth={3} aria-hidden="true" />当前已选</span> : null}
        {!plug.enabled ? <span>不可用</span> : null}
      </div>
    </div>
  );
}


function alignedPerkSockets(items: InventoryItemView[]): AlignedSocket[] {
  const sockets = new Map<number, string>();
  items.forEach((item) => {
    item.socketGroups?.perkColumns.forEach((column) => {
      if (column.visible === false || !column.plugs.length) return;
      if (!sockets.has(column.socketIndex)) sockets.set(column.socketIndex, column.label || `栏位 ${column.socketIndex}`);
    });
  });

  return [...sockets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([socketIndex, label]) => ({
      socketIndex,
      label,
      columns: items.map((item) => item.socketGroups?.perkColumns.find((column) => (
        column.socketIndex === socketIndex && column.visible !== false && column.plugs.length > 0
      ))),
    }));
}


function isComparableSet(items: InventoryItemView[]): boolean {
  return items.length >= 1
    && items.length <= 3
    && items[0].hash !== 0
    && items.every((item) => item.hash === items[0].hash);
}
