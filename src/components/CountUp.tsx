import React, { useEffect } from 'react';
import { TextInput, TextStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';

Animated.addWhitelistedNativeProps({ text: true });
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface Props {
  value: number;
  decimals?: number;
  /**
   * 末尾の .0 を落とす。勝率やpipsは formatWinRate / formatPips が
   * 「67%」「66.7%」のように整数なら小数を出さない書式なので、
   * カウントアップ表示もそれに揃えないと同じ値が画面ごとに違って見える。
   */
  trimZeros?: boolean;
  prefix?: string;
  suffix?: string;
  showSign?: boolean;
  style?: TextStyle;
  duration?: number;
}

export default function CountUp({
  value,
  decimals = 0,
  trimZeros = false,
  prefix = '',
  suffix = '',
  showSign = false,
  style,
  duration = 700,
}: Props) {
  const sv = useSharedValue(0);

  useEffect(() => {
    sv.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value]);

  const animatedProps = useAnimatedProps(() => {
    const n = decimals > 0 ? sv.value : Math.round(sv.value);
    let rounded = decimals > 0 ? n.toFixed(decimals) : n.toString();
    if (decimals > 0 && trimZeros) rounded = rounded.replace(/\.0+$/, '');
    const sign = showSign && n > 0 ? '+' : '';
    return {
      text: `${prefix}${sign}${rounded}${suffix}`,
      defaultValue: `${prefix}0${suffix}`,
    } as any;
  });

  return (
    <AnimatedTextInput
      editable={false}
      underlineColorAndroid="transparent"
      style={[{ padding: 0, margin: 0 }, style]}
      animatedProps={animatedProps}
    />
  );
}
