-- ============================================================
-- DDL: Koperasi Pegawai BKN Kanreg V Jakarta
-- ============================================================

-- Drop tables if exist (for fresh setup)
DROP TABLE IF EXISTS cicilan_pinjaman CASCADE;
DROP TABLE IF EXISTS pengajuan_pinjaman CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Table: users
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  nip           VARCHAR(30) UNIQUE NOT NULL,
  nik           VARCHAR(30),
  nama          VARCHAR(150) NOT NULL,
  jabatan       VARCHAR(100),
  unit_kerja    VARCHAR(150),
  alamat        TEXT,
  no_hp         VARCHAR(30),
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: transaksi_simpanan
CREATE TABLE transaksi_simpanan (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jenis_simpanan  VARCHAR(20) NOT NULL CHECK (jenis_simpanan IN ('pokok', 'wajib', 'sukarela')),
  tipe_transaksi  VARCHAR(10) NOT NULL DEFAULT 'setor' CHECK (tipe_transaksi IN ('setor', 'tarik')),
  nominal         NUMERIC(15,2) NOT NULL CHECK (nominal > 0),
  tanggal         DATE NOT NULL DEFAULT CURRENT_DATE,
  keterangan      TEXT,
  admin_id        INTEGER REFERENCES users(id),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: pengajuan_pinjaman
CREATE TABLE pengajuan_pinjaman (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nominal_pengajuan   NUMERIC(15,2) NOT NULL,
  tenor_bulan         INTEGER NOT NULL CHECK (tenor_bulan BETWEEN 1 AND 60),
  suku_bunga_persen   NUMERIC(5,2) NOT NULL DEFAULT 2.0,
  keperluan           TEXT,
  biaya_admin         NUMERIC(15,2) DEFAULT 0,
  nominal_cair        NUMERIC(15,2),
  status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','APPROVED','REJECTED','LUNAS')),
  catatan_admin       TEXT,
  tanggal_persetujuan DATE,
  is_topup            BOOLEAN DEFAULT FALSE,
  topup_pinjaman_id   INTEGER REFERENCES pengajuan_pinjaman(id) ON DELETE SET NULL,
  pelunasan_pinjaman_lama NUMERIC(15,2) DEFAULT 0,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: cicilan_pinjaman
CREATE TABLE cicilan_pinjaman (
  id               SERIAL PRIMARY KEY,
  pinjaman_id      INTEGER NOT NULL REFERENCES pengajuan_pinjaman(id) ON DELETE CASCADE,
  bulan_ke         INTEGER NOT NULL,
  periode_tagihan  VARCHAR(7) NOT NULL,
  pokok_angsuran   NUMERIC(15,2) NOT NULL,
  bunga_angsuran   NUMERIC(15,2) NOT NULL,
  total_angsuran   NUMERIC(15,2) NOT NULL,
  sisa_pokok       NUMERIC(15,2) NOT NULL,
  status_potong    VARCHAR(20) NOT NULL DEFAULT 'BELUM_DIPOTONG'
                     CHECK (status_potong IN ('BELUM_DIPOTONG','SUDAH_DIPOTONG')),
  tanggal_potong   DATE,
  admin_id         INTEGER REFERENCES users(id),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_cicilan_pinjaman_id ON cicilan_pinjaman(pinjaman_id);
CREATE INDEX idx_cicilan_periode ON cicilan_pinjaman(periode_tagihan);
CREATE INDEX idx_cicilan_status ON cicilan_pinjaman(status_potong);
CREATE INDEX idx_pengajuan_user ON pengajuan_pinjaman(user_id);
CREATE INDEX idx_pengajuan_status ON pengajuan_pinjaman(status);
