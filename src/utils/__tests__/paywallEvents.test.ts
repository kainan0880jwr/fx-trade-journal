import * as Sentry from '@sentry/react-native';
import {
  recordPremiumGateShown, recordPaywallViewed, recordPaywallNoPackages,
  recordPurchaseTapped, recordPurchaseResult, recordPaywallDismissed,
  normalizeFeatureKey, normalizeSource, __resetPaywallEventsForTest,
} from '../paywallEvents';

jest.mock('@sentry/react-native', () => ({ captureMessage: jest.fn() }));

const captureMessage = Sentry.captureMessage as jest.Mock;

beforeEach(() => {
  captureMessage.mockClear();
  __resetPaywallEventsForTest();
});

describe('タグ値の正規化', () => {
  it('未知の機能キーは unknown に丸める（翻訳文字列が混入しても集計が壊れないこと）', () => {
    expect(normalizeFeatureKey('badges')).toBe('badges');
    expect(normalizeFeatureKey('分析（時間帯）')).toBe('unknown');
    expect(normalizeFeatureKey(undefined)).toBe('unknown');
  });

  it('未知の流入元は unknown に丸める', () => {
    expect(normalizeSource('gate')).toBe('gate');
    expect(normalizeSource('trade_form_hint')).toBe('trade_form_hint');
    expect(normalizeSource('どこか')).toBe('unknown');
    expect(normalizeSource(undefined)).toBe('unknown');
  });
});

describe('recordPremiumGateShown', () => {
  it('同じ機能はセッション内で1度しか送らない', () => {
    recordPremiumGateShown('badges');
    recordPremiumGateShown('badges');
    recordPremiumGateShown('badges');
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      'paywall:gate_shown',
      { level: 'info', tags: { paywall_feature: 'badges' } },
    );
  });

  it('機能が違えばそれぞれ1度ずつ送る', () => {
    recordPremiumGateShown('badges');
    recordPremiumGateShown('calculator');
    expect(captureMessage).toHaveBeenCalledTimes(2);
  });
});

describe('ファネル各段のイベント', () => {
  it('viewed は流入元と機能をタグに乗せる', () => {
    recordPaywallViewed('gate', 'analysis_mental');
    expect(captureMessage).toHaveBeenCalledWith(
      'paywall:viewed',
      { level: 'info', tags: { paywall_source: 'gate', paywall_feature: 'analysis_mental' } },
    );
  });

  it('no_packages を送れる（買う手段が表示されなかったケース）', () => {
    recordPaywallNoPackages('gate');
    expect(captureMessage).toHaveBeenCalledWith(
      'paywall:no_packages',
      { level: 'info', tags: { paywall_source: 'gate' } },
    );
  });

  it('purchase_tapped はプランとトライアル有無を送る', () => {
    recordPurchaseTapped('annual', true);
    expect(captureMessage).toHaveBeenCalledWith(
      'paywall:purchase_tapped',
      { level: 'info', tags: { paywall_plan: 'annual', paywall_has_trial: '1' } },
    );
  });

  it('dismissed はパッケージが見えていたかを送る', () => {
    recordPaywallDismissed('trade_form_hint', false);
    expect(captureMessage).toHaveBeenCalledWith(
      'paywall:dismissed',
      { level: 'info', tags: { paywall_source: 'trade_form_hint', paywall_saw_packages: '0' } },
    );
  });
});

describe('recordPurchaseResult', () => {
  it('トライアル付きの成功は trial_started も送る', () => {
    recordPurchaseResult('success', 'annual', true);
    const messages = captureMessage.mock.calls.map(c => c[0]);
    expect(messages).toEqual(['paywall:purchase_result', 'paywall:trial_started']);
  });

  it('トライアル無しの成功は purchase_completed を送る', () => {
    recordPurchaseResult('success', 'monthly', false);
    const messages = captureMessage.mock.calls.map(c => c[0]);
    expect(messages).toEqual(['paywall:purchase_result', 'paywall:purchase_completed']);
  });

  it('キャンセルや失敗では成功イベントを送らない', () => {
    recordPurchaseResult('cancelled', 'annual', true);
    recordPurchaseResult('error', 'annual', true);
    const messages = captureMessage.mock.calls.map(c => c[0]);
    expect(messages).toEqual(['paywall:purchase_result', 'paywall:purchase_result']);
  });
});

describe('計装の安全性', () => {
  it('Sentryが例外を投げても呼び出し側に伝播しない', () => {
    captureMessage.mockImplementation(() => { throw new Error('sentry down'); });
    expect(() => recordPaywallViewed('gate', 'badges')).not.toThrow();
    expect(() => recordPurchaseResult('success', 'annual', true)).not.toThrow();
  });
});
