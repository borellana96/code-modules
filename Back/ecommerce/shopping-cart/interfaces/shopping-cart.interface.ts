import { Document } from 'mongoose';

export interface ShoppingCart extends Document {
  readonly id_user: string;
  readonly id_product: string;
  readonly name_product: string;
  info_product: any;
  readonly image_product: string;
  readonly quantity: number;
  readonly price: number;
  readonly total_price: number;
  tenant: string;
  limit_hour: Date;
  code_ERP:string;
  num_session:string;
  method_send:any;
  populate_method_send:any;
  order: string;
  readonly create_by: string;
  update_by: string;
  readonly create_date: Date;
  update_date: Date;
  reserved_campaign_stock: number;
  coupon?: any;
}
