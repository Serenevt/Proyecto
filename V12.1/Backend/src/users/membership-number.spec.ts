import { formatMembershipNumber, nextMembershipNumber } from './membership-number';

describe('Membership sequence', () => {
  it.each([
    [1n, 'PRIM-001'],
    [2n, 'PRIM-002'],
    [999n, 'PRIM-999'],
    [1000n, 'PRIM-001A'],
    [1998n, 'PRIM-999A'],
    [1999n, 'PRIM-001B'],
    [26973n, 'PRIM-999Z'],
    [26974n, 'PRIM-001AA'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatMembershipNumber(value)).toBe(expected);
  });
});
it('uses the persisted PostgreSQL counter after seed and restart, skipping occupied codes', async () => {
  const persisted={value:1n};
  const occupied=new Set(['PRIM-001','PRIM-002']);
  const tx={
    $queryRaw:jest.fn(async()=>[{value:++persisted.value}]),
    membership:{findUnique:jest.fn(async({where}:{where:{number:string}})=>occupied.has(where.number)?{id:'existing'}:null)},
  };
  expect(await nextMembershipNumber(tx as any)).toBe('PRIM-003');
  const afterRestart={...tx,$queryRaw:jest.fn(async()=>[{value:++persisted.value}])};
  expect(await nextMembershipNumber(afterRestart as any)).toBe('PRIM-004');
  expect(persisted.value).toBe(4n);
});
