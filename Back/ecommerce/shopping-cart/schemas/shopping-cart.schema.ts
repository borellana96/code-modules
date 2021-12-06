import * as mongoose from 'mongoose';
import { IConnectionConfig } from '../../../../utils/utils';
import { ShoppingCart } from '../interfaces/shopping-cart.interface';
import { ProductSchemaManager } from '../../../../entities/product-config/product/schemas/product.schema';

export class ShoppingCartSchemaManager {
  /*   config: IConnectionConfig;
    ShoppingCartModel: mongoose.Model<ShoppingCart>;
    dbConection: any;
    constructor(config: IConnectionConfig, dbConection: any) {
      this.config = config;
      this.dbConection = dbConection;
    }
   */
  static getModel(config, dbConection): mongoose.Model<ShoppingCart> {
    let ShoppingCartModel: mongoose.Model<ShoppingCart>;
    const exists = mongoose[dbConection].modelNames().find(value => {
      return value === config.tenant + 'ShoppingCart';
    });

    if (!exists) {
      const ProductModel = ProductSchemaManager.getModel(config, dbConection);
      const ShoppingCartSchema = new mongoose.Schema({
        id_user: { type: String, required: true },
        id_product: { type: String, required: true },
        name_product: { type: String, required: true },
        info_product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: ProductModel,
        },
        image_product: { type: String, required: true },
        quantity: { type: Number, required: true },
        method_send: { type: 'Mixed', required: true },
        populate_method_send: [{ type: mongoose.Schema.Types.ObjectId, ref: config.tenant + 'MethodSend' }],
        price: { type: Number, required: true },
        total_price: { type: Number, required: true },
        tenant: { type: String, required: true },
        limit_hour: { type: Date, required: true },
        order: { type: String },
        code_ERP: { type: String },
        num_session: { type: String },
        create_by: { type: String },
        update_by: { type: String },
        create_date: { type: Date, default: Date.now },
        update_date: { type: Date },
        reserved_campaign_stock: { type: Number, default: 0 },
        max_reserved_campaign_stock: { type: Number, default: 0 },
        coupon: { type: 'Mixed' }
      });
      ShoppingCartModel = mongoose[dbConection].model<ShoppingCart>(
        config.tenant + 'ShoppingCart',
        ShoppingCartSchema,
        config.tenant + '__ShoppingCart',
      );
    } else {
      ShoppingCartModel = mongoose[dbConection].model<ShoppingCart>(
        config.tenant + 'ShoppingCart',
      );
    }
    return ShoppingCartModel;
  }
}
