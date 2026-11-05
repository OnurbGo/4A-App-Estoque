import { Text, View } from 'react-native';
import { formatDateTime } from '@/utils/format';

type Props = {
  atualizadoEm?: string | null;
  semConexao?: boolean;
};

export function OfflineStatusBanner({ atualizadoEm, semConexao }: Props) {
  if (!semConexao) return null;

  return (
    <View
      className="mb-4 rounded-md border border-warning bg-warning-soft p-3"
      accessibilityRole="alert"
      testID="offline-status-banner"
    >
      <Text className="mb-1 font-sans-medium text-sm leading-5 text-warning">Sem conexão</Text>
      <Text className="font-sans text-[13px] leading-[18px] text-ink-secondary">
        Pode continuar lançando: tudo é enviado quando a conexão voltar.
        {atualizadoEm ? ` Dados de ${formatDateTime(atualizadoEm)}.` : ''}
      </Text>
    </View>
  );
}
