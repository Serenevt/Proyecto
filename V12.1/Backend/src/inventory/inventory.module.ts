import { Module } from '@nestjs/common';
import {
  InventoryReconciliationController,
  InventoryReconciliationService,
} from './inventory-reconciliation';

@Module({
  controllers: [InventoryReconciliationController],
  providers: [InventoryReconciliationService],
})
export class InventoryModule {}
