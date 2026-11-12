'use strict';
// HTTP Node real + handler do projeto. Apenas Siteverify é substituído por servidor HTTP local.
// Não lê .env.local nem usa credenciais reais; não é o runtime hospedado da Vercel.
const http = require('node:http');
const { once } = require('node:events');
const handler = require('../../api/verify-turnstile.js');

async function createHttpFunction() {
  const originalFetch = global.fetch;
  const keys = ['TURNSTILE_SECRET_KEY','EXPECTED_HOSTNAME','EXPECTED_HOSTNAMES','ALLOWED_ORIGIN','WHATSAPP_NUMBER','WHATSAPP_MESSAGE_EMOJIS'];
  const saved = Object.fromEntries(keys.map(key => [key,process.env[key]]));
  Object.assign(process.env, {
    TURNSTILE_SECRET_KEY:'local-http-test-only', EXPECTED_HOSTNAMES:'noidesentupidora.com.br',
    ALLOWED_ORIGIN:'https://noidesentupidora.com.br', WHATSAPP_NUMBER:'5511950566792',
    WHATSAPP_MESSAGE_EMOJIS:'false'
  });
  const state = { success:true, cloudflareStatus:200, verifications:0 };
  const server = http.createServer(async (req,res) => {
    if (req.url === '/siteverify') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      state.verifications++;
      res.writeHead(state.cloudflareStatus,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({
        success:state.success && form.get('secret')==='local-http-test-only',
        hostname:'noidesentupidora.com.br',action:'qualification'
      }), 'utf8');
    } else {
      await handle(req,res);
    }
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base = 'http://127.0.0.1:'+server.address().port;
  global.fetch = (url,options) => String(url)==='https://challenges.cloudflare.com/turnstile/v0/siteverify'
    ? originalFetch(base+'/siteverify',options)
    : originalFetch(url,options);

  async function handle(req,res) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      req.body = raw.length ? JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)) : {};
      res.status = function(code) { this.statusCode=code; return this; };
      res.json = function(body) {
        // Equivalente local da API de resposta Vercel, sobre ServerResponse real.
        if (!this.hasHeader('Content-Type')) this.setHeader('Content-Type','application/json; charset=utf-8');
        this.end(JSON.stringify(body),'utf8');
        return this;
      };
      await handler(req,res);
    } catch {
      if (!res.headersSent) res.writeHead(500,{'Content-Type':'application/json; charset=utf-8'});
      if (!res.writableEnded) res.end('{"success":false,"error":"Local HTTP fixture failed"}','utf8');
    }
  }
  return {
    base, handle, state, fetch:originalFetch,
    emojis(enabled) { process.env.WHATSAPP_MESSAGE_EMOJIS=String(enabled); },
    async close() {
      global.fetch=originalFetch;
      for (const key of keys) {
        if (saved[key]===undefined) delete process.env[key];
        else process.env[key]=saved[key];
      }
      server.closeAllConnections();
      await new Promise(resolve=>server.close(resolve));
    }
  };
}
module.exports={createHttpFunction};
