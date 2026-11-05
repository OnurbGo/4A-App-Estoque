import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { obterRepositorio } from '@/banco';
import {
  EmptyState,
  IndicadorEnvio,
  OfflineStatusBanner,
  PrimaryButton,
  ScreenContainer,
} from '@/components';
import { telaDeTesteLigada } from '@/features/teste/ligada';
import { usePendencias } from '@/hooks/usePendencias';
import { chegaAoServidor, useEnvioStore } from '@/stores/envio-store';

const SEM_ESTOQUE_PADRAO = 'Sem estoque padrão';

/** Início provisório: os botões de lançamento chegam na A.11. */
export default function Inicio() {
  const router = useRouter();
  const [estoque, setEstoque] = useState(SEM_ESTOQUE_PADRAO);
  const { data } = usePendencias();
  const conectado = useEnvioStore(chegaAoServidor);
  const falhaGeral = useEnvioStore((estado) => estado.ultimaFalha);
  const rodada = useEnvioStore((estado) => estado.rodada);

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
      // A rodada traz o bootstrap novo, que pode trazer o nome do estoque.
    }, [rodada]),
  );

  return (
    <ScreenContainer>
      <View className="mb-4">
        <Text className="font-sans-bold text-2xl leading-8 text-ink">Estoque 4A</Text>
        <Text className="mt-1 font-sans text-base leading-6 text-ink-secondary" testID="inicio-estoque">
          {estoque}
        </Text>
      </View>

      <OfflineStatusBanner semConexao={!conectado} atualizadoEm={data?.atualizadoEm} />

      <View className="mb-4">
        <IndicadorEnvio
          resumo={data?.resumo ?? { aguardando: 0, atencao: 0 }}
          conectado={conectado}
          falhaGeral={falhaGeral}
          aoAbrir={() => router.push('/pendencias')}
        />
      </View>

      <EmptyState
        title="Os lançamentos chegam em breve"
        description="Por enquanto dá para conferir as configurações e o que aguarda envio."
      />

      {telaDeTesteLigada() ? (
        <PrimaryButton
          label="Lançamento de teste"
          className="mb-3"
          onPress={() => router.push('/teste-lancamento')}
          testID="inicio-teste"
        />
      ) : null}

      <PrimaryButton
        label="Configurações"
        variant="secondary"
        onPress={() => router.push('/configuracoes')}
        testID="inicio-configuracoes"
      />
    </ScreenContainer>
  );
}
