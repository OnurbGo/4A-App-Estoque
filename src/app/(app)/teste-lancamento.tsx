import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { obterRepositorio } from '@/banco';
import { EmptyState, PrimaryButton, ScreenContainer } from '@/components';
import { telaDeTesteLigada } from '@/features/teste/ligada';
import { podeAdicionarFoto } from '@/regras/foto';
import { recentesDoEstoque } from '@/regras/recentes';
import { responsaveisDisponiveis, type OpcaoResponsavel } from '@/regras/responsaveis';
import { agoraDepois, calcularSaldos } from '@/regras/saldo-local';
import type { Estoque, Produto } from '@/regras/tipos';
import { tirarFoto, type FotoTirada } from '@/services/fotos';
import { registrarLancamento, registrarResponsavel } from '@/sync/registrar';
import { colors } from '@/theme';
import { cn } from '@/utils/cn';
import { formatQuantidade } from '@/utils/format';

const QUANTIDADE_DE_TESTE = 1;
const LIMITE_DA_LISTA = 8;

async function lerDadosDeTeste() {
  const repositorio = await obterRepositorio();
  const [config, bootstrap] = await Promise.all([
    repositorio.lerConfig(),
    repositorio.lerBootstrap(),
  ]);
  if (!bootstrap) return null;

  const { dados, iniciado_em: inicio } = bootstrap;
  const operacoes = await repositorio.listarOperacoesEmAberto(inicio);
  const estoque =
    dados.estoques.find(({ id_almox_estoque: id }) => id === config.estoque_padrao_id) ??
    dados.estoques[0];
  if (!estoque) return null;

  const saldos = calcularSaldos(dados.produtos_por_estoque, operacoes, inicio);
  const recentes = recentesDoEstoque(dados, estoque.id_almox_estoque, operacoes, inicio);

  return {
    estoque,
    saldos,
    produtos: [...dados.produtos].sort(
      (a, b) =>
        Number(recentes.includes(b.id_almox_produto)) -
        Number(recentes.includes(a.id_almox_produto)),
    ),
    responsaveis: responsaveisDisponiveis(dados, operacoes, inicio),
  };
}

type OpcaoProps = { nome: string; escolhido: boolean; aoEscolher: () => void };

function Opcao({ nome, escolhido, aoEscolher }: OpcaoProps) {
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
      <Text className="font-sans text-lg leading-6 text-ink">{nome}</Text>
    </Pressable>
  );
}

function montarLancamento(
  estoque: Estoque,
  responsavel: OpcaoResponsavel,
  produto: Produto,
  fotos: readonly FotoTirada[],
) {
  return {
    dados: {
      tipo: 'SAIDA' as const,
      motivo: 'OUTROS' as const,
      motivo_texto: 'Teste do app',
      estoque_id: estoque.id_almox_estoque,
      ...('responsavel_id' in responsavel
        ? { responsavel_id: responsavel.responsavel_id }
        : { responsavel_client_id: responsavel.responsavel_client_id }),
      itens: [{ produto_id: produto.id_almox_produto, quantidade: QUANTIDADE_DE_TESTE }],
    },
    nomes: {
      responsavel: responsavel.nome,
      estoque: estoque.nome,
      produtos: { [produto.id_almox_produto]: produto.nome },
    },
    fotos,
  };
}

