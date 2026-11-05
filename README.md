# Estoque 4A

App dos tablets do Almoxarifado do Gestão 4A. Registra saídas, entradas, movimentações, aplicações e abastecimentos nos quatro estoques, mesmo sem internet, e envia tudo quando a conexão volta.

O plano do app está em `docs/refatoracao/PLANO-ALMOXARIFADO.md`, no repositório do Gestão 4A (partes A.10 e A.11).

## Desenvolvimento

Precisa do Node 22.13 ou mais novo.

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

O Expo Go não serve para este projeto: use o APK do perfil `development` ou o do perfil `teste`.

## Gerar o APK

O build é feito pelo EAS, na nuvem. O build local não é recomendado aqui: precisa do Android SDK completo, e caminho com espaço e acento, como `Área de Trabalho`, costuma quebrar o Gradle.

Só na primeira vez, para criar o projeto na sua conta Expo:

```bash
npx eas-cli@latest init
```

Depois, escolha o perfil:

| Perfil | Para quê |
|---|---|
| `teste` | Teste da fila: mostra o botão "Lançamento de teste". Provisório, sai na A.11 |
| `preview` | APK normal, sem a tela de teste |
| `development` | Desenvolvimento, com o Metro |

```bash
npx eas-cli@latest build --platform android --profile teste
```

Ao terminar, o EAS mostra o link e o QR Code do APK.

## Instalar no tablet

1. No tablet, abra o link do APK ou leia o QR Code, e baixe o arquivo.
2. Toque no arquivo baixado. Se o Android pedir, permita instalar apps desta origem.
3. Abra o **Estoque 4A**.

## Preparar o servidor no notebook

O tablet fala com o nginx do Gestão 4A, na porta 80. Só o backend e o banco no ar não bastam: o backend não publica porta para fora do Docker.

No repositório do Gestão 4A, confira se os três estão no ar:

```bash
docker compose ps
```

Se o nginx não aparecer:

```bash
docker compose up -d nginx
```

Descubra o IP do notebook na rede Wi-Fi (linha "Endereço IPv4"):

```bash
ipconfig
```

O tablet e o notebook precisam estar na mesma rede. Se a conexão falhar, libere a porta 80 no Firewall do Windows para redes privadas e confira se a rede Wi-Fi está marcada como privada.

A conta dos tablets precisa ter só o módulo `ALMOXARIFADO_TABLET`, com visualizar e criar.

## Primeira configuração no tablet

1. No login, toque em **Opções avançadas**.
2. Digite o IP do notebook. Se a porta for a 80, não precisa informá-la. Exemplo: `192.168.0.10`.
3. Toque em **Testar conexão**: os estoques aparecem na lista.
4. Escolha o estoque padrão, ou **Nenhum**, e toque em **Salvar**.
5. Entre com o e-mail e a senha da conta dos tablets.

O endereço e o estoque padrão continuam salvos depois de sair da conta. Para mudá-los depois de entrar, use o botão **Configurações**, que pede a senha da conta.

## Como o app guarda e envia

- Tudo que é registrado vai primeiro para o SQLite do aparelho. Só depois o app tenta enviar.
- O envio dispara ao abrir o app, quando a conexão volta, depois de cada lançamento e a cada 2 minutos.
- Em erro de rede, espera 1, 2, 5 e 10 minutos entre tentativas.
- A tela **Pendências**, aberta pelo indicador do início, mostra o que ainda não chegou ao servidor.
- Lançamento recusado ou parado não pode ser apagado no tablet: a correção é feita no sistema, em Baixa manual.
