import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { PasswordField, PrimaryButton, ScreenContainer } from '@/components';
import { TelaConfiguracoes } from '@/features/configuracoes/TelaConfiguracoes';
import { senhaConfere } from '@/services/token-storage';
import { useSessionStore } from '@/stores/session-store';

const SENHA_ERRADA = 'Senha incorreta.';

/** Pede a senha para ninguém trocar o servidor sem querer (regra 25). Funciona sem conexão. */
function PedirSenha({ aoLiberar, aoVoltar }: { aoLiberar: () => void; aoVoltar: () => void }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function conferir() {
    if (await senhaConfere(senha)) aoLiberar();
    else setErro(SENHA_ERRADA);
  }

  return (
    <ScreenContainer contentClassName="flex-grow justify-center">
      <Text className="mb-2 font-sans-bold text-2xl leading-8 text-ink">Configurações</Text>
      <Text className="mb-6 font-sans text-base leading-6 text-ink-secondary">
        Digite a senha da conta dos tablets para abrir.
      </Text>

      <PasswordField
        label="Senha"
        value={senha}
        onChangeText={(texto) => {
          setSenha(texto);
          setErro(null);
        }}
        error={erro ?? undefined}
        testID="config-senha"
      />

      <PrimaryButton label="Abrir" onPress={() => void conferir()} testID="config-abrir" />
      <PrimaryButton label="Voltar" variant="ghost" className="mt-2" onPress={aoVoltar} />
    </ScreenContainer>
  );
}

export default function Configuracoes() {
  const router = useRouter();
  const sair = useSessionStore((estado) => estado.sair);
  const [liberado, setLiberado] = useState(false);

  if (!liberado) {
    return <PedirSenha aoLiberar={() => setLiberado(true)} aoVoltar={() => router.back()} />;
  }

  return (
    <TelaConfiguracoes
      titulo="Configurações"
      aoTerminar={() => router.back()}
      rodape={
        <View className="mt-8 border-t border-border pt-6">
          <PrimaryButton
            label="Sair da conta"
            variant="secondary"
            onPress={() => void sair()}
            testID="config-sair"
          />
          <Text className="mt-2 font-sans text-sm leading-5 text-ink-secondary">
            O que aguarda envio fica guardado. Para entrar de novo é preciso conexão com o
            servidor.
          </Text>
        </View>
      }
    />
  );
}
