'use strict';
const {createSeedState} = require('./data');

class ApiError extends Error {
  constructor(status, code, message) {
    super(message); this.status = status; this.code = code;
  }
}
const CUSTOMER_STATUSES = new Set(['active','prospect','paused']);
const ORDER_STATUSES = new Set(['paid','pending','refunded']);
const FIELDS = {
  customers: new Set(['name','email','company','status']),
  orders: new Set(['customerId','item','amount','status'])
};
const SORTS = {
  customers: new Set(['newest','name','company']),
  orders: new Set(['newest','amount_high','amount_low'])
};
const fail = (status,code,message) => {throw new ApiError(status,code,message);};
const formatDate = () => new Date().toISOString().slice(0,10);

function text(value, field, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    fail(422,'validation_error',`${field} must contain 1–${max} characters.`);
  }
  return value.trim();
}
function validate(type, input, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail(400,'invalid_body','A JSON object is required.');
  }
  const required = type === 'customers' ? ['name','email','company'] : ['customerId','item','amount'];
  if (!partial && required.some(field => !(field in input))) {
    fail(422,'validation_error',`Required fields: ${required.join(', ')}.`);
  }
  if (partial && !Object.keys(input).length) fail(422,'validation_error','At least one field is required.');
  if (Object.keys(input).some(field => !FIELDS[type].has(field))) {
    fail(422,'validation_error','Unknown field supplied.');
  }
  const result = {};
  if (type === 'customers') {
    for (const field of ['name','email','company']) {
      if (field in input) result[field] = text(input[field],field,field === 'name' ? 80 : 120);
    }
    if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) {
      fail(422,'validation_error','Provide a valid email address.');
    }
    if ('status' in input && !CUSTOMER_STATUSES.has(input.status)) {
      fail(422,'validation_error','Invalid customer status.');
    }
    if ('status' in input) result.status = input.status;
    else if (!partial) result.status = 'prospect';
  } else {
    if ('customerId' in input) {
      if (!Number.isSafeInteger(input.customerId)) fail(422,'validation_error','customerId must be an integer.');
      result.customerId = input.customerId;
    }
    if ('item' in input) result.item = text(input.item,'item',100);
    if ('amount' in input) {
      const amount = input.amount;
      if (typeof amount !== 'number' || !Number.isFinite(amount) ||
        amount <= 0 || amount > 100000 ||
        Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
        fail(422,'validation_error','Amount must be between 0.01 and 100000 with at most 2 decimal places.');
      }
      result.amount = amount;
    }
    if ('status' in input && !ORDER_STATUSES.has(input.status)) {
      fail(422,'validation_error','Invalid order status.');
    }
    if ('status' in input) result.status = input.status;
    else if (!partial) result.status = 'pending';
  }
  return result;
}
function filters(query,type) {
  const page = Number(query.get('page') || 1);
  const pageSize = Number(query.get('pageSize') || 8);
  const sort = query.get('sort') || 'newest';
  const status = query.get('status') || 'all';
  const search = (query.get('search') || '').trim().toLowerCase();
  const statuses = type === 'customers' ? CUSTOMER_STATUSES : ORDER_STATUSES;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 ||
    !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
    !SORTS[type].has(sort) || (status !== 'all' && !statuses.has(status)) || search.length > 120) {
    fail(400,'invalid_query','Invalid page, pageSize, sort, status or search.');
  }
  return {page,pageSize,sort,status,search};
}
function list(store,type,query) {
  const opts = filters(query,type);
  let rows;
  if (type === 'customers') {
    rows = store.customers.map(customer => ({
      ...customer, orderCount: store.orders.filter(order => order.customerId === customer.id).length
    }));
    rows = rows.filter(c => (opts.status === 'all' || c.status === opts.status) &&
      [c.name,c.email,c.company].some(s => s.toLowerCase().includes(opts.search)));
    rows.sort((a,b) => opts.sort === 'name' ? a.name.localeCompare(b.name) :
      opts.sort === 'company' ? a.company.localeCompare(b.company) : b.id-a.id);
  } else {
    const names = new Map(store.customers.map(c => [c.id,c.name]));
    rows = store.orders.map(o => ({...o,customerName:names.get(o.customerId) || 'Unknown'}));
    rows = rows.filter(o => (opts.status === 'all' || o.status === opts.status) &&
      [o.item,o.customerName].some(s => s.toLowerCase().includes(opts.search)));
    rows.sort((a,b) => opts.sort === 'amount_high' ? b.amount-a.amount || b.id-a.id :
      opts.sort === 'amount_low' ? a.amount-b.amount || b.id-a.id : b.id-a.id);
  }
  return {
    data: rows.slice((opts.page-1)*opts.pageSize,opts.page*opts.pageSize),
    meta: {page:opts.page,pageSize:opts.pageSize,total:rows.length,
      totalPages:Math.ceil(rows.length/opts.pageSize)}
  };
}
function summary(store) {
  const orderStatuses = {paid:0,pending:0,refunded:0};
  let cents = 0;
  for (const order of store.orders) {
    orderStatuses[order.status] += 1;
    if (order.status === 'paid') cents += Math.round(order.amount*100);
  }
  return {
    totalCustomers:store.customers.length,
    activeCustomers:store.customers.filter(c => c.status === 'active').length,
    totalOrders:store.orders.length,
    pendingOrders:orderStatuses.pending,
    paidRevenue:cents/100,
    orderStatuses
  };
}
function perform(store,method,route,query,input) {
  if (method === 'GET' && route === '/api/health') return [200,{ok:true,service:'jquery-rest-dashboard'}];
  if (method === 'GET' && route === '/api/summary') return [200,summary(store)];
  if (method === 'GET' && route === '/api/customer-options') return [200,{data:
    [...store.customers].sort((a,b)=>a.name.localeCompare(b.name)).map(({id,name})=>({id,name}))}];
  const match = route.match(/^\/api\/(customers|orders)(?:\/(\d+))?$/);
  if (!match) fail(404,'not_found','Endpoint not found.');
  const [,type,rawId] = match;
  const collection = store[type];
  const current = rawId ? collection.find(row => row.id === Number(rawId)) : null;
  if (rawId && !current) fail(404,'not_found','Record not found.');
  if (method === 'GET') {
    return rawId ? [200,{data:current}] : [200,list(store,type,query)];
  }
  if (method === 'POST' && !rawId) {
    const entry = validate(type,input);
    if (type === 'customers') {
      if (store.customers.some(c => c.email.toLowerCase() === entry.email.toLowerCase())) {
        fail(409,'duplicate_email','A customer with this email already exists.');
      }
      const record = {id:store.nextCustomerId++,...entry,joinedAt:formatDate()};
      collection.unshift(record);
      return [201,{data:record}];
    }
    if (!store.customers.some(c=>c.id===entry.customerId)) {
      fail(422,'validation_error','Select an existing customer.');
    }
    const record = {id:store.nextOrderId++,...entry,createdAt:formatDate()};
    collection.unshift(record);
    return [201,{data:record}];
  }
  if (method === 'PATCH' && rawId) {
    const patch = validate(type,input,true);
    if (type === 'customers' && patch.email &&
      store.customers.some(c => c.id !== current.id && c.email.toLowerCase()===patch.email.toLowerCase())) {
      fail(409,'duplicate_email','A customer with this email already exists.');
    }
    if (type === 'orders' && patch.customerId !== undefined &&
      !store.customers.some(c => c.id===patch.customerId)) {
      fail(422,'validation_error','Select an existing customer.');
    }
    Object.assign(current,patch);
    return [200,{data:current}];
  }
  if (method === 'DELETE' && rawId) {
    collection.splice(collection.indexOf(current),1);
    if (type === 'customers') {
      const before=store.orders.length;
      store.orders=store.orders.filter(o=>o.customerId !== current.id);
      return [200,{deleted:true,removedOrders:before-store.orders.length}];
    }
    return [200,{deleted:true}];
  }
  fail(405,'method_not_allowed','Method not allowed for this resource.');
}

module.exports={ApiError,createSeedState,perform,validate};
