import { Stack } from 'expo-router';
import { useSincronizacao } from '@/hooks/useSincronizacao';
import { colors } from '@/theme';

export const unstable_settings = { anchor: 'index' };

export default function AppLayout() {
  useSincronizacao();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
