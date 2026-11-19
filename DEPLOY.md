# NÓIS Desentupidora — implantação e validação

Atualizado em 12/11/2026. Site estático com função Node na Vercel. Layout, informações comerciais, SEO e as três perguntas foram preservados. Nenhuma configuração externa foi alterada e nenhum deploy foi executado.

## Correções implementadas

- Siteverify no backend exige success estritamente verdadeiro, hostname DNS válido presente em lista exata e action exatamente qualification. Ausência ou divergência rejeita a solicitação.
- O frontend envia action qualification; renderização explícita, remoção do widget antes de destruir o container e nova verificação em cada tentativa.
- Timeout de 8 segundos cobre a consulta e leitura JSON do Cloudflare. Erros HTTP, rede ou JSON retornam 502; timeout retorna 504. Nenhuma dessas falhas entrega whatsappUrl.
- Frontend tem timeout de 15 segundos, AbortController e identificadores de sessão e etapa. Fechar, reabrir ou trocar de etapa invalida callbacks e respostas anteriores, mesmo quando o transporte não respeita cancelamento.
- Tokens utilizados não são reenviados na mesma sessão. O botão de nova tentativa recria a verificação em vez de reutilizar o token.
- Bairro restaurado por input.value; mensagens de erro por textContent. Nenhuma entrada do usuário é interpolada em HTML.
- Voltar retorna da verificação para urgência; progresso da verificação fica em 100%, separado das três perguntas. Serviço e urgência recuperam a seleção visual.
- Um listener de clique por botão; teclado nativo para botões; origem terms_header/terms_float somente em termos.html.
- Bootstrap oficial GTM nas duas páginas, mesmo contêiner GTM-55MN7ZRV, com noscript. CSP permite o iframe GTM. Os demais cabeçalhos e a rota da Vercel foram preservados.
- Link principal WhatsApp abre outra aba e mantém o modal disponível. Alternativa explícita abre na mesma aba. URL retornada é validada para HTTPS, host wa.me e caminho numérico.
- Botão de fechar com área de toque de 44px, foco inicial, retorno ao botão de origem, retenção de Tab no modal, Escape e setas nas opções.
- CORS fica somente na função; cabeçalhos duplicados foram removidos de vercel.json. Respostas da API usam Cache-Control: no-store.
- Handler CommonJS (module.exports), sem pacote ou dependência adicional.

## Variáveis da Vercel

Configure em Settings → Environment Variables, separadamente para Production e Preview.

| Variável | Uso |
| --- | --- |
| TURNSTILE_SECRET_KEY | Obrigatória. Secret real do widget; nunca colocar no HTML, JavaScript público ou repositório. |
| EXPECTED_HOSTNAMES | Lista explícita de hostnames separados por vírgula, sem esquema, porta, caminho ou curingas. Ex.: noisdesentupidora.com.br,www.noisdesentupidora.com.br. |
| EXPECTED_HOSTNAME | Compatibilidade com configuração anterior de um único hostname; usada se EXPECTED_HOSTNAMES não estiver definida. |
| ALLOWED_ORIGIN | Origens completas separadas por vírgula, sem barra final. Ex.: https://www.noisdesentupidora.com.br,https://www.noisdesentupidora.com.br. |
| WHATSAPP_NUMBER | Número comercial em formato internacional, apenas 10 a 15 dígitos. Atual: 5511950566792. |
| WHATSAPP_MESSAGE_EMOJIS | Ausente ou false: sem emojis fixos (padrão temporário). true: somente diagnóstico, reativar após validar o percurso externo. |

Sem configuração explícita, os defaults incluem www.noisdesentupidora.com.br, noisdesentupidora.com.br e nois-desentupidora.vercel.app, com origens HTTPS equivalentes. Variáveis explícitas substituem essas listas; confira os valores completos na seção de migração.

WHATSAPP_NUMBER mantém o valor comercial atual como fallback; configure a variável para facilitar manutenção. Número inválido configurado retorna 500 e não libera URL.

TURNSTILE_ACTION deixou de ser configurável: o valor obrigatório é qualification em frontend e backend. Remova valores antigos para evitar confusão.

TURNSTILE_SITE_KEY não é lida por este site estático. A chave pública está em CONFIG.turnstileSiteKey no script.js; altere ali ao trocar de widget. Sua exposição é normal. O número do WhatsApp também não deve ser tratado como segredo: clientes recebem a URL após validação.

## Cloudflare — ajustes manuais

1. Conferir se a sitekey de script.js e TURNSTILE_SECRET_KEY pertencem ao mesmo widget.
2. Em Hostname Management, autorizar apenas os domínios necessários; manter localhost e domínios de teste fora do widget de produção.
3. Conferir EXPECTED_HOSTNAMES da Vercel: somente hosts que realmente servem o site. Nenhum subdomínio é autorizado implicitamente pelo backend.
4. A action é enviada pelo código como qualification; o backend exige esse valor. Não depende de configurar uma action no painel.
5. Executar um desafio real em Preview autorizado e depois no domínio de produção. Chaves fictícias de teste não comprovam hostname/action de produção.

Referências oficiais:
- [Validação server-side](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Renderização e remoção do widget](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)
- [Chaves de teste](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)

## CORS e proteção contra abuso

CORS é uma política do navegador, não autenticação. A função rejeita Origin informado fora da lista. Requisições sem Origin continuam permitidas, mas precisam passar pela mesma validação completa do Turnstile. Omitir ou falsificar Origin não remove essa exigência.

A API aceita POST e OPTIONS; outros métodos retornam 405. Corpo inválido, token ausente ou acima de 2048 caracteres e qualificações inválidas retornam 400. Falhas de validação do Turnstile retornam 403.

O limitador continua em memória: dez requisições por IP a cada minuto, por instância aquecida. Registros vencidos são eliminados; o mapa tem capacidade de 10.000 entradas. Quando cheio, novos IPs seguem para a validação normal do Turnstile sem ganhar registro local, preservando disponibilidade.

Limitações:
- Instâncias e regiões não compartilham contagem; reinícios perdem o estado.
- Não garante limite global nem proteção contra ataque distribuído.
- Clientes atrás de um mesmo IP podem compartilhar a cota. O frontend respeita Retry-After e permite repetir a verificação após o prazo.
- O IP vem de x-forwarded-for na infraestrutura Vercel. Se migrar de hospedagem, revisar quais proxies e cabeçalhos são confiáveis.

Não foi contratado nem integrado Redis ou qualquer serviço adicional. Monitorar volume, erros 429 e reclamações antes de justificar outra solução. A limitação local é complementar ao Turnstile.

## GTM e mensuração — revisão manual

| Evento | Significado |
| --- | --- |
| whatsapp_intent | Uma abertura do formulário; origem header, hero, price, float, terms_header ou terms_float. |
| qualification_completed | Dados validados pelo backend, com Turnstile aprovado; não confirma atendimento. |
| whatsapp_redirect | Primeira tentativa de abrir WhatsApp naquela sessão; não prova abertura do aplicativo, envio de mensagem ou conversa. |
| lead_qualified | Reservado para confirmação offline; não é disparado automaticamente e não há integração offline implementada. |

