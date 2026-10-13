"""Printed demo plates: pretrained Tesseract LSTM + OpenCV, no image retention."""
import base64
import csv
import io
import re
import subprocess
import tempfile

import cv2
import numpy as np
from flask import Flask, jsonify, request
from PIL import Image

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 2_800_100
Image.MAX_IMAGE_PIXELS = 4_000_000


def normalize(value):
    compact = re.sub(r'[\s-]', '', value.upper())
    return compact[:3] + '-' + compact[3:] if re.fullmatch(r'[A-Z0-9]{3}\d{3}', compact) else None


def recognize(raw):
    if len(raw) > 2_000_000:
        raise ValueError('Image too large')
    with Image.open(io.BytesIO(raw)) as image:
        if image.format not in ('PNG', 'JPEG') or image.width * image.height > 4_000_000:
            raise ValueError('Invalid image dimensions or type')
        image.verify()
    frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if frame is None:
        raise ValueError('Invalid image')
    if max(frame.shape) > 1600:
        frame = cv2.resize(frame, None, fx=1600/max(frame.shape), fy=1600/max(frame.shape))
    # Low-detail images must not produce fabricated confident recognition.
    if float(frame.std()) < 8:
        return {'plate': None, 'confidence': 0.0}
    versions = [frame, cv2.threshold(frame, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]]
    best = {'plate': None, 'confidence': 0.0}
    with tempfile.TemporaryDirectory(prefix='plate-') as folder:
        for index, candidate in enumerate(versions):
            file = f'{folder}/{index}.png'
            cv2.imwrite(file, candidate)
            output = subprocess.run(['tesseract', file, 'stdout', '-l', 'eng', '--psm', '6', 'tsv'], capture_output=True, text=True, timeout=4, check=True).stdout
            words = [row for row in csv.DictReader(io.StringIO(output), delimiter='\t') if row.get('text', '').strip()]
            for start in range(len(words)):
                for count in (1, 2, 3):
                    group = words[start:start+count]
                    plate = normalize(''.join(word['text'] for word in group))
                    confidence = min(float(word['conf']) for word in group) / 100
                    if plate and confidence > best['confidence']:
                        best = {'plate': plate, 'confidence': round(max(0.0, min(1.0, confidence)), 4)}
    return best


@app.get('/health')
def health():
    return jsonify(status='ok', engine='Tesseract LSTM')


@app.post('/recognize')
def endpoint():
    try:
        data = request.get_json()
        if not isinstance(data, dict) or not isinstance(data.get('image'), str):
            raise ValueError('Missing image')
        return jsonify(recognize(base64.b64decode(data['image'], validate=True)))
    except (ValueError, OSError, Image.DecompressionBombError):
        return jsonify(error='Invalid JPEG/PNG image'), 400
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
        return jsonify(error='OCR temporarily unavailable'), 503
