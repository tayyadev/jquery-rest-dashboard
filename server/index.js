'use strict';

const http = require('node:http');
const path = require('node:path');
const {readFile} = require('node:fs/promises');
const {ApiError,createSeedState,perform} = require('./logic');

const ROOT = path.resolve(__dirname, '../public');
const STATIC = {
  '/': ['index.html','text/html; charset=utf-8'],
  '/index.html': ['index.html','text/html; charset=utf-8'],
  '/styles.css': ['styles.css','text/css; charset=utf-8'],
  '/app.js': ['app.js','text/javascript; charset=utf-8'],
  '/favicon.svg': ['favicon.svg','image/svg+xml']
};
function respond(res,status,data) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}
async function parseJSON(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) {
    throw new ApiError(415,'unsupported_media_type','Send Content-Type: application/json.');
  }
  let size=0; const chunks=[];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new ApiError(413,'payload_too_large','Maximum body size is 64 KB.');
    chunks.push(chunk);
  }
  let body;
  try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw new ApiError(400,'invalid_json','Body must contain valid JSON.');}
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400,'invalid_body','Body must be a JSON object.');
  }
  return body;
}
function createServer(store = createSeedState()) {
  return http.createServer(async (req,res) => {
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://code.jquery.com; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'");
    try {
      const url = new URL(req.url,'http://localhost');
      const route=url.pathname;
      if (req.method === 'GET' && Object.hasOwn(STATIC,route)) {
        const [file,type] = STATIC[route];
        const body=await readFile(path.join(ROOT,file));
        res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache',
          'X-Content-Type-Options':'nosniff'});
        res.end(body); return;
      }
      if (!route.startsWith('/api/')) throw new ApiError(404,'not_found','Page not found.');
      const input=['POST','PATCH'].includes(req.method) ? await parseJSON(req) : undefined;
      const [status,result]=perform(store,req.method,route,url.searchParams,input);
      respond(res,status,result);
    } catch (error) {
      if (error instanceof ApiError) {
        respond(res,error.status,{error:{code:error.code,message:error.message}});
      } else {
        console.error('Unexpected server error:',error.message);
        respond(res,500,{error:{code:'internal_error',message:'Unexpected server error.'}});
      }
    }
  });
}

if (require.main === module) {
  const port=Number(process.env.PORT || 3000);
  createServer().listen(port,()=>console.log(`Dashboard ready at http://localhost:${port}`));
}
module.exports={createServer};
