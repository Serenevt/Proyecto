import unittest, io
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from app import recognize, normalize_membership, preprocess
class V11OCR(unittest.TestCase):
 def test_membership_formats(self):
  for text in ('PRIM001','PRIM999','PRIM001A'):
   self.assertEqual(normalize_membership(text),text)
 def test_membership_photo(self):
  image=Image.new('RGB',(700,200),'white');d=ImageDraw.Draw(image)
  font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',70)
  d.text((80,50),'PRIM001A',font=font,fill='black');buf=io.BytesIO();image.save(buf,format='PNG')
  result=recognize(buf.getvalue(),'membership');self.assertEqual(result['plate'],'PRIM001A');self.assertGreaterEqual(result['confidence'],.75)
 def test_screen_perspective_plate(self):
  image=cv2.imread('fixtures/ABC-123.png',cv2.IMREAD_GRAYSCALE);h,w=image.shape
  matrix=cv2.getPerspectiveTransform(np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]]),np.float32([[20,15],[w-20,0],[w-1,h-15],[0,h-1]]))
  screen=cv2.warpPerspective(image,matrix,(w,h),borderValue=255)
  ok,raw=cv2.imencode('.png',screen);self.assertTrue(ok)
  result=recognize(raw.tobytes());self.assertEqual(result['plate'],'ABC-123')
 def test_preprocessing_variants(self):
  image=cv2.imread('fixtures/ABC-123.png',cv2.IMREAD_GRAYSCALE)
  self.assertGreaterEqual(len(preprocess(image)),5)
