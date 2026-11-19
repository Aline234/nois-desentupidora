'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const base='https://www.noisdesentupidora.com.br';
test('canonical, OG e imagens nas duas páginas usam domínio oficial e arquivos existentes',()=>{
 for(const [name,page] of [['index.html','/'],['termos.html','/termos.html']]){
  const html=read(name);
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
  assert.ok(html.includes('rel="canonical" href="'+base+page+'"'));
  assert.ok(html.includes('property="og:url" content="'+base+page+'"'));
  assert.ok(html.includes(base+'/imagens/logo.png'));
  assert.ok(!html.includes('https://noidesentupidora.com.br'));
  assert.ok(!html.includes('/assets/'));
 }
 assert.ok(fs.existsSync(path.join(root,'imagens/logo.png')));
});
test('schema preserva dados comerciais e usa URL oficial',()=>{
 const html=read('index.html');
 const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert.equal(schema.url,base+'/');
 assert.equal(schema.image,base+'/imagens/logo.png');
 assert.equal(schema.telephone,'+55-11-95056-6792');
 assert.equal(schema['@type'],'Plumber');
 assert.equal(schema.areaServed.name,'Grande São Paulo');
 assert.equal(schema.contactPoint.areaServed,'Grande São Paulo');
 assert.equal(schema.hasOfferCatalog.itemListElement.length,7);
 assert.ok(schema.paymentAccepted.includes('Pix'));
 assert.equal(schema.aggregateRating,undefined);
 assert.equal(schema.review,undefined);
 for(const offer of schema.hasOfferCatalog.itemListElement) assert.equal(offer.price,undefined);
});

test('SEO técnico: UTF-8 cedo, um H1, hierarquia e âncoras locais válidas nas duas páginas',()=>{
 for(const name of ['index.html','termos.html']){
  const html=read(name);
  assert.ok(Buffer.byteLength(html.slice(0,html.indexOf('<meta charset="UTF-8" />')),'utf8')<1024);
  const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
  const headings=[...main.matchAll(/<h([1-6])\b/g)].map(x=>Number(x[1]));
  assert.equal(headings.filter(level=>level===1).length,1,name);
  for(let i=1;i<headings.length;i++) assert.ok(headings[i]<=headings[i-1]+1,name+': salto de título');
  for(const [,href] of html.matchAll(/href="([^"]+)"/g)){
   if(!href.includes('#') || /^(?:https?:|mailto:|tel:)/.test(href)) continue;
   const [file,anchor]=href.split('#');
   const target=file?read(file.replace(/^\.\//,'')):html;
   assert.ok(target.includes('id="'+anchor+'"'),name+': '+href);
  }
 }
});
test('sitemap e robots indicam somente URLs canônicas',()=>{
 const xml=read('sitemap.xml');
 const urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]);
 assert.deepEqual(urls,[base+'/',base+'/termos.html']);
 const robots=read('robots.txt');
 assert.ok(robots.includes('Allow: /'));
 assert.ok(robots.includes('Sitemap: '+base+'/sitemap.xml'));
 assert.ok(!robots.includes('Disallow: /'));
});
test('transição preserva rotas relativas, GTM e ausência de redirects',()=>{
 const config=JSON.parse(read('vercel.json'));
 assert.equal(config.redirects,undefined);
 assert.ok(config.rewrites.some(x=>x.source==='/api/verify-turnstile'));
 assert.ok(read('script.js').includes("apiEndpoint: '/api/verify-turnstile'"));
 assert.ok(read('consent.js').includes('GTM-55MN7ZRV'));
 for(const name of ['index.html','termos.html']){
  const html=read(name);
  assert.ok(html.includes('src="./consent.js"'));
  assert.ok(!/http-equiv=["']refresh/i.test(html));
 }
 assert.ok(fs.existsSync(path.join(root,'google80511e0d4337c7f0.html')));
});
