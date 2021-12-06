import { Injectable, Scope, NotFoundException } from '@nestjs/common';
import { Order } from './interfaces/order.interface';
import { IConnectionConfig } from '../../utils/utils';
import { OrderSchemaManager } from './schemas/order.schema';
import { Connect } from '../../connect/connect';

@Injectable({ scope: Scope.DEFAULT })
export class OrderService {
  constructor() { }

  async findObjPopulateUser(
    config: IConnectionConfig,
    obj: any,
  ): Promise<Order[]> {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const OrderModel = OrderSchemaManager.getModel(config, dbConection);
    const result: any = await OrderModel.find(obj)
      .select('user_id code create_date detail.amount_total detail.product_name detail.product_price detail.product_code detail.delivery detail.supplier detail.quantity coupon detail.method_id delivery_address delivery_district_id')
      .populate({ path: 'delivery_district_id', select: 'name' })
      .populate({
        path: 'user_id',
        select: 'email additionals.number_document additionals.name additionals.last_name_father additionals.last_name_mother additionals.phone',
      })
      .populate({
        path: 'detail.product_id',
        select: 'brand categories commission',
        populate: [
          { path: 'brand', select: 'name' },
          {
            path: 'categories',
            select: 'name group',
            populate: { path: 'group', select: 'name' }
          }
        ]
      })
      .lean()
      .exec();

    for (const row of result) {
      let user_id: any = {};
      if (row.user_id) {
        user_id.email = row.user_id.email;
        if (row.user_id.additionals) {
          user_id.name = row.user_id.additionals.name;
          user_id.lastname_father = row.user_id.additionals.last_name_father;
          user_id.lastname_mother = row.user_id.additionals.last_name_mother;
          user_id.dni = row.user_id.additionals.number_document;
          user_id.cellphone = row.user_id.additionals.phone;
        }
        row.user_id = user_id;
      }
    }
    return result;
  }

}
