import os
import secrets
from pathlib import Path
from urllib.parse import unquote, urlparse

BASE_DIR = Path(__file__).resolve().parent.parent
RUNTIME = BASE_DIR / 'runtime'
RUNTIME.mkdir(exist_ok=True)
SECRET_KEY = os.environ.get('ONEFLOW_SECRET_KEY')
if not SECRET_KEY:
    key_path = RUNTIME / 'secret_key.txt'
    try:
        with key_path.open('x', encoding='utf-8') as key_file:
            key_file.write(secrets.token_urlsafe(64))
        key_path.chmod(0o600)
    except FileExistsError:
        pass
    SECRET_KEY = key_path.read_text(encoding='utf-8').strip()

DEBUG = os.environ.get('ONEFLOW_DEBUG', '1') == '1'
ONEFLOW_DEMO = os.environ.get('ONEFLOW_DEMO', '1') == '1'
ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]'] + [h for h in os.environ.get('ONEFLOW_ALLOWED_HOSTS', '').split(',') if h]
CSRF_TRUSTED_ORIGINS = [o for o in os.environ.get('ONEFLOW_CSRF_TRUSTED_ORIGINS', '').split(',') if o]
RENDER_HOSTNAME = os.environ.get('RENDER_EXTERNAL_HOSTNAME')
if RENDER_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_HOSTNAME)
    CSRF_TRUSTED_ORIGINS.append(f'https://{RENDER_HOSTNAME}')
INSTALLED_APPS = ['django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles', 'crm']
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'whitenoise.middleware.WhiteNoiseMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware', 'django.contrib.messages.middleware.MessageMiddleware', 'django.middleware.clickjacking.XFrameOptionsMiddleware', 'crm.frontend.FrontendErrors']
ROOT_URLCONF = 'oneflow.urls'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [], 'APP_DIRS': True, 'OPTIONS': {'context_processors': ['django.template.context_processors.request', 'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION = 'oneflow.wsgi.application'
DATABASE_URL = os.environ.get('DATABASE_URL', '')
if DATABASE_URL:
    # Connection string internal Render tidak memakai query parameter.
    parsed = urlparse(DATABASE_URL)
    DATABASES = {'default': {'ENGINE': 'django.db.backends.postgresql', 'NAME': parsed.path.lstrip('/'), 'USER': unquote(parsed.username or ''), 'PASSWORD': unquote(parsed.password or ''), 'HOST': parsed.hostname or '', 'PORT': str(parsed.port or ''), 'CONN_MAX_AGE': 600, 'ATOMIC_REQUESTS': False}}
else:
    DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': os.environ.get('ONEFLOW_DB', str(RUNTIME / 'oneflow.sqlite3')), 'OPTIONS': {'transaction_mode': 'IMMEDIATE', 'timeout': 5}, 'ATOMIC_REQUESTS': False, 'TEST': {'NAME': os.environ.get('ONEFLOW_TEST_DB', str(RUNTIME / 'test_oneflow.sqlite3'))}}}
    if Path(DATABASES['default']['NAME']).resolve() == Path(DATABASES['default']['TEST']['NAME']).resolve():
        from django.core.exceptions import ImproperlyConfigured
        raise ImproperlyConfigured('Database test harus terpisah dari database aplikasi.')
AUTH_PASSWORD_VALIDATORS = [{'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'}, {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'}, {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'}, {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'}]
LANGUAGE_CODE = 'id'
TIME_ZONE = 'Asia/Jakarta'
USE_I18N = True
USE_THOUSAND_SEPARATOR = True
USE_TZ = True
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
LOGIN_URL = '/login/'
LOGIN_REDIRECT_URL = '/'
LOGOUT_REDIRECT_URL = '/login/'
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True
X_FRAME_OPTIONS = 'DENY'

CSRF_FAILURE_VIEW = 'crm.frontend.csrf_failure'

if not DEBUG:
    # Render mengakhiri TLS di proxy dan meneruskannya lewat header ini.
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
