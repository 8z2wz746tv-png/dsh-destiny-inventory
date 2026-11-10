/**
 * 护甲详情里的能量条与套装区。
 *
 * 判定在 `armor-view.ts`，这里只画。样式内联：`styles-detail.ts` 贴着 430 行上限，
 * 为两块新内容去挤它不划算，而这两块的结构简单到不需要独立样式表。
 */
import type { ReactElement } from 'react'
import { energyBar, setPanel } from './armor-view'
import type { ArmorSetView, ItemDetailView } from '../host/types'

const ELEMENT_COLOR: Record<string, string> = {
  电弧能量: 'var(--dsh-armor-arc, #79bbe8)',
  烈日能量: 'var(--dsh-armor-solar, #f0833a)',
  虚空能量: 'var(--dsh-armor-void, #b185df)',
  冰影能量: 'var(--dsh-armor-stasis, #4a7fbf)',
  缚丝能量: 'var(--dsh-armor-strand, #35c98c)',
}

/**
 * 能量条。
 * @param energy - 详情里的能量块。
 * @returns 武器与缺失时什么也不画。
 */
export function ArmorEnergy({ energy }: { energy: ItemDetailView['energy'] }): ReactElement | null {
  const bar = energyBar(energy)
  if (bar === null) return null
  const color = ELEMENT_COLOR[bar.type] ?? 'var(--dsh-armor-energy, #8a8f98)'
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.85 }}>
        {/* 查不到元素名就只写"能量"：不猜它是哪一种。 */}
        <span>{bar.type === '' ? '能量' : bar.type}</span>
        <span>
          {bar.used} / {bar.capacity}
        </span>
      </div>
      {bar.showBar && (
        <div
          style={{ height: 6, marginTop: 4, borderRadius: 3, background: 'rgba(255,255,255,0.12)' }}
          role="meter"
          aria-valuenow={bar.used}
          aria-valuemin={0}
          aria-valuemax={bar.capacity}
        >
          <div
            style={{ width: `${Math.round(bar.ratio * 100)}%`, height: '100%', borderRadius: 3, background: color }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * 套装区。
 * @param set - 详情里的套装块。
 * @returns 不属任何套装时什么也不画。
 */
export function ArmorSetPanel({ set }: { set: ArmorSetView | null }): ReactElement | null {
  const panel = setPanel(set)
  if (panel === null) return null
  return (
    <section style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
      <div style={{ fontSize: 11, opacity: 0.7 }}>套装</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{panel.name}</div>
      {panel.tiers.map((tier) => (
        <div key={tier.count} style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12 }}>
            <span style={{ opacity: 0.7 }}>{tier.count} 件</span> {tier.name}
          </div>
          {tier.description !== '' && (
            <p style={{ margin: '2px 0 0', fontSize: 11, lineHeight: 1.4, opacity: 0.75 }}>
              {tier.description}
            </p>
          )}
        </div>
      ))}
    </section>
  )
}
