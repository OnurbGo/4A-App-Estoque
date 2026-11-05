import { Stack } from 'expo-router';
import { colors } from '@/theme';

export const unstable_settings = { anchor: 'index' };

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
