import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { obterRepositorio } from '@/banco';
import { EmptyState, PrimaryButton, ScreenContainer } from '@/components';

const SEM_ESTOQUE_PADRAO = 'Sem estoque padrão';

/** Início provisório: os botões de lançamento chegam na A.11. */
export default function Inicio() {
  const router = useRouter();
  const [estoque, setEstoque] = useState(SEM_ESTOQUE_PADRAO);

  useFocusEffect(
    useCallback(() => {
      void obterRepositorio().then(async (repositorio) => {
        const [config, bootstrap] = await Promise.all([
          repositorio.lerConfig(),
          repositorio.lerBootstrap(),
        ]);
        const padrao = bootstrap?.dados.estoques.find(
          ({ id_almox_estoque }) => id_almox_estoque === config.estoque_padrao_id,
        );
        setEstoque(padrao?.nome ?? SEM_ESTOQUE_PADRAO);
      });
    }, []),
  );

  return (
    <ScreenContainer>
      <View className="mb-6">
        <Text className="font-sans-bold text-2xl leading-8 text-ink">Estoque 4A</Text>
        <Text className="mt-1 font-sans text-base leading-6 text-ink-secondary" testID="inicio-estoque">
          {estoque}
        </Text>
      </View>

      <EmptyState
        title="Os lançamentos chegam em breve"
        description="Por enquanto dá para conferir as configurações do aparelho."
      />

      <PrimaryButton
        label="Configurações"
        variant="secondary"
        onPress={() => router.push('/configuracoes')}
        testID="inicio-configuracoes"
      />
    </ScreenContainer>
  );
}
