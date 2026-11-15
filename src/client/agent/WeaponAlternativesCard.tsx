/**
 * 同类型持有候选卡。
 *
 * 只展示 filter_rolls 返回的事实：候选身份、持有副本、当前插槽、社区清单记录。
 * **不显示“为什么能替代/损失/场景”**——那是 Agent 回复的内容；卡片不生成评分、排名或推荐结论。
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { locateItem } from '../locate-bus'
import type { LocateResult } from '../locate-bus'
import type { WeaponAlternativesModel } from './weapon-alternatives-model'

const PLACE: Record<string, string> = {
  Hunter: '猎人',
  Warlock: '术士',
  Titan: '泰坦',
  Vault: '仓库',
  Equipped: '已装备',
  Character: '角色',
}

const place = (key: string): string => PLACE[key] ?? key

const FAILURE: Record<'not-mounted' | 'not-in-snapshot', string> = {
  'not-mounted': '先在左侧打开「命运仓库」面板，再点定位。',
  'not-in-snapshot': '这件不在当前库存快照里，先刷新库存再试。',
}

export function WeaponAlternativesCard({
  model,
}: {
  model: WeaponAlternativesModel
}): ReactElement {
  const [located, setLocated] = useState<{ instanceId: string; result: LocateResult } | null>(null)

  if (!model.currentKnown) {
    return (
      <section className="inventory-dock__alt-card">
        <p className="inventory-dock__alt-error">
          当前武器身份无法确认（缺少 selectedItemHash），不能排除同定义副本；未生成候选。
        </p>
      </section>
    )
  }

  const onLocate = (instanceId: string): void => {
    setLocated({ instanceId, result: locateItem(instanceId) })
  }

  return (
    <section className="inventory-dock__alt-card">
      <header className="inventory-dock__alt-head">
        <div>
          <h4>同类型持有候选</h4>
          <span className="inventory-dock__alt-source">filter_rolls · 持有实例</span>
        </div>
        <span className="inventory-dock__alt-count">{model.candidates.length} 组</span>
      </header>

      <p className="inventory-dock__alt-current">
        当前：{model.currentName === '' ? '未命名武器' : model.currentName}
        {model.currentHash > 0 ? `（Hash ${String(model.currentHash)}）` : ''}
      </p>
      {model.current === null ? (
        <p className="inventory-dock__alt-muted">
          本次返回未包含当前实例；已按 selectedItemHash 排除同定义副本，未拿同 Hash 的另一副本冒充当前。
        </p>
      ) : (
        <div className="inventory-dock__alt-current-detail">
          <span>{[model.current.frame, model.current.rpm === null ? '' : `${model.current.rpm} RPM`].filter((part) => part !== '').join(' · ')}</span>
          <span>{model.current.slots.join(' / ')}</span>
        </div>
      )}

      {model.truncated && (
        <p className="inventory-dock__alt-note">
          仅展示返回的 {model.returnedCount} 个实例 / 共 {model.matchedCount} 个持有实例；未返回的未参与比较。
        </p>
      )}
      {model.candidatesTruncated && (
        <p className="inventory-dock__alt-note">当前返回结果去重后超过 10 组，仅展示其中前 10 组；这不是推荐排名。</p>
      )}

      {model.candidates.length === 0 ? (
        <p className="inventory-dock__alt-muted">没有可展示的同类型持有候选（已排除当前武器）。</p>
      ) : (
        <div className="inventory-dock__alt-list">
          {model.candidates.map((candidate) => (
            <article className="inventory-dock__alt-candidate" key={candidate.itemHash}>
              <div className="inventory-dock__alt-candidate-head">
                {candidate.iconUrl === '' ? (
                  <div className="inventory-dock__alt-icon is-empty" aria-hidden />
                ) : (
                  <img
                    className="inventory-dock__alt-icon"
                    src={candidate.iconUrl}
                    alt={`${candidate.name} 图标`}
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <div className="inventory-dock__alt-identity">
                  <strong>{candidate.name}</strong>
                  {candidate.nameEn !== '' && <span>{candidate.nameEn}</span>}
                  <span>
                    {[candidate.weaponType, candidate.frame, candidate.rpm === null ? '' : `${candidate.rpm} RPM`]
                      .filter((part) => part !== '')
                      .join(' · ')}
                  </span>
                </div>
              </div>

              <div className="inventory-dock__alt-copies">
                {candidate.copies.map((copy) => (
                  <button
                    key={copy.instanceId}
                    type="button"
                    className="inventory-dock__alt-copy"
                    onClick={() => onLocate(copy.instanceId)}
                    title={`定位 ${copy.instanceId}`}
                  >
                    <span className="inventory-dock__alt-copy-line">
                      <strong>{place(copy.location) || '位置未知'}</strong>
                      <span>{copy.power === null ? '—' : `${copy.power} 光`}</span>
                      {copy.equipped && <em>已装备</em>}
                      {copy.locked && <em>已锁定</em>}
                    </span>
                    <span className="inventory-dock__alt-copy-perks">
                      {copy.perks.length === 0 ? '当前插槽未读到' : copy.perks.join(' / ')}
                    </span>
                  </button>
                ))}
              </div>

              {candidate.community.length > 0 && (
                <div className="inventory-dock__alt-community">
                  <strong>社区清单记录（按名称关联，弱证据）</strong>
                  {candidate.community.map((entry) => (
                    <p key={`${entry.list}-${entry.tier}-${entry.note}`}>
                      {[entry.list, entry.tier, entry.scale].filter((part) => part !== '').join(' · ')}
                      {entry.note !== '' ? `：${entry.note}` : ''}
                      {(entry.source !== '' || entry.updatedAt !== '') && (
                        <span className="inventory-dock__alt-community-source">
                          {' '}· {[entry.source, entry.updatedAt].filter((part) => part !== '').join(' / ')}
                        </span>
                      )}
                    </p>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {located !== null && !located.result.ok && (
        <p className="inventory-dock__alt-error">{FAILURE[located.result.reason]}</p>
      )}
      {located !== null && located.result.ok && (
        <p className="inventory-dock__alt-ok">已在面板定位。</p>
      )}
    </section>
  )
}
