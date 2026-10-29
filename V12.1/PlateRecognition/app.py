"""Printed demo plates: pretrained Tesseract LSTM + OpenCV, no image retention."""
import base64
import csv
import io
import hmac
import os
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


def normalize_membership(value):
    compact = re.sub(r'[^A-Z0-9]', '', value.upper())
    match = re.fullmatch(r'PRIM([0-9OI]+)([A-HJ-NP-Z]?)', compact)
    if match:
        compact = 'PRIM' + match[1].translate(str.maketrans({'O':'0', 'I':'1'})) + match[2]
    if re.fullmatch(r'PRIM[0-9]+[A-Z]?', compact):
        return compact
    if re.fullmatch(r'PRIME[0-9]+', compact):
        return 'PRIME-' + compact[5:]
    return None


def preprocess(frame):
    # Contrast and noise reduction help screen moire, glare and printed cards.
    clean = cv2.bilateralFilter(frame, 5, 35, 35)
    contrast = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(clean)
    sharp = cv2.addWeighted(contrast, 1.6, cv2.GaussianBlur(contrast, (0, 0), 1), -.6, 0)
    candidates = [frame, sharp, cv2.adaptiveThreshold(sharp, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 9)]
    ink = cv2.findNonZero(cv2.threshold(clean,0,255,cv2.THRESH_BINARY_INV+cv2.THRESH_OTSU)[1])
    if ink is not None:
        x,y,w,h = cv2.boundingRect(ink)
        if h > 12 and w > h and w*h < frame.size*.85:
            roi = clean[max(0,y-10):min(frame.shape[0],y+h+10),max(0,x-10):min(frame.shape[1],x+w+10)]
            candidates.append(cv2.copyMakeBorder(roi,20,20,20,20,cv2.BORDER_CONSTANT,value=255))
    # Quadrilateral ROI rectification removes perspective rather than lowering confidence.
    edges = cv2.Canny(clean, 60, 160)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:8]:
        area = cv2.contourArea(contour)
        if area < frame.size * .03: continue
        poly = cv2.approxPolyDP(contour, .025 * cv2.arcLength(contour, True), True)
        if len(poly) != 4: continue
        pts = poly.reshape(4, 2).astype('float32')
        sums, diffs = pts.sum(axis=1), np.diff(pts, axis=1).ravel()
        ordered = np.array([pts[np.argmin(sums)], pts[np.argmin(diffs)], pts[np.argmax(sums)], pts[np.argmax(diffs)]], dtype='float32')
        if len(np.unique(ordered, axis=0)) != 4: continue
        width = int(max(np.linalg.norm(ordered[1]-ordered[0]), np.linalg.norm(ordered[2]-ordered[3])))
        height = int(max(np.linalg.norm(ordered[3]-ordered[0]), np.linalg.norm(ordered[2]-ordered[1])))
        if height < 25 or not 1.3 < width/height < 7: continue
        matrix = cv2.getPerspectiveTransform(ordered, np.array([[0,0],[width-1,0],[width-1,height-1],[0,height-1]], dtype='float32'))
        candidates.append(cv2.warpPerspective(sharp, matrix, (width, height)))
        break
    # Small rotation variants deskew photographed text without assuming a horizontal card.
    center = (frame.shape[1]/2, frame.shape[0]/2)
    for angle in (-6, 6):
        candidates.append(cv2.warpAffine(sharp, cv2.getRotationMatrix2D(center, angle, 1), (frame.shape[1],frame.shape[0]), borderValue=255))
    return [cv2.resize(c, None, fx=min(2,1200/c.shape[1]), fy=min(2,1200/c.shape[1]), interpolation=cv2.INTER_CUBIC) for c in candidates]


def recognize(raw, kind='plate'):
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
    versions = preprocess(frame)
    votes = {}
    normalizer = normalize_membership if kind == 'membership' else normalize
    best = {'plate': None, 'confidence': 0.0}
    with tempfile.TemporaryDirectory(prefix='plate-') as folder:
        for index, candidate in enumerate(versions):
            file = f'{folder}/{index}.png'
            cv2.imwrite(file, candidate)
            output = subprocess.run(['tesseract', file, 'stdout', '-l', 'eng', '--psm', ('11' if kind == 'membership' else '6'), '-c', 'load_system_dawg=0', '-c', 'load_freq_dawg=0', 'tsv'], capture_output=True, text=True, timeout=4, check=True).stdout
            words = [row for row in csv.DictReader(io.StringIO(output), delimiter='\t') if row.get('text', '').strip()]
            for start in range(len(words)):
                for count in (1, 2, 3):
                    group = words[start:start+count]
                    plate = normalizer(''.join(word['text'] for word in group))
                    confidence = min(float(word['conf']) for word in group) / 100
                    if plate:
                        votes.setdefault(plate, set()).add(index)
                    if plate and confidence > best['confidence']:
                        best = {'plate': plate, 'confidence': round(max(0.0, min(1.0, confidence)), 4)}
    best['consensus'] = len(votes.get(best['plate'], set()))
    return best


@app.get('/health')
def health():
    return jsonify(status='ok')


@app.post('/recognize')
def endpoint():
    secret = os.environ.get('OCR_SERVICE_SECRET', '')
    supplied = request.headers.get('Authorization', '')
    if len(secret) < 32:
        return jsonify(error='Service unavailable'), 503
    if not hmac.compare_digest(supplied, 'Bearer ' + secret):
        return jsonify(error='Unauthorized'), 401
    if request.mimetype != 'application/json':
        return jsonify(error='Invalid request'), 415
    try:
        data = request.get_json()
        if not isinstance(data, dict) or not isinstance(data.get('image'), str) or data.get('kind', 'plate') not in ('plate', 'membership'):
            raise ValueError('Missing image')
        return jsonify(recognize(base64.b64decode(data['image'], validate=True), data.get('kind', 'plate')))
    except (ValueError, OSError, Image.DecompressionBombError):
        return jsonify(error='Invalid JPEG/PNG image'), 400
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
        return jsonify(error='OCR temporarily unavailable'), 503
