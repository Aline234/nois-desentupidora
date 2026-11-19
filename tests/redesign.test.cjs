'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('oferta comercial sem preço antigo ou promessas de prazo',()=>{
 const html=read('index.html');
 assert.ok(!/149|30 min|45 min/.test(html));
 assert.ok(html.includes('Cobrimos qualquer orçamento!'));
 assert.ok(html.includes('Encontrou um preço melhor? Apresente o orçamento da concorrência à nossa equipe. Cobrimos orçamentos de serviços equivalentes.'));
 for(const label of ['Residências','Comércios e empresas','Condomínios']) assert.ok(html.includes(label));
});
test('IDs de contato, links e destino do atalho de teclado preservados',()=>{
 const html=read('index.html');
 for(const id of ['botao-whatsapp-header','botao-whatsapp-hero','botao-whatsapp-preco','botao-whatsapp-float','servico1','servico2','servico3','preco','cookie-banner','cookie-accept','cookie-reject','cookie-preferences']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 for(const file of ['index.html','termos.html']){
  const text=read(file);
  assert.ok(text.includes('href="#conteudo"'));
  assert.ok(text.includes('id="conteudo" tabindex="-1"'));
  assert.ok(text.includes('tel:+5511950566792'));
 }
});
test('contraste das principais combinações de texto e fundo >= 4.5:1',()=>{
 function luminance(hex) {
  const rgb=hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 }
 for(const [fg,bg] of [['10234c','ffffff'],['526176','ffffff'],['ffffff','16803d'],['ffffff','29378c'],['d4dfed','10234c'],['526176','eaf1fa']]){
  const values=[luminance(fg),luminance(bg)].sort((a,b)=>b-a);
  assert.ok((values[0]+.05)/(values[1]+.05)>=4.5,fg+' / '+bg);
 }
});
