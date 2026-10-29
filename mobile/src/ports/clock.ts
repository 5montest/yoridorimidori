/**
 * 時刻供給。鮮度計算は単調増加時計のみを使う（requirements §10: 壁時計変更の影響を受けない）。
 * 実装: SystemClock（端末）/ FakeClock（テスト・シナリオ）。
 */
export interface Clock {
  /** 単調増加ミリ秒。差分のみ意味を持つ。巻き戻らないこと。 */
  nowMonotonicMs(): number;
  /** Unix epoch ミリ秒。記録・表示用の壁時計。 */
  nowEpochMs(): number;
}
