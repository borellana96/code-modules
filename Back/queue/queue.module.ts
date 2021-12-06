import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { LDVDetailService } from 'src/entities/ldv/ldv-detail.service';
import { LDVService } from 'src/entities/ldv/ldv.service';
import { EnterpriseService } from 'src/entities/system-settings/authorization-authentication/authorization/enterprice.service';
import { UserService } from 'src/entities/system-settings/identity/user/user.service';
import { NotificationRepositoryService } from 'src/entities/system-settings/notification/notification.repository.service';
import { NotificationService } from 'src/entities/system-settings/notification/service/notification.service';
import { SupplierService } from 'src/entities/system-settings/supplier/supplier.service';
import { QueueConsumer } from './queue.consumer';
import { QueueProducerService } from './queue.producer.service';

@Module({
	imports: [
		BullModule.registerQueue({
			name: 'queue',
			redis: {
				host: 'localhost',
				port: 6379,
			},
		}),
	],
	controllers: [],
	providers: [
		QueueProducerService,
		QueueConsumer,
		NotificationService,
		UserService,
		NotificationRepositoryService,
		LDVService,
		LDVDetailService,
		SupplierService,
		EnterpriseService
	],
	exports: [QueueProducerService]
})
export class QueueModule { }
