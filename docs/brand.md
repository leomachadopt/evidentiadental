# Identidade visual — EvidentiaDental (Dental Biz Hub)

Paleta extraída de `frontend/tailwind.config.js`, `frontend/src/styles/index.css` e
`frontend/index.html`. Use estes hexes em emails, materiais e qualquer comunicação.

## Navy (`primary`) — cor dominante
Cor-chave **`#1e3352`** (`primary-600`) · também é o `theme-color` do browser.

| Token | Hex | Uso |
|---|---|---|
| primary-50 | `#f0f4f9` | fundos de info, badges, tags |
| primary-100 | `#d8e4ef` | — |
| primary-200 | `#b1c8de` | blobs mesh, bordas de info |
| primary-300 | `#7fa3c0` | blobs mesh, borda card hover |
| primary-400 | `#4e7da1` | borda input em foco |
| primary-500 | `#2f5a7e` | anel de foco |
| **primary-600** | **`#1e3352`** | **botão primário, links, ícones, theme-color** |
| primary-700 | `#172843` | hover do botão, nav ativa, texto escuro |
| primary-800 | `#101e33` | fundos escuros, gradiente login |
| primary-900 | `#0a1422` | fim do gradiente login |

## Gold (`gold`) — acento
Cor-chave **`#bf9535`** (`gold-500`). Usar só em destaques — nunca como fundo do botão principal.

| Token | Hex | Uso |
|---|---|---|
| gold-50 | `#fdf8ed` | caixa de destaque |
| gold-100 | `#f8efd0` | badge "Anual", blob mesh |
| gold-200 | `#f0d99b` | anel card premium, blob mesh |
| gold-300 | `#e5c165` | acento de texto (sidebar login) |
| gold-400 | `#d4a73c` | borda card premium |
| **gold-500** | **`#bf9535`** | **destaques de texto na landing** |
| gold-600 | `#a37c28` | texto auxiliar |
| gold-700 | `#85631e` | texto de badge |

## Neutros
- Fundo do site: `#eef3f7`
- Texto/UI secundária: escala `slate` do Tailwind
- Texto suave (rodapés/labels): `#64748b`, `#94a3b8`

## Gramática da marca
- **Navy = estrutura e ação.** Botões primários: fundo `#1e3352`, **texto branco**, hover `#172843`.
- **Gold = destaque pontual.** Palavras-chave, badges, card premium.
- **Gradiente de marca:** `#172843 → #101e33 → #0a1422`.

## Spec para emails (MailerLite + alertas)

> O `update_automation_email` da API MailerLite só altera texto simples — o **estilo
> (botões/cores) aplica-se no editor visual** de cada automação. Usar estes valores aí.

- **Título (H2):** `color:#1e3352`
- **Botão CTA** (navy, texto branco):
  ```html
  <a href="https://evidentiadental.vercel.app/billing"
     style="background:#1e3352;color:#ffffff;padding:12px 22px;border-radius:8px;
            text-decoration:none;font-weight:bold;display:inline-block">Texto do botão</a>
  ```
- **Hover do botão:** `#172843`
- **Acento de texto (gold):** `<strong style="color:#bf9535">…</strong>`
- **Rodapé / assinatura co-marca:**
  ```html
  <p style="color:#64748b;font-size:13px;margin-top:20px">Equipa EvidentiaDental — Dental Biz Hub</p>
  ```
- **Links da app** (login/billing) apontam para `evidentiadental.vercel.app`.
- **Remetente:** `evidentia@dentalbizhub.com`, nome `EvidentiaDental · Dental Biz Hub`.

O alerta interno (n8n → Gmail) já usa estes hexes no HTML que gera.
