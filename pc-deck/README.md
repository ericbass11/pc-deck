# PC Deck

Stream Deck caseiro: o celular vira um painel de atalhos do PC, com monitor de CPU, RAM e GPU.

- `server.js`: agente no PC (Node puro, sem `npm install`)
- `public/`: o app do celular (PWA) e o editor
- `deck.json`: as teclas. Edite pelo editor visual (`/editar`) ou à mão; o celular atualiza sozinho, sem reiniciar o agente.
- `tools/app-icon.ps1`: tira o ícone de um app do menu Iniciar (usado pelo editor)

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

> Sem Tailscale: `start.cmd --lan` abre em `http://<ip-do-pc>:8787` na rede local. Funciona, mas sem HTTPS o Chrome não instala como app e o ditado por voz não funciona.

## 3. Parear e instalar

1. No PC, abra `http://127.0.0.1:8787/pair`.
2. Escaneie o QR com a câmera do celular.
3. No Chrome do celular: menu ⋮ → **Instalar app**.

O QR carrega a chave de acesso. Para desparear todo mundo, use **Gerar nova chave** na mesma página.

## 4. Montar o deck no editor

No PC, abra **`http://127.0.0.1:8787/editar`**. O editor só abre no próprio PC: pelo Tailscale ou pela rede ele é bloqueado.

- **Grade igual à do celular** (3×5, em pé). Clique numa tecla para editar; arraste para mudar de lugar.
- **Apps do Iniciar numa lista:** digite o nome do app e o editor preenche o AppID.
- **Ícones:** "Ícone do app" pede ao Windows o ícone do app escolhido; "Ícone do site" busca o favicon em 256 px; "Escolher…" abre a galeria e aceita envio de PNG/SVG.
- **Testar no PC** roda a ação na hora, antes de salvar.
- **Salvar** (ou `Ctrl+S`) valida tudo e grava o `deck.json`. A versão anterior fica em `deck.json.bak`. O celular percebe a mudança em até 2 s.

## 5. Iniciar junto com o Windows (opcional)

`Win+R` → `shell:startup` → crie um atalho para `start.cmd` (dá para marcar "Executar: Minimizada").

## Recursos

### Teclas vivas

A tecla mostra o estado do PC em tempo real:

- **App aberto:** um LED verde acende no canto da tecla quando o app está rodando, e o ícone fica esmaecido quando está fechado. No `deck.json`: `"live": { "type": "process", "name": "ms-teams" }`. Use `"path"` com um trecho do caminho para separar apps com o mesmo nome de processo (o Claude Desktop e o Claude Code, por exemplo, se chamam `claude`).
- **Tocando agora:** capa do álbum (ou do vídeo), título e se está pausado, de qualquer app que aparece no controle de mídia do Windows (Spotify, YouTube no navegador etc.). No `deck.json`: `"live": { "type": "media" }`, numa tecla de atalho `media_play_pause`.

O estado é lido por um PowerShell contínuo que só roda enquanto o app está aberto no celular.

### Pastas

Uma tecla pode abrir um grupo de até 14 teclas; a primeira tecla da pasta vira "voltar". Sem ícone, a pasta mostra as miniaturas das 4 primeiras teclas, e o topo do celular mostra o nome dela. Pastas podem ter pastas, até 3 níveis.

```json
{ "id": "midia", "label": "Mídia", "folder": [ ...teclas... ] }
```

### Capturar ideia por voz

A tecla abre uma tela de ditado: fale, revise o texto e toque em **Salvar**. A ideia entra numa linha com data e hora no arquivo definido no `deck.json`, que pode ser uma nota do seu cofre do Obsidian:

```md
- **2026-11-18 15:56** Criar uma tecla que abre o projeto do dia no VS Code
```

O ditado usa o reconhecimento de voz do Chrome (que envia o áudio ao serviço do Google) e precisa de HTTPS, o que já acontece via Tailscale. Sem ditado, dá para digitar, inclusive com o microfone do teclado do celular. O celular manda só o texto; o arquivo de destino é fixo no PC.

### Atalhos de teclado

A tecla aperta uma combinação no PC, na janela que estiver em foco: `ctrl+shift+m` (microfone do Teams), `win+shift+s` (recorte), teclas de mídia e volume. Para uma sequência, use uma lista: `["win+r", "enter"]`. O editor grava a combinação direto do teclado do PC.

Nomes aceitos: `ctrl`, `shift`, `alt`, `win`, `a`–`z`, `0`–`9`, `f1`–`f24`, `enter`, `esc`, `tab`, `space`, `backspace`, `delete`, `insert`, `home`, `end`, `pageup`, `pagedown`, `up`, `down`, `left`, `right`, `printscreen`, `capslock`, `minus`, `equal`, `comma`, `period`, `slash`, `semicolon`, `quote`, `backquote`, `bracketleft`, `bracketright`, `backslash`, `media_play_pause`, `media_next`, `media_prev`, `media_stop`, `volume_mute`, `volume_down`, `volume_up`.

