import type { InventoryDamage } from "./types";


const damageLabels: Record<InventoryDamage, string> = {
  kinetic: "动能",
  solar: "烈日",
  arc: "电弧",
  void: "虚空",
  stasis: "冰影",
  strand: "缚丝",
  unknown: "",
};

const BUNGIE_ORIGIN = "https://www.bungie.net";

const damageIconPaths: Record<Exclude<InventoryDamage, "unknown">, string> = {
  kinetic: "/common/destiny2_content/icons/DestinyDamageTypeDefinition_3385a924fd3ccb92c343ade19f19a370.png",
  solar: "/common/destiny2_content/icons/DestinyDamageTypeDefinition_2a1773e10968f2d088b97c22b22bba9e.png",
  arc: "/common/destiny2_content/icons/DestinyDamageTypeDefinition_092d066688b879c807c3b460afdd61e6.png",
  void: "/common/destiny2_content/icons/DestinyDamageTypeDefinition_ceb2f6197dccf3958bb31cc783eb97a0.png",
  stasis: "/common/destiny2_content/icons/DestinyDamageTypeDefinition_530c4c3e7981dc2aefd24fd3293482bf.png",
  strand: "/common/destiny2_content/icons/DestinyDamageTypeDefinition_b2fe51a94f3533f97079dfa0d27a4096.png",
};


interface DamageTypeBadgeProps {
  damageType?: InventoryDamage;
  className?: string;
}


export function DamageTypeBadge({ damageType, className = "" }: DamageTypeBadgeProps) {
  const damage = damageType || "unknown";
  const label = damageLabels[damage];
  if (!label || damage === "unknown") return null;
  const iconUrl = `${BUNGIE_ORIGIN}${damageIconPaths[damage]}`;

  return (
    <span
      className={`inventory-damage-badge damage-${damage} ${className}`.trim()}
      data-damage-type={damage}
      aria-label={`伤害类型：${label}`}
      title={`${label}伤害`}
    >
      <img
        className="inventory-damage-icon"
        src={iconUrl}
        alt=""
        aria-hidden="true"
        decoding="async"
        onError={(event) => { event.currentTarget.hidden = true; }}
      />
      <span className="inventory-damage-label">{label}</span>
    </span>
  );
}
