import { Module } from '@nestjs/common';
import { ShoppingCartController } from './shopping-cart.controller';
import { ShoppingCartService } from './shopping-cart.service';
import { ProductService } from '../../../entities/product-config/product/product.service';
import { CampaignService } from '../../../entities/campaign/campaign.service';
import { ValidateService } from './validate.service';
import { CategoryService } from '../../../entities/product-config/category/category.service';
import { LDVDetailService } from '../../../entities/ldv/ldv-detail.service';
import { MethodSendService } from '../../../entities/system-settings/supplier/method-send/method-send.service';
import { CmsModule } from '../../../entities/cms/cms.module';
import { CategoryGroupService } from '../../../entities/cms/category-group/category-group.service';
import { LogsService } from '../../../entities/log/log.service';
import { UserService } from '../../system-settings/identity/user/user.service';
import { OrderService } from 'src/entities/checkout/order/order.service';
import { DiscountCodeService } from 'src/entities/discount-code/discount-code.service';
import { GroupCustomerService } from 'src/entities/system-settings/group-customer/group-customer.service';

@Module({
  controllers: [ShoppingCartController],
  providers: [
    ShoppingCartService,
    ProductService,
    CampaignService,
    ValidateService,
    CategoryService,
    LDVDetailService,
    MethodSendService,
    UserService,
    LogsService,
    OrderService,
    DiscountCodeService,
    GroupCustomerService,
  ],
  exports: [ValidateService, ShoppingCartService]
})
export class ShoppingCartModule {}
