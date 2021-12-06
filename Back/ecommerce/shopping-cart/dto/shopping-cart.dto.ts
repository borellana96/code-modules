import { ApiProperty } from '@nestjs/swagger';

export class ShoppingCartDto {
  @ApiProperty()
  id_user: string;

  @ApiProperty()
  readonly id_product: string;

  @ApiProperty()
  name_product: string;

  @ApiProperty()
  info_product: any;

  @ApiProperty()
  image_product: string;

  @ApiProperty()
  order: string;

  @ApiProperty()
  method_send:any
  
  @ApiProperty()
  populate_method_send:any

  @ApiProperty()
  num_session:string;

  @ApiProperty()
  code_ERP:string

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  price: number;

  @ApiProperty()
  total_price: number;

  @ApiProperty()
  tenant: string;

  @ApiProperty()
  limit_hour: Date;

  @ApiProperty()
  create_by: string;

  @ApiProperty()
  update_by: string;

  @ApiProperty()
  create_date: Date;

  @ApiProperty()
  update_date: Date;

  @ApiProperty()
  reserved_campaign_stock: number;

  @ApiProperty()
  coupon?: any;
}
