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
  prefix?: string;
  suffix?: string;
  showSign?: boolean;
  style?: TextStyle;
  duration?: number;
}

export default function CountUp({
  value,
  decimals = 0,
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
    const rounded = decimals > 0 ? n.toFixed(decimals) : n.toString();
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
