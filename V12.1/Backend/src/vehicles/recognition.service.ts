import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VehiclesService } from './vehicles.service';
import { normalizePlate } from './plate.dto';

@Injectable()
export class RecognitionService {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly config: ConfigService,
  ) {}
  async recognize(image: string, kind: 'plate'|'membership' = 'plate') {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length > 2800000)
      throw new BadRequestException('Imagen inválida');
    let data: { plate?: unknown; confidence?: unknown };
    try {
      const response = await fetch(
        this.config.get<string>(
          'PLATE_RECOGNITION_URL',
          'http://plate-recognition:8000',
        ) + '/recognize',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image, kind }),
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!response.ok) throw new Error('OCR unavailable');
      data = (await response.json()) as typeof data;
    } catch {
      throw new ServiceUnavailableException(
        'No pudimos procesar la imagen. Reintenta o ingresa la placa manualmente.',
      );
    }
    if (kind === 'membership') {
      const number = typeof data.plate === 'string' ? data.plate : '';
      const confidence = typeof data.confidence === 'number' ? data.confidence : 0;
      const threshold = Number(this.config.get('PLATE_CONFIDENCE_THRESHOLD', '0.75'));
      const membership = /^PRIM(?:[0-9]+[A-Z]?|E-[0-9]+)$/.test(number) && confidence >= threshold ? await this.vehicles.membership(number) : null;
      return { membership, number, confidence, threshold, recognized: Boolean(membership && membership.status === 'ACTIVE') };
    }
    const plate = normalizePlate(data.plate);
    const confidence =
      typeof data.confidence === 'number' &&
      Number.isFinite(data.confidence) &&
      data.confidence >= 0 &&
      data.confidence <= 1
        ? data.confidence
        : 0;
    const threshold = Number(
      this.config.get('PLATE_CONFIDENCE_THRESHOLD', '0.75'),
    );
    const valid =
      typeof plate === 'string' && /^[A-Z0-9]{3}-\d{3}$/.test(plate);
    const recognized = valid && confidence >= threshold;
    let vehicle = null;
    if (recognized) {
      try {
        vehicle = await this.vehicles.findByPlate(plate as string, {
          kind: 'kiosk',
        });
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    return {
      plate: valid ? plate : null,
      confidence,
      threshold,
      recognized,
      vehicle,
    };
  }
}
