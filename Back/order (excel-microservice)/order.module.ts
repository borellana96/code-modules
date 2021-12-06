import { Module } from '@nestjs/common';
import { LDVDetailService } from '../ldv/ldv-detail.service';
import { UserService } from '../system-settings/identity/user/user.service';
import { NotificationRepositoryService } from '../system-settings/notification/notification.repository.service';
import { NotificationService } from '../system-settings/notification/service/notification.service';
import { SupplierService } from '../system-settings/supplier/supplier.service';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [],
  providers: [
    OrderService,
    SupplierService,
    NotificationService,
    NotificationRepositoryService,
    UserService,
    LDVDetailService,
  ],
  controllers: [OrderController],
})
export class OrderModule { }
