import * as mongoose from 'mongoose';
import { Order } from '../interfaces/order.interface';
import { ProductSchemaManager } from 'src/entities/schemas/product.schema';
import { LDVDetailSchemaManager } from 'src/entities/ldv/schemas/ldv-detail.schema';
import { DistrictSchemaManager } from 'src/entities/system-settings/location/district/schemas/district.schema';
import { DepartmentSchemaManager } from 'src/entities/system-settings/location/department/schemas/department.schema';
import { ProvinceSchemaManager } from 'src/entities/system-settings/location/province/schemas/province.schema';
import { UserSchemaManager } from 'src/entities/system-settings/identity/user/schemas/user.schema';
import { UserAddressSchemaManager } from 'src/entities/system-settings/identity/user-address/schemas/user-address.schemas';
import { MethodSendSchemaManager } from 'src/entities/schemas/method-send.schemas';
import { SupplierSchemaManager } from 'src/entities/system-settings/supplier/schemas/supplier.schema';


export class OrderSchemaManager {

  static getModel(config, dbConection): mongoose.Model<Order> {
    let OrderModel: mongoose.Model<Order>;
    const exists = mongoose[dbConection].modelNames().find(value => {
      return value === config.tenant + 'Order';
    });

    if (!exists) {
      const ProductModel = ProductSchemaManager.getModel(config, dbConection);
      const LDVModel = LDVDetailSchemaManager.getModel(config, dbConection);
      const DistrictModel = DistrictSchemaManager.getModel(config, dbConection);
      const DepartmentModel = DepartmentSchemaManager.getModel(
        config,
        dbConection,
      );
      const ProvinceModel = ProvinceSchemaManager.getModel(config, dbConection);
      const UserModel = UserSchemaManager.getModel(config, dbConection);
      const UserAddressModel = UserAddressSchemaManager.getModel(
        config,
        dbConection,
      );
      const MethodSendModel = MethodSendSchemaManager.getModel(config, dbConection);
      const SupplierModel = SupplierSchemaManager.getModel(config, dbConection);
      const OrderSchema = new mongoose.Schema({
        ip_cliente: { type: String },
        code: { type: String, required: true },
        only_history: { type: Boolean, required: true, default: true },
        status_order: {
          type: mongoose.Schema.Types.ObjectId,
          ref: LDVModel,
        },
        supplier_status_order: [
          {
            supplierId: { type: mongoose.Schema.Types.ObjectId, ref: SupplierModel },
            status_order: { type: mongoose.Schema.Types.ObjectId, ref: LDVModel }
          }
        ],
        cancelation_justification: { type: String },
        status_payment: { type: Boolean, default: false, required: true },
        status_dispached: { type: Boolean, default: false, required: true },
        status_delivery: { type: Boolean, default: false },
        user_phone: { type: String },
        session: { type: String },
        attended: [
          {
            state: { type: Boolean, default: false },
            supplier: { type: String }
          },
        ],
        current_step: { type: mongoose.Schema.Types.ObjectId, ref: LDVModel },
        //    operation_number: { type: String },
        payu: {
          orderId: { type: Number },
          transactionId: { type: String },
          ip: { type: String },
          state: { type: String },
          paymentNetworkResponseCod: { type: String },
          paymentNetworkResponseErrorMessage: { type: String },
          trazabilityCode: { type: String },
          authorizationCode: { type: String },
          pendingReason: { type: String },
          responseCode: { type: String },
          responseMessage: { type: String },
          transactionDate: { type: String },
          transactionTime: { type: String },
          operationDate: { type: String },
          referenceQuestionnaire: { type: String },
          extraParameters: { type: 'Mixed' },
          additionalInfo: { type: String },
        },
        visaNet: {
          header: {
            ecoreTransactionUUID: { type: String },
            ecoreTransactionDate: { type: Number },
            millis: { type: Number },
          },
          order: {
            tokenId: { type: String },
            purchaseNumber: { type: String },
            productId: { type: String },
            amount: { type: Number },
            currency: { type: String },
            authorizedAmount: { type: Number },
            authorizationCode: { type: String },
            actionCode: { type: String },
            traceNumber: { type: String },
            transactionDate: { type: String },
            transactionId: { type: String },
          },
          dataMap: {
            CURRENCY: { type: String },
            TRANSACTION_DATE: { type: String },
            TERMINAL: { type: String },
            ACTION_CODE: { type: String },
            TRACE_NUMBER: { type: String },
            ECI_DESCRIPTION: { type: String },
            ECI: { type: String },
            BRAND: { type: String },
            CARD: { type: String },
            MERCHANT: { type: String },
            STATUS: { type: String },
            ADQUIRENTE: { type: String },
            ACTION_DESCRIPTION: { type: String },
            ID_UNICO: { type: String },
            AMOUNT: { type: String },
            PROCESS_CODE: { type: String },
            RECURRENCE_STATUS: { type: String },
            TRANSACTION_ID: { type: String },
            AUTHORIZATION_CODE: { type: String },
          }
        },
        type_payment: { type: String }, // se conecta con la base de datos de empresas
        amount_total_purchase: { type: Number, required: true },
        amount_delivery: { type: Number, default: 0 },
        amount_total: { type: Number, required: true },
        amount_subtotal: { type: Number, required: true },
        amount_discount: { type: Number },
        currency: {
          type: mongoose.Schema.Types.ObjectId,
          ref: LDVModel,
          required: true,
        },
        exchange_rate: { type: Number },
        address_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: UserAddressModel,
        },
        delivery_name_address: { type: String },
        delivery_phone: { type: String },
        delivery_address: { type: String },
        delivery_reference: { type: String },
        delivery_district_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: DistrictModel,
        },
        delivery_province_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: ProvinceModel,
        },
        delivery_department_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: DepartmentModel,
        },
        invoice_send: { type: Boolean },
        invoice_ruc: { type: String },
        invoice_business_name: { type: String },
        invoice_address: { type: String },
        invoice_district: {
          type: mongoose.Schema.Types.ObjectId,
          ref: DistrictModel,
        },
        invoice_province: {
          type: mongoose.Schema.Types.ObjectId,
          ref: ProvinceModel,
        },
        invoice_department: {
          type: mongoose.Schema.Types.ObjectId,
          ref: DepartmentModel,
        },

