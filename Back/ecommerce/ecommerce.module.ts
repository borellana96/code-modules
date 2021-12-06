import { Module } from '@nestjs/common';
import { ShoppingCartModule } from './shopping-cart/shopping-cart.module';

@Module({
  controllers: [],
  imports: [ShoppingCartModule],
  providers: [],
})
export class EcommerceModule { }
