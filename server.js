require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
const PORT = process.env.PORT || 3000;
const roles = { admin: 3, accounts: 2, viewer: 1 };

app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new PgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const requireAuth = (req,res,next) => req.session.user ? next() : res.status(401).json({ error: 'Please log in.' });
const requireRole = min => (req,res,next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in.' });
  if ((roles[req.session.user.role] || 0) < min) return res.status(403).json({ error: 'You do not have permission for this action.' });
  next();
};
const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const str = (v, max=500) => String(v ?? '').trim().slice(0,max);
const num = v => Number.isFinite(Number(v)) ? Number(v) : NaN;

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  // Set initial admin via environment variables on first deployment.
  if (process.env.INIT_ADMIN_USERNAME && process.env.INIT_ADMIN_PASSWORD) {
    const exists = await pool.query('SELECT id FROM users WHERE username=$1', [process.env.INIT_ADMIN_USERNAME]);
    if (!exists.rowCount) {
      const hash = await bcrypt.hash(process.env.INIT_ADMIN_PASSWORD, 12);
      await pool.query('INSERT INTO users(username,password_hash,display_name,role) VALUES($1,$2,$3,$4)',
        [str(process.env.INIT_ADMIN_USERNAME,80), hash, str(process.env.INIT_ADMIN_NAME || 'School Administrator',120), 'admin']);
      console.log('Initial administrator created from environment settings.');
    }
  }
}

app.get('/api/me', (req,res) => res.json({ user: req.session.user || null }));
app.post('/api/login', asyncRoute(async (req,res) => {
  const username = str(req.body.username,80);
  const password = String(req.body.password || '');
  const result = await pool.query('SELECT id,username,password_hash,display_name,role FROM users WHERE username=$1', [username]);
  if (!result.rowCount || !(await bcrypt.compare(password, result.rows[0].password_hash))) return res.status(401).json({error:'Username or password is incorrect.'});
  const u = result.rows[0];
  req.session.user = { id:u.id, username:u.username, displayName:u.display_name, role:u.role };
  res.json({ user:req.session.user });
}));
app.post('/api/logout', (req,res) => req.session.destroy(() => res.json({ok:true})));

app.get('/api/dashboard', requireAuth, asyncRoute(async (req,res) => {
  const [notices,cash,students,meal] = await Promise.all([
    pool.query('SELECT id,title,body,category,created_at FROM notices ORDER BY created_at DESC LIMIT 50'),
    pool.query('SELECT COALESCE(SUM(receipt),0) receipts, COALESCE(SUM(payment),0) payments FROM cashbook'),
    pool.query('SELECT COUNT(*) total FROM students WHERE active=true'),
    pool.query('SELECT COALESCE(SUM(student_count*rate_per_student),0) total FROM meal_records')
  ]);
  res.json({ notices:notices.rows, totals:{ receipts:Number(cash.rows[0].receipts), payments:Number(cash.rows[0].payments), students:Number(students.rows[0].total), meal:Number(meal.rows[0].total) } });
}));

app.post('/api/users', requireRole(3), asyncRoute(async (req,res) => {
  const username = str(req.body.username,80), password = String(req.body.password || '');
  const displayName = str(req.body.displayName,120), role = str(req.body.role,20);
  if (!username || password.length < 12 || !displayName || !['admin','accounts','viewer'].includes(role)) return res.status(400).json({error:'Enter username, display name, role, and a password of at least 12 characters.'});
  const hash = await bcrypt.hash(password,12);
  try {
    const r = await pool.query('INSERT INTO users(username,password_hash,display_name,role) VALUES($1,$2,$3,$4) RETURNING id,username,display_name,role', [username,hash,displayName,role]);
    res.status(201).json({user:r.rows[0]});
  } catch(e) { if (e.code==='23505') return res.status(409).json({error:'That username already exists.'}); throw e; }
}));

app.post('/api/notices', requireRole(2), asyncRoute(async (req,res) => {
  const title=str(req.body.title,160), body=str(req.body.body,3000), category=str(req.body.category,20);
  if (!title || !body || !['School','Accounts','Holidays','Urgent'].includes(category)) return res.status(400).json({error:'Complete the title, message and category.'});
  const r=await pool.query('INSERT INTO notices(title,body,category,created_by) VALUES($1,$2,$3,$4) RETURNING *',[title,body,category,req.session.user.id]);
  res.status(201).json(r.rows[0]);
}));
app.delete('/api/notices/:id', requireRole(3), asyncRoute(async (req,res) => { await pool.query('DELETE FROM notices WHERE id=$1',[req.params.id]); res.json({ok:true}); }));

