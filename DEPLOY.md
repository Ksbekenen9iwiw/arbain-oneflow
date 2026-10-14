# Deploy ke Render (gratis, PostgreSQL)

Panduan ini menaruh Arbain OneFlow di Render: web service Docker + database PostgreSQL.
Database berada di luar container, jadi data dan password login tidak hilang saat
service tidur atau deploy ulang.

## Yang sudah disiapkan di repo

| Berkas | Fungsi |
|---|---|
| `render.yaml` | Blueprint: satu web service + satu database Postgres, region Singapore |
| `Dockerfile` | Bangun bundle React (Node) lalu jalankan Django (Python) |
| `scripts/start.py` | Migrasi, seed sekali bila database kosong, lanjut gunicorn |
| `.dockerignore` | Jangan bawa `.venv`, `node_modules`, `runtime`, hasil build lokal |
| `oneflow/settings.py` | Baca `DATABASE_URL`, `ALLOWED_HOSTS`, static lewat whitenoise |

Build dijalankan Render dari `render.yaml`. Tidak ada langkah build manual.

## Prasyarat

1. Repo sudah ada di GitHub/GitLab.
2. Python 3.12 dan Node 22 tersedia lokal (untuk memperbarui `requirements.lock`).
3. Akun Render.

## Langkah 1 — perbarui `requirements.lock` (wajib, sekali)

`requirements.txt` kini memuat `gunicorn`, `whitenoise`, dan `psycopg[binary]`.
`requirements.lock` adalah yang diinstal Render, jadi harus ikut diperbarui.

Di PowerShell, dari folder yang berisi `manage.py`:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m pip freeze > requirements.lock
```

Periksa isinya:

```powershell
Get-Content requirements.lock
```

Harus memuat `gunicorn`, `whitenoise`, dan `psycopg`/`psycopg-binary` selain
Django dan tzdata. Kalau tidak ada, instalan gagal — jangan lanjut.

Sisa panduan di README (migrate, seed, runserver) tetap bisa dipakai untuk
menjalankan versi lokal. Tanpa `DATABASE_URL`, aplikasi tetap memakai SQLite.

## Langkah 2 — commit dan push

```powershell
git add render.yaml Dockerfile .dockerignore scripts/start.py DEPLOY.md
git add .gitignore requirements.txt requirements.lock oneflow/settings.py
git commit -m "Siapkan deploy Render: Docker, Postgres, whitenoise"
git push
```

`requirements.lock` **harus** ikut ter-commit. Kalau tertinggal, build gagal
saat `collectstatic` karena whitenoise tidak terpasang.

## Langkah 3 — buat Blueprint di Render

1. Buka <https://dashboard.render.com/blueprints>.
2. **New Blueprint Instance** → pilih repo ini.
3. Render membaca `render.yaml` dan menampilkan daftar: 1 database (`oneflow-db`),
   1 web service (`oneflow`).
4. Pilih region Singapore untuk keduanya (sudah tertulis di `render.yaml`) lalu
   **Apply**.

Render membuat database dulu, menyuntikkan `DATABASE_URL` ke web service,
kemudian membangun image. Build pertama sekitar 3–6 menit (unduh Node + pip).

## Langkah 4 — ambil password demo

Seed berjalan otomatis saat container pertama kali menyala, dan hanya sekali.
Password muncul di log:

**oneflow → Logs**, cari baris:

```
MANAGER: username=manajer password=...
SALES: username=nadia password=...
SALES: username=rafi password=...
WAREHOUSE: username=gudang password=...
```

Simpan keempatnya. Password dibuat acak dan tidak disimpan di source.

## Langkah 5 — periksa

Buka `https://<nama-service>.onrender.com/login/`.

Kalau berhasil: halaman login tampil rapi (berarti whitenoise dan bundle React
jalan), dan keempat akun bisa masuk.

## Mengganti password

Lewat Shell Render (oneflow → Shell), atau hapus database lalu biarkan seed
berjalan ulang saat deploy berikutnya.

```bash
python manage.py changepassword nadia
```

## Catatan penting

- **Free tier tidur setelah 15 menit tanpa akses.** Permintaan pertama setelah
  tidur butuh sekitar 1 menit. Bilang ke penguji agar tidak menganggapnya error.
- **Database gratis Render punya masa berlaku.** Periksa tanggal kedaluwarsa di
  dashboard. Sebelum habis: upgrade, atau ekspor data, atau biarkan database
  dibuat ulang (seed ulang → password baru).
- **Semua pengunjung memakai akun yang sama.** Tidak ada pendaftaran publik.
  Siapa pun yang punya link dan password bisa mengubah data operasional. Aplikasi
  ini demo; jangan masukkan data nyata.
- **`ONEFLOW_DEBUG=0`.** Halaman error tidak lagi menampilkan traceback. Untuk
  menelusuri masalah, pakai log Render, jangan menyalakan DEBUG di publik.
- **Domain sendiri.** Tambahkan domain di dashboard Render, lalu set env
  `ONEFLOW_ALLOWED_HOSTS` = `domain.com,www.domain.com` dan
  `ONEFLOW_CSRF_TRUSTED_ORIGINS` = `https://domain.com,https://www.domain.com`.
- **Perubahan frontend.** Push ke branch yang dipantau → Render bangun ulang.
  Bundle React tidak di-commit; selalu dibangun di dalam image.

## Kalau build gagal

| Gejala | Penyebab |
|---|---|
| `npm ci` gagal | `package-lock.json` tidak sinkron. Jalankan `npm install` lokal, commit lock-nya |
| `import gunicorn, psycopg, whitenoise` gagal | `requirements.lock` belum diperbarui (langkah 1) |
| `400 Bad Request` | `RENDER_EXTERNAL_HOSTNAME` tidak terlihat. Set manual `ONEFLOW_ALLOWED_HOSTS` |
| `403 CSRF` saat submit form | Set manual `ONEFLOW_CSRF_TRUSTED_ORIGINS` = `https://domain` |
| Deploy sukses, halaman 500 | Baca log. Biasanya koneksi database: cek `DATABASE_URL` sampai ke service, dan `ipAllowList` di `render.yaml` tidak memblokir akses internal |
| Halaman tanpa CSS | `collectstatic` tidak jalan, atau `STATIC_ROOT` tidak terisi |

## Menjalankan suite test terhadap PostgreSQL

Test lokal memakai SQLite dan sebagian mengandaikan itu. Jangan arahkan
`manage.py test` ke database Render, dan jangan pakai database bisnis sebagai
database test — `settings.py` menolak konfigurasi SQLite yang bertabrakan.
