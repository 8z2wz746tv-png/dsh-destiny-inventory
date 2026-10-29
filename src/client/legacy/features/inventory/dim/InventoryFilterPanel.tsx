import { ListFilter, RotateCcw } from "lucide-react";
import type { InventoryFilters, InventorySort } from "./types";


interface InventoryFilterPanelProps {
  open: boolean;
  filters: InventoryFilters;
  sort: InventorySort;
  typeNames: string[];
  ammoTypes: string[];
  activeCount: number;
  resultCount: number;
  onOpenChange: (open: boolean) => void;
  onChange: (filters: InventoryFilters) => void;
  onSortChange: (sort: InventorySort) => void;
  onReset: () => void;
}

const damageOptions = [
  ["all", "全部元素"],
  ["kinetic", "动能"],
  ["solar", "烈日"],
  ["arc", "电弧"],
  ["void", "虚空"],
  ["stasis", "冰影"],
  ["strand", "缚丝"],
] as const;

const tierOptions = [
  ["all", "全部品质"],
  ["exotic", "异域"],
  ["legendary", "传说"],
  ["rare", "稀有"],
  ["common", "普通"],
] as const;

const sortOptions: Array<[InventorySort, string]> = [
  ["power-desc", "光能从高到低"],
  ["name-asc", "名称"],
  ["type-asc", "武器类型"],
  ["tier-desc", "品质"],
];

export function InventoryFilterPanel({
  open,
  filters,
  sort,
  typeNames,
  ammoTypes,
  activeCount,
  resultCount,
  onOpenChange,
  onChange,
  onSortChange,
  onReset,
}: InventoryFilterPanelProps) {
  return (
    <div className="inventory-filter">
      <button
        className={`button secondary inventory-filter-toggle ${open || activeCount || sort !== "power-desc" ? "active" : ""}`}
        type="button"
        aria-expanded={open}
        aria-controls="inventory-filter-panel"
        onClick={() => onOpenChange(!open)}
      >
        <ListFilter size={15} aria-hidden="true" />
        筛选
        {activeCount ? <span aria-label={`${activeCount} 个筛选条件`}>{activeCount}</span> : null}
      </button>

      {open ? (
        <section id="inventory-filter-panel" className="inventory-filter-panel" aria-label="装备筛选与排序">
          <header>
            <strong>筛选与排序</strong>
            <span>{resultCount} 件</span>
            <button
              className="icon-button"
              type="button"
              onClick={onReset}
              disabled={!activeCount && sort === "power-desc"}
              aria-label="重置装备筛选"
              title="重置筛选"
            >
              <RotateCcw size={14} />
            </button>
          </header>

          <label>
            <span>类型</span>
            <select value={filters.typeName} onChange={(event) => onChange({ ...filters, typeName: event.target.value })}>
              <option value="all">全部类型</option>
              {typeNames.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>

          <label>
            <span>元素</span>
            <select value={filters.damage} onChange={(event) => onChange({ ...filters, damage: event.target.value as InventoryFilters["damage"] })}>
              {damageOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>

          <label>
            <span>弹药</span>
            <select value={filters.ammoType} onChange={(event) => onChange({ ...filters, ammoType: event.target.value })}>
              <option value="all">全部弹药</option>
              {ammoTypes.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>

          <label>
            <span>品质</span>
            <select value={filters.tier} onChange={(event) => onChange({ ...filters, tier: event.target.value as InventoryFilters["tier"] })}>
              {tierOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>

          <label>
            <span>锁定</span>
            <select value={filters.lockState} onChange={(event) => onChange({ ...filters, lockState: event.target.value as InventoryFilters["lockState"] })}>
              <option value="all">全部状态</option>
              <option value="locked">已锁定</option>
              <option value="unlocked">未锁定</option>
            </select>
          </label>

          <label>
            <span>排序</span>
            <select value={sort} onChange={(event) => onSortChange(event.target.value as InventorySort)}>
              {sortOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>

          <label className="inventory-duplicate-filter">
            <input
              type="checkbox"
              checked={filters.duplicatesOnly}
              onChange={(event) => onChange({ ...filters, duplicatesOnly: event.target.checked })}
            />
            <span aria-hidden="true" />
            仅重复项
          </label>
        </section>
      ) : null}
    </div>
  );
}
