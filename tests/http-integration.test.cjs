'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createHttpFunction}=require('./helpers/http-function.cjs');
let fixture;
let serial=0;
const qualification={service:'calha',neighborhood:'São João & Água Branca + Centro #1 (100%)',urgency:'emergencia'};
before(async()=>{fixture=await createHttpFunction();});
after(async()=>{await fixture.close();});
async function request(body={token:'http-test-token-12345',qualification}) {
  return fixture.fetch(fixture.base+'/api/verify-turnstile',{
    method:'POST',headers:{'Content-Type':'application/json','x-forwarded-for':'203.0.113.'+(++serial)},
    body:JSON.stringify(body)
  });
}
async function decodeResponse(response) {
  assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');
  const bytes=new Uint8Array(await response.arrayBuffer());
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  assert.ok(!raw.includes('\uFFFD'));
  return {bytes,raw,data:JSON.parse(raw)};
}

test('HTTP real: padrão sem emojis preserva JSON UTF-8, acentos e URL',async()=>{
  fixture.emojis(false);
  const response=await request();
  assert.equal(response.status,200);
  const {raw,data}=await decodeResponse(response);
  assert.match(raw,/Verificação concluída/);
  const url=new URL(data.whatsappUrl);
  const text=url.searchParams.get('text');
  assert.equal(url.origin,'https://wa.me');
  assert.match(text,/\*Serviço:\* Limpeza de Calha e Caixa d'Água/);
  assert.ok(text.includes(qualification.neighborhood));
  assert.match(text,/\*Urgência:\* Emergência/);
  assert.ok(!/[\p{Extended_Pictographic}\uFE0F\uFFFD]/u.test(text));
  assert.equal(decodeURIComponent(data.whatsappUrl.split('?text=')[1]),text);
  assert.equal(data.whatsappUrl.split('?text=')[1],encodeURIComponent(text));
});
test('HTTP real: emojis opt-in atravessam bytes, JSON e uma decodificação',async()=>{
  fixture.emojis(true);
  const response=await request();
  const {data}=await decodeResponse(response);
  const encoded=data.whatsappUrl.split('?text=')[1];
  const text=decodeURIComponent(encoded);
  for(const emoji of ['\u{1F6E0}\uFE0F','\u{1F4CD}','\u23F0']) assert.ok(text.includes(emoji));
  assert.ok(!text.includes('\uFFFD'));
  assert.ok(!/%25F0|%25E2|%EF%BF%BD/i.test(encoded));
  assert.equal(new URL(data.whatsappUrl).searchParams.get('text'),text);
  fixture.emojis(false);
});
test('HTTP real: falha no Siteverify não entrega URL',async()=>{
  fixture.state.success=false;
  const response=await request();
  assert.equal(response.status,403);
  const {data}=await decodeResponse(response);
  assert.equal(data.success,false);
  assert.equal(data.whatsappUrl,undefined);
  fixture.state.success=true;
});
test('HTTP real: erro HTTP do Cloudflare não entrega URL',async()=>{
  fixture.state.cloudflareStatus=503;
  const response=await request();
  assert.equal(response.status,502);
  const {data}=await decodeResponse(response);
  assert.equal(data.whatsappUrl,undefined);
  fixture.state.cloudflareStatus=200;
});
test('HTTP real: sem token continua rejeitado antes de Siteverify',async()=>{
  const count=fixture.state.verifications;
  const response=await request({qualification});
  assert.equal(response.status,400);
  const {data}=await decodeResponse(response);
  assert.equal(data.whatsappUrl,undefined);
  assert.equal(fixture.state.verifications,count);
});
test('rede externa opcional: Location de wa.me preserva mensagem padrão', {
  skip:process.env.NOIS_LIVE_WHATSAPP!=='1'
},async()=>{
  fixture.emojis(false);
  // Texto sintético; não abre sessão do WhatsApp nem envia conversa.
  const response=await request({token:'live-http-test-token',qualification:{service:'calha',neighborhood:'São João - teste técnico',urgency:'orcamento'}});
  const {data}=await decodeResponse(response);
  const expected=new URL(data.whatsappUrl).searchParams.get('text');
  const redirect=await fixture.fetch(data.whatsappUrl,{redirect:'manual',signal:AbortSignal.timeout(20000)});
  assert.ok([301,302,303,307,308].includes(redirect.status),'Esperado redirecionamento de wa.me');
  const location=new URL(redirect.headers.get('location'),data.whatsappUrl);
  assert.equal(location.hostname,'api.whatsapp.com');
  assert.equal(location.searchParams.get('text'),expected);
  assert.ok(!location.searchParams.get('text').includes('\uFFFD'));
  console.log('WhatsApp externo: mensagem padrão preservada no Location real.');
});

test('rede externa opcional: registra integridade dos emojis no Location real', {
  skip:process.env.NOIS_LIVE_WHATSAPP!=='1'
},async()=>{
  const original='\u{1F6E0}\uFE0F \u{1F4CD} \u23F0';
  const input='https://wa.me/5511950566792?text='+encodeURIComponent(original);
  assert.equal(new URL(input).searchParams.get('text'),original);
  const response=await fixture.fetch(input,{redirect:'manual',signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,302);
  const redirected=new URL(response.headers.get('location'),input);
  assert.equal(redirected.hostname,'api.whatsapp.com');
  const received=redirected.searchParams.get('text');
  assert.notEqual(received,null);
  // Diagnóstico de serviço externo, não exige que a falha persista para sempre.
  console.log('WHATSAPP_LIVE_EMOJI_DIAGNOSTIC',JSON.stringify({
    inputEncoded:encodeURIComponent(original),
    outputEncoded:encodeURIComponent(received),
    unchanged:received===original,
    replacementCount:[...received].filter(value=>value==='\uFFFD').length
  }));
});