function TelaDeTeste() {
  const router = useRouter();
  const cliente = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ['teste-lancamento'], queryFn: lerDadosDeTeste });

  const [responsavelChave, setResponsavelChave] = useState<string | null>(null);
  const [produtoId, setProdutoId] = useState<number | null>(null);
  const [fotos, setFotos] = useState<FotoTirada[]>([]);
  const [registrados, setRegistrados] = useState(0);
  const [salvando, setSalvando] = useState(false);

  if (isPending) {
    return (
      <ScreenContainer scroll={false} contentClassName="items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
      </ScreenContainer>
    );
  }

  if (!data) {
    return (
      <ScreenContainer>
        <EmptyState
          title="Ainda sem dados do servidor"
          description="Conecte o aparelho uma vez, para baixar os cadastros, e abra esta tela de novo."
        />
        <PrimaryButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  const { estoque, saldos, produtos, responsaveis } = data;
  const responsavel = responsaveis.find(({ chave }) => chave === responsavelChave);
  const produto = produtos.find(({ id_almox_produto: id }) => id === produtoId);

  const [previa] = produto
    ? agoraDepois(saldos, {
        tipo: 'SAIDA',
        estoque_id: estoque.id_almox_estoque,
        itens: [{ produto_id: produto.id_almox_produto, quantidade: QUANTIDADE_DE_TESTE }],
      })
    : [];

  async function fotografar() {
    const foto = await tirarFoto();
    if (foto) setFotos((atuais) => [...atuais, foto]);
  }

  async function registrar() {
    if (!responsavel || !produto) return;

    setSalvando(true);
    try {
      await registrarLancamento(montarLancamento(estoque, responsavel, produto, fotos));
      setFotos([]);
      setRegistrados((total) => total + 1);
      await cliente.invalidateQueries({ queryKey: ['teste-lancamento'] });
    } finally {
      setSalvando(false);
    }
  }

  async function cadastrarResponsavel() {
    await registrarResponsavel(`Responsável teste ${new Date().toLocaleTimeString('pt-BR')}`);
    await cliente.invalidateQueries({ queryKey: ['teste-lancamento'] });
  }

  return (
    <ScreenContainer>
      <Text className="font-sans-bold text-2xl leading-8 text-ink">Lançamento de teste</Text>
      <Text className="mb-6 mt-1 font-sans text-base leading-6 text-ink-secondary">
        Saída de {QUANTIDADE_DE_TESTE} em {estoque.nome}. Esta tela é só para testar a fila.
      </Text>

      <Text className="mb-2 font-sans-medium text-sm leading-5 text-ink-secondary">
        Responsável
      </Text>
      {responsaveis.slice(0, LIMITE_DA_LISTA).map(({ chave, nome }) => (
        <Opcao
          key={chave}
          nome={nome}
          escolhido={chave === responsavelChave}
          aoEscolher={() => setResponsavelChave(chave)}
        />
      ))}
      <PrimaryButton
        label="Cadastrar responsável de teste"
        variant="secondary"
        onPress={() => void cadastrarResponsavel()}
        testID="teste-responsavel"
      />

      <Text className="mb-2 mt-6 font-sans-medium text-sm leading-5 text-ink-secondary">
        Produto
      </Text>
      {produtos.slice(0, LIMITE_DA_LISTA).map(({ id_almox_produto: id, nome }) => (
        <Opcao
          key={id}
          nome={nome}
          escolhido={id === produtoId}
          aoEscolher={() => setProdutoId(id)}
        />
      ))}

      {produto && previa ? (
        <View className="mb-2 mt-2" testID="teste-previa">
          <Text className="font-sans-medium text-lg leading-6 text-ink">
            Agora {formatQuantidade(previa.agora, produto.unidade)} → Depois{' '}
            {formatQuantidade(previa.depois, produto.unidade)}
          </Text>
          {previa.vai_ficar_negativo ? (
            <Text className="font-sans-bold text-base leading-6 text-danger">
              Vai ficar negativo
            </Text>
          ) : null}
        </View>
      ) : null}

      <PrimaryButton
        label={fotos.length > 0 ? `Tirar outra foto (${fotos.length})` : 'Tirar foto'}
        variant="secondary"
        className="mt-4"
        disabled={!podeAdicionarFoto(fotos.length)}
        onPress={() => void fotografar()}
        testID="teste-foto"
      />

      <PrimaryButton
        label="Registrar saída de teste"
        className="mt-4"
        disabled={!responsavel || !produto}
        loading={salvando}
        onPress={() => void registrar()}
        testID="teste-registrar"
      />

      {registrados > 0 ? (
        <Text className="mt-3 font-sans-medium text-base leading-6 text-primary-dark" testID="teste-registrados">
          {registrados} registrados nesta tela
        </Text>
      ) : null}

      <PrimaryButton label="Voltar" variant="ghost" className="mt-2" onPress={() => router.back()} />
    </ScreenContainer>
  );
}

export default function TesteLancamento() {
  if (!telaDeTesteLigada()) return <Redirect href="/" />;
  return <TelaDeTeste />;
}
