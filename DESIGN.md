# Nóis Desentupidora 2.1

Direção: serviços locais, linguagem industrial e atendimento direto. A marca existente é
o recurso visual central; não há fotografias, depoimentos, certificações ou métricas inventadas.

## Tokens
| Papel | Valor |
| --- | --- |
| Azul profundo / títulos e seções institucionais | #10234C |
| Azul institucional / marca e controles | #29378C |
| Azul de foco | #2563EB |
| Ciano derivado do logo / detalhes | #39A9D6 |
| Superfície clara | #EAF1FA |
| Branco | #FFFFFF |
| WhatsApp / contato | #16803D |
| Texto secundário | #526176 |

Variáveis em :root de styles.css. Fundo branco, linhas discretas, raio padrão de 4px.
Verde indica contato, não uma condição comercial. Sem gradientes, pulse ou blur decorativo.
Logo original preservado; object-fit recorta apenas a área transparente em sua apresentação.
Tipografia: Bahnschrift para títulos, Segoe UI para corpo, com fallbacks locais Arial/sans-serif.
Não há download de fontes. Espaçamento de seção fluido de 56px a 96px,
com blocos comerciais e institucionais compactos quando o conteúdo permite.

## Composição
Cabeçalho com o logo real, WhatsApp e navegação por âncoras. Hero em duas colunas no
desktop e leitura vertical no celular: serviço e região no H1, slogan separado e painel
compacto de emergência. O logo não é repetido no hero; o relógio vetorial comunica horário.
Faixa azul de benefícios sem cards. Serviços organizados em dois grupos com sete entradas,
mantendo as âncoras antigas. Seção azul diferencia residências, empresas e condomínios.
Diferenciais com estrutura própria, nota fiscal e garantia, seguidos do institucional.
Oferta em superfície clara com condição de equivalência visível e pagamentos integrados.
Regiões com as cinco cidades já existentes. FAQ nativo details/summary em duas colunas no
desktop e uma no celular, operável sem JavaScript. Rodapé preserva os dados comerciais.
Termos recebem a mesma tipografia e paleta.

O institucional separa título e about-copy sem placeholder público. Fotografias reais
podem ser incluídas futuramente em uma figure dentro de about-layout, ajustando essa grade;
fornecer dimensões explícitas, texto alternativo e imagem comprimida. Nenhuma fotografia
de equipe, serviço ou veículo foi simulada.

## Interação e acessibilidade
Link para pular ao conteúdo; alvo main focável; navegação visível sem menu dependente de JS.
Foco visível, controles de contato com área de toque, contraste mínimo calculado 4.5:1
nas principais combinações normais. Isso não equivale a uma auditoria WCAG completa.
Formulário mantém três perguntas e todos os seletores. Emojis decorativos dos rótulos
foram retirados; opções, valores, backend e mensagem do WhatsApp não mudaram.
Modal com cabeçalho claro, seleção azul, conteúdo rolável e rodapé de ações próprio.
O complemento usa visualViewport somente com modal aberto para ajustar altura/posição
quando o teclado reduz a área visível; os listeners são removidos ao fechar. O campo
focado permanece no corpo rolável e o zoom continua sob controle do navegador.
Consentimento mantém lógica e IDs; ações de aceitar/recusar continuam explícitas.
Banner mais compacto, com botões de mesma largura, contraste e altura mínima de 44px.
No celular, o flutuante fica oculto enquanto o banner estiver aberto para não cobrir
o CTA principal. Cabeçalho e hero mantêm contato protegido; decidir revela o flutuante.
prefers-reduced-motion respeitado. Conteúdo principal não depende de animação de entrada.

## Complemento do pedido 2.1

O anexo complementar foi incorporado: FAQ de 13 perguntas, priorizando horário, região,
gratuidade e cobertura de orçamento, depois públicos, pagamentos, garantia e técnicas.
Texto da cobertura: “Apresente o orçamento recebido. Cobrimos orçamentos de serviços equivalentes.”
O H1 permanece direto e visível; o CTA mobile ocupa a largura disponível. A redução
de margens e do banner permite ver o CTA acima do banner em 320/375 × 667px. Alturas
menores podem exigir rolagem; o botão do cabeçalho permanece disponível.

SEO: title/description/OG locais, charset no início, um H1 por página e links dos
termos apontando para os serviços da página inicial. JSON-LD usa o tipo oficial
[Plumber](https://schema.org/Plumber), área Grande São Paulo, sete serviços e pagamentos
confirmados. Canonical, sitemap, robots e coexistência com o domínio antigo preservados.

Capturas e relatórios do complemento estão em output/playwright/v21-complemento-*.
Lighthouse 13.6.0 no servidor local: mobile e desktop com 100 em desempenho,
acessibilidade, boas práticas e SEO. São execuções únicas de laboratório, sem cookies
autorizados e sem concluir o desafio real; não representam dados de usuários nem
auditoria integral de acessibilidade. Detalhes e condições em DEPLOY.md.

## Limites
Revisar em Preview o desafio real do Turnstile, tags publicadas e teclado virtual
de Android/iOS. Validação local não comprova entrega da mensagem no aplicativo.
A oferta “Cobrimos qualquer orçamento!” usa a condição confirmada pelo proprietário:
serviços equivalentes. Visita e orçamento gratuitos, 3x sem juros, equipe/veículos próprios
e emissão de nota fiscal também foram confirmados. Garantia sem prazo ou cobertura
inventados: “Consulte as condições da garantia”. Nenhuma experiência, avaliação ou prazo
de chegada foi acrescentado. A pergunta de regiões agora usa a resposta do complemento:
“Atendemos a Grande São Paulo.” As cinco cidades anteriores continuam na seção de áreas.
