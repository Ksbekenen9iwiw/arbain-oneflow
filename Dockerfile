# Tahap 1: bangun bundle frontend. Node tidak ikut ke image akhir.
FROM node:22-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Tahap 2: runtime Django.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock
# Gagal di sini lebih jelas daripada 500 saat service menyala.
RUN python -c "import gunicorn, psycopg, whitenoise"
COPY . .
COPY --from=frontend /app/crm/static/crm/react ./crm/static/crm/react
COPY --from=frontend /app/crm/templates/crm/generated ./crm/templates/crm/generated
RUN python manage.py collectstatic --noinput
CMD ["python", "scripts/start.py"]
