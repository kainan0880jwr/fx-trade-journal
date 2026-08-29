import { router } from 'expo-router';
import { closeScreen } from '../closeScreen';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() },
}));

const back = router.back as jest.Mock;
const replace = router.replace as jest.Mock;
const canGoBack = router.canGoBack as jest.Mock;

beforeEach(() => {
  back.mockClear();
  replace.mockClear();
  canGoBack.mockReset();
});

describe('closeScreen', () => {
  it('戻り先があるときは通常どおり戻る', () => {
    canGoBack.mockReturnValue(true);
    closeScreen();
    expect(back).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it('戻り先が無いときはタブのトップへ置き換える（ウィジェットから直接開いた場合）', () => {
    canGoBack.mockReturnValue(false);
    closeScreen();
    expect(back).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('戻り先が無くても必ずどちらかは実行され、画面に閉じ込められない', () => {
    for (const can of [true, false]) {
      back.mockClear();
      replace.mockClear();
      canGoBack.mockReturnValue(can);
      closeScreen();
      expect(back.mock.calls.length + replace.mock.calls.length).toBe(1);
    }
  });
});
