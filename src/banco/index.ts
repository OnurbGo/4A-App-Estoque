import * as SQLite from 'expo-sqlite';
import type { BancoSql } from './banco-sql';
import { migrar } from './migracoes';
import { criarRepositorio, type Repositorio } from './repositorio';

const NOME_DO_ARQUIVO = 'estoque4a.db';

/** `synchronous = FULL`: lançamento confirmado sobrevive a uma queda de energia. */
async function abrirBanco(): Promise<BancoSql> {
  const banco = await SQLite.openDatabaseAsync(NOME_DO_ARQUIVO);
  await banco.execAsync(
    'PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;',
  );

  return {
    execAsync: (sql) => banco.execAsync(sql),
    runAsync: (sql, parametros) => banco.runAsync(sql, parametros),
    getAllAsync: <T>(sql: string, parametros: Parameters<BancoSql['runAsync']>[1]) =>
      banco.getAllAsync<T>(sql, parametros),
    withTransactionAsync: (tarefa) => banco.withTransactionAsync(tarefa),
  };
}

let aberto: Promise<Repositorio> | null = null;

export function obterRepositorio(): Promise<Repositorio> {
  aberto ??= abrirBanco()
    .then(async (banco) => {
      await migrar(banco);
      return criarRepositorio(banco);
    })
    .catch((erro: unknown) => {
      aberto = null;
      throw erro;
    });
  return aberto;
}

export type {
  BootstrapLocal,
  ConfigAparelho,
  FotoNova,
  Repositorio,
  SessaoLocal,
} from './repositorio';