        tenant: { type: String, required: true },
        payment_state: { type: String },
        payment_order_id: { type: Number },
        error_ERP: { type: String },
        error_LOGERP: { type: String },
        error_no_connection: { type: Boolean, default: false },
        detail: [
          {
            quantity: { type: Number, required: true },
            product_id: {
              type: mongoose.Schema.Types.ObjectId,
              ref: ProductModel,
            },
            method_id: { type: String },
            supplier_delivery: { type: String },
            delivery: Number,
            delivery_day: { type: Date },
            range_day: { type: String },
            min_range: { type: Number },
            max_range: { type: Number },
            current_step: { type: mongoose.Schema.Types.ObjectId, ref: LDVModel },
            product_price: { type: Number, required: true },
            amount_total: { type: Number, required: true },
            amount_subtotal: { type: Number, required: true },
            discount: { type: Number, default: 0 },
            product_name: { type: String, required: true },
            product_code: { type: String },
            giftcard: { type: String },
            friendly_url: { type: String },
            supplier: { type: String },
            discount_price: { type: Number },
            reason: { type: 'Mixed' },
            dedication: [{ type: String }],
            is_variation: { type: Boolean, required: true, default: false },
            product_father: {
              type: mongoose.Schema.Types.ObjectId,
              ref: ProductModel,
            },
          },
        ],
        maximum_attempts: { type: Number, default: 0, required: true },
        email_Send: { type: String, default: false, required: true },
        delivery_type_address_ERP: { type: String },
        pick_up_time: { type: Date },
        method_send_id: { type: mongoose.Schema.Types.ObjectId, ref: MethodSendModel },
        requestTime: { type: String },
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: UserModel },
        create_by: { type: mongoose.Schema.Types.ObjectId, ref: UserModel },
        update_by: { type: String },
        code_ERP: { type: String },
        create_date: { type: Date, default: Date.now, required: true },
        update_date: { type: Date },
      });

      OrderModel = mongoose[dbConection].model<Order>(
        config.tenant + 'Order',
        OrderSchema,
        config.tenant + '__Order',
      );
    } else {
      OrderModel = mongoose[dbConection].model<Order>(config.tenant + 'Order');
    }
    return OrderModel;
  }
}
