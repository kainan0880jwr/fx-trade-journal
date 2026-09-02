import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import * as Sentry from '@sentry/react-native';
import { t } from '../i18n';
import type { ThemeColors } from '../theme/colors';

interface InnerProps {
  children: React.ReactNode;
  colors: ThemeColors;
}

interface State {
  hasError: boolean;
}

// Reactのレンダー中にキャッチされない例外が起きると、React Native標準の挙動では
// アプリ全体が強制終了する。componentDidCatch/getDerivedStateFromErrorはクラス
// コンポーネントでしか実装できないため、テーマ取得はフック対応の外側ラッパーで行い
// ここへpropsとして渡す。
class ErrorBoundaryInner extends React.Component<InnerProps, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error('[ErrorBoundary] Unhandled render error:', error, info.componentStack);
    // Sentry未初期化（DSN未設定）の場合はSDK内部で無視される
    Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } });
  }

  handleRestart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // 開発ビルド等でreloadAsyncが使えない場合は、境界の状態だけリセットして再描画を試みる
      this.setState({ hasError: false });
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const C = this.props.colors;
    return (
      <View style={[styles.container, { backgroundColor: C.bg }]}>
        <Text style={[styles.title, { color: C.text }]}>{t('error_boundary_title')}</Text>
        <Text style={[styles.message, { color: C.text2 }]}>{t('error_boundary_message')}</Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: C.primary }]}
          onPress={this.handleRestart}
          activeOpacity={0.85}
        >
          <Text style={[styles.buttonText, { color: C.onAccent }]}>{t('error_boundary_restart_button')}</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

interface Props {
  children: React.ReactNode;
  colors: ThemeColors;
}

export default function ErrorBoundary({ children, colors }: Props) {
  return <ErrorBoundaryInner colors={colors}>{children}</ErrorBoundaryInner>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  buttonText: {
    // 静的StyleSheetのためテーマ色を参照できない。実際の色は描画側で
    // C.onAccent を重ねて上書きしている（ダークでは白だとコントラストが足りない）。
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
