import { OperationsService } from './operations.service';

const operationId='33333333-3333-4333-8333-333333333333';
const terminalId='44444444-4444-4444-8444-444444444444';
const stationId='55555555-5555-4555-8555-555555555555';
const userId='66666666-6666-4666-8666-666666666666';
function fixture(){
  const db={
    terminalOperation:{findUnique:jest.fn().mockResolvedValue({operationId,terminalId,stationId})},
    supervisorStationAssignment:{findFirst:jest.fn().mockResolvedValue({id:'assignment'})},
    fuelAuthorization:{findFirst:jest.fn().mockResolvedValue(null)},
    transaction:{findFirst:jest.fn().mockResolvedValue(null)},
    inventoryReservation:{findFirst:jest.fn().mockResolvedValue(null)},
    onlineOrder:{findFirst:jest.fn().mockResolvedValue(null)},
    supervisorShift:{findUnique:jest.fn().mockResolvedValue({id:operationId,stationId,supervisorUserId:userId,status:'CIERRE_PENDIENTE'})},
  };
  const service=new OperationsService(db as any);
  const close=jest.spyOn(service,'closeOperation').mockResolvedValue({status:'CLOSED'} as any);
  return {db,service,close};
}
describe('Supervisor recovery of unpaid terminal operations',()=>{
  it('closes only the assigned operation with no sale, preserving the same operationId',async()=>{
    const f=fixture();
    await f.service.cancelUnpaidOperation(userId,operationId);
    expect(f.close).toHaveBeenCalledWith(terminalId,operationId,userId);
  });
  it.each(['fuelAuthorization','transaction','inventoryReservation','onlineOrder'] as const)('keeps an operation with active %s protected',async kind=>{
    const f=fixture();
    f.db[kind].findFirst.mockResolvedValue({id:'financial-record'});
    await expect(f.service.cancelUnpaidOperation(userId,operationId)).rejects.toThrow('requiere conciliación');
    expect(f.close).not.toHaveBeenCalled();
  });
  it('rejects resume and repeat close while CIERRE_PENDIENTE',async()=>{
    const f=fixture();
    (f.db as any).atomic=async(work:any)=>work(f.db);
    await expect(f.service.shiftState(userId,operationId,'resume')).rejects.toThrow('Estado de turno incompatible');
    await expect(f.service.shiftState(userId,operationId,'close')).rejects.toThrow('Estado de turno incompatible');
  });
});
