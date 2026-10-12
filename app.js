const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let me = null, dashboardData = null;
const money = v => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(v||0));
const dateFmt = v => { if(!v) return ''; const s=String(v).slice(0,10); return s; };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(text,bad=false){ const el=$('#message'); el.textContent=text; el.classList.toggle('bad',bad); if(text) setTimeout(()=>{if(el.textContent===text)el.textContent=''},4500); }
async function api(url, options={}) {
  const res=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const type=res.headers.get('content-type')||'';
  const data=type.includes('application/json')?await res.json():await res.text();
  if(!res.ok) throw new Error(data.error||'Request failed.');
  return data;
}
function formData(form){return Object.fromEntries(new FormData(form).entries())}
function setRoleUI(){
  const role=me?.role;
  $$('.admin-only').forEach(e=>e.classList.toggle('hidden',role!=='admin'));
  $$('.accounts-only').forEach(e=>e.classList.toggle('hidden',!['admin','accounts'].includes(role)));
  $$('.export-btn').forEach(e=>e.classList.toggle('hidden',!['admin','accounts'].includes(role)));
}
function tab(name){
  $$('.tab-pane').forEach(p=>p.classList.toggle('hidden',p.id!==`tab-${name}`));
  $$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
}
function noticeHTML(n,admin=false){
  const cls=n.category==='Urgent'?'urgent':n.category==='Holidays'?'holidays':'';
  return `<article class="notice"><div class="notice-top"><h3>${esc(n.title)}</h3><span class="pill ${cls}">${esc(n.category)}</span></div><p>${esc(n.body)}</p><div class="notice-top"><small>${esc(String(n.created_at||'').replace('T',' ').slice(0,16))}</small>${admin?`<button class="button" onclick="deleteNotice(${Number(n.id)})">Delete</button>`:''}</div></article>`;
}
async function refreshDashboard(){
  dashboardData=await api('/api/dashboard');
  $('#statReceipts').textContent=money(dashboardData.totals.receipts);
  $('#statPayments').textContent=money(dashboardData.totals.payments);
  $('#statStudents').textContent=dashboardData.totals.students;
  $('#statMeal').textContent=money(dashboardData.totals.meal);
  $('#latestNotices').innerHTML=dashboardData.notices.slice(0,4).map(n=>noticeHTML(n,false)).join('')||'<div class="empty">No notices published yet.</div>';
  $('#noticeList').innerHTML=dashboardData.notices.map(n=>noticeHTML(n,me.role==='admin')).join('')||'<div class="empty">No notices published yet.</div>';
}
async function loadCash(){
  const rows=await api('/api/cashbook');
  $('#cashRows').innerHTML=rows.map(r=>`<tr><td>${dateFmt(r.entry_date)}</td><td>${esc(r.particulars)}</td><td>${esc(r.voucher_no)}</td><td class="amount">${money(r.receipt)}</td><td class="amount">${money(r.payment)}</td><td>${esc(r.remarks)}</td><td class="admin-only">${me.role==='admin'?`<button class="button" onclick="deleteCash(${r.id})">Delete</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">No cash book entries yet.</td></tr>';
}
async function loadVouchers(){
 const rows=await api('/api/vouchers');
 $('#voucherRows').innerHTML=rows.map(r=>`<tr><td>${dateFmt(r.voucher_date)}</td><td>${esc(r.voucher_no)}</td><td>${esc(r.supplier)}</td><td>${esc(r.particulars)}</td><td>${esc(r.category)}</td><td class="amount">${money(r.amount)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No vouchers recorded yet.</td></tr>';
}
async function loadStudents(){
 const rows=await api('/api/students');
 $('#studentRows').innerHTML=rows.map(r=>`<tr><td>${esc(r.admission_no)}</td><td>${esc(r.student_name)}</td><td>${esc(r.class_name)}</td><td>${esc(r.guardian_name)}</td><td>${r.active?'Active':'Inactive'}</td><td class="accounts-only">${['admin','accounts'].includes(me.role)?`<button class="button" onclick="toggleStudent(${r.id},${!r.active})">${r.active?'Deactivate':'Activate'}</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No students added yet.</td></tr>';
}
async function loadMeals(){
 const rows=await api('/api/meals');
 $('#mealRows').innerHTML=rows.map(r=>`<tr><td>${dateFmt(r.record_date)}</td><td>${esc(r.student_count)}</td><td>${money(r.rate_per_student)}</td><td class="amount">${money(r.total)}</td><td>${esc(r.notes)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No meal records yet.</td></tr>';
}
async function refreshAll(){await Promise.all([refreshDashboard(),loadCash(),loadVouchers(),loadStudents(),loadMeals()]);setRoleUI();}
async function enterApp(user){
  me=user; $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden'); $('#logoutBtn').classList.remove('hidden');
  $('#userLine').textContent=`Signed in as ${user.displayName} · ${user.role}`;
  setRoleUI(); await refreshAll();
}
async function start(){
  try{const d=await api('/api/me'); if(d.user) await enterApp(d.user);}catch(e){console.error(e)}
}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').textContent='';try{const d=await api('/api/login',{method:'POST',body:JSON.stringify(formData(e.target))});e.target.reset();await enterApp(d.user)}catch(err){$('#loginError').textContent=err.message}});
$('#logoutBtn').addEventListener('click',async()=>{await api('/api/logout',{method:'POST'});location.reload()});
$('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)tab(b.dataset.tab)});
$$('[data-goto]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.goto)));
$('#noticeForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/notices',{method:'POST',body:JSON.stringify(formData(e.target))});e.target.reset();await refreshDashboard();message('Notice published.')}catch(err){message(err.message,true)}});
window.deleteNotice=async id=>{if(!confirm('Delete this notice?'))return;try{await api(`/api/notices/${id}`,{method:'DELETE'});await refreshDashboard();message('Notice deleted.')}catch(e){message(e.message,true)}};
$('#cashForm').addEventListener('submit',async e=>{e.preventDefault();const d=formData(e.target);try{await api('/api/cashbook',{method:'POST',body:JSON.stringify(d)});e.target.reset();e.target.elements.receipt.value='0';e.target.elements.payment.value='0';e.target.elements.entry_date.value=new Date().toISOString().slice(0,10);await loadCash();await refreshDashboard();message('Cash book entry saved.')}catch(err){message(err.message,true)}});
window.deleteCash=async id=>{if(!confirm('Delete this cash book entry?'))return;try{await api(`/api/cashbook/${id}`,{method:'DELETE'});await loadCash();await refreshDashboard();message('Entry deleted.')}catch(e){message(e.message,true)}};
$('#voucherForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/vouchers',{method:'POST',body:JSON.stringify(formData(e.target))});e.target.reset();e.target.elements.category.value='General';e.target.elements.voucher_date.value=new Date().toISOString().slice(0,10);await loadVouchers();message('Voucher saved.')}catch(err){message(err.message,true)}});
$('#studentForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/students',{method:'POST',body:JSON.stringify(formData(e.target))});e.target.reset();await loadStudents();await refreshDashboard();message('Student added.')}catch(err){message(err.message,true)}});
window.toggleStudent=async(id,active)=>{try{await api(`/api/students/${id}`,{method:'PATCH',body:JSON.stringify({active})});await loadStudents();await refreshDashboard();message('Student status updated.')}catch(e){message(e.message,true)}};
$('#mealForm').addEventListener('input',()=>{const f=formData($('#mealForm'));$('#mealTotal').value=money((Number(f.student_count)||0)*(Number(f.rate_per_student)||0))});
$('#mealForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/meals',{method:'POST',body:JSON.stringify(formData(e.target))});e.target.reset();e.target.elements.rate_per_student.value='6.78';$('#mealTotal').value=money(0);await loadMeals();await refreshDashboard();message('Meal record saved.')}catch(err){message(err.message,true)}});
$$('.export-btn').forEach(b=>b.addEventListener('click',async()=>{try{const res=await fetch(`/api/export/${b.dataset.export}`);if(!res.ok){const d=await res.json();throw new Error(d.error||'Export failed.')}const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${b.dataset.export}.csv`;a.click();URL.revokeObjectURL(url)}catch(e){message(e.message,true)}}));
$('#backupBtn').addEventListener('click',async()=>{try{const res=await fetch('/api/backup');if(!res.ok){const d=await res.json();throw new Error(d.error||'Backup failed.')}const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='baramao-school-backup.json';a.click();URL.revokeObjectURL(url);message('Backup downloaded. Keep it in a secure place.')}catch(e){message(e.message,true)}});
$('#userForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/users',{method:'POST',body:JSON.stringify(formData(e.target))});e.target.reset();message('User created. Share credentials securely and ask the user to change their password through your managed process.')}catch(err){message(err.message,true)}});
$('#cashForm').elements.entry_date.value=new Date().toISOString().slice(0,10);
$('#voucherForm').elements.voucher_date.value=new Date().toISOString().slice(0,10);
$('#mealForm').elements.record_date.value=new Date().toISOString().slice(0,10);
start();