O Windows não deixa um programa comum mandar teclas para janelas abertas como administrador; nesses casos o atalho não chega.

## Tipos de ação no `deck.json`

| tipo   | campos                    | exemplo                                                |
|--------|---------------------------|--------------------------------------------------------|
| `app`  | `aumid`                   | apps da Store/Iniciar; o editor lista todos            |
| `exe`  | `path`, `args` (opcional) | aceita `%LOCALAPPDATA%` etc.                           |
| `url`  | `browser`, `url`          | `browser` = chave de `browsers` (`chrome`, `edge`)     |
| `keys` | `keys`                    | `"ctrl+shift+m"` ou `["win+r", "enter"]`               |
| `idea` | `file`                    | `"%USERPROFILE%\\Documents\\PC Deck\\ideias.md"`       |

Cada tecla tem `id` (único no deck), `label` (para leitor de tela e para teclas sem ícone) e `image` opcional, um PNG/JPG/WEBP/SVG em `public/icons/`, de preferência 256 px com fundo transparente. Em vez de `action`, uma tecla pode ter `folder` (pasta). O deck tem 15 teclas por página (3×5 em pé, 5×3 deitado); com mais de uma página, aparecem pontos para trocar.

### Origem dos ícones

- **Dos apps instalados:**
  - Claude, Codex (logo da OpenAI) e Outlook: pasta `assets` dos pacotes da Store.
  - Teams: tile do pacote `MSTeams`, recortado para 256 px.
  - VS Code: quadro de 256 px do `code.ico`.
  - Gemini: `%LOCALAPPDATA%\Google\Gemini\app-*\resources\app.asar.unpacked\assets\icon.png`.
  - Explorador, Ferramenta de Captura, Termius e Docker: ícone do Shell do Windows (o mesmo de `tools/app-icon.ps1`).
- **Dos sites oficiais:**
  - YouTube e Google: favicons via `google.com/s2/favicons`.
  - GitHub: `github.githubassets.com/favicons/favicon-dark.svg`.
- **Glifos próprios** (voltar, pasta, ideia, mídia, volume): SVGs feitos para o projeto.

## Tela cheia

Instalado como app, ele abre em tela cheia, sem barra de status e sem barra de navegação. Se você instalou antes desta versão, desinstale e instale de novo para o Android aplicar o modo novo. Aberto no navegador, a tela cheia liga no primeiro toque, e o botão de cantos no topo direito alterna.

A fonte (Barlow Condensed, licença OFL) fica em `public/fonts/` e funciona offline.

## Segurança

- O celular só manda o **id** da tecla; o que é executado está fixo no `deck.json` do PC. Não existe rota para comando livre. A única coisa que o celular envia além do id é o texto de uma ideia, que só é gravado no arquivo definido pelo PC.
- O editor e o pareamento só abrem no próprio PC (bloqueados via Tailscale e via LAN), recusam POST vindo de outro site e não carregam nenhum script de fora.
- Toda chamada do celular exige a chave (`Authorization: Bearer`); errar a chave custa 400 ms por tentativa.
- O agente recusa pedidos endereçados a outro domínio (proteção contra *DNS rebinding*).
- SVGs enviados pelo editor são servidos sem permissão de rodar script.
- `.token` é a chave. Não versione esse arquivo.

### Antes de usar, leia

- **Não exponha na internet.** Nada de `tailscale funnel`, ngrok, Cloudflare Tunnel ou redirecionamento de porta no roteador. O `tailscale serve` já deixa o painel visível só para os seus aparelhos.
- **`--lan` só em rede de casa.** Sem HTTPS, a chave passa aberta pela rede. Em Wi-Fi público, de trabalho ou de hotel, use o Tailscale.
- **O `deck.json` é seu.** Os caminhos que vêm no repositório são de exemplo. Revise o que cada tecla executa antes de ligar o agente.
- **Atalhos de teclado agem na janela em foco.** Quem tem a chave do celular aperta as combinações que você cadastrou. Evite cadastrar sequências perigosas (como abrir um terminal e apertar Enter).
- **Celular perdido ou chave vazada:** abra `http://127.0.0.1:8787/pair` e use **Gerar nova chave**.

## Monitor

- **CPU:** tempos dos núcleos via Node (funciona em Windows em qualquer idioma).
- **RAM:** `os.totalmem/freemem`.
- **GPU:** contador do Windows `GPU Engine(*engtype_3D)`, o mesmo do Gerenciador de Tarefas, lido por um PowerShell contínuo. Ele só roda enquanto o app está aberto no celular e desliga 30 s depois.
