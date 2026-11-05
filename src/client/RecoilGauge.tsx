import type { ReactElement } from 'react'

/**
 * Recoil direction as a gauge, ported from DIM's `RecoilStat`.
 *
 * Positive value leans right, negative left, zero straight up; a value of 95+
 * draws a straight line instead of a fan because the spread is already tiny.
 * @param props - the stat value (0..100).
 */
export function RecoilGauge({ value }: { value: number }): ReactElement {
  const direction = (Math.sin(((value + 5) * Math.PI) / 10) * (100 - value) * 0.8 * Math.PI) / 180
  const x = Math.sin(direction)
  const y = Math.cos(direction)
  const spread = ((100 - value) / 100) * 90 * (Math.PI / 180) * Math.sign(direction)
  const xMore = Math.sin(direction + spread)
  const yMore = Math.cos(direction + spread)
  const xLess = Math.sin(direction - spread)
  const yLess = Math.cos(direction - spread)
  return (
    <svg className="dsh-destiny-recoil" viewBox="0 0 2 1" aria-label={`后坐方向 ${value}`}>
      <circle r={1} cx={1} cy={1} fill="#333" />
      {value >= 95 ? (
        <line x1={1 - x} y1={1 + y} x2={1 + x} y2={1 - y} stroke="white" strokeWidth="0.1" />
      ) : (
        <path
          d={`M1,1 L${1 + xMore},${1 - yMore} A1,1 0 0,${direction < 0 ? '1' : '0'} ${1 + xLess},${1 - yLess} Z`}
          fill="#fff"
        />
      )}
    </svg>
  )
}
