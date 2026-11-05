import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { EmptyState, IndicadorEnvio, PrimaryButton, ScreenContainer } from '@/components';
import { usePendencias } from '@/hooks/usePendencias';
import { motivoDaFalha } from '@/regras/indicador';
import type { ItemPendencia, SituacaoPendencia } from '@/regras/pendencias';
import { chegaAoServidor, useEnvioStore } from '@/stores/envio-store';
import { dispararEnvio } from '@/sync';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/format';

const SITUACOES: Record<SituacaoPendencia, { nome: string; caixa: string; texto: string }> = {
  RECUSADA: { nome: 'Recusado', caixa: 'border-danger bg-danger-soft', texto: 'text-danger' },
  PRESA: { nome: 'Parado', caixa: 'border-warning bg-warning-soft', texto: 'text-warning' },
  AGUARDANDO: { nome: 'Aguardando envio', caixa: 'border-border bg-surface', texto: 'text-ink-secondary' },
};

function CartaoPendencia({ item }: { item: ItemPendencia }) {
  const situacao = SITUACOES[item.situacao];

  return (
    <View className={cn('mb-3 rounded-md border p-3', situacao.caixa)} testID={`pendencia-${item.id}`}>
      <Text className={cn('mb-1 font-sans-bold text-sm leading-5', situacao.texto)}>
        {situacao.nome}
      </Text>
      <Text className="font-sans-medium text-lg leading-6 text-ink">{item.titulo}</Text>
      <Text className="mt-1 font-sans text-base leading-6 text-ink-secondary">{item.detalhe}</Text>

      {item.fotos > 0 ? (
        <Text className="mt-1 font-sans text-sm leading-5 text-ink-secondary">
          {item.fotos === 1 ? '1 foto junto' : `${item.fotos} fotos juntas`}
        </Text>
      ) : null}
      {item.mensagem ? (
        <Text className="mt-2 font-sans text-base leading-6 text-ink">{item.mensagem}</Text>
      ) : null}
      {item.orientacao ? (
        <Text className="mt-2 font-sans-medium text-base leading-6 text-ink">
          {item.orientacao}
        </Text>
      ) : null}

      <Text className="mt-2 font-sans text-[13px] leading-[18px] text-ink-muted">
        {formatDateTime(item.criado_em)}
        {item.tentativas > 0 ? ` · ${item.tentativas} tentativas` : ''}
      </Text>
    </View>
  );
}

/** Só leitura: correção é no sistema, nunca no tablet (regra 16). */
export default function Pendencias() {
  const router = useRouter();
  const { data } = usePendencias();
  const conectado = useEnvioStore(chegaAoServidor);
  const falhaGeral = useEnvioStore((estado) => estado.ultimaFalha);
  const [enviando, setEnviando] = useState(false);

  const itens = data?.itens ?? [];
  const resumo = data?.resumo ?? { aguardando: 0, atencao: 0 };

  async function tentarAgora() {
    setEnviando(true);
    try {
      await dispararEnvio('ABRIR');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ScreenContainer>
      <Text className="mb-4 font-sans-bold text-2xl leading-8 text-ink">Pendências</Text>

      <View className="mb-4">
        <IndicadorEnvio resumo={resumo} conectado={conectado} falhaGeral={falhaGeral} />
        {motivoDaFalha(falhaGeral, conectado) ? (
          <Text
            className="mt-2 font-sans-medium text-base leading-6 text-ink"
            testID="pendencias-orientacao"
          >
            O que foi lançado continua guardado no aparelho. Se não resolver, avise o escritório.
          </Text>
        ) : null}
      </View>

      {itens.length === 0 ? (
        <EmptyState
          title="Nada aguardando envio"
          description="Tudo que foi lançado neste aparelho já está no sistema."
        />
      ) : (
        itens.map((item) => <CartaoPendencia key={item.id} item={item} />)
      )}

      {resumo.aguardando > 0 ? (
        <PrimaryButton
          label="Tentar enviar agora"
          className="mt-2"
          onPress={() => void tentarAgora()}
          loading={enviando}
          testID="pendencias-tentar"
        />
      ) : null}

      <PrimaryButton
        label="Voltar"
        variant="ghost"
        className="mt-2"
        onPress={() => router.back()}
        testID="pendencias-voltar"
      />
    </ScreenContainer>
  );
}
