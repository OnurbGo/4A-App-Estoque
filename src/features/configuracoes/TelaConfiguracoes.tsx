import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { obterRepositorio } from '@/banco';
import { FormField, PrimaryButton, ScreenContainer } from '@/components';
import { normalizarEndereco } from '@/regras/endereco';
import type { Estoque } from '@/regras/tipos';
import { toFriendlyError } from '@/services/errors';
import { listarEstoques } from '@/services/tablet-api';
import { colors } from '@/theme';
import { cn } from '@/utils/cn';
import {
  carregarConfiguracoes,
  enderecoVaiMudar,
  quantosAguardamEnvio,
  salvarConfiguracoes,
} from './servico';

type Teste = { situacao: 'ok' | 'erro'; mensagem: string } | null;

type Props = {
  titulo: string;
  aoTerminar: () => void;
  rodape?: ReactNode;
};

type OpcaoProps = { nome: string; escolhido: boolean; aoEscolher: () => void };

function OpcaoDeEstoque({ nome, escolhido, aoEscolher }: OpcaoProps) {
  return (
    <Pressable
      onPress={aoEscolher}
      accessibilityRole="radio"
      accessibilityLabel={nome}
      accessibilityState={{ checked: escolhido }}
      className={cn(
        'mb-2 min-h-[56px] justify-center rounded-md border px-4 py-3',
        escolhido ? 'border-primary bg-primary-soft' : 'border-border bg-surface',
      )}
    >
      <Text
        className={cn(
          'text-lg leading-6',
          escolhido ? 'font-sans-bold text-primary-dark' : 'font-sans text-ink',
        )}
      >
        {nome}
      </Text>
    </Pressable>
  );
}

function confirmarTrocaDeServidor(aguardando: number): Promise<boolean> {
  const envios = aguardando === 1 ? '1 envio pendente irá' : `${aguardando} envios pendentes irão`;

  return new Promise((resolver) => {
    Alert.alert('Trocar de servidor?', `${envios} para o novo servidor.`, [
      { text: 'Voltar', style: 'cancel', onPress: () => resolver(false) },
      { text: 'Trocar', style: 'destructive', onPress: () => resolver(true) },
    ]);
  });
}

/** A mesma tela nas "Opções avançadas" do login e no botão Configurações (regra 25). */
export function TelaConfiguracoes({ titulo, aoTerminar, rodape }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [endereco, setEndereco] = useState('');
  const [erroEndereco, setErroEndereco] = useState<string | null>(null);
  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [estoquePadrao, setEstoquePadrao] = useState<number | null>(null);
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<Teste>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;

    void obterRepositorio()
      .then(carregarConfiguracoes)
      .then((dados) => {
        if (cancelado) return;
        setEndereco(dados.endereco);
        setEstoquePadrao(dados.estoque_padrao_id);
        setEstoques(dados.estoques);
        setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  function enderecoValido(): string | null {
    const resultado = normalizarEndereco(endereco);
    if (!resultado.ok) {
      setErroEndereco(resultado.erro);
      return null;
    }
    setErroEndereco(null);
    return resultado.endereco;
  }

  async function testarConexao() {
    const destino = enderecoValido();
    if (!destino) return;

    setTestando(true);
    setTeste(null);
    try {
      const lista = await listarEstoques(destino);
      setEstoques(lista);
      setTeste({ situacao: 'ok', mensagem: `Conexão certa. ${lista.length} estoques encontrados.` });
    } catch (erro) {
      setTeste({ situacao: 'erro', mensagem: toFriendlyError(erro).message });
    } finally {
      setTestando(false);
    }
  }

  async function salvar() {
    const destino = enderecoValido();
    if (!destino) return;

    setSalvando(true);
    try {
      const repositorio = await obterRepositorio();
      if (await enderecoVaiMudar(repositorio, destino)) {
        const aguardando = await quantosAguardamEnvio(repositorio);
        if (aguardando > 0 && !(await confirmarTrocaDeServidor(aguardando))) return;
      }

      await salvarConfiguracoes(repositorio, {
        endereco: destino,
        estoque_padrao_id: estoquePadrao,
      });
      aoTerminar();
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <ScreenContainer scroll={false} contentClassName="items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text className="mb-6 font-sans-bold text-2xl leading-8 text-ink">{titulo}</Text>

      <FormField
        label="Endereço do servidor (IP e porta)"
        value={endereco}
        onChangeText={(texto) => {
          setEndereco(texto);
          setErroEndereco(null);
          setTeste(null);
        }}
        placeholder="192.168.0.10"
        keyboardType="url"
        autoCorrect={false}
        error={erroEndereco ?? undefined}
        testID="config-endereco"
      />

      <PrimaryButton
        label="Testar conexão"
        variant="secondary"
        onPress={() => void testarConexao()}
        loading={testando}
        testID="config-testar"
      />

      {teste ? (
        <Text
          className={cn(
            'mt-3 font-sans text-base leading-6',
            teste.situacao === 'ok' ? 'text-primary-dark' : 'text-danger',
          )}
          testID="config-teste"
        >
          {teste.mensagem}
        </Text>
      ) : null}

      <Text className="mb-2 mt-6 font-sans-medium text-sm leading-5 text-ink-secondary">
        Estoque padrão
      </Text>
      <View accessibilityRole="radiogroup">
        {estoques.map(({ id_almox_estoque: id, nome }) => (
          <OpcaoDeEstoque
            key={id}
            nome={nome}
            escolhido={estoquePadrao === id}
            aoEscolher={() => setEstoquePadrao(id)}
          />
        ))}
        <OpcaoDeEstoque
          nome="Nenhum"
          escolhido={estoquePadrao === null}
          aoEscolher={() => setEstoquePadrao(null)}
        />
      </View>
      {estoques.length === 0 ? (
        <Text className="mb-2 font-sans text-sm leading-5 text-ink-secondary">
          Toque em Testar conexão para ver os estoques.
        </Text>
      ) : null}

      <PrimaryButton
        label="Salvar"
        className="mt-6"
        onPress={() => void salvar()}
        loading={salvando}
        testID="config-salvar"
      />

      {rodape}
    </ScreenContainer>
  );
}
