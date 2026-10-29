import base64
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from app import app, normalize, recognize


class OCRTests(unittest.TestCase):
    def setUp(self):
        self.secret = 'local-ocr-test-secret-with-32-characters'
        self.secret_env = patch.dict(os.environ, {'OCR_SERVICE_SECRET': self.secret})
        self.secret_env.start()

    def tearDown(self):
        self.secret_env.stop()

    def post(self, **kwargs):
        return app.test_client().post('/recognize', headers={'Authorization': 'Bearer ' + self.secret}, **kwargs)

    def test_readable_plate(self):
        result = recognize((Path('fixtures') / 'ABC-123.png').read_bytes())
        self.assertEqual(result['plate'], 'ABC-123')
        self.assertGreaterEqual(result['confidence'], .75)

    def test_no_plate(self):
        self.assertIsNone(recognize(Path('fixtures/no-plate.png').read_bytes())['plate'])

    def test_unreadable(self):
        self.assertLess(recognize(Path('fixtures/unreadable.png').read_bytes())['confidence'], .75)

    def test_normalization(self):
        for value in ('ABC123', 'abc123', 'ABC 123', 'ABC-123'):
            self.assertEqual(normalize(value), 'ABC-123')
        self.assertIsNone(normalize('not-a-plate'))

    def test_http(self):
        image = base64.b64encode(Path('fixtures/ABC-123.png').read_bytes()).decode()
        response = self.post(json={'image': image})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['plate'], 'ABC-123')

    def test_invalid_input(self):
        self.assertEqual(self.post(json={'image': 'invalid!'}).status_code, 400)

    def test_authentication_and_media_type(self):
        image = base64.b64encode((Path('fixtures') / 'ABC-123.png').read_bytes()).decode()
        self.assertEqual(app.test_client().post('/recognize', json={'image': image}).status_code, 401)
        self.assertEqual(app.test_client().post('/recognize', json={'image': image}, headers={'Authorization': 'Bearer wrong'}).status_code, 401)
        self.assertEqual(self.post(data='plain', content_type='text/plain').status_code, 415)
        self.assertEqual(self.post(json={'image': image, 'kind': 'invalid'}).status_code, 400)
        with patch.dict(os.environ, {'OCR_SERVICE_SECRET': ''}):
            self.assertEqual(self.post(json={'image': image}).status_code, 503)

    def test_health(self):
        response = app.test_client().get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {'status': 'ok'})


if __name__ == '__main__':
    unittest.main()
