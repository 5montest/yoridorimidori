import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UI_TEXT } from '../labels';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '../theme';

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** フォールバックの [メインに戻る] 押下時に呼ぶ（画面状態の初期化用）。 */
  readonly onReturnToMain?: () => void;
  /** フォールバックの見出し（既定は「表示中にエラーが発生しました」）。 */
  readonly title?: string;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

/**
 * 描画時の想定外例外を隔離する Error Boundary（クラスコンポーネント）。§11.4 / T22。
 *
 * - `getDerivedStateFromError` でフォールバックを表示し、`componentDidCatch` では
 *   `console.error` のみ（外部送信しない。NFR-02）。
 * - フォールバックは「目的地・記録は消えていない」旨と [メインに戻る] を出す。
 * - 画面単位で包む（地図の例外がメインを巻き込まないようにする）。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 外部送信は行わない（console のみ）。
    console.error('ErrorBoundary caught an error', error, info.componentStack);
  }

  private readonly handleReturnToMain = (): void => {
    this.setState({ hasError: false });
    this.props.onReturnToMain?.();
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{this.props.title ?? UI_TEXT.errorBoundary.title}</Text>
        <Text style={styles.body}>{UI_TEXT.errorBoundary.body}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={this.handleReturnToMain}
          style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
        >
          <Text style={styles.buttonText}>{UI_TEXT.errorBoundary.backToMain}</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.title,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  body: {
    fontSize: FONT_SIZE.body,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: COLORS.onPrimary,
    fontSize: FONT_SIZE.bodyLarge,
    fontWeight: '600',
  },
});
