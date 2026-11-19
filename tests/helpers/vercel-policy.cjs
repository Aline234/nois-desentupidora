'use strict';
// Espelha apenas o subconjunto de matching usado pelo projeto; não é um emulador Vercel.
const config=require('../../vercel.json');
const previewHost=config.headers.find(rule=>rule.has)?.has[0]?.value?.eq;
function headersFor(hostname) {
  const headers=[];
  for(const rule of config.headers) {
    if(rule.source!=='/(.*)') throw new Error('Atualize os testes para o novo source');
    const matches=condition=>{
      if(condition.type!=='host' || typeof condition.value?.eq!=='string') throw new Error('Condição não suportada pelo teste');
      return hostname===condition.value.eq;
    };
    if((rule.has||[]).every(matches) && !(rule.missing||[]).some(matches)) headers.push(...rule.headers);
  }
  return headers;
}
function policyFor(hostname) {
  const values=headersFor(hostname).filter(header=>header.key==='Content-Security-Policy');
  if(values.length!==1) throw new Error('Deve haver uma única CSP para '+hostname);
  return values[0].value;
}
function directives(policy) {
  return Object.fromEntries(policy.split(';').map(part=>part.trim().split(/\s+/)).filter(tokens=>tokens[0]).map(([name,...sources])=>[name,sources]));
}
module.exports={headersFor,policyFor,previewHost,directives};
