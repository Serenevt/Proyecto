import base64
from pathlib import Path
import unittest
from app import app, normalize, recognize


class OCRTests(unittest.TestCase):
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
        response = app.test_client().post('/recognize', json={'image': image})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['plate'], 'ABC-123')

    def test_invalid_input(self):
        self.assertEqual(app.test_client().post('/recognize', json={'image': 'invalid!'}).status_code, 400)

    def test_health(self):
        self.assertEqual(app.test_client().get('/health').status_code, 200)


if __name__ == '__main__':
    unittest.main()
