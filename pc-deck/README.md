# PC Deck

Stream Deck caseiro: o celular vira um painel de atalhos do PC, com monitor de CPU, RAM e GPU.

- `server.js`: agente no PC (Node puro, sem `npm install`)
- `public/`: o app do celular (PWA)
- `deck.json`: os botões. Edite e recarregue o app no celular; não precisa reiniciar o agente.

## 1. Ligar o agente

```bat
start.cmd
```

Por padrão ele só escuta em `127.0.0.1:8787`, sem nada exposto na rede.

## 2. Deixar o celular alcançar o PC (Tailscale, HTTPS)

Uma vez só, no PC:

```bat
tailscale serve --bg 8787
```

Isso publica o agente em `https://<nome-do-pc>.<sua-tailnet>.ts.net`, visível **só para os aparelhos da sua tailnet**. O celular precisa ter o app Tailscale logado na mesma conta. Funciona no Wi-Fi e no 4G.

Para desfazer: `tailscale serve reset`.

> Sem Tailscale: `start.cmd --lan` abre em `http://<ip-do-pc>:8787` na rede local. Funciona, mas sem HTTPS o Chrome não instala como app (vira só um atalho).

## 3. Parear e instalar

1. No PC, abra `http://127.0.0.1:8787/pair`.
2. Escaneie o QR com a câmera do celular.
3. No Chrome do celular: menu ⋮ → **Instalar app**.

O QR carrega a chave de acesso. Para desparear todo mundo, use **Gerar nova chave** na mesma página.

## 4. Iniciar junto com o Windows (opcional)

`Win+R` → `shell:startup` → crie um atalho para `start.cmd` (dá para marcar "Executar: Minimizada").

## Tipos de ação no `deck.json`

| tipo  | campos                    | exemplo                                                |
|-------|---------------------------|--------------------------------------------------------|
| `app` | `aumid`                   | apps da Store/Iniciar; ache o ID com `Get-StartApps`   |
| `exe` | `path`, `args` (opcional) | aceita `%LOCALAPPDATA%` etc.                           |
| `url` | `browser`, `url`          | `browser` = chave de `browsers` (`chrome`, `edge`)     |

Cada botão tem `id`, `label` (só para leitor de tela; a tecla mostra apenas o ícone) e `image`, um PNG ou SVG em `public/icons/`, de preferência 256 px e com fundo transparente. O deck tem 15 teclas por página (3×5 em pé, 5×3 deitado). Para mais teclas, crie outro item em `pages`; os pontos de página aparecem sozinhos.

Ao adicionar um ícone, inclua o caminho na lista `SHELL` de `public/sw.js` e suba a versão de `CACHE`, para que ele também funcione offline.

### Origem dos ícones

- **Dos apps instalados:**
  - Claude, Codex (logo da OpenAI) e Outlook: pasta `assets` dos pacotes da Store.
  - Teams: tile do pacote `MSTeams`, recortado para 256 px.
  - VS Code: quadro de 256 px do `code.ico`.
  - Gemini: `%LOCALAPPDATA%\Google\Gemini\app-*\resources\app.asar.unpacked\assets\icon.png`.
- **Dos sites oficiais:**
  - YouTube e Google: favicons via `google.com/s2/favicons`.
  - GitHub: `github.githubassets.com/favicons/favicon-dark.svg`.

Apps desktop que não são da Store também funcionam como `app`: o `aumid` é o AppID mostrado por `Get-StartApps` (ex.: `com.google.gemini.windows`).

## Tela cheia

Instalado como app, ele abre em tela cheia, sem barra de status e sem barra de navegação. Se você instalou antes desta versão, desinstale e instale de novo para o Android aplicar o modo novo. Aberto no navegador, a tela cheia liga no primeiro toque, e o botão de cantos no topo direito alterna.

A fonte (Barlow Condensed, licença OFL) fica em `public/fonts/` e funciona offline.

## Segurança

- O celular só manda o **id** do botão; o que é executado está fixo no `deck.json` do PC. Não existe rota para comando livre.
- Toda chamada exige a chave (`Authorization: Bearer`); errar a chave custa 400 ms por tentativa.
- A página de pareamento só abre no próprio PC (bloqueada via Tailscale e via LAN) e não carrega nenhum script de fora.
- O agente recusa pedidos endereçados a outro domínio (proteção contra *DNS rebinding*) e POST vindo de outro site.
- `.token` é a chave. Não versione esse arquivo.

### Antes de usar, leia

- **Não exponha na internet.** Nada de `tailscale funnel`, ngrok, Cloudflare Tunnel ou redirecionamento de porta no roteador. O `tailscale serve` já deixa o painel visível só para os seus aparelhos.
- **`--lan` só em rede de casa.** Sem HTTPS, a chave passa aberta pela rede. Em Wi-Fi público, de trabalho ou de hotel, use o Tailscale.
- **O `deck.json` é seu.** Os caminhos que vêm no repositório são de exemplo. Revise o que cada tecla executa antes de ligar o agente.
- **Celular perdido ou chave vazada:** abra `http://127.0.0.1:8787/pair` e use **Gerar nova chave**.

## Monitor

- **CPU:** tempos dos núcleos via Node (funciona em Windows em qualquer idioma).
- **RAM:** `os.totalmem/freemem`.
- **GPU:** contador do Windows `GPU Engine(*engtype_3D)`, o mesmo do Gerenciador de Tarefas, lido por um PowerShell contínuo. Ele só roda enquanto o app está aberto no celular e desliga 30 s depois.
