import type { BancoSql } from './banco-sql';

/** Só acrescente versões no fim: a fila do tablet não pode se perder numa atualização do app. */
export const MIGRACOES: readonly string[] = [
  `
  CREATE TABLE operacoes (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL CHECK (tipo IN ('RESPONSAVEL_CRIAR', 'LANCAMENTO_CRIAR')),
    dados TEXT NOT NULL,
    nomes TEXT,
    status TEXT NOT NULL DEFAULT 'PENDENTE'
      CHECK (status IN ('PENDENTE', 'ENVIADO', 'ERRO', 'RECUSADO')),
    tentativas INTEGER NOT NULL DEFAULT 0,
    mensagem TEXT,
    id_servidor INTEGER,
    criado_em TEXT NOT NULL,
    enviado_em TEXT,
    proxima_tentativa_em TEXT
  );
  CREATE INDEX idx_operacoes_status ON operacoes (status);

  CREATE TABLE anexos_pendentes (
    client_id TEXT PRIMARY KEY,
    lancamento_client_id TEXT NOT NULL REFERENCES operacoes (client_id),
    caminho TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'RECUSADO')),
    tentativas INTEGER NOT NULL DEFAULT 0,
    mensagem TEXT,
    proxima_tentativa_em TEXT,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE cache_bootstrap (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    dados TEXT NOT NULL,
    iniciado_em TEXT NOT NULL
  );

  CREATE TABLE config (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );

  CREATE TABLE sessao (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    conta_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    entrou_em TEXT NOT NULL
  );
  `,
];

export async function migrar(banco: BancoSql, migracoes = MIGRACOES): Promise<void> {
  const [linha] = await banco.getAllAsync<{ user_version: number }>('PRAGMA user_version', []);
  const versaoAtual = linha?.user_version ?? 0;

  for (const [indice, sql] of migracoes.entries()) {
    const versao = indice + 1;
    if (versao <= versaoAtual) continue;

    await banco.withTransactionAsync(async () => {
      await banco.execAsync(sql);
      await banco.execAsync(`PRAGMA user_version = ${versao}`);
    });
  }
}
