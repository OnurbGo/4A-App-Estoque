import { create } from 'zustand';
import { obterRepositorio } from '@/banco';
import { definirEndereco } from '@/services/api-client';
import { toFriendlyError } from '@/services/errors';
import { entrarNaConta } from '@/services/tablet-api';
import {
  lerCredenciais,
  lerEmail,
  lerToken,
  limparCredenciais,
  salvarCredenciais,
} from '@/services/token-storage';

const SENHA_MUDOU = 'A senha da conta mudou. Entre de novo.';

type SessionState = {
  /** A leitura inicial do aparelho terminou. */
  pronto: boolean;
  autenticado: boolean;
  email: string | null;
  aviso: string | null;
  falhaAoIniciar: string | null;
  iniciar: () => Promise<void>;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  sessaoEncerrada: () => void;
};

/**
 * Com credenciais salvas entra direto, sem rede: o tablet tem que abrir offline. Quem decide se a
 * senha ainda vale é o servidor, no primeiro 401 (D2).
 */
export const useSessionStore = create<SessionState>((set) => ({
  pronto: false,
  autenticado: false,
  email: null,
  aviso: null,
  falhaAoIniciar: null,

  iniciar: async () => {
    try {
      const repositorio = await obterRepositorio();
      const { endereco } = await repositorio.lerConfig();
      definirEndereco(endereco);

      const [credenciais, token, email] = await Promise.all([
        lerCredenciais(),
        lerToken(),
        lerEmail(),
      ]);
      set({ pronto: true, autenticado: Boolean(credenciais && token), email });
    } catch (erro) {
      set({ pronto: true, falhaAoIniciar: toFriendlyError(erro).message });
    }
  },

  entrar: async (email, senha) => {
    const { token, usuario } = await entrarNaConta(email, senha);
    await salvarCredenciais({ email, senha, token });

    const repositorio = await obterRepositorio();
    await repositorio.salvarSessao({
      conta_id: usuario.conta_id,
      nome: usuario.nome,
      email: usuario.email,
      entrou_em: new Date().toISOString(),
    });

    set({ autenticado: true, email, aviso: null });
  },

  sair: async () => {
    await limparCredenciais();
    const repositorio = await obterRepositorio();
    await repositorio.limparSessao();
    set({ autenticado: false, aviso: null });
  },

  sessaoEncerrada: () => {
    set({ autenticado: false, aviso: SENHA_MUDOU });
    void obterRepositorio().then((repositorio) => repositorio.limparSessao());
  },
}));
