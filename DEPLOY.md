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
| EXPECTED_HOSTNAMES | Lista explícita de hostnames separados por vírgula, sem esquema, porta, caminho ou curingas. Ex.: noidesentupidora.com.br,www.noidesentupidora.com.br. |
| EXPECTED_HOSTNAME | Compatibilidade com configuração anterior de um único hostname; usada se EXPECTED_HOSTNAMES não estiver definida. |
| ALLOWED_ORIGIN | Origens completas separadas por vírgula, sem barra final. Ex.: https://noidesentupidora.com.br,https://www.noidesentupidora.com.br. |
| WHATSAPP_NUMBER | Número comercial em formato internacional, apenas 10 a 15 dígitos. Atual: 5511950566792. |
| WHATSAPP_MESSAGE_EMOJIS | Ausente ou false: sem emojis fixos (padrão temporário). true: somente diagnóstico, reativar após validar o percurso externo. |

Sem configuração explícita, hostname e origem usam apenas noidesentupidora.com.br e https://noidesentupidora.com.br. Se www servir o site sem redirecionar, adicione-o explicitamente nas duas listas e no widget Cloudflare.

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
