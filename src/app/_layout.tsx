import '../global.css';

import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
  useFonts,
} from '@expo-google-fonts/dm-sans';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ErrorState, ScreenContainer } from '@/components';
import { useSessionBootstrap } from '@/hooks/useSessionBootstrap';
import { useSessionStore } from '@/stores/session-store';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Navegacao() {
  const pronto = useSessionBootstrap();
  const autenticado = useSessionStore((estado) => estado.autenticado);
  const falhaAoIniciar = useSessionStore((estado) => estado.falhaAoIniciar);

  useEffect(() => {
    if (pronto) void SplashScreen.hideAsync().catch(() => undefined);
  }, [pronto]);

  if (!pronto) return null;

  if (falhaAoIniciar) {
    return (
      <ScreenContainer scroll={false} contentClassName="justify-center">
        <ErrorState title="O app não conseguiu abrir" description={falhaAoIniciar} />
      </ScreenContainer>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Protected guard={autenticado} redirectTo="/login">
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!autenticado} redirectTo="/">
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontesCarregadas] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  if (!fontesCarregadas) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <Navegacao />
    </QueryClientProvider>
  );
}
