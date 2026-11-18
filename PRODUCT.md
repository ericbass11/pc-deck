# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Uso pessoal: o celular (Android) fica apoiado ao lado do PC de trabalho e funciona como painel de atalhos, no lugar de um Stream Deck físico.

## Product Purpose
PC Deck abre apps e sites no PC com um toque no celular e mostra o uso de CPU, RAM e GPU do PC em tempo real. Sucesso = tocar e o app abrir no PC sem pensar, como numa tecla física.

## Positioning
Substitui o hardware Stream Deck por um PWA próprio, com ações fixas no PC (o celular só envia o id da tecla) e acesso privado via Tailscale.

## Operating Context
Mesa de trabalho, celular em pé ao lado do monitor, olhado de relance. Agente Node local (`pc-deck/server.js`), PWA servido via `tailscale serve` em HTTPS. Botões definidos em `pc-deck/deck.json`.

## Capabilities and Constraints
- Ações: `app` (AUMID), `exe`, `url` (Chrome/Edge). Sem comando livre.
- Monitor: CPU (Node), RAM (os), GPU (contador Windows, Intel integrada).
- Botões atuais: Claude, Codex (app OpenAI/ChatGPT), Gemini (app desktop), Microsoft Teams, VS Code, YouTube, Google, Outlook (Edge), GitHub.
- Tela cheia: manifest `display: fullscreen`; no navegador entra no primeiro toque e há botão para alternar.
- Sem dependências npm; sem build step.

## Brand Commitments
- Referência visual vinculante do usuário: hardware Elgato Stream Deck (versão sóbria, sem RGB). Teclas só com ícone, sem rótulo visível. Monitor em faixa acima das teclas.
- Ícones reais de cada ferramenta (em `pc-deck/public/icons/`).

## Evidence on Hand
Ícones oficiais extraídos dos apps instalados (Claude, OpenAI/Codex, VS Code, Outlook) e dos sites (YouTube, Google, GitHub).

## Product Principles
1. Um toque, uma ação: nada entre o dedo e o PC.
2. Ler de relance: estado (online, carga do PC) visível sem foco.
3. Parecer e responder como hardware.
4. Seguro por padrão: o celular nunca define o que o PC executa.
