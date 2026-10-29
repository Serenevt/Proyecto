import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { RecognitionService } from './recognition.service';
import { VehiclesService } from './vehicles.service';
import { normalizePlate } from './plate.dto';
describe('OCR gateway', () => {
  const vehicles = { findByPlate: jest.fn() };
  const service = new RecognitionService(
    vehicles as unknown as VehiclesService,
    new ConfigService({ PLATE_CONFIDENCE_THRESHOLD: '0.75', OCR_SERVICE_SECRET: 'test-ocr-service-secret-with-32-characters' }),
  );
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
    jest.clearAllMocks();
  });
  function output(plate: unknown, confidence: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plate, confidence }),
    });
  }
  it('alta confianza busca Vehicle/Membership', async () => {
    output('abc123', 0.94);
    vehicles.findByPlate.mockResolvedValue({
      plate: 'ABC-123',
      membership: { number: 'PRIME-0001', name: 'Diego' },
    });
    const result = await service.recognize('a'.repeat(16));
    expect(result.recognized).toBe(true);
    expect(result.vehicle?.membership?.number).toBe('PRIME-0001');
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/recognize'), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-ocr-service-secret-with-32-characters' }),
    }));
  });
  it('baja confianza no identifica una membresía', async () => {
    output('ABC-123', 0.5);
    expect((await service.recognize('a'.repeat(16))).recognized).toBe(false);
    expect(vehicles.findByPlate).not.toHaveBeenCalled();
  });
  it('placa inexistente permite fallback', async () => {
    output('ZZZ-999', 0.95);
    vehicles.findByPlate.mockRejectedValue(new NotFoundException());
    expect((await service.recognize('a'.repeat(16))).vehicle).toBeNull();
  });
  it.each(['ABC123', 'abc123', 'ABC 123', 'ABC-123'])(
    'normaliza %s',
    (value) => {
      expect(normalizePlate(value)).toBe('ABC-123');
    },
  );
  it('fallo OCR devuelve 503', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error());
    await expect(service.recognize('a'.repeat(16))).rejects.toMatchObject({
      status: 503,
    });
  });
  it('staging inicial deshabilita OCR sin llamar al servicio remoto', async () => {
    global.fetch = jest.fn();
    const disabled = new RecognitionService(
      vehicles as unknown as VehiclesService,
      new ConfigService({ PLATE_RECOGNITION_ENABLED: 'false' }),
    );
    await expect(disabled.recognize('a'.repeat(16))).rejects.toThrow('Ingresa la placa manualmente');
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('resultado malformado no tiene confianza', async () => {
    output('bad', 2);
    expect((await service.recognize('a'.repeat(16))).recognized).toBe(false);
  });
});
