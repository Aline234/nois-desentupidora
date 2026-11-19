'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const config=require('../vercel.json');
const {headersFor,policyFor,previewHost,directives}=require('./helpers/vercel-policy.cjs');
const productionHosts=['www.noisdesentupidora.com.br','noisdesentupidora.com.br','nois-desentupidora.vercel.app'];
const production=directives(policyFor(productionHosts[0]));
const preview=directives(policyFor(previewHost));

test('depuração limitada ao hostname Preview exato; uma única CSP em cada resposta',()=>{
 assert.equal(previewHost,'nois-desentupidora-teste-aline-9883.vercel.app');
 assert.equal(config.headers.length,2);
 assert.deepEqual(config.headers[0].missing,config.headers[1].has);
 for(const host of [...productionHosts,'other.vercel.app',previewHost+'.evil.test','evil'+previewHost,previewHost.replace('.vercel.','XvercelX')]){
  assert.equal(policyFor(host),policyFor(productionHosts[0]),host);
 }
 assert.notEqual(policyFor(previewHost),policyFor(productionHosts[0]));
});

test('somente os recursos oficiais de Preview ampliam script, style e img',()=>{
 const additions={
  'script-src':['https://tagmanager.google.com'],
  'style-src':['https://www.googletagmanager.com','https://tagmanager.google.com','https://fonts.googleapis.com'],
  'img-src':['https://ssl.gstatic.com','https://www.gstatic.com']
 };
 assert.deepEqual(Object.keys(preview),Object.keys(production));
 for(const [name,sources] of Object.entries(production)) {
  if(name==='font-src'){
   assert.deepEqual(preview[name],["'self'",'data:','https://fonts.gstatic.com']);
  }else{
   assert.deepEqual(preview[name],[...sources,...(additions[name]||[])]);
  }
 }
 assert.equal(preview['style-src-elem'],undefined);
 assert.equal(preview['script-src-elem'],undefined);
 assert.ok(production['style-src'].includes("'self'"));
 assert.ok(production['style-src'].includes("'unsafe-inline'"));
});

test('connect-src, frames, segurança e rota da API continuam preservados',()=>{
 assert.deepEqual(preview['connect-src'],production['connect-src']);
 for(const host of ['https://www.googletagmanager.com','https://www.google.com']) assert.ok(preview['connect-src'].includes(host));
 assert.ok(!preview['connect-src'].includes('https://tagassistant.google.com'));
 for(const name of ['default-src','frame-src','base-uri','form-action']) assert.deepEqual(preview[name],production[name]);
 const security=host=>headersFor(host).filter(h=>h.key!=='Content-Security-Policy');
 assert.deepEqual(security(previewHost),security(productionHosts[0]));
 assert.ok(security(previewHost).some(h=>h.key==='X-Frame-Options' && h.value==='DENY'));
 assert.deepEqual(config.rewrites,[{source:'/api/verify-turnstile',destination:'/api/verify-turnstile.js'}]);
 assert.equal(config.redirects,undefined);
 for(const policy of [production,preview]){
  assert.ok(policy['script-src'].includes('https://challenges.cloudflare.com'));
  assert.ok(policy['script-src'].includes('https://googleads.g.doubleclick.net'));
  assert.ok(!Object.values(policy).flat().includes("'unsafe-eval'"));
  assert.ok(!Object.values(policy).flat().includes('*'));
 }
});
