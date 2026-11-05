import { useRouter } from 'expo-router';
import { TelaConfiguracoes } from '@/features/configuracoes/TelaConfiguracoes';

export default function OpcoesAvancadas() {
  const router = useRouter();

  return <TelaConfiguracoes titulo="Opções avançadas" aoTerminar={() => router.back()} />;
}
