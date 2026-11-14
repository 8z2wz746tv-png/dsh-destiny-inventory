/**
 * 武器分析卡：只读 `WeaponCardModel`，不解析原始结果、不补字段。
 *
 * 放在工具气泡里，与那一条 `tool/result` 绑定；同一个会话里多次调用各自成卡，
 * 不共享“最近一条结果”。
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { locateItem } from '../locate-bus'
import type { LocateResult } from '../locate-bus'
import type { WeaponCardModel } from './weapon-card-model'

/** 位置键的中文说法；认不出就原样给，不猜。 */
const PLACE: Record<string, string> = {
  Hunter: '猎人',
  Warlock: '术士',
  Titan: '泰坦',
  Vault: '仓库',
  Equipped: '已装备',
  Character: '角色',
}

const place = (key: string): string => PLACE[key] ?? key

/** null/0/6 都不是 T 级；只有 1..5 才是。 */
const tier = (value: number | null | undefined): string =>
  value === undefined ? '' : value !== null && value >= 1 && value <= 5 ? `T${value}` : '无分级'

const FAILURE: Record<'not-mounted' | 'not-in-snapshot', string> = {
  'not-mounted': '先在左侧打开「命运仓库」面板，再点定位。',
  'not-in-snapshot': '这件不在当前库存快照里，先刷新库存再试。',
}

export function WeaponCard({
  model,
  selectedInstanceId,
}: {
  model: WeaponCardModel
  /** `/context` 里选中的那件；用来标出“你选中的副本”。 */
  selectedInstanceId?: string
}): ReactElement {
  const [located, setLocated] = useState<{ instanceId: string; result: LocateResult } | null>(null)
  const selected =
    model.owned.find((copy) => copy.instanceId === selectedInstanceId) ?? model.owned[0]

  const onLocate = (instanceId: string): void => {
    setLocated({ instanceId, result: locateItem(instanceId) })
  }

  return (
    <section className="inventory-dock__weapon-card">
      <div className="inventory-dock__weapon-head">
        {model.iconUrl === '' ? (
          <div className="inventory-dock__weapon-icon is-empty" aria-hidden />
        ) : (
          <img
            className="inventory-dock__weapon-icon"
            src={model.iconUrl}
            alt={`${model.name} 图标`}
            loading="lazy"
            decoding="async"
          />
        )}
        <div className="inventory-dock__weapon-identity">
          <span className="inventory-dock__weapon-kicker">
            {[model.rarity, model.weaponType, `${model.damageType}/${model.ammoType}`]
              .filter((part) => part !== '' && part !== '/')
              .join(' · ')}
          </span>
          <strong className="inventory-dock__weapon-name">{model.name}</strong>
          <span className={`inventory-dock__weapon-source-tag is-${model.source}`}>
            {model.source === 'filter_rolls' ? '副本信息 · 非完整分析' : '武器分析'}
          </span>
          {model.nameEn !== '' && <span className="inventory-dock__weapon-en">{model.nameEn}</span>}
          <span className="inventory-dock__weapon-frame">
            {[model.frame, model.rpm === null ? '' : `${model.rpm} RPM`]
              .filter((part) => part !== '')
              .join(' · ')}
          </span>
        </div>
      </div>

      {model.source === 'filter_rolls' && (
        <p className="inventory-dock__weapon-scope-note">
          只含持有副本与当前插槽；stats、定义池、愿单参考未包含。
        </p>
      )}

      {model.summary !== '' && <p className="inventory-dock__weapon-summary">{model.summary}</p>}

      {model.stats.length > 0 && (
        <div className="inventory-dock__weapon-stats">
          {model.stats.map((stat) => (
            <div className="inventory-dock__weapon-stat" key={stat.name}>
              <span>{stat.name}</span>
              <strong>{stat.display}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="inventory-dock__weapon-section">
        <h4>{model.source === 'filter_rolls' ? '当前插槽' : '当前 perk'}</h4>
        {selected !== undefined && selected.perks.length > 0 ? (
          <ul className="inventory-dock__weapon-perks">
            {selected.perks.map((perk, index) => (
              <li key={`${perk.slot}-${perk.name}-${String(index)}`}>
                {perk.slot !== '' && <span>{perk.slot}</span>}
                {perk.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="inventory-dock__weapon-muted">
            {model.inventoryChecked ? '响应里没有副本明细。' : '账号未读取，不能把 0 件当作“你没有”。'}
          </p>
        )}
      </div>

      <div className="inventory-dock__weapon-section">
        <h4>我的副本 · {model.owned.length}</h4>
        {!model.inventoryChecked && (
          <p className="inventory-dock__weapon-muted">账号未读取。</p>
        )}
        {model.inventoryChecked && model.owned.length === 0 && (
          <p className="inventory-dock__weapon-muted">账号已读取，响应里没有副本明细。</p>
        )}
        {model.owned.map((copy) => (
          <button
            key={copy.instanceId}
            type="button"
            className={`inventory-dock__weapon-copy${
              copy.instanceId === selectedInstanceId ? ' is-selected' : ''
            }`}
            onClick={() => onLocate(copy.instanceId)}
            title={`定位 ${copy.instanceId}`}
          >
            <span className="inventory-dock__weapon-copy-line">
              <strong>{place(copy.location) || '位置未知'}</strong>
              <span>
                {copy.power === null ? '—' : `${copy.power} 光`}
                {tier(copy.gearTier) === '' ? '' : ` · ${tier(copy.gearTier)}`}
              </span>
              {copy.equipped && <em>已装备</em>}
              {copy.locked && <em>已锁定</em>}
              {copy.instanceId === selectedInstanceId && <em>你选中的</em>}
            </span>
            <span className="inventory-dock__weapon-copy-perks">
              {copy.perks.length === 0
                ? '当前 perk 未读到'
                : copy.perks.map((perk) => perk.name).join(' / ')}
            </span>
            {copy.godRollScore !== '' && (
              <span className="inventory-dock__weapon-copy-score">愿单 {copy.godRollScore}</span>
            )}
          </button>
        ))}
        {located !== null && !located.result.ok && (
          <p className="inventory-dock__weapon-error">{FAILURE[located.result.reason]}</p>
        )}
        {located !== null && located.result.ok && (
          <p className="inventory-dock__weapon-ok">已在面板定位。</p>
        )}
      </div>

      {model.perkHints.length > 0 && (
        <div className="inventory-dock__weapon-section">
          <h4>可能滚出（定义）</h4>
          <div className="inventory-dock__weapon-hints">
            {model.perkHints.map((hint) => (
              <div key={`${hint.kind}-${hint.slot}`}>
                <span>{hint.slot}</span>
                <span>
                  {hint.recommended.length > 0
                    ? hint.recommended.join(' / ')
                    : `${hint.optionCount === null ? '?' : String(hint.optionCount)} 个可选项`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {model.references.length > 0 && (
        <div className="inventory-dock__weapon-section">
          <h4>参考</h4>
          {model.references.map((reference) => (
            <p className="inventory-dock__weapon-ref" key={`${reference.label}-${reference.text}`}>
              <strong>{reference.label}</strong> {reference.text}
              {reference.source !== '' && (
                <span className="inventory-dock__weapon-source"> · {reference.source}</span>
              )}
            </p>
          ))}
        </div>
      )}

      {model.warnings.length > 0 && (
        <div className="inventory-dock__weapon-warnings">
          <strong>注意</strong>
          <ul>
            {model.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
