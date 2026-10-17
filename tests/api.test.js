'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createServer} = require('../server/index');

async function withServer(run) {
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {await run(base);}
  finally {await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
}
async function request(base,route,method='GET',body) {
  const response=await fetch(base+route,{
    method,
    headers:body===undefined?{}:{'content-type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  return {status:response.status,body:await response.json()};
}

test('serves frontend assets and a health endpoint',async()=>{
  await withServer(async base=>{
    const health=await request(base,'/api/health');
    assert.equal(health.status,200);
    assert.equal(health.body.ok,true);
    for (const asset of ['/','/app.js','/styles.css','/favicon.svg']) {
      const response=await fetch(base+asset);
      assert.equal(response.status,200,asset);
    }
  });
});

test('reports deterministic synthetic summary',async()=>{
  await withServer(async base=>{
    const {body}=await request(base,'/api/summary');
    assert.equal(body.totalCustomers,24);
    assert.equal(body.totalOrders,56);
    assert.equal(body.activeCustomers,12);
    assert.equal(Object.values(body.orderStatuses).reduce((a,b)=>a+b,0),56);
    assert.ok(body.paidRevenue>0);
  });
});

test('supports customer pagination and name sorting',async()=>{
  await withServer(async base=>{
    const {body}=await request(base,'/api/customers?page=2&pageSize=5&sort=name');
    assert.equal(body.data.length,5);
    assert.equal(body.meta.total,24);
    assert.equal(body.meta.page,2);
    const names=body.data.map(c=>c.name);
    assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b)));
  });
});

test('filters customers by status and search',async()=>{
  await withServer(async base=>{
    const {body}=await request(base,'/api/customers?search=Cedar&status=active');
    assert.ok(body.data.length>0);
    for (const row of body.data) {
      assert.equal(row.status,'active');
      assert.match(row.company,/Cedar/i);
    }
  });
});

test('rejects invalid pagination and unknown query values',async()=>{
  await withServer(async base=>{
    for (const route of ['/api/customers?page=0','/api/orders?pageSize=100',
      '/api/customers?status=invalid','/api/orders?sort=bad']) {
      const result=await request(base,route);
      assert.equal(result.status,400);
      assert.equal(result.body.error.code,'invalid_query');
    }
  });
});

test('creates a customer and prevents duplicate email',async()=>{
  await withServer(async base=>{
    const payload={name:'Public Sample',email:'sample@example.com',company:'Example Studio'};
    const created=await request(base,'/api/customers','POST',payload);
    assert.equal(created.status,201);
    assert.equal(created.body.data.status,'prospect');
    assert.equal((await request(base,'/api/summary')).body.totalCustomers,25);
    const duplicate=await request(base,'/api/customers','POST',{...payload,email:'SAMPLE@example.com'});
    assert.equal(duplicate.status,409);
    assert.equal(duplicate.body.error.code,'duplicate_email');
  });
});

test('updates customer fields and rejects invalid statuses',async()=>{
  await withServer(async base=>{
    const updated=await request(base,'/api/customers/1001','PATCH',{name:'Revised Name',status:'paused'});
    assert.equal(updated.status,200);
    assert.equal(updated.body.data.name,'Revised Name');
    assert.equal(updated.body.data.status,'paused');
    const bad=await request(base,'/api/customers/1001','PATCH',{status:'expired'});
    assert.equal(bad.status,422);
    assert.equal((await request(base,'/api/customers/1001')).body.data.status,'paused');
  });
});

test('deleting a customer explicitly cascades linked synthetic orders',async()=>{
  await withServer(async base=>{
    const before=(await request(base,'/api/summary')).body;
    const deletion=await request(base,'/api/customers/1001','DELETE');
    assert.equal(deletion.status,200);
    assert.ok(deletion.body.removedOrders>0);
    const after=(await request(base,'/api/summary')).body;
    assert.equal(after.totalCustomers,before.totalCustomers-1);
    assert.equal(after.totalOrders,before.totalOrders-deletion.body.removedOrders);
    assert.equal((await request(base,'/api/customers/1001')).status,404);
  });
});

test('creates, updates, filters and deletes orders',async()=>{
  await withServer(async base=>{
    const created=await request(base,'/api/orders','POST',{
      customerId:1001,item:'Custom Integration',amount:59.95,status:'pending'
    });
    assert.equal(created.status,201);
    const id=created.body.data.id;
    const query=await request(base,'/api/orders?search=Custom%20Integration');
    assert.ok(query.body.data.some(o=>o.id===id && o.customerName==='Alex Morgan'));
    const updated=await request(base,`/api/orders/${id}`,'PATCH',{status:'paid'});
    assert.equal(updated.body.data.status,'paid');
    const deletion=await request(base,`/api/orders/${id}`,'DELETE');
    assert.equal(deletion.status,200);
    assert.equal((await request(base,`/api/orders/${id}`)).status,404);
  });
});

test('rejects invalid amounts and nonexistent customer references',async()=>{
  await withServer(async base=>{
    for (const payload of [
      {customerId:999999,item:'Sample',amount:12},
      {customerId:1001,item:'Sample',amount:-1},
      {customerId:1001,item:'Sample',amount:3.001}
    ]) {
      const res=await request(base,'/api/orders','POST',payload);
      assert.equal(res.status,422);
    }
  });
});

test('requires JSON and rejects malformed request bodies',async()=>{
  await withServer(async base=>{
    const wrongType=await fetch(base+'/api/customers',{method:'POST',
      headers:{'content-type':'text/plain'},body:'hello'});
    assert.equal(wrongType.status,415);
    const invalid=await fetch(base+'/api/customers',{method:'POST',
      headers:{'content-type':'application/json'},body:'{bad'});
    assert.equal(invalid.status,400);
  });
});

test('restricts unknown paths and unsupported methods',async()=>{
  await withServer(async base=>{
    assert.equal((await request(base,'/server/data.js')).status,404);
    assert.equal((await request(base,'/api/private')).status,404);
    assert.equal((await request(base,'/api/customers','PUT')).status,405);
  });
});

test('treats user-provided markup as plain record text in JSON',async()=>{
  await withServer(async base=>{
    const name='<img src=x onerror=alert(1)>';
    const created=await request(base,'/api/customers','POST',{
      name,email:'markup@example.com',company:'Safe Demo'
    });
    assert.equal(created.status,201);
    assert.equal(created.body.data.name,name);
  });
});
