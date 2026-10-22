"""Read-only scan of the actual debug APK; never print server secrets."""
import json
import subprocess
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
config = json.loads(subprocess.check_output(['docker', 'compose', 'config', '--format', 'json'], cwd=root))
backend = config['services']['backend']['environment']
secrets = [backend['JWT_SECRET'], backend['KIOSK_API_KEY'], config['services']['postgres']['environment']['POSTGRES_PASSWORD']]
secrets += [backend[key] for key in ['SMTP_PASSWORD', 'ADMIN_PASSWORD_HASH'] if backend.get(key)]
apk = root / 'FrontEnd_2/android/app/build/outputs/apk/debug/app-debug.apk'
with zipfile.ZipFile(apk) as archive:
    for entry in archive.infolist():
        if entry.is_dir():
            continue
        data = archive.read(entry)
        assert all(secret.encode() not in data for secret in secrets), 'Server secret found in APK'
        assert not entry.filename.endswith('/.env'), 'Environment file found in APK'
        if entry.filename.startswith('assets/public/') and entry.filename.endswith(('.js', '.html')):
            assert b'SMTP_PASSWORD' not in data and b'SMTP_USER' not in data, 'SMTP settings found in APK'
    public = archive.read('assets/public/js/config.js').decode()
    assert 'http://localhost' not in public and '127.0.0.1' not in public
    assert 'const __FUELFLOW_DEMO__ = false' in public
    assert 'Prime123' not in public and 'demo@primaxprime.pe' not in public
    assert '/api/v1' in public
    assert b'Crear cuenta' in archive.read('assets/public/js/register.js')
print('PASS: debug APK contains registration and configurable API, no server secrets or environment files; demo credentials disabled.')