Fechar e reabrir inicia uma nova sessão e pode produzir nova intenção legítima. Dois links de saída na mesma sessão geram um único whatsapp_redirect. Novas verificações na mesma sessão não duplicam qualification_completed.

No GTM Preview/Tag Assistant:
1. Conferir um bootstrap por página e um evento por etapa.
2. Conferir origens em index.html e termos.html.
3. Revisar tags disparadas por eventos personalizados e também por cliques automáticos: não deixar ambos enviarem a mesma conversão ao mesmo destino.
4. Conferir GA4 DebugView e Google Ads; não tratar todas as etapas do funil como contatos confirmados.
5. Não alterar Ads/GTM publicados sem revisão e autorização específicas.

Referência: [Data layer e inicialização GTM](https://developers.google.com/tag-platform/tag-manager/datalayer).

## Testes automatizados gratuitos

Pré-requisito: Node 22 ou superior com WebSocket global; execução validada com Node 24.15.0.

    node --check script.js
    node --check api/verify-turnstile.js
    node --check tests/backend.test.cjs
    node --check tests/browser.cjs
    node --test tests/backend.test.cjs
    node tests/browser.cjs

O último comando requer Chrome/Chromium instalado. No Windows, usa por padrão C:/Program Files/Google/Chrome/Application/chrome.exe. Para outro local, defina CHROME_PATH com o caminho do executável antes de executar.

tests/backend.test.cjs carrega a função em contexto isolado e simula somente a comunicação com o Cloudflare. Não usa segredo real ou rede. Testa hostnames e actions válidos/ausentes/inválidos, lista explícita, erros HTTP/JSON/rede/timeout, CORS, corpo, campos, token, configuração e limite local.

tests/browser.cjs abre Chrome headless com perfil temporário e servidor HTTP local, aplicando a CSP definida no vercel.json. Somente no servidor de teste substitui GTM e Turnstile por simuladores e respostas da API por respostas controladas. Não altera o HTML de produção, não envia contatos e não mede integração externa. O perfil temporário é removido ao terminar.

Resultado em 12/11/2026:
- 37 testes de backend aprovados.
- 65 verificações em Chrome aprovadas, incluindo carregamento explícito e recuperação em index.html e termos.html, além de aplicação da CSP real do vercel.json.
- Inclui Enter/Espaço nativos, campos obrigatórios, injeção de bairro, seleções e Voltar, expiração e reutilização de token, resposta e callback antigos, cancelamento, timeout, erro HTTP/JSON, URL inválida, Retry-After, saída alternativa e eventos.
- Layout sem overflow horizontal em 320, 375 e 768px; botão fechar com largura de 44px em 375px. Medidas realizadas após a animação.

Esses testes não validam configuração de produção, reputação de IP, desafios reais, abertura do aplicativo WhatsApp, entrega da mensagem, iOS/Safari, leitores de tela nem todos os tamanhos de tela.

## Execução local e publicação

Para integração completa, usar Vercel CLI já disponível/instalada e executar vercel dev. Um servidor estático sozinho não executa a função. Configure ambiente local separado e hostname/origem de desenvolvimento explícitos. Não enfraqueça as listas de produção para fazer testes locais.

Checklist antes da publicação:

- [ ] Revisar diff considerando as alterações locais que já existiam antes desta correção.
- [ ] Executar os comandos de sintaxe e os dois conjuntos de testes.
- [ ] Configurar segredo, domínios, origens e número na Vercel para o ambiente escolhido.
- [ ] Validar em Preview a rota POST /api/verify-turnstile; não receber HTML, 404 ou erro de runtime.
- [ ] Fazer uma verificação real: hostname e action esperados, mensagem comercial correta.
- [ ] Simular falha no Cloudflare e confirmar que não há link de WhatsApp liberado.
- [ ] Testar fechar/reabrir durante validação e usar Voltar nas três perguntas e verificação.
- [ ] Testar WhatsApp em Android, iPhone e computador; conferir link alternativo na mesma aba.
- [ ] Revisar foco, teclado, zoom e modal com teclado virtual aberto.
- [ ] Conferir CSP no console e cabeçalhos HTTP reais. Se tags publicadas precisarem de outros destinos, autorizar apenas os necessários após inspeção.
- [ ] Conferir GTM Preview e ausência de conversões duplicadas no destino.
- [ ] Publicar somente após essas verificações e observar erros 403/429/502/504 e atendimento.

## Pendências e limites conhecidos

Não foram acessados painéis Cloudflare/GTM/Vercel nem realizados deploy ou alterações externas. O contêiner publicado e os destinos precisam de inspeção manual para excluir duplicações adicionais.

A CSP mantém unsafe-inline para o bootstrap e os estilos existentes, mas unsafe-eval foi removido. Não foram alteradas regras do contêiner. Se o GTM publicado usar variáveis do tipo JavaScript personalizado, verificar no Tag Assistant se dependem de eval; o Google recomenda Custom Templates como alternativa. Não reativar eval automaticamente para resolver bloqueios de rede.

O banner existente agora implementa Consent Mode v2 básico, com aceitação/recusa explícitas e GTM bloqueado até autorização. Consulte a seção de Consent Mode ao final deste guia.

O Turnstile protege a emissão da URL pela API, mas não impede contato direto com um número comercial já conhecido, nem confirma que um contato é cliente. Não há promessa de ocultação permanente do número ou de identificação de conversa iniciada.


## Correção do Preview: carregamento Turnstile e CSP

O script assíncrono usa render=explicit e onload=onNoisTurnstileLoad. Os callbacks globais de sucesso/erro são definidos antes da tag externa nas duas páginas. Não há chamada a turnstile.ready(), que era incompatível com async/defer.

script.js espera o callback por uma Promise compartilhada, validando sessão e etapa antes de renderizar. Após erro de carregamento, Tentar novamente pode recarregar a API, mantendo somente uma tag ativa. Se o callback não chegar em 10 segundos, o formulário mostra erro recuperável. Após renderizar, callbacks de erro, expiração, timeout e navegador incompatível são tratados; há também prazo máximo de 120 segundos para widget silencioso. Fechar ou trocar de etapa limpa o temporizador do widget. Nunca há liberação do WhatsApp por falha de carregamento ou de verificação.

CSP ajustada segundo [Google Tag Manager — CSP](https://developers.google.com/tag-platform/security/guides/csp):
- script-src: acrescentados www.googleadservices.com e www.google.com; preservados os scripts já permitidos e removido unsafe-eval.
- connect-src: acrescentados www.googletagmanager.com, www.googleadservices.com, googleads.g.doubleclick.net, ad.doubleclick.net, pagead2.googlesyndication.com, www.google.com e www.google.com.br.
- img-src: substituído o HTTPS irrestrito pela lista de origens do site, Cloudflare, Analytics, GTM e Ads. A origem regional Google Brasil é explícita; não há curinga genérico.
- frame-src: preservados os iframes Cloudflare/GTM já autorizados; não há evidência que justifique ampliar esta diretiva para os bloqueios relatados.
- Nenhuma regra de conversão, tag ou destino externo foi alterado.

Referência de renderização: [Cloudflare — explicit rendering e onload callback](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/#using-onload-callback).

Os testes passam a fazer o simulador lançar erro se ready() for chamado, evitando repetir a regressão. Os testes de CSP interceptam as requisições externas no Chrome e respondem localmente, sem enviar dados ao Google. Casos de timeout de 10/120 segundos usam relógio acelerado apenas no teste. Foram verificados destinos permitidos para conexão, script e imagem e bloqueio de destinos não autorizados.

Ainda validar no Preview real:
- Recarregar sem cache e confirmar os novos cabeçalhos HTTP; nenhuma CSP adicional deve continuar bloqueando esses destinos.
- Completar um desafio real em index.html e termos.html, fechar/reabrir e testar rede indisponível.
- Conferir hostname autorizado de Preview e action qualification no backend.
- Conferir tags publicadas no GTM/Tag Assistant: variáveis JavaScript personalizadas, requisições regionais e scripts adicionais podem exigir análise específica. Não autorizar domínios amplos nem eval automaticamente.
- Nenhum deploy de Production foi executado.


## Diagnóstico real dos emojis — 12/11/2026

Evidência externa reproduzida com texto sintético, sem enviar conversa:
- Entrada de wa.me decodificada: 🛠️ 📍 ⏰.
- Entrada codificada: %F0%9F%9B%A0%EF%B8%8F%20%F0%9F%93%8D%20%E2%8F%B0.
- O 302 de wa.me retornou Location em api.whatsapp.com com text equivalente a � � �.
- Texto retornado codificado: %EF%BF%BD%20%EF%BF%BD%20%EF%BF%BD.
- A rota com barra final apresentou a mesma falha. O acesso direto a api.whatsapp.com também exibiu substituições no HTML.
- Mensagens sem emojis com Olá, Serviço, São João e Urgência foram preservadas no redirecionamento real.
- A corrupção foi observada no percurso HTTP externo, independentemente do projeto/Vercel. Não atribuímos o problema a uma versão específica do software WhatsApp ou descartamos particularidades da rota/região de rede.

As respostas bem-sucedidas do Preview fornecido não puderam ser examinadas: página, script.js e API responderam 401, Protected by Vercel Authentication. Não foi desativada nem contornada essa proteção. Portanto:
A. Corrupção na resposta HTTP do Preview: ainda não observada diretamente.
B. Corrupção no JavaScript do Preview: ainda não observada diretamente.
C. Corrupção no redirecionamento externo: reproduzida com requisições reais em Python e Node, após comprovar o text correto na URL de entrada.

Nos arquivos locais, não foi encontrado U+FFFD nem UTF-8 inválido. Não há Buffer, atob, btoa ou conversão de bytes no percurso de produção da mensagem. O backend usa encodeURIComponent uma vez; o frontend faz response.json(), new URL() e atribuição a href. A URL transportada no JSON é ASCII com percent-encoding; uma mera ausência de charset não explica, por si só, a troca seletiva dos emojis. Content-Type agora é explicitamente application/json; charset=utf-8.

Mitigação aplicada:
- Mensagem padrão sem os emojis fixos, mantendo serviço, localização, urgência, acentos e demais informações.
- WHATSAPP_MESSAGE_EMOJIS ausente ou false mantém essa alternativa. Somente true habilita os emojis para diagnóstico; não reativar até validar o redirecionamento e WhatsApp Web reais.
- Nenhum endpoint novo, relaxamento de segurança, alteração de GTM, layout, SEO ou script.js foi necessário.
- Nenhum deploy foi realizado.

### Testes de integração

    node --test tests/backend.test.cjs
    node --test tests/http-integration.test.cjs
    node tests/browser.cjs
    node tests/browser.cjs --http

Resultado:
- 37 testes unitários aprovados, incluindo 16 combinações com emojis no modo de diagnóstico.
- 5 testes HTTP locais aprovados: handler do projeto em servidor Node real, bytes UTF-8, JSON, URL, falhas e rejeição sem token. Os 2 testes de rede são ignorados por padrão.
- 65 verificações da regressão de navegador aprovadas.
- 17 verificações HTTP + Chrome aprovadas: nas duas páginas, modo padrão e modo com emojis, URL recebida por HTTP comparada aos dois links e captura segura.
- 2 testes externos opcionais executados: mensagem padrão preservada e falha com emojis registrada no Location real.

Para repetir os testes de rede no PowerShell:

    $env:NOIS_LIVE_WHATSAPP = '1'
    node --test tests/http-integration.test.cjs
    Remove-Item Env:NOIS_LIVE_WHATSAPP

O teste HTTP usa tests/helpers/http-function.cjs e executa o handler real. Adapta res.status/res.json sobre ServerResponse de Node e substitui APENAS Siteverify por outro servidor HTTP local, com credenciais fictícias. Não usa .env.local e não reproduz todo o runtime hospedado da Vercel. O modo --http do Chrome usa essa resposta de rede, em vez de fabricar JSON no navegador. Os testes externos fazem somente GET com texto sintético; não autenticam no WhatsApp, não enviam conversa e não comprovam o campo de mensagem do WhatsApp Web.

### Capturar o Preview sem expor tokens

1. Acesse o Preview autenticado, sem mudar sua proteção.
2. DevTools → Sources → Snippets → New snippet.
3. Copie o conteúdo local de tests/preview-probe.js e execute ANTES de concluir o formulário.
4. Preencha com dados fictícios e aguarde o botão final, sem clicar nele ainda.
5. No Console, copie somente a linha NOIS_WHATSAPP_DIAGNOSTIC. Ela contém status, Content-Type e indicadores; não imprime token, telefone, bairro, mensagem ou URL completa.
6. O observador se remove após a resposta com URL. Para removê-lo manualmente: window.restoreNoisWhatsAppProbe?.(). Recarregar a página também o remove.

Interpretação:
- utf8Valid=false: os bytes recebidos não formam UTF-8 válido.
- api.replacementCount > 0: o text já contém U+FFFD na resposta da API (caso A).
- api íntegra e sameDecodedText=false: API e link divergem (investigar caso B).
- api íntegra, sameDecodedText=true e texto corrompido após abrir WhatsApp: investigar Location de wa.me (caso C, já reproduzido externamente).
- doubleEncodingSuspected=true: sequências percent-encoded de emoji permaneceram após uma decodificação; investigar codificação dupla.
- No modo padrão sem emojis, os três indicadores de emoji false são ESPERADOS; replacementCount deve ser zero.

Verificação manual complementar: Network → Preserve log → /api/verify-turnstile → Headers e Response. Confira Content-Type, status e whatsappUrl. Em seguida, ao abrir WhatsApp, confira a requisição de documento a wa.me e seu Response Header Location. O text deve ser decodificado UMA vez (new URL(url).searchParams.get('text') já decodifica).

Não compartilhe Request Payload, token Turnstile, cookies, Authorization, Copy as cURL nem HAR completo. A chave TURNSTILE_SECRET_KEY nunca deve aparecer no navegador. A aba Response não contém token de validação, mas sua URL inclui os dados do atendimento; mantenha o JSON bruto local e compartilhe somente os indicadores do snippet.

### Checklist específico do Preview

- [ ] Disponibilizar estas alterações SOMENTE em Preview antes de qualquer decisão de Production.
- [ ] Deixar WHATSAPP_MESSAGE_EMOJIS ausente ou false.
- [ ] Conferir status 200, Content-Type UTF-8 e indicadores sem substituição.
- [ ] Confirmar serviço, bairro e urgência no link e na página intermediária.
- [ ] Conferir os acentos no campo do WhatsApp Web, sem enviar a mensagem.
- [ ] Confirmar que uma falha de segurança continua sem liberar URL.
- [ ] Somente reconsiderar emojis após confirmar também o redirecionamento e campo final reais.


## CSP — script de conversão identificado pelo Tag Assistant

O bloqueio real reportado para GTM-55MN7ZRV / tag Clique WhatsApp foi:
https://googleads.g.doubleclick.net/pagead/viewthroughconversion/18556510889/

A diretiva efetiva era script-src-elem, mas a política não a declara explicitamente. Nesse caso, o navegador aplica o fallback script-src. O host já era permitido para connect-src e img-src; essas permissões não autorizam carregamento de scripts.

Correção localizada: acrescentado SOMENTE https://googleads.g.doubleclick.net a script-src, mantendo o fallback. Não foi criada uma script-src-elem parcial que pudesse bloquear os scripts locais, o bootstrap GTM ou o Turnstile. Não foram adicionados curingas nem unsafe-eval. Os outros cabeçalhos e diretivas foram preservados.

connect-src e img-src foram revisados: os destinos Google Ads necessários já estavam listados, incluindo googleads.g.doubleclick.net. Não precisaram de alteração.

Referência: [Google — CSP para GTM/Ads e diagnóstico pelo Tag Assistant](https://developers.google.com/tag-platform/security/guides/csp). A lista geral do Google orienta as permissões por tipo de recurso; a extensão de script-src corresponde ao recurso concreto identificado no contêiner existente.

Validação local:
- node --check tests/browser.cjs: aprovado.
- node tests/browser.cjs: 69 verificações aprovadas com a CSP real do vercel.json.
- Inclui a URL exata de viewthroughconversion carregada como script, conexões/imagens autorizadas e bloqueio de host parecido não autorizado.
- ad.doubleclick.net continua permitido para conexão, mas bloqueado como script.
- A requisição exata foi interceptada e respondida localmente; nenhuma conversão real foi enviada ao Google.
- git diff --check: sem erros de whitespace.

Não foram alterados o contêiner, tags, dataLayer, formulário, WhatsApp, Turnstile, layout ou SEO. Nenhum deploy foi executado.

No Preview, após disponibilizar esta versão: recarregar sem cache, conferir o Content-Security-Policy recebido, executar o fluxo da tag Clique WhatsApp no Tag Assistant e verificar que a URL não apresenta mais violação script-src-elem. Se outro cabeçalho CSP também for aplicado pela infraestrutura, ele precisa ser inspecionado: múltiplas políticas são cumulativas. A confirmação da tag e da conversão real depende dessa validação no Preview.


## Google Consent Mode v2 básico — 12/11/2026

Implementação no código da página, seguindo a alternativa documentada pelo
[Google para consentimento em sites](https://developers.google.com/tag-platform/security/guides/consent).
Não foram acessados nem modificados o contêiner publicado GTM-55MN7ZRV ou as conversões do Google Ads.

### Ordem e bloqueio

consent.js é carregado de forma síncrona no head de index.html e termos.html.
Ele cria dataLayer/gtag e coloca consent default com os quatro parâmetros denied:
ad_storage, analytics_storage, ad_user_data e ad_personalization.

Nenhum script Google/GTM é solicitado antes de autorização. Ao aceitar, ocorre:
1. Persistência da escolha explícita.
2. consent update com os quatro granted.
3. Único bootstrap e carregamento de GTM-55MN7ZRV.
4. Eventos posteriores ao consentimento podem entrar no dataLayer.

Na primeira visita, silêncio, navegação ou ausência de storage não concedem consentimento.
Sem JavaScript, o GTM também não carrega: o antigo iframe noscript foi removido porque
poderia solicitar tags sem uma decisão do visitante. Se consent.js falhar, o GTM permanece bloqueado.

Esta primeira versão oferece escolha CONJUNTA dos quatro tipos: “Aceitar todos”
ou “Recusar opcionais”. O texto do banner explicita estatísticas, medição publicitária,
uso de dados para publicidade e personalização. Não há seleção granular nesta versão;
aceitação autoriza esses quatro tipos e recusa nega todos. Não se inferem permissões adicionais.

### Armazenamento, alteração e revogação

A chave existente cookie_consent_nois é mantida, agora com JSON:
{"version":2,"choice":"accepted"} ou {"version":2,"choice":"rejected"}.

O antigo valor "true" gravado pelo botão “Entendi” não comprova autorização para
as finalidades apresentadas agora: exige nova escolha. JSON inválido ou indisponibilidade
do localStorage inicia negado. Se o storage falhar após clique explícito, a aceitação
vale somente para a página atual; a próxima visita volta ao estado seguro. Se a gravação
falhar ao revogar, tenta-se remover a autorização antiga para não restaurá-la após o reload.

“Preferências de cookies”, no rodapé de ambas as páginas, reabre o MESMO banner.
A recusa após aceitação salva a decisão, enfileira consent update denied na página
atual e recarrega imediatamente. O novo documento restaura denied e não baixa GTM.
A mudança em outra aba também é respeitada por storage event.

O reload é necessário porque retirar uma tag script do DOM não desfaz scripts,
listeners ou temporizadores já executados. Requisições já iniciadas e dados enviados
antes da revogação não podem ser retroativamente cancelados. Esta implementação
não promete apagar cookies de outros domínios; o bloqueio impede a nova carga das tags.

### Eventos e atendimento

whatsapp_intent, qualification_completed e whatsapp_redirect mantêm seus nomes
e condições do funil, mas só são enviados ao dataLayer de mensuração após consentimento.
Interações sem autorização são descartadas, não guardadas para envio retroativo.
Não há lead_qualified automático, novos identificadores pessoais nem evento extra de conversão.

Turnstile, verificação server-side, formulário, URL do WhatsApp e alternativa de saída
continuam independentes da publicidade. A API, vercel.json e os callbacks Turnstile
não foram alterados nesta implementação. A CSP atual permite consent.js via self
e o mesmo único GTM após aceitação; não foram adicionados domínios, eval ou curingas.

O banner mantém sua posição, cores e estrutura. Foram acrescentados recusa, aceitação
explícita e acesso posterior às preferências. O deslocamento do botão WhatsApp usa
a altura real do banner no celular para preservar o acesso ao atendimento.
A seção factual de cookies em termos.html foi atualizada, pois declarava não usar tags.

### Configuração manual no Google Tag Manager

Antes da publicação, no workspace do contêiner existente:
- Habilitar a visão geral de consentimento em Container Settings, se ainda não estiver ativa.
- Revisar se já existem CMPs/tags de Consent Initialization que sobrescrevam estes estados.
  Não instalar uma segunda solução nem criar um default granted conflitante.
- Revisar Consent Settings das tags existentes. Conferir os consentimentos integrados
  das tags Google. Em tags HTML personalizadas/terceiros sem suporte integrado,
  exigir consentimento adicional apropriado (analytics_storage para análise;
  ad_storage, ad_user_data e ad_personalization para publicidade/personalização).
- Não alterar acionadores de conversão, IDs, rótulos ou configurações no Google Ads.
  Não criar uma segunda instalação GTM/Ads para resolver consentimento.
- Nesta solução o default é definido pela página ANTES do bootstrap GTM.
  Não é necessário criar uma tag adicional de default em Consent Initialization.
  Se futuramente migrar para um modelo GTM, usar setDefaultConsentState e
  updateConsentState, na etapa Consent Initialization, removendo o gerenciamento
  redundante da página em uma migração revisada.

O uso das APIs de modelo GTM é a preferência do Google para soluções internas ao
contêiner; esta implementação usa a alternativa de código da página e preserva
a ordem default/update/gtm.js. Não usa Custom HTML para executar consent updates.
As configurações de consentimento das tags publicadas ainda exigem auditoria manual.

### Validar no Tag Assistant / Preview

1. Publicar primeiro SOMENTE a versão Preview. Usar perfil limpo e excluir
   cookie_consent_nois para simular visitante novo.
2. Antes de escolher, verificar Network: não pode haver gtm.js, Analytics ou Ads.
   No modo básico, o Tag Assistant pode estar desconectado ou informar ausência de
   tag Google nesse momento: o contêiner ainda não foi carregado deliberadamente.
3. Clicar “Aceitar todos”. No histórico de eventos/aba Consentimento, confirmar
   default denied para os quatro tipos e update granted antes das tags de medição.
   Conferir que não há outro gerenciador substituindo esse estado.
4. Completar o formulário. Conferir uma ocorrência de cada evento do funil autorizado
   e os Consent Settings da tag Clique WhatsApp, sem mudar a conversão existente.
5. Recarregar e navegar para termos.html: preferência restaurada, update antes das tags,
   mesmo contêiner uma vez por página, banner oculto.
6. Preferências de cookies → Recusar opcionais: confirmar reload e, no Network com
   Preserve log, ausência de novas cargas Google no documento posterior.
   Após o reload negado, a desconexão do Tag Assistant é esperada no modo básico.
7. Repetir em perfil limpo recusando inicialmente: os quatro denied, nenhum GTM;
   formulário e WhatsApp continuam funcionando. Navegar e recarregar não autoriza tags.
8. Aceitar novamente não pode gerar eventos referentes ao atendimento anterior recusado.
9. Validar com o Cloudflare e as tags reais no Preview. Os testes locais não comprovam
   consentimento efetivo no contêiner publicado nem os destinos externos.

### Testes executados

    node --check consent.js
    node --check script.js
    node --check tests/browser.cjs
    node tests/browser.cjs --consent
    node tests/browser.cjs
    node tests/browser.cjs --http --consent
    node --test tests/backend.test.cjs tests/http-integration.test.cjs

Resultados: 30 verificações específicas de consentimento, 69 de regressão de
formulário/eventos/CSP e 17 de HTTP Node + navegador sem consentimento aprovadas.
Backend: 37 unitários e 5 integrações HTTP aprovados; 2 testes externos opcionais
do WhatsApp não foram executados nesta etapa. Todos os checks de sintaxe passaram.

Os testes de consentimento usam o Chrome real com um script GTM simulado para
inspecionar a ordem e evitar coleta real. Cobrem novo visitante, silêncio,
legado, aceitação, recusa, navegação, recarregamento, revogação local/entre abas,
storage bloqueado/inválido, ausência de mensuração retroativa, atendimento negado,
CSP e controles móveis. O modo HTTP executa o handler real com Siteverify simulado.
Nenhum deploy de Production foi realizado.


## Migração de domínio — 18/11/2026

Oficial: https://www.noisdesentupidora.com.br
Transição: https://nois-desentupidora.vercel.app continua servindo as páginas sem redirect.
O domínio apex noisdesentupidora.com.br será redirecionado para www pelo painel Vercel,
conforme configuração do proprietário. Nenhum redirect foi acrescentado ao vercel.json.

Canonical e og:url das duas páginas apontam ao www oficial; JSON-LD usa o mesmo domínio.
As imagens OG/schema usam /imagens/logo.png, arquivo existente, substituindo assets inexistentes.
Sitemap lista somente as duas páginas canônicas; robots permite rastreamento e referencia esse sitemap.
Canonical é indicação aos buscadores, não redirecionamento de visitantes. O endereço antigo permanece
acessível para a campanha. Não bloquear seu rastreamento nem adicionar noindex durante esta transição.
Os perfis sociais e e-mail comerciais foram preservados. A verificação HTML Google foi mantida.

IMPORTANTE: variáveis explícitas substituem os defaults do código. Para manter os dois sites operacionais,
conferir estas listas em Production (sem espaços, caminhos, curingas ou barra final):
EXPECTED_HOSTNAMES=www.noisdesentupidora.com.br,noisdesentupidora.com.br,nois-desentupidora.vercel.app
ALLOWED_ORIGIN=https://www.noisdesentupidora.com.br,https://noisdesentupidora.com.br,https://nois-desentupidora.vercel.app

Esses também são os defaults da função. Hostname e action continuam estritos; não há autorização automática
de outros projetos Vercel. Preview precisa de suas próprias listas explícitas e hostname autorizado.
Manter o hostname antigo no widget Cloudflare junto dos novos durante a campanha.
Não foi possível confirmar variáveis Production ou painel Cloudflare por inspeção de arquivos.

A API continua relativa (/api/verify-turnstile), funcionando em cada origem. Links internos, scripts,
Consent Mode e demais recursos locais continuam relativos. CSP, GTM, eventos e WhatsApp preservados.
Preferências de cookies são locais à origem: a decisão no vercel.app não migra automaticamente para www;
o visitante deve escolher novamente. Não compartilhar tokens ou consentimento entre domínios por URL.

Validação externa antes da publicação:
- Conferir DNS/TLS de www e apex no Registro.br/Vercel, já configurados pelo proprietário.
- Conferir redirect apex → www e ausência de redirect no domínio vercel.app.
- Conferir as listas acima e completar o fluxo real de WhatsApp em ambos os hosts, com consentimento negado e aceito.
- Auditar acionadores GTM existentes filtrados por Page Hostname; incluir o www se houver filtros, sem duplicar tags.
- Verificar propriedade do novo domínio no Search Console (DNS do Registro.br), enviar /sitemap.xml e inspecionar canonicals.
- Confirmar imagens, robots e sitemap por HTTP no novo domínio; cabeçalhos de proteção de Preview não devem ir a Production.
- Planejar futuramente mudança do destino da campanha e redirect do vercel.app, somente após autorização.
Não foi alterado Google Ads nem executado deploy de Production ou git push.


Testes da migração executados:
- node --test tests/backend.test.cjs tests/http-integration.test.cjs tests/domain-migration.test.cjs:
  50 aprovados, 2 testes de rede WhatsApp opcionais ignorados.
- node tests/browser.cjs --consent: 30 verificações aprovadas.
- node tests/browser.cjs: 69 verificações aprovadas.
- node tests/browser.cjs --http --consent: 17 verificações aprovadas.
- Sintaxe da função e git diff --check aprovados.
As integrações usam Siteverify simulado; DNS, TLS, redirects e variáveis dos painéis precisam ser
validados externamente no ambiente publicado. Esses testes não comprovam o Cloudflare de Production.


## Redesign Nóis 2.0 — 18/11/2026

HTML/CSS existentes foram repaginados; nenhum framework ou fonte remota foi adicionado.
Hero, navegação, serviços, aplicações residencial/comercial/condominial, diferenciais,
oferta, rodapé, formulário e apresentação do consentimento seguem DESIGN.md.
A oferta de preço anterior foi removida; o texto comercial novo é o fornecido pelo proprietário.
Promessas de chegada/resposta em minutos foram retiradas, sem acrescentar garantias.

Preservação confirmada por SHA-256 contra o início desta tarefa: api/verify-turnstile.js,
consent.js, vercel.json, sitemap.xml e robots.txt estão idênticos. Os arquivos já tinham
alterações anteriores no workspace; nenhuma foi revertida. Canonical/OG/schema e a migração
foram validados pelos testes existentes. O script.js mudou apenas rótulos visuais dos
passos (retirada de emojis), mantendo lógica, opções, seletores e eventos.

Capturas em output/playwright/: before-*, after-*, modal-* nas larguras 320, 375, 768,
1024 e 1440. after-clean-1440.png mostra a página com consentimento recusado.
terms-375.png registra a página de termos. comparacao.html reúne antes/depois.
As capturas anteriores foram feitas antes de editar, percorrendo as seções para ativar
os reveals antigos. O redesign não depende desses reveals para exibir conteúdo.

Verificações:
- Sem overflow horizontal na página principal, termos e modal nas cinco larguras.
- Playwright: Tab/Enter no atalho focalizam main; Escape fecha modal.
- Inspeção visual desktop, mobile, modal e termos com refinamento de cabeçalho/foco.
- node --test tests/redesign.test.cjs: 3 aprovados (oferta, seletores/atalhos, contraste).
- Suítes backend/HTTP/migração: 50 aprovados; 2 testes de rede opcionais ignorados.
- node tests/browser.cjs --consent: 30 verificações aprovadas.
- node tests/browser.cjs: 69 verificações aprovadas, incluindo deduplicação de eventos e CSP.
- node tests/browser.cjs --http --consent: 17 verificações aprovadas.
- Sintaxe script.js e git diff --check verificados.

Comparação de tamanho bruto (HTML principal + CSS + JS principal):
antes 67.867 bytes; depois aproximadamente 70.813 bytes (+2,9 KB).
O aumento pequeno acompanha mais conteúdo e estados acessíveis. Logo/ícone originais
reutilizados; nenhuma imagem ou biblioteca externa adicional. Não foi executado Lighthouse
com condições de rede controladas: não se afirma ganho de Core Web Vitals ou conversão.
O CSS de teste usa cache desabilitado para evitar capturar uma versão antiga durante a edição.

A oferta, disponibilidade real, desafio Cloudflare e tags/consentimento publicados devem
ser conferidos no Preview. Não foram enviados leads reais, feito git push, deploy de
Production ou alterações externas no Google Ads.

## Refinamento Nóis 2.1 — 18/11/2026

Evolução do visual 2.0 aprovado, em index.html e styles.css. A paleta permanece a mesma
(DESIGN.md). Hero com H1 local, slogan preservado, painel de emergência menor e sem logo
repetido; faixa compacta de benefícios; sete serviços em duas categorias; públicos com
descrições próprias; institucional; oferta com equivalência de serviços explícita;
pagamentos integrados; áreas atendidas e FAQ nativo de 12 perguntas.

Condições informadas pelo proprietário: orçamento e visita técnica gratuitos, sem
restrições à visita; Pix, dinheiro, débito e crédito; até 3x sem juros; serviços com
garantia; emissão de nota fiscal; equipe e veículos próprios. Não foi definido prazo
nem cobertura de garantia: o site orienta consultar as condições. Não foram acrescentados
depoimentos, fotografias, capacidade técnica ou prazo de chegada não confirmados.
O anexo terminava na última pergunta “Quais regiões”; a resposta utiliza somente
Grande São Paulo e as cinco cidades já presentes no projeto.

### Formulário e preservação

Nenhum novo botão de contato, pergunta ou valor de serviço foi criado. O botão
“Solicitar meu orçamento” mantém id botao-whatsapp-preco e origem price. Os quatro
botões de WhatsApp continuam abrindo o mesmo fluxo protegido.

Os valores existentes continuam esgoto, gordura, calha e outro. Hidrojateamento,
inspeção por câmera e manutenção preventiva podem ser solicitados em “Outro serviço”,
com esclarecimento pela equipe no atendimento. Uma futura categorização específica
deve ser proposta e aprovada antes de atualizar simultaneamente lista do frontend,
validação e mensagem do backend, testes e relatórios/variáveis do GTM. Nesta versão
não se altera a taxonomia de mensuração.

Comparação SHA-256 com o início do refinamento (output/playwright/v21-baseline.json):
api/verify-turnstile.js, script.js, consent.js, vercel.json, sitemap.xml, robots.txt e
termos.html idênticos. As diferenças anteriores do workspace foram preservadas.
Canonical, Open Graph e JSON-LD mantidos. Nenhuma configuração de ambiente nova,
alteração externa no Cloudflare/GTM/Google Ads ou redirect foi necessária.

### Validação local 2.1

- node --test tests/backend.test.cjs tests/domain-migration.test.cjs tests/http-integration.test.cjs tests/redesign.test.cjs:
  53 aprovados, 2 testes opcionais de rede WhatsApp ignorados, zero falhas.
- node tests/browser.cjs: 73 verificações aprovadas, incluindo FAQ com Enter/Espaço,
  deduplicação de eventos, formulário completo, sessões, tokens, CSP e recuperação de erros.
- node tests/browser.cjs --consent: 30 verificações aprovadas.
- node tests/browser.cjs --http --consent: 17 verificações aprovadas.
- node --check em script.js, consent.js, api/verify-turnstile.js e tests/browser.cjs;
  git diff --check sem erros.
- Playwright/Chrome: página, termos e modal sem overflow horizontal em 320, 375,
  768, 1024 e 1440 px. Tab/Enter no atalho levam ao conteúdo; Escape fecha o modal e
  devolve o foco ao botão de origem. FAQ usa controles nativos sem novo JavaScript.

Capturas antes/depois, modal e termos em output/playwright/v21-*. Comparação visual
em output/playwright/v21-comparacao.html. Foram inspecionadas as capturas e refinado
o FAQ para eliminar a coluna vazia no desktop. Os screenshots antes da edição são
da versão 2.0 aprovada; a comparação anterior 1.0/2.0 continua disponível.

HTML principal + CSS + JS principal: 70.790 → 79.828 bytes brutos (+9.038 bytes),
com o novo conteúdo institucional/comercial. Sem novas bibliotecas, fontes remotas
ou imagens. Não foi medido Lighthouse sob rede controlada; não se afirma melhora de
Core Web Vitals ou aumento de conversão apenas com essa comparação de tamanho.

### Checklist de Preview 2.1

- Conferir os textos comerciais, região, gratuidade, parcelamento e garantia.
- Conferir hero, faixa de benefícios, sete serviços e FAQ em celular e desktop.
- Percorrer as três perguntas; voltar, fechar e reabrir; conferir a seleção e o foco.
- Validar o desafio Cloudflare real no hostname do Preview e o WhatsApp no aparelho.
- Recusar cookies e concluir atendimento; aceitar, restaurar e revogar preferências.
- No Tag Assistant, conferir Consent Mode v2 e um whatsapp_intent por interação,
  qualification_completed após verificação e whatsapp_redirect no link final.
- Conferir que nenhuma conversão é interpretada como prova de conversa iniciada.

Os testes de navegador simulam serviços externos; o modo --http usa a função Node
real com Siteverify simulado. As capturas e testes locais não comprovam desafio real,
entrega no WhatsApp, tags publicadas ou comportamento de teclado virtual iOS/Android.
Nenhum contato real foi enviado, nem git push ou deploy de Production executado.

## Complemento final do pedido 2.1 — 18/11/2026

Esta seção registra a versão após o recebimento da parte que faltava do pedido.
Ela atualiza as métricas e o escopo da validação 2.1 registrados acima.

### Alterações e decisões

- FAQ com a resposta de regiões fornecida e a pergunta sobre cobertura de orçamentos.
  Treze perguntas, ordenadas por urgência, local, gratuidade e condições comerciais.
- Hero mobile com margens menores e CTA de largura total. Em 375 × 667px, o banner
  caiu de 195,94 para 141,5px; em 1440 × 900px, de 93,5 para 71px. O CTA principal
  fica acima do banner em 320/375 × 667px nas capturas finais.
- Aceitar e recusar têm a mesma largura, apresentação e área mínima de 44px. Preferências,
  revogação e finalidade dos quatro estados de consentimento foram preservadas.
- Enquanto o banner está aberto em celular, o flutuante fica oculto para não cobrir o
  CTA principal. Cabeçalho e hero continuam abrindo o formulário protegido. O flutuante
  volta após a escolha, inclusive recusa. No desktop permanece acima do banner.
- script.js recebeu somente um ajuste funcional de apresentação: visualViewport limita
  altura e posição do modal à área visível, mantendo o campo focado no corpo rolável.
  Listeners são vinculados ao abrir e removidos ao fechar; zoom não é substituído.
  Motivo: teclado móvel pode reduzir só a área visível, sem redimensionar o layout
  ([documentação Chrome](https://developer.chrome.com/blog/viewport-resize-behavior)).
- Metadados title/description/OG refletem a Grande São Paulo e serviços confirmados.
  Charset no início de ambas as páginas; termos com um H1 e documentos/subseções H2/H3.
  Links de serviços do rodapé dos termos agora apontam para index.html e âncoras existentes.
- JSON-LD: tipo [Plumber](https://schema.org/Plumber), área Grande São Paulo em vez do
  estado inteiro, sete serviços e pagamentos confirmados. Nenhum preço numérico,
  avaliação, certificação, prazo ou endereço novo foi adicionado. Endereço, geo,
  priceRange e perfis sociais previamente existentes foram mantidos; não houve
  confirmação externa desses dados nesta tarefa.

Arquivos do complemento: index.html, termos.html, styles.css, script.js,
tests/browser.cjs, tests/domain-migration.test.cjs, DESIGN.md e DEPLOY.md.
Artefatos locais em output/playwright/v21-complemento-*.

SHA-256 comparado com v21-complemento-baseline.json confirma API, consent.js, vercel.json,
sitemap.xml e robots.txt idênticos. O script.js mudou apenas no controle visual do modal;
mensagem padrão sem emojis, telefone, proteção, sessões, eventos e taxonomia mantidos.
Não é necessária nova variável de ambiente nem mudança em Cloudflare, GTM ou Google Ads.
Não há redirecionamento novo do domínio antigo.

### Testes realmente executados

- node --test tests/backend.test.cjs tests/domain-migration.test.cjs tests/http-integration.test.cjs tests/redesign.test.cjs:
  54 aprovados, 2 opcionais de rede WhatsApp ignorados, zero falhas.
- node tests/browser.cjs: 77 verificações aprovadas; inclui segurança, sessões/tokens,
  recuperação, eventos, FAQ com Enter/Espaço e 1920px.
- node tests/browser.cjs --consent: 37 verificações aprovadas, com escolhas de tamanho
  equivalente, banner/flutuante nas seis larguras e atendimento com cookies recusados.
- node tests/browser.cjs --http --consent: 17 verificações aprovadas, função Node HTTP
  real com Siteverify simulado; não envia conversão ou mensagem real.
- node tests/browser.cjs --visual: 2 verificações e capturas de seis estados: serviço,
  localização, urgência, verificação simulada, erro e sucesso. Backend Node real,
  Cloudflare simulado e nenhum clique de envio final.
- Sintaxe JavaScript e git diff --check aprovados.
- Playwright/Chrome: páginas principal e termos sem overflow em 320, 375, 768, 1024,
  1440 e 1920px; primeiras dobras, banner aberto/fechado e comparações capturados.
  Navegação por teclado, fechamento/reabertura e foco continuam cobertos pelos testes.
- Área visível reduzida a 360px e deslocada 24px foi simulada no Chrome para verificar
  campo focado, rodapé, zoom e remoção de listeners. Captura adicional em 375 × 360px:
  fechar e avançar ficam dentro da tela. Isso não equivale a abrir teclado físico
  Android/iOS: ambos precisam de teste manual no Preview.

### Lighthouse — laboratório local

Lighthouse 13.6.0, Chrome headless, servidor Python HTTP em 127.0.0.1:8765,
perfil novo sem autorização de cookies, sem disparar GTM e sem concluir o Turnstile.
Script Cloudflare carregado normalmente; sem bloqueio de URLs ou alteração da página
para o Lighthouse. Perfil mobile padrão e preset desktop, throttling simulado.
Execuções únicas e sequenciais; não são dados de campo/CrUX nem medição de Production.
O servidor estático local não reproduz TLS, CDN ou cabeçalhos da Vercel; CSP foi
testada separadamente pelo servidor da suíte de navegador com a política do projeto.

| Perfil | Desempenho | Acessibilidade | Boas práticas | SEO | FCP / LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Antes do complemento, mobile | 100 | 100 | 100 | 100 | 1,1s / 1,1s | 0,004 | 0ms |
| Final, mobile | 100 | 100 | 100 | 100 | 1,2s / 1,2s | 0 | 0ms |
| Final, desktop | 100 | 100 | 100 | 100 | 0,4s / 0,4s | 0 | 0ms |

Os resultados não comprovam ganho de velocidade: há variação entre execuções e nenhum
dado real de usuários foi coletado. O relatório ainda aponta oportunidades de tamanho
do logo PNG, minificação, CSS/JS usados só nas interações e cache do servidor local.
Não foram adicionados frameworks, fontes, bibliotecas ou imagens, nem alterado o
carregamento de consentimento/segurança para melhorar uma nota de laboratório.

HTML principal + CSS + JS: 79.828 → 84.478 bytes brutos no complemento (+4.650 bytes).
Os relatórios completos HTML/JSON estão em v21-complemento-lighthouse-*.report.*.
A galeria v21-complemento-comparacao.html reúne capturas e links dos relatórios.

### Pendências para Preview

Conferir as condições comerciais e o FAQ, validar teclado real Android/iOS com foco
no bairro, orientação e zoom, percorrer o desafio real do Turnstile, abrir o WhatsApp
com cookies recusados e verificar os eventos/consentimento no Tag Assistant. Conferir
canonical e CSP nos cabeçalhos reais da Vercel. Os testes locais não confirmam entrega
no aplicativo, conversas iniciadas ou configuração externa das conversões existentes.
Não houve git push, deploy de Production nem alteração em configurações externas.

## CSP do modo Preview do GTM — 18/11/2026

### Diagnóstico e escopo

O contêiner carregava, mas os estilos de depuração eram bloqueados. A política não
declara style-src-elem: o navegador aplica style-src como fallback, limitado a self
e unsafe-inline. Portanto o bloqueio desses estilos é compatível com o GTM já carregado.
Referência: [Google — Preview Mode e CSP](https://developers.google.com/tag-platform/security/guides/csp#preview_mode).

A correção é exclusiva do hostname confirmado pelo proprietário:
nois-desentupidora-teste-aline-9883.vercel.app.
Em vercel.json, has/missing com type host e value.eq escolhem políticas mutuamente
exclusivas. Não há duas CSP cumulativas na mesma resposta. Todos os outros cabeçalhos
de proteção são iguais nas duas regras. O schema oficial da Vercel foi consultado e
confirma suporte a comparação eq de host. Referência:
[Vercel — headers e condições has/missing](https://vercel.com/docs/project-configuration/vercel-json#headers).

Isso delimita a política por hostname, sem migrar o projeto estático para configuração
programática, adicionar middleware ou modificar o build. Não é uma detecção de
VERCEL_ENV: um novo endereço de deployment não recebe as permissões automaticamente.
Use o alias confirmado; para outro hostname de teste, revisar explicitamente as duas
condições e seus testes. Os três domínios públicos (www, sem www e o vercel.app antigo)
continuam recebendo exatamente a política e os cabeçalhos anteriores.

### Diretivas alteradas somente no hostname de teste

| Diretiva | Alteração | Motivo |
| --- | --- | --- |
| style-src | Acrescenta https://www.googletagmanager.com, https://tagmanager.google.com e https://fonts.googleapis.com | badge.css, folhas /icon e /css e estilos de depuração indicados pelo Google |
| script-src | Acrescenta https://tagmanager.google.com | Origem adicional de scripts indicada para GTM Preview; www.googletagmanager.com já era permitida |
| img-src | Acrescenta https://ssl.gstatic.com e https://www.gstatic.com | Imagens da interface de depuração indicadas pelo Google |
| font-src | Troca o esquema amplo https: por https://fonts.gstatic.com; mantém self e data: | Fontes do Preview, com origem exata em vez de liberar qualquer fonte HTTPS |

style-src-elem e script-src-elem continuam sem declaração própria e usam os fallbacks
style-src/script-src. Isso preserva estilos inline, arquivos locais, Turnstile e
Google Ads sem criar listas parciais divergentes. Não foi adicionado unsafe-eval,
nenhum curinga novo ou novo esquema genérico. O font-src dos domínios públicos continua
como estava (self, data:, https:); o endurecimento de fontes é exclusivo da depuração.

connect-src, frame-src, default-src, base-uri, form-action e os demais cabeçalhos
permaneceram idênticos. As conexões www.googletagmanager.com e www.google.com exigidas
na documentação já eram permitidas. O guia de Preview não exige connect-src para
tagassistant.google.com: não há evidência fornecida de uma requisição bloqueada a ele,
por isso essa origem não foi liberada. Nenhuma CSP adicional em meta, COOP ou rotina
de conexão própria do Tag Assistant foi encontrada no HTML/JS do projeto.

### Preservação e testes

Arquivos desta correção: vercel.json, tests/browser.cjs, tests/csp-preview.test.cjs,
tests/helpers/vercel-policy.cjs e DEPLOY.md. Nenhum arquivo de design, HTML, JavaScript
do site, Consent Mode ou função de verificação foi alterado nesta tarefa.
Comparação SHA-256 contra output/playwright/gtm-preview-csp-baseline.json confirma
preservação de index.html, termos.html, styles.css, script.js, consent.js,
api/verify-turnstile.js, sitemap.xml e robots.txt. A política e todos os cabeçalhos dos
domínios públicos foram comparados integralmente com o mesmo registro.

Executado:

- node --test tests/csp-preview.test.cjs tests/backend.test.cjs tests/domain-migration.test.cjs tests/http-integration.test.cjs tests/redesign.test.cjs:
  57 aprovados, 2 opcionais de rede ignorados, zero falhas.
- node tests/browser.cjs: 89 verificações aprovadas usando a política dos domínios públicos.
- node tests/browser.cjs --gtm-preview: 90 verificações aprovadas usando a política de depuração.
- node tests/browser.cjs --gtm-preview --consent: 37 verificações aprovadas.
- node tests/browser.cjs --gtm-preview --http --consent: 17 verificações aprovadas.
- node --check nos arquivos de testes alterados e git diff --check sem erros.

No Chrome real, as três URLs reportadas são carregadas como link rel=stylesheet com
MIME CSS correto: onload e aplicação de uma propriedade CSS confirmam autorização no
Preview. A mesma operação é bloqueada pela política pública. Também são testados
scripts/imagens de depuração, fontes, domínios semelhantes maliciosos, conexões não
autorizadas, Cloudflare, sessões/tokens, consentimento e eventos sem duplicação.
A fonte de teste verifica apenas se a requisição é autorizada pela CSP: o fixture não
contém uma fonte válida e não comprova rasterização. As requisições externas são
interceptadas e respondidas localmente; nada foi enviado ao Google/WhatsApp/Cloudflare.

### Validação manual no Preview

1. Disponibilizar esta configuração somente no Preview, sem publicar Production.
2. Abrir o alias exato confirmado, autenticar na proteção Vercel se houver e recarregar
   sem cache. Em Network, conferir uma única CSP no documento, com a lista de debug.
   A seleção de cabeçalhos pela infraestrutura Vercel precisa desta confirmação real;
   o helper local testa somente as condições utilizadas, sem emular toda a Vercel.
3. O modo básico continua sem carregar GTM antes de consentimento. Para depurar as
   tags, autorizar explicitamente os opcionais e iniciar o Preview do GTM-55MN7ZRV
   nesse endereço. Recusa não deve ser contornada para estabelecer a conexão.
4. Conferir badge.css, fonts.googleapis.com/icon e /css sem violações style-src-elem,
   além de scripts, imagens e fontes da interface. Confirmar conexão no Tag Assistant.
5. Verificar whatsapp_intent uma vez por interação, qualification_completed após
   validação e whatsapp_redirect no link final; nenhum lead_qualified automático.
6. Se a conexão ainda falhar, registrar somente URL/origem e diretiva de qualquer novo
   bloqueio, sem tokens ou cookies. Conferir bloqueadores, autenticação do Preview,
   permissões de janelas e avisos de conexão do próprio Tag Assistant. Não ampliar a
   CSP por tentativa nem remover X-Frame-Options, consentimento ou proteção Vercel.

Os testes comprovam as permissões locais, não o pareamento real do Tag Assistant.
Não houve deploy, git push, alteração de contêiner ou conversões/configurações externas.