app.get('/api/cashbook', requireAuth, asyncRoute(async (req,res) => {
  const r=await pool.query('SELECT id,entry_date,particulars,voucher_no,receipt,payment,remarks FROM cashbook ORDER BY entry_date DESC,id DESC LIMIT 1000');
  res.json(r.rows);
}));
app.post('/api/cashbook', requireRole(2), asyncRoute(async (req,res) => {
  const d=str(req.body.entry_date,10), particulars=str(req.body.particulars,250), voucher=str(req.body.voucher_no,80), remarks=str(req.body.remarks,500);
  const receipt=num(req.body.receipt||0), payment=num(req.body.payment||0);
  if(!validDate(d)||!particulars||!Number.isFinite(receipt)||!Number.isFinite(payment)||receipt<0||payment<0||(receipt===0&&payment===0)) return res.status(400).json({error:'Enter a valid date, particulars, and a positive receipt or payment amount.'});
  const r=await pool.query('INSERT INTO cashbook(entry_date,particulars,voucher_no,receipt,payment,remarks,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[d,particulars,voucher,receipt,payment,remarks,req.session.user.id]);
  res.status(201).json(r.rows[0]);
}));
app.delete('/api/cashbook/:id', requireRole(3), asyncRoute(async (req,res) => { await pool.query('DELETE FROM cashbook WHERE id=$1',[req.params.id]); res.json({ok:true}); }));

app.get('/api/vouchers', requireAuth, asyncRoute(async (req,res) => {
  const r=await pool.query('SELECT id,voucher_date,voucher_no,supplier,particulars,amount,category FROM vouchers ORDER BY voucher_date DESC,id DESC LIMIT 1000');
  res.json(r.rows);
}));
app.post('/api/vouchers', requireRole(2), asyncRoute(async (req,res) => {
  const d=str(req.body.voucher_date,10), no=str(req.body.voucher_no,80), supplier=str(req.body.supplier,160), particulars=str(req.body.particulars,250), category=str(req.body.category,80), amount=num(req.body.amount);
  if(!validDate(d)||!no||!particulars||!Number.isFinite(amount)||amount<0) return res.status(400).json({error:'Enter valid voucher date, number, particulars and amount.'});
  const r=await pool.query('INSERT INTO vouchers(voucher_date,voucher_no,supplier,particulars,amount,category,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[d,no,supplier,particulars,amount,category||'General',req.session.user.id]);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/students', requireAuth, asyncRoute(async (req,res) => { const r=await pool.query('SELECT id,admission_no,student_name,class_name,guardian_name,active FROM students ORDER BY class_name,student_name'); res.json(r.rows); }));
app.post('/api/students', requireRole(2), asyncRoute(async (req,res) => {
  const no=str(req.body.admission_no,80), name=str(req.body.student_name,160), cls=str(req.body.class_name,10), guardian=str(req.body.guardian_name,160);
  if(!no||!name||!['I','II','III','IV','V'].includes(cls)) return res.status(400).json({error:'Enter admission number, student name and Class I–V.'});
  try { const r=await pool.query('INSERT INTO students(admission_no,student_name,class_name,guardian_name) VALUES($1,$2,$3,$4) RETURNING *',[no,name,cls,guardian]); res.status(201).json(r.rows[0]); }
  catch(e) { if(e.code==='23505') return res.status(409).json({error:'Admission number already exists.'}); throw e; }
}));
app.patch('/api/students/:id', requireRole(2), asyncRoute(async (req,res) => { const active=Boolean(req.body.active); await pool.query('UPDATE students SET active=$1 WHERE id=$2',[active,req.params.id]); res.json({ok:true}); }));

app.get('/api/meals', requireAuth, asyncRoute(async (req,res) => { const r=await pool.query('SELECT id,record_date,student_count,rate_per_student,notes,(student_count*rate_per_student) AS total FROM meal_records ORDER BY record_date DESC LIMIT 1000'); res.json(r.rows); }));
app.post('/api/meals', requireRole(2), asyncRoute(async (req,res) => {
  const d=str(req.body.record_date,10), count=num(req.body.student_count), rate=num(req.body.rate_per_student ?? 6.78), notes=str(req.body.notes,500);
  if(!validDate(d)||!Number.isInteger(count)||count<0||!Number.isFinite(rate)||rate<0) return res.status(400).json({error:'Enter a valid date, non-negative student count and rate.'});
  const r=await pool.query('INSERT INTO meal_records(record_date,student_count,rate_per_student,notes,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(record_date) DO UPDATE SET student_count=EXCLUDED.student_count,rate_per_student=EXCLUDED.rate_per_student,notes=EXCLUDED.notes RETURNING *',[d,count,rate,notes,req.session.user.id]);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/export/:type', requireRole(2), asyncRoute(async (req,res) => {
  const queries = {
    cashbook: 'SELECT entry_date,particulars,voucher_no,receipt,payment,remarks FROM cashbook ORDER BY entry_date,id',
    vouchers: 'SELECT voucher_date,voucher_no,supplier,particulars,amount,category FROM vouchers ORDER BY voucher_date,id',
    students: 'SELECT admission_no,student_name,class_name,guardian_name,active FROM students ORDER BY class_name,student_name',
    meals: 'SELECT record_date,student_count,rate_per_student,(student_count*rate_per_student) AS total,notes FROM meal_records ORDER BY record_date'
  };
  const q=queries[req.params.type]; if(!q) return res.status(404).json({error:'Unknown export type.'});
  const r=await pool.query(q);
  const esc = v => { const s=String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; };
  const csv=[r.fields.map(f=>esc(f.name)).join(','), ...r.rows.map(row=>r.fields.map(f=>esc(row[f.name])).join(','))].join('\r\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="${req.params.type}.csv"`);
  res.send('\uFEFF'+csv);
}));
app.get('/api/backup', requireRole(3), asyncRoute(async (req,res) => {
  const names=['users','notices','cashbook','vouchers','students','meal_records'];
  const backup={exportedAt:new Date().toISOString(),school:'Baramao LP School',data:{}};
  for(const n of names) { const r=await pool.query(`SELECT * FROM ${n}`); backup.data[n]=r.rows; }
  res.setHeader('Content-Type','application/json');
  res.setHeader('Content-Disposition','attachment; filename="baramao-school-backup.json"');
  res.send(JSON.stringify(backup,null,2));
}));

app.get('*', (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));
app.use((err,req,res,next) => { console.error(err); res.status(500).json({error:'A server error occurred. Check server logs.'}); });

init().then(()=>app.listen(PORT,()=>console.log(`Baramao LP School Accounts running on port ${PORT}`)))
  .catch(err=>{ console.error('Startup failed:',err); process.exit(1); });
