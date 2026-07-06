import { useWindowDimensions } from 'react-native';

export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= 768;
}

// タブレットではサイドバー(200pt)を除いたコンテンツ幅を返す
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  return isTablet ? width - 200 : width;
}
