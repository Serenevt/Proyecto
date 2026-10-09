import { ConfigService } from '@nestjs/config';
import { PointsPolicyService } from './points-policy.service';
describe('PointsPolicyService', () => {
  const policy = new PointsPolicyService(
    new ConfigService({ POINTS_PER_SOL: '1' }),
  );
  it.each([
    ['100.00', 100],
    ['74.50', 74],
    ['0.99', 0],
    ['0.01', 0],
    ['999999.99', 999999],
  ])('%s soles generan %s puntos', (amount, expected) =>
    expect(policy.calculate(policy.amount(amount))).toBe(expected),
  );
  it('tasa central configurable sin errores de float', () => {
    const alternate = new PointsPolicyService(
      new ConfigService({ POINTS_PER_SOL: '2.5' }),
    );
    expect(alternate.calculate(alternate.amount('100.40'))).toBe(251);
  });
  it.each(['0', '-1', '1.001', 'NaN', '1000000', '1e2'])(
    'rechaza monto %s',
    (value) => expect(() => policy.amount(value)).toThrow(),
  );
});
