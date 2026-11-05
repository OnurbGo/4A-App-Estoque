import initSqlJs from 'sql.js';
import type { BancoSql, ParametroSql } from '@/banco/banco-sql';
import { migrar } from '@/banco/migracoes';
import { criarRepositorio } from '@/banco/repositorio';

/** O mesmo SQL do aparelho, em memória: a fila é testada contra um SQLite de verdade. */
export async function bancoEmMemoria(): Promise<BancoSql> {
  const SQL = await initSqlJs();
  const banco = new SQL.Database();
  banco.run('PRAGMA foreign_keys = ON');

  function consultar<T>(sql: string, parametros: ParametroSql[]): T[] {
    const comando = banco.prepare(sql);
    comando.bind(parametros);
    const linhas: T[] = [];
    while (comando.step()) linhas.push(comando.getAsObject() as T);
    comando.free();
    return linhas;
  }

  return {
    async execAsync(sql) {
      banco.exec(sql);
    },
    async runAsync(sql, parametros) {
      banco.run(sql, parametros);
      const changes = banco.getRowsModified();
      const [{ id }] = consultar<{ id: number }>('SELECT last_insert_rowid() AS id', []) as [
        { id: number },
      ];
      return { changes, lastInsertRowId: id };
    },
    async getAllAsync<T>(sql: string, parametros: ParametroSql[]) {
      return consultar<T>(sql, parametros);
    },
    async withTransactionAsync(tarefa) {
      banco.run('BEGIN');
      try {
        await tarefa();
        banco.run('COMMIT');
      } catch (erro) {
        banco.run('ROLLBACK');
        throw erro;
      }
    },
  };
}

export async function repositorioEmMemoria() {
  const banco = await bancoEmMemoria();
  await migrar(banco);
  return { banco, repositorio: criarRepositorio(banco) };
}
