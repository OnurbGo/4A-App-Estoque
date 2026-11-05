export type ParametroSql = string | number | null;

/** A parte do `expo-sqlite` que o app usa; nos testes, o mesmo SQL roda no `sql.js`. */
export interface BancoSql {
  execAsync(sql: string): Promise<void>;
  runAsync(
    sql: string,
    parametros: ParametroSql[],
  ): Promise<{ changes: number; lastInsertRowId: number }>;
  getAllAsync<T>(sql: string, parametros: ParametroSql[]): Promise<T[]>;
  withTransactionAsync(tarefa: () => Promise<void>): Promise<void>;
}

export type EmTransacao = <T>(tarefa: () => Promise<T>) => Promise<T>;

/**
 * A transação do `expo-sqlite` não é exclusiva: outra escrita pode entrar nela, e um rollback da
 * sincronização levaria junto o lançamento que acabou de ser confirmado. Por isso as escritas do
 * app passam uma de cada vez.
 */
export function criarTransacaoSerial(banco: BancoSql): EmTransacao {
  let ultima: Promise<unknown> = Promise.resolve();

  return function emTransacao<T>(tarefa: () => Promise<T>): Promise<T> {
    const atual = ultima.then(async () => {
      let resultado: T | undefined;
      await banco.withTransactionAsync(async () => {
        resultado = await tarefa();
      });
      return resultado as T;
    });

    ultima = atual.catch(() => undefined);
    return atual;
  };
}
