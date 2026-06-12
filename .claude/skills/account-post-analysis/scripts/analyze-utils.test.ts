import { describe, it, expect } from 'vitest'
import { slugify, calcEngagementRate, parseArgs, formatReportFilename } from './analyze-utils'

describe('slugify', () => {
  it('英数字以外をハイフンに変換し、小文字化・前後のハイフンを除去する', () => {
    expect(slugify('Dober/Threads')).toBe('dober-threads')
    expect(slugify('  Foo_Bar 123 ')).toBe('foo-bar-123')
  })
})

describe('calcEngagementRate', () => {
  it('インプレッションに対するライク・リプライ・リポストの割合をパーセントで返す', () => {
    expect(calcEngagementRate(1000, 50, 10, 5)).toBe(6.5)
  })

  it('インプレッションが0のときは0を返す', () => {
    expect(calcEngagementRate(0, 5, 0, 0)).toBe(0)
  })
})

describe('parseArgs', () => {
  it('アカウント名のみ指定した場合、daysはデフォルト7になる', () => {
    expect(parseArgs(['Dober'])).toEqual({ accountQuery: 'Dober', days: 7 })
  })

  it('--daysオプションを指定できる', () => {
    expect(parseArgs(['Dober', '--days', '30'])).toEqual({ accountQuery: 'Dober', days: 30 })
  })

  it('アカウント名が無い場合はエラーになる', () => {
    expect(() => parseArgs([])).toThrow('アカウント名を指定してください')
    expect(() => parseArgs(['--days', '30'])).toThrow('アカウント名を指定してください')
  })

  it('--daysに数値以外を指定するとエラーになる', () => {
    expect(() => parseArgs(['Dober', '--days', 'abc'])).toThrow('--days には数値を指定してください')
  })
})

describe('formatReportFilename', () => {
  it('YYYY-MM-DD_HHMM_analysis.md 形式のファイル名を返す', () => {
    expect(formatReportFilename(new Date(2026, 5, 12, 9, 5))).toBe('2026-06-12_0905_analysis.md')
  })
})
