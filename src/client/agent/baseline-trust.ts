/**
 * 页面级的「列表基线信任」跟踪器。
 *
 * 为什么需要它：DSH 的 `list.phase` 只证明**这个页面里**曾经建立过一次成功基线；
 * 重连后 phase 不会回到 pending，旧的 summaries 会继续冒充 ready。于是
 * 「ready + 列表里没有」并不能证明会话真的没了——它也可能是拿一份旧 generation
 * 的列表在做判断。拿它清理 id，就会误删一个实际存在的历史会话。
 *
 * 规则（2026-11-14 批准）：
 *
 * - 插件初始化：`none`。
 * - 首次观察到的有效 generation G1：记录 G1，仍为 `none`（首次连接不是重连）。
 * - G1 下观察到首次 `pending → ready`：授予 `initial(G1)`。
 * - G1 变 `undefined` / 变 G2：`revoked`，本页面生命周期内不再授予。
 * - 启动时 phase 已经是 ready：无法证明基线属于当前 generation，不授予。
 *
 * 它必须**尽早建立**（client plugin 的 `apply`），不能等账号确认：账号是异步的，
 * 等它回来时首次 ready 可能已经过去了。
 *
 * 它只读两个公开面：`sessions.list` 的 phase 与 `connection.generation`。
 * 它不持有 Session、不读 summaries、不发起任何请求——不是第二套 Session 管理器。
 */

/** 破坏性恢复的授权状态。 */
export type BaselineTrust =
  | { readonly kind: 'none' }
  | { readonly kind: 'initial'; readonly generation: number }
  | { readonly kind: 'revoked' }

/** 一次同步快照：信任状态 + 当前 generation（未连接时 undefined）。 */
export interface BaselineTrustSnapshot {
  readonly trust: BaselineTrust
  readonly generation: number | undefined
}

/** Adapter 只读这一面。 */
export interface BaselineTrustSource {
  snapshot(): BaselineTrustSnapshot
  subscribe(listener: () => void): () => void
}

/** `sessions.list` 里 tracker 需要的部分。 */
export interface BaselineListSource {
  getSnapshot(): { readonly phase: 'pending' | 'ready' }
  subscribe(listener: () => void): () => void
}

/** `connection.generation` 里 tracker 需要的部分。 */
export interface BaselineGenerationSource {
  getSnapshot(): { readonly id: number } | undefined
  subscribe(listener: () => void): () => void
}

/** 页面级 tracker。创建一次，随 client plugin 一起 dispose。 */
export class BaselineTrustTracker implements BaselineTrustSource {
  private readonly listeners = new Set<() => void>()
  private trust: BaselineTrust = { kind: 'none' }
  private generation: number | undefined
  private firstGeneration: number | undefined
  private sawPending: boolean
  private disposed = false
  private readonly stopGeneration: () => void
  private readonly stopList: () => void

  constructor(
    private readonly sources: {
      list: BaselineListSource
      generation: BaselineGenerationSource
    },
  ) {
    this.generation = sources.generation.getSnapshot()?.id
    this.firstGeneration = this.generation
    this.sawPending = sources.list.getSnapshot().phase === 'pending'
    this.stopGeneration = sources.generation.subscribe(() => this.onGeneration())
    this.stopList = sources.list.subscribe(() => this.onList())
    // 订阅可能晚于状态变化：再读一次，收口「读快照」与「订阅」之间的窗口。
    this.onGeneration()
    this.onList()
  }

  snapshot(): BaselineTrustSnapshot {
    return { trust: this.trust, generation: this.generation }
  }

  subscribe(listener: () => void): () => void {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 释放两个订阅；之后的回调一律 no-op。 */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stopGeneration()
    this.stopList()
    this.listeners.clear()
  }

  private onGeneration(): void {
    if (this.disposed) return
    const next = this.sources.generation.getSnapshot()?.id
    if (next === this.generation) return
    this.generation = next
    if (this.firstGeneration === undefined) {
      // 第一次拿到有效 generation：这是首次连接，不是重连。
      if (next !== undefined) this.firstGeneration = next
      this.maybeGrant()
      return
    }
    if (next !== this.firstGeneration) {
      this.revoke()
      return
    }
    this.maybeGrant()
  }

  private onList(): void {
    if (this.disposed) return
    if (this.sources.list.getSnapshot().phase === 'pending') {
      this.sawPending = true
      return
    }
    this.maybeGrant()
  }

  private maybeGrant(): void {
    if (this.disposed) return
    if (this.trust.kind !== 'none') return
    // 没亲眼见过 pending：订阅时就已经 ready，无法证明这份基线属于当前 generation。
    if (!this.sawPending) return
    if (this.firstGeneration === undefined) return
    if (this.generation !== this.firstGeneration) return
    if (this.sources.list.getSnapshot().phase !== 'ready') return
    this.trust = { kind: 'initial', generation: this.firstGeneration }
    this.emit()
  }

  private revoke(): void {
    if (this.trust.kind === 'revoked') return
    this.trust = { kind: 'revoked' }
    this.emit()
  }

  private emit(): void {
    if (this.disposed) return
    for (const listener of [...this.listeners]) listener()
  }
}
