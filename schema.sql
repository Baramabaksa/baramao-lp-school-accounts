CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','accounts','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notices (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('School','Accounts','Holidays','Urgent')),
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cashbook (
  id BIGSERIAL PRIMARY KEY,
  entry_date DATE NOT NULL,
  particulars TEXT NOT NULL,
  voucher_no TEXT DEFAULT '',
  receipt NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (receipt >= 0),
  payment NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (payment >= 0),
  remarks TEXT DEFAULT '',
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS vouchers (
  id BIGSERIAL PRIMARY KEY,
  voucher_date DATE NOT NULL,
  voucher_no TEXT NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  particulars TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  category TEXT NOT NULL DEFAULT 'General',
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS students (
  id BIGSERIAL PRIMARY KEY,
  admission_no TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL CHECK (class_name IN ('I','II','III','IV','V')),
  guardian_name TEXT DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS meal_records (
  id BIGSERIAL PRIMARY KEY,
  record_date DATE NOT NULL UNIQUE,
  student_count INTEGER NOT NULL CHECK (student_count >= 0),
  rate_per_student NUMERIC(8,2) NOT NULL DEFAULT 6.78 CHECK (rate_per_student >= 0),
  notes TEXT DEFAULT '',
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
