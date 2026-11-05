# Estoque 4A

App Android dos tablets do Almoxarifado. O plano fica no repositório do Gestão 4A, em `docs/refatoracao/PLANO-ALMOXARIFADO.md` (partes A.10 e A.11, regras do negócio e decisões D1 a D26).

## Stack

- Expo SDK 58, React Native 0.88, React 19.3, Node 22.13+.
- expo-router 58, com grupos `(auth)` e `(app)` e `Stack.Protected`.
- NativeWind 4.2.7 com Tailwind 3. A documentação dele só vai até o SDK 57: se trocar a versão, valide num APK.
- expo-sqlite, expo-secure-store, zustand, React Query, react-hook-form, zod, axios.
- Jest 30, jest-expo e Testing Library 14. O SQL da fila roda de verdade nos testes, com `sql.js`.

Instale pacotes com `npx expo install`, que escolhe a versão do SDK. O `react-dom` fica fixo na versão do React.

## Comandos

| O quê | Comando |
|---|---|
| Testes | `npm test` |
| Tipos | `npm run typecheck` |
| Cobertura das regras | `npx jest --coverage --collectCoverageFrom='src/regras/**/*.ts'` |
| Configuração do Expo | `npx expo-doctor` |
| Bundle Android | `npx expo export --platform android --output-dir <pasta fora do repositório>` |
| APK | `npx eas-cli@latest build --platform android --profile teste` |

## Estrutura

```
src/app/          telas e rotas
src/regras/       funções puras: fila, saldo local, recentes, Repetir, Pendências, indicador
src/banco/        expo-sqlite: migrações e repositório
src/sync/         motor de envio, com banco e API por porta
src/services/     cliente HTTP, credenciais, API dos tablets, fotos
src/features/     telas compostas
src/stores/       estado global (zustand)
```

- **`src/regras/` é pura e testada:** sem Expo, sem React Native e sem tela, com 100% de ramos cobertos. Regra de negócio nova entra aqui, não na tela.
- Toda escrita no banco passa pelo repositório, uma de cada vez: a transação do `expo-sqlite` não é exclusiva.
- Migração nova entra no fim de `MIGRACOES`. Nunca altere uma que já foi instalada: a fila do tablet não pode se perder.

## Regras que não podem quebrar

- `TENTAR_NOVAMENTE` fica na fila, e operação presa aparece em Pendências (D23).
- O saldo nunca bloqueia nada: pode ficar negativo.
- Nada de valor, preço ou custo no app.
- Sair da conta não apaga fila, `config` nem bootstrap.
- Só o 401 no novo login encerra a sessão. Sem rede, o tablet segue offline.
- `dados` vai igual para o servidor, que recusa campo a mais: nomes ficam em `nomes`.
- Sem endereço de servidor padrão no código nem no `eas.json`.
- Senha e token só no `expo-secure-store` (D2).

## Git

- Um commit por passo, em português: `feat(app): ...`, `fix(app): ...`, `chore: ...` ou `docs: ...`.
- Sem `Co-Authored-By`, "Generated with Claude Code" ou outra assinatura do Claude em commits e PRs.
- Sem push e sem PR sem o ok do Bruno.
- Branch `feat/almox-<id da parte>-<assunto>` a partir da `main`.
