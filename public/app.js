/* global jQuery */
(function ($) {
  'use strict';

  const state = {
    view: 'customers', page: 1, search: '', status: 'all', sort: 'newest',
    items: [], editingId: null, request: null, sequence: 0
  };
  const choices = {
    customers: {
      status: [['all','All statuses'],['active','Active'],['prospect','Prospect'],['paused','Paused']],
      sort: [['newest','Newest first'],['name','Name A–Z'],['company','Company A–Z']]
    },
    orders: {
      status: [['all','All statuses'],['paid','Paid'],['pending','Pending'],['refunded','Refunded']],
      sort: [['newest','Newest first'],['amount_high','Highest amount'],['amount_low','Lowest amount']]
    }
  };
  const currency = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
  let searchTimer;
  let toastTimer;
  let restoreFocus = null;

  // Never inject data from the API into HTML strings; all values are written with .text().
  function td(value, klass) {
    const cell=$('<td>').text(value === undefined || value === null ? '—' : String(value));
    if (klass) cell.addClass(klass);
    return cell;
  }
  function statusPill(value) {
    const allowed = ['active','prospect','paused','paid','pending','refunded'];
    const normalized = allowed.includes(value) ? value : 'unknown';
    return $('<span>').addClass('status-pill').addClass(normalized).text(normalized);
  }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0,2).map(s=>s[0] || '').join('').toUpperCase();
  }
  function customerIdentity(customer) {
    const person=$('<div>').addClass('person');
    person.append($('<span>').addClass('person-initials tone-'+(customer.id % 4)).text(initials(customer.name)));
    person.append($('<span>').addClass('person-info')
      .append($('<strong>').text(customer.name))
      .append($('<small>').text(customer.email)));
    return person;
  }
  function actions(id) {
    const wrap=$('<div>').addClass('record-actions');
    for (const [action,label] of [['edit','Edit'],['delete','Delete']]) {
      wrap.append($('<button>',{type:'button'}).addClass('action-button '+action)
        .attr({'data-action':action,'data-id':id,'aria-label':label+' record '+id}).text(label));
    }
    return wrap;
  }
  function rowFor(item) {
    const row=$('<tr>');
    if (state.view === 'customers') {
      row.append($('<td>').append(customerIdentity(item)));
      row.append(td(item.company));
      row.append($('<td>').append(statusPill(item.status)));
      row.append(td(item.orderCount));
      row.append(td(item.joinedAt));
    } else {
      row.append(td('#'+item.id));
      row.append(td(item.customerName));
      row.append(td(item.item,'item-name'));
      row.append(td(currency.format(item.amount)));
      row.append($('<td>').append(statusPill(item.status)));
    }
    row.append($('<td>').append(actions(item.id)));
    return row;
  }
  function setConnection(online) {
    $('#connection').toggleClass('is-offline',!online)
      .find('.online-dot').end().contents().filter(function(){return this.nodeType===3;}).remove();
    $('#connection').append(document.createTextNode(online ? ' API connected' : ' API unavailable'));
  }
  function showToast(message) {
    window.clearTimeout(toastTimer);
    $('#toast').text(message).prop('hidden',false);
    toastTimer=window.setTimeout(()=>$('#toast').prop('hidden',true),4200);
  }
  function errorMessage(xhr,fallback) {
    return (xhr && xhr.responseJSON && xhr.responseJSON.error && xhr.responseJSON.error.message) || fallback;
  }
  function tableMessage(message) {
    $('#tableBody').empty().append($('<tr>').append($('<td>',{colspan:6})
      .addClass('table-message').text(message)));
  }
  function renderTable(data) {
    state.items=data.data || [];
    const meta=data.meta || {page:1,total:0,pageSize:8,totalPages:0};
    const body=$('#tableBody').empty();
    if (!state.items.length) tableMessage('No matching records. Try changing your filters.');
    else state.items.forEach(item=>body.append(rowFor(item)));
    const first=meta.total ? (meta.page-1)*meta.pageSize+1 : 0;
    const last=Math.min(meta.page*meta.pageSize,meta.total);
    $('#paginationLabel').text('Showing '+first+'–'+last+' of '+meta.total+' records');
    $('#pageNumber').text(meta.totalPages ? meta.page+' / '+meta.totalPages : '0 / 0');
    $('#prevPage').prop('disabled',meta.page<=1);
    $('#nextPage').prop('disabled',meta.page>=meta.totalPages);
  }
  function loadTable() {
    const current=++state.sequence;
    if (state.request && state.request.readyState!==4) state.request.abort();
    tableMessage('Loading records...');
    $('#prevPage,#nextPage').prop('disabled',true);
    state.request=$.ajax({
      url:'/api/'+state.view,method:'GET',dataType:'json',timeout:10000,
      data:{page:state.page,pageSize:8,search:state.search,status:state.status,sort:state.sort}
    }).done(response=>{
      if (current!==state.sequence) return;
      setConnection(true);
      renderTable(response);
    }).fail((xhr,status)=>{
      if (status==='abort' || current!==state.sequence) return;
      setConnection(false);
      tableMessage(errorMessage(xhr,'Could not load records. Please retry.'));
      showToast('Could not load records.');
    });
  }
  function loadSummary() {
    return $.ajax({url:'/api/summary',dataType:'json',timeout:10000})
      .done(info=>{
        $('#metricCustomers').text(info.totalCustomers);
        $('#metricActive').text(info.activeCustomers);
        $('#metricOrders').text(info.totalOrders);
        $('#metricRevenue').text(currency.format(info.paidRevenue));
        for (const status of ['paid','pending','refunded']) {
          const total=info.totalOrders || 0;
          const count=info.orderStatuses[status] || 0;
          $('#count'+status[0].toUpperCase()+status.slice(1)).text(count);
          $('#bar'+status[0].toUpperCase()+status.slice(1)).css('width',(total ? count/total*100 : 0)+'%');
        }
        setConnection(true);
      })
      .fail(()=>setConnection(false));
  }
  function refresh() {
    loadSummary();
    loadTable();
  }
  function setOptions(selector,options) {
    const select=$(selector).empty();
    options.forEach(([value,label])=>select.append(new Option(label,value)));
  }
  function switchView(view) {
    if (!choices[view] || (view===state.view && state.items.length)) return;
    state.view=view;state.page=1;state.search='';state.status='all';state.sort='newest';
    $('#searchInput').val('').attr('placeholder',view==='customers' ?
      'Search name, email or company...' : 'Search customer or item...');
    $('[data-view]').each(function(){
      const active=$(this).attr('data-view')===view;
      $(this).toggleClass('is-active',active);
      if ($(this).hasClass('view-tab')) $(this).attr('aria-pressed',String(active));
      if ($(this).hasClass('nav-link')) active ? $(this).attr('aria-current','page') : $(this).removeAttr('aria-current');
    });
    const isCustomer=view==='customers';
    $('#breadcrumbView,#listTitle').text(isCustomer?'Customers':'Orders');
    $('#listDescription').text(isCustomer ?
      'A simple home for every customer relationship.' : 'An up-to-date view of every order and its progress.');
    $('#addLabel').text(isCustomer?'Add customer':'Add order');
    setOptions('#statusFilter',choices[view].status);
    setOptions('#sortFilter',choices[view].sort);
    $('#tableHeaders').empty().append($('<tr>').append((isCustomer ?
      ['CUSTOMER','COMPANY','STATUS','ORDERS','JOINED','ACTIONS'] :
      ['ORDER','CUSTOMER','ITEM','AMOUNT','STATUS','ACTIONS']
    ).map(label=>$('<th>').text(label))));
    loadTable();
  }
  function closeModal() {
    $('#modal').prop('hidden',true);
    $('body').removeClass('modal-open');
    $('#formError').prop('hidden',true);
    if (restoreFocus && document.contains(restoreFocus)) restoreFocus.focus();
    restoreFocus=null;
  }
  function formError(message) {
    $('#formError').text(message).prop('hidden',false);
  }
  function openModal(record) {
    restoreFocus=document.activeElement;
    state.editingId=record ? record.id : null;
    const customer=state.view==='customers';
    $('#recordForm')[0].reset();
    $('#formError').prop('hidden',true);
    $('#saveRecord').prop('disabled',false).text(record?'Save changes':'Create record');
    $('#customerFields').prop('hidden',!customer);
    $('#orderFields').prop('hidden',customer);
    $('#modalTitle').text((record?'Edit ':'Add ')+(customer?'customer':'order'));
    if (customer) {
      $('#customerName').val(record ? record.name : '');
      $('#customerEmail').val(record ? record.email : '');
      $('#customerCompany').val(record ? record.company : '');
      $('#customerStatus').val(record ? record.status : 'active');
    } else {
      $('#orderItem').val(record ? record.item : '');
      $('#orderAmount').val(record ? record.amount : '');
      $('#orderStatus').val(record ? record.status : 'pending');
      $('#orderCustomer').empty().append(new Option('Loading customers...',''));
      $('#saveRecord').prop('disabled',true);
      $.ajax({url:'/api/customer-options',dataType:'json'}).done(response=>{
        if ($('#modal').prop('hidden') || state.view!=='orders') return;
        const options=$('#orderCustomer').empty();
        (response.data || []).forEach(c=>options.append(new Option(c.name,c.id)));
        if (record) options.val(String(record.customerId));
        $('#saveRecord').prop('disabled',!response.data.length);
        if (!response.data.length) formError('Create a customer before adding an order.');
      }).fail(xhr=>formError(errorMessage(xhr,'Could not load customers. Close and retry.')));
    }
    $('#modal').prop('hidden',false);
    $('body').addClass('modal-open');
    window.setTimeout(()=>$(customer?'#customerName':'#orderCustomer').trigger('focus'),30);
  }
  function formPayload() {
    if (state.view==='customers') {
      const name=$('#customerName').val().trim();
      const email=$('#customerEmail').val().trim();
      const company=$('#customerCompany').val().trim();
      if (!name || !company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Enter a name, company and valid email address.');
      }
      return {name,email,company,status:$('#customerStatus').val()};
    }
    const customerId=Number($('#orderCustomer').val());
    const item=$('#orderItem').val().trim();
    const raw=$('#orderAmount').val();
    const amount=Number(raw);
    if (!Number.isSafeInteger(customerId) || !item || !raw || !Number.isFinite(amount) ||
      amount<=0 || amount>100000 || Math.abs(amount*100-Math.round(amount*100))>1e-7) {
      throw new Error('Select a customer, enter an item and a valid amount (up to 2 decimal places).');
    }
    return {customerId,item,amount,status:$('#orderStatus').val()};
  }
  function saveRecord(event) {
    event.preventDefault();
    $('#formError').prop('hidden',true);
    let payload;
    try {payload=formPayload();}
    catch (error) {formError(error.message);return;}
    const editing=state.editingId!==null;
    $('#saveRecord').prop('disabled',true).text('Saving...');
    $.ajax({
      url:'/api/'+state.view+(editing?'/'+state.editingId:''),
      method:editing?'PATCH':'POST',contentType:'application/json',
      data:JSON.stringify(payload),dataType:'json',timeout:10000
    }).done(()=>{
      closeModal(); state.page=1; refresh();
      showToast(editing?'Changes saved successfully.':'Record created successfully.');
    }).fail(xhr=>{
      formError(errorMessage(xhr,'Could not save this record. Please retry.'));
    }).always(()=>$('#saveRecord').prop('disabled',false).text(editing?'Save changes':'Create record'));
  }
  function deleteRecord(record) {
    const name=state.view==='customers'?record.name:'#'+record.id;
    const note=state.view==='customers' && record.orderCount ?
      ' This also removes '+record.orderCount+' linked demo orders.' : '';
    if (!window.confirm('Delete '+name+'?'+note+' This cannot be undone in this demo session.')) return;
    $.ajax({url:'/api/'+state.view+'/'+record.id,method:'DELETE',
      dataType:'json',timeout:10000
    }).done(()=>{
      state.page=1;refresh();showToast('Record deleted.');
    }).fail(xhr=>showToast(errorMessage(xhr,'Could not delete the record.')));
  }

  $(function () {
    setOptions('#statusFilter',choices.customers.status);
    setOptions('#sortFilter',choices.customers.sort);
    $('[data-view]').on('click',function(){switchView($(this).attr('data-view'));});
    $('#addRecord').on('click',()=>openModal(null));
    $('#refreshButton').on('click',()=>refresh());
    $('#searchInput').on('input',function(){
      const value=$(this).val();
      window.clearTimeout(searchTimer);
      searchTimer=window.setTimeout(()=>{state.search=value;state.page=1;loadTable();},250);
    });
    $('#statusFilter').on('change',function(){state.status=$(this).val();state.page=1;loadTable();});
    $('#sortFilter').on('change',function(){state.sort=$(this).val();state.page=1;loadTable();});
    $('#prevPage').on('click',()=>{if(state.page>1){state.page--;loadTable();}});
    $('#nextPage').on('click',()=>{state.page++;loadTable();});
    // Delegation keeps action buttons functional for AJAX-created table rows.
    $('#tableBody').on('click','[data-action]',function(){
      const item=state.items.find(row=>row.id===Number($(this).attr('data-id')));
      if (!item) return;
      if ($(this).attr('data-action')==='edit') openModal(item);
      else deleteRecord(item);
    });
    $('#recordForm').on('submit',saveRecord);
    $('#closeModal,#cancelModal').on('click',closeModal);
    $('#modal').on('click',function(event){if(event.target===this) closeModal();});
    $(document).on('keydown',function(event){
      if (event.key==='Escape' && !$('#modal').prop('hidden')) closeModal();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='k') {
        event.preventDefault();$('#searchInput').trigger('focus');
      }
    });
    refresh();
  });
})(jQuery);
