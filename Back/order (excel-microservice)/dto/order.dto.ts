import { ApiProperty } from '@nestjs/swagger';

export class OrderDto {
  @ApiProperty()
  code: string;
  @ApiProperty()
  only_history: boolean;
  @ApiProperty()
  status_order: boolean;
  @ApiProperty()
  supplier_status_order: any[];
  @ApiProperty()
  attended: any[];
  @ApiProperty()
  current_step: string;
  @ApiProperty()
  cancelation_justification: string;
  @ApiProperty()
  status_payment: boolean;
  @ApiProperty()
  status_dispached: boolean;
  @ApiProperty()
  status_delivery: boolean;
  @ApiProperty()
  payment_state: string;
  @ApiProperty()
  payment_order_id: number;
  @ApiProperty()
  error_ERP: string;
  @ApiProperty()
  error_LOGERP: string;
  @ApiProperty()
  error_no_connection: boolean;

  @ApiProperty()
  delivery_type_address_ERP: string;
  /* @ApiProperty()
  operation_number: string; */
  @ApiProperty()
  pick_up_time?: Date;
  @ApiProperty()
  method_send_id?: string;
  @ApiProperty()
  requestTime?: string;
  @ApiProperty()
  payu: any;
  @ApiProperty()
  type_payment: string;
  @ApiProperty()
  amount_total_purchase: number;
  @ApiProperty()
  amount_delivery: number;
  @ApiProperty()
  amount_total: number;
  @ApiProperty()
  amount_subtotal: number
  @ApiProperty()
  amount_discount: number;
  @ApiProperty()
  user_phone: string;
  @ApiProperty()
  currency: string;
  @ApiProperty()
  exchange_rate: number;
  @ApiProperty()
  address_id: string;
  @ApiProperty()
  delivery_name_address: string;
  @ApiProperty()
  delivery_phone: string;
  @ApiProperty()
  delivery_address: string;
  @ApiProperty()
  delivery_reference: string;
  @ApiProperty()
  invoice_send: boolean;
  @ApiProperty()
  invoice_ruc: string;
  @ApiProperty()
  invoice_business_name: string;
  @ApiProperty()
  invoice_address: string;
  @ApiProperty()
  invoice_district: string;
  @ApiProperty()
  invoice_province: string;
  @ApiProperty()
  invoice_department: string;
  @ApiProperty()
  district_id: string;
  @ApiProperty()
  province_id: string;
  @ApiProperty()
  department_id: string;
  @ApiProperty()
  tenant: string;
  @ApiProperty()
  session: string;
  @ApiProperty()
  detail: any;
  @ApiProperty()
  ip_cliente: number;
  @ApiProperty()
  email_Send: string;
  @ApiProperty()
  user_id: string;
  @ApiProperty()
  create_date?: Date;
  @ApiProperty()
  code_ERP?: string;
  @ApiProperty()
  update_date?: Date;
  @ApiProperty()
  create_by?: string;
  @ApiProperty()
  update_by?: string;
}
