// @sentry/react-native のJestモック。
//
// 実体はESM（dist/js/index.js が `export {...}` を含む）で、jest-expoの
// transformIgnorePatternsの対象外のため、そのまま読み込むと
// 「SyntaxError: Unexpected token 'export'」でテストスイートごと落ちる。
// パッケージ全体をBabel変換対象に加えるより、ネイティブSDKを呼ばないモックを
// 置くほうが速く副作用もない（react-native-purchases と同じ方針）。
//
// node_modules配下のパッケージに対する __mocks__ はjestが自動適用するため、
// 各テストで jest.mock() を書く必要はない。
// 送信内容そのものを検証したいテストは、これを jest.mock() で上書きすること
// （src/utils/__tests__/paywallEvents.test.ts がその例）。

export const init = jest.fn();
export const captureMessage = jest.fn();
export const captureException = jest.fn();
export const captureEvent = jest.fn();
export const addBreadcrumb = jest.fn();
export const setTag = jest.fn();
export const setTags = jest.fn();
export const setContext = jest.fn();
export const setExtra = jest.fn();
export const setUser = jest.fn();
export const wrap = <T>(component: T): T => component;
export const ReactNativeTracing = jest.fn();
export const reactNavigationIntegration = jest.fn(() => ({ name: 'ReactNavigation' }));
