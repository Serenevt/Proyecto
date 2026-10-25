import { formatMembershipNumber } from './membership-number';

describe('Membership sequence', () => {
  it.each([
    [1n, 'PRIM001'],
    [2n, 'PRIM002'],
    [999n, 'PRIM999'],
    [1000n, 'PRIM001A'],
    [1998n, 'PRIM999A'],
    [1999n, 'PRIM001B'],
    [26973n, 'PRIM999Z'],
    [26974n, 'PRIM001AA'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatMembershipNumber(value)).toBe(expected);
  });
});
