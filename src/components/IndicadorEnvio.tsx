import { Pressable, Text, View } from 'react-native';
import { indicadorDeEnvio, type EstadoIndicador, type FalhaDeEnvio } from '@/regras/indicador';
import type { ResumoPendencias } from '@/regras/pendencias';
import { cn } from '@/utils/cn';

type Props = {
  resumo: ResumoPendencias;
  conectado: boolean;
  falhaGeral?: FalhaDeEnvio | null;
  /** Sem isto, é só informação: na tela de Pendências não há para onde ir. */
  aoAbrir?: () => void;
};

const CORES: Record<EstadoIndicador, { fundo: string; ponto: string; texto: string }> = {
  TUDO_ENVIADO: { fundo: 'bg-primary-soft', ponto: 'bg-primary', texto: 'text-primary-dark' },
  AGUARDANDO: { fundo: 'bg-warning-soft', ponto: 'bg-warning', texto: 'text-warning' },
  SEM_CONEXAO: { fundo: 'bg-surface-muted', ponto: 'bg-ink-muted', texto: 'text-ink-secondary' },
};

/** "Tudo enviado", "N aguardando envio" ou "Sem conexão". Tocar abre as Pendências. */
export function IndicadorEnvio({ resumo, conectado, falhaGeral = null, aoAbrir }: Props) {
  const { estado, texto, atencao, falha } = indicadorDeEnvio(resumo, conectado, falhaGeral);
  const cores = CORES[estado];

  return (
    <Pressable
      onPress={aoAbrir}
      disabled={!aoAbrir}
      accessibilityRole={aoAbrir ? 'button' : 'text'}
      accessibilityLabel={[texto, falha, atencao].filter(Boolean).join('. ')}
      className={cn('min-h-[56px] justify-center rounded-md px-4 py-2', cores.fundo)}
      testID="indicador-envio"
    >
      <View className="flex-row items-center">
        <View className={cn('mr-2 h-3 w-3 rounded-pill', cores.ponto)} />
        <Text className={cn('font-sans-bold text-base leading-6', cores.texto)}>{texto}</Text>
      </View>
      {falha ? (
        <Text
          className="mt-0.5 font-sans-medium text-sm leading-5 text-danger"
          testID="indicador-falha"
        >
          {falha}
        </Text>
      ) : null}
      {atencao ? (
        <Text className="mt-0.5 font-sans-medium text-sm leading-5 text-danger">{atencao}</Text>
      ) : null}
    </Pressable>
  );
}
