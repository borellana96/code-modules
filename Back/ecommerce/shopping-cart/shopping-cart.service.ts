import {
  Injectable,
  InternalServerErrorException,
  Scope,
} from '@nestjs/common';
import { BadRequestException } from 'src/utils/generalExceptions';
import { Connect } from '../../../connect/connect';
import { MethodSendSchemaManager } from '../../../entities/system-settings/supplier/method-send/schemas/method-send.schemas';
import { IConnectionConfig, Utils } from '../../../utils/utils';
import { utilsFunction } from '../../../utils/utilsFunction';
import { ShoppingCartDto } from './dto/shopping-cart.dto';
import { ShoppingCart } from './interfaces/shopping-cart.interface';
import { ShoppingCartSchemaManager } from './schemas/shopping-cart.schema';
import { OrderService } from 'src/entities/checkout/order/order.service';
import { DiscountCodeService } from 'src/entities/discount-code/discount-code.service';

@Injectable({ scope: Scope.DEFAULT })
export class ShoppingCartService {
  constructor(
    private _orderService: OrderService,
    private discountCodeService: DiscountCodeService,
  ) { }

  async getShoppingCartProductsWithUbigeosByUbigeoAddress(
    config: IConnectionConfig,
    ubigeoAddressList: Array<any>,
    userId,
    limitHour,
  ) {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const ShoppingCartModel = ShoppingCartSchemaManager.getModel(
      config,
      dbConection,
    );
    const pipeline = [
      {
        $match: {
          id_user: userId,
          tenant: config.tenant,
          limit_hour: { $gte: limitHour },
        },
      },
      {
        $lookup: {
          from: `${config.tenant}__Product`,
          let: { info_product: '$info_product' },
          pipeline: [
            { $match: { $expr: { $eq: ['$$info_product', '$_id'] } } },
            {
              $project: {
                _id: 1,
                list_method: 1,
                name: 1,
                brand: 1,
                supplier_delivery: 1,
                campaign: 1,
                campaign_price: 1,
              },
            },
            {
              $lookup: {
                from: `${config.tenant}__Campaign`,
                let: { campaign: '$campaign' },
                pipeline: [
                  { $match: { $expr: { $eq: ['$_id', '$$campaign'] } } },
                  {
                    $project: {
                      _id: 1,
                      rules_admin: 1,
                      products: 1,
                      name: 1,
                      discount_name: 1,
                      active: 1,
                      delivery: 1,
                    },
                  },
                  {
                    $lookup: {
                      from: `${config.tenant}__RulesAdmin`,
                      let: { rules_admin: '$rules_admin' },
                      pipeline: [
                        {
                          $match: { $expr: { $eq: ['$_id', '$$rules_admin'] } },
                        },
                        { $project: { _id: 1, name: 1, rules: 1 } },
                      ],
                      as: 'rules_admin',
                    },
                  },
                  {
                    $unwind: {
                      path: '$rules_admin',
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                  {
                    $unwind: {
                      path: '$rules_admin.rules',
                    },
                  },
                  {
                    $lookup: {
                      from: `${config.tenant}__LDVDetail`,
                      localField: 'rules_admin.rules.operator',
                      foreignField: '_id',
                      as: 'rules_admin.rules.operator',
                    },
                  },
                  {
                    $unwind: {
                      path: '$rules_admin.rules.operator',
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                  {
                    $lookup: {
                      from: `${config.tenant}__Rdd`,
                      let: {
                        rddId: '$rules_admin.rules.rddId',
                      },
                      pipeline: [
                        {
                          $match: {
                            $expr: {
                              $eq: ['$_id', '$$rddId'],
                            },
                          },
                        },
                        {
                          $lookup: {
                            from: `${config.tenant}__LDVDetail`,
                            localField: 'tipo',
                            foreignField: '_id',
                            as: 'tipo',
                          },
                        },
                        {
                          $unwind: {
                            path: '$tipo',
                            preserveNullAndEmptyArrays: true,
                          },
                        },
                        {
                          $lookup: {
                            from: `${config.tenant}__LDVDetail`,
                            localField: 'operator',
                            foreignField: '_id',
                            as: 'operator',
                          },
                        },
                        {
                          $unwind: {
                            path: '$operator',
                            preserveNullAndEmptyArrays: true,
                          },
                        },
                        {
                          $lookup: {
                            from: `${config.tenant}__LDVDetail`,
                            localField: 'ldv_attr_field_id',
                            foreignField: '_id',
                            as: 'ldv_attr_field_id',
                          },
                        },
                        {
                          $unwind: {
                            path: '$ldv_attr_field_id',
                            preserveNullAndEmptyArrays: true,
                          },
                        },
                        {
                          $lookup: {
                            from: `${config.tenant}__LDVDetail`,
                            localField: 'ldv_attr_id',
                            foreignField: '_id',
                            as: 'ldv_attr_id',
                          },
                        },
                        {
                          $unwind: {
                            path: '$ldv_attr_id',
                            preserveNullAndEmptyArrays: true,
                          },
                        },
                      ],
                      as: 'rules_admin.rules.rddId',
                    },
                  },
                  {
                    $unwind: {
                      path: '$rules_admin.rules.rddId',
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                  {
                    $group: {
                      _id: '$_id',
                      active: {
                        $first: '$active',
                      },
                      delivery: {
                        $first: '$delivery',
                      },
                      discount_name: {
                        $first: '$discount_name',
                      },
                      name: {
                        $first: '$name',
                      },
                      products: {
                        $first: '$products',
                      },
                      rules_admin: {
                        $first: '$rules_admin',
                      },
                      rules_admin_rules: {
                        $push: "$rules_admin.rules"
                      }
                    },
                  },
                  {
                    $addFields: {
                      "rules_admin.rules": "$rules_admin_rules"
                    }
                  },
                  {
                    $unset: ["rules_admin_rules"]
                  },
                ],
                as: 'campaign',
              },
            },
            {
              $unwind: { path: '$campaign', preserveNullAndEmptyArrays: true },
            },
            {
              $lookup: {
                from: `${config.tenant}__Supplier`,
                let: { id_supplier: '$supplier_delivery' },
                pipeline: [
                  { $match: { $expr: { $eq: ['$_id', '$$id_supplier'] } } },
                  { $project: { _id: 1.0, name: 1.0 } },
                ],
                as: 'supplier_delivery',
              },
            },
            {
              $unwind: {
                path: '$supplier_delivery',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: `${config.tenant}__MethodSend`,
                let: { list_method: '$list_method' },
                pipeline: [
                  { $match: { $expr: { $in: ['$_id', '$$list_method'] } } },
                  {
                    $addFields: {
                      ubigeo: {
                        $filter: {
                          input: '$ubigeo',
                          as: 'ubi',
                          cond: {
                            $in: ['$$ubi.ubigeo', ubigeoAddressList],
                          },
                        },
                      },
                    },
                  },
                  { $unset: ['available'] },
                ],
                as: 'list_method',
              },
            },
          ],
          as: 'product',
        },
      },
      { $unwind: { path: '$product' } },
    ];
    return await ShoppingCartModel.aggregate(pipeline).exec();
  }

  async create(
    config: IConnectionConfig,
    createDto: ShoppingCartDto,
  ): Promise<ShoppingCart> {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const ShoppingCartModel = ShoppingCartSchemaManager.getModel(
      config,
      dbConection,
    );
    createDto.tenant = config.tenant;
    const created = new ShoppingCartModel(createDto);
    const result = await created.save();
    return result;
  }

  async update(
    config: IConnectionConfig,
    _id: string,
    updateDto: ShoppingCartDto,
  ): Promise<any> {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const ShoppingCartModel = ShoppingCartSchemaManager.getModel(
      config,
      dbConection,
    );
    let result;
    await ShoppingCartModel.findById(_id)
      .exec()
      .then(async findItem => {
        findItem = Object.assign(findItem, updateDto);
        result = await findItem.save();
      });
    return result;
  }

  async findAll(config: IConnectionConfig): Promise<ShoppingCart[]> {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const ShoppingCartModel = ShoppingCartSchemaManager.getModel(
      config,
      dbConection,
    );
    const result = await ShoppingCartModel.find().exec();
    return result;
  }

  async findOne(config: IConnectionConfig, _id: string): Promise<ShoppingCart> {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const ShoppingCartModel = ShoppingCartSchemaManager.getModel(
      config,
      dbConection,
    );
    const result = await ShoppingCartModel.findById(_id).exec();

    return result;
  }

  async findObj(config: IConnectionConfig, obj: any): Promise<ShoppingCart[]> {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const ShoppingCartModel = ShoppingCartSchemaManager.getModel(
      config,
      dbConection,
    );
    const result = await ShoppingCartModel.find(obj)
      .populate([
        {
          path: 'info_product',
          model: config.tenant + 'Product',
          populate: {
            path: 'brand',
            model: config.tenant + 'Brand',
            select: 'name',
          },
        },
      ])
      .populate({
        path: 'info_product',
        select: '-detail_list',
        populate: {
          path: 'supplier_delivery',
          select: '-list_brand',
          //  populate: {
          //    path: 'method_send',
          //    select: 'name available active description intervalTime rangeMin rangeMax maxDaySchedule maxDayDelivery',
          //    populate: {
          //     path: 'type'
          //    }
          //  }
        },
      })
      .lean()
      .exec();

    return result;
  }

  async findObjValidateRules(config: IConnectionConfig, obj: any): Promise<ShoppingCart[]> {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const ShoppingCartModel = ShoppingCartSchemaManager.getModel(
      config,
      dbConection,
    );
    const result = await ShoppingCartModel.find(obj)
      .populate([
        {
          path: 'info_product',
          model: config.tenant + 'Product',
          populate: {
            path: 'brand',
            model: config.tenant + 'Brand',
            select: 'name',
          },
        },
      ])
      .populate({
        path: 'info_product',
        select: '-detail_list',
        populate: [
          { path: 'supplier_delivery', select: '-list_brand' },
          { path: 'campaign', select: 'name' },
          { path: 'categories', select: 'name' }
        ],
      })
      //.lean()
      .exec();

    return result;
  }

  async updateMany(
    config: IConnectionConfig,
    condition: any,
    updateDto: Partial<ShoppingCartDto>,
  ): Promise<ShoppingCart> {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const ShoppingCardModel = ShoppingCartSchemaManager.getModel(config, dbConection);
    let result: Promise<ShoppingCart>;
    result = await ShoppingCardModel.updateMany(condition, updateDto).exec()
    return result;
  }
  async findObjRestaurant(
    config: IConnectionConfig,
    obj: any,
  ): Promise<ShoppingCart[]> {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const ShoppingCartModel = ShoppingCartSchemaManager.getModel(
      config,
      dbConection,
    );
    const result = await ShoppingCartModel.find(obj)
      .populate([
        {
          path: 'info_product',
          model: config.tenant + 'Product',
          populate: {
            path: 'brand',
            model: config.tenant + 'Brand',
            select: 'name',
          },
        },
      ])
      .populate({
        path: 'info_product',
        select: '-detail_list',
        populate: {
          path: 'supplier_delivery',
          select: '-list_brand',
          populate: {
            path: 'method_send',
            select:
              'name available active description intervalTime rangeMin rangeMax maxDaySchedule maxDayDelivery',
            populate: {
              path: 'type',
            },
          },
        },
      })
      .lean()
      .exec();

    return result;
  }

  async getTotalItem(
    config: IConnectionConfig,
    obj: any,
  ): Promise<ShoppingCart[]> {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const ShoppingCartModel = ShoppingCartSchemaManager.getModel(
      config,
      dbConection,
    );
    const result = await ShoppingCartModel.countDocuments(obj)
      .lean()
      .exec();

    return result;
  }

  private async validateMethodSend(
    validMethodSend,
    infoShoppingCart,
    ubigeo,
    req,
    getAmountDelivery,
    _methodService,
    campaignService,
  ) {
    let delivery_discount = 0;
    let invalid_delivery_reason = '';

    // const methods = infoShoppingCart.map(product => product.info_product.list_method.map(method => method));
    // const campaigns = infoShoppingCart.map(product => product.info_product.campaign);

    for (const product of infoShoppingCart) {
      if (product.info_product.list_method) {
        if (product.info_product.list_method.length > 0) {
          for (const method of product.info_product.list_method) {
            const existUbigeo = await _methodService.findOneMethod(
              req.config,
              method,
              ubigeo,
            );
            if (getAmountDelivery) {
              if (existUbigeo) {
                const freeDelivery = await campaignService.getDeliveryStatus(
                  req.config,
                  product.info_product.campaign,
                );
                if (freeDelivery) {
                  delivery_discount += existUbigeo.price;
                  /*    const ubigeoDeliveryPrice: any = existUbigeo.ubigeo.find((ubi: any) => ubi.ubigeo == parseData.ubigeo)
                     delivery_discount += ubigeoDeliveryPrice.price; */
                }
              }
            }
            if (!existUbigeo) {
              validMethodSend = false;
              invalid_delivery_reason =
                'El producto ' +
                product.info_product.name +
                ' no tiene método de envío a la dirección ingresada';
            }
          }
        } else {
          validMethodSend = false;
          break;
        }
      } else {
        validMethodSend = false;
        break;
      }

      const productPack = product.info_product;
      if (productPack.is_pack) {
        const maxProduct = new utilsFunction();
        productPack.stock = await maxProduct.maxTotalPackageNoERP(
          req,
          productPack.pack_products,
        );
      }
    }

    if (getAmountDelivery) {
      return [delivery_discount, validMethodSend, invalid_delivery_reason];
    } else {
      return validMethodSend;
    }
  }

  private async validateMethodSendCallCenter(
    validMethodSend,
    infoShoppingCart,
    ubigeo,
    req,
    _methodService,
  ) {

    for (const product of infoShoppingCart) {
      let methodSend: any = {};
      if (product.info_product.list_method) {
        if (product.info_product.list_method.length > 0) {
          for (const method of product.info_product.list_method) {
            const existUbigeo = await _methodService.findOneMethod(
              req.config,
              method,
              ubigeo,
            );

            if (existUbigeo) {
              methodSend.exists = true;
              methodSend.productName = product.info_product.name;
            } else {
              methodSend.exists = false;
              methodSend.productName = product.info_product.name;
            }
          }
        } else {
          methodSend.exists = false;
          methodSend.productName = product.info_product.name;
          break;
        }
      } else {
        methodSend.exists = false;
        methodSend.productName = product.info_product.name;
        break;
      }
      validMethodSend.push(methodSend);
    }

    return validMethodSend;
  }

  async getShoppingCartRestaurant(
    req,
    state,
    data,
    _methodService,
    campaignService,
    validateService,
    ldvDetailService,
  ): Promise<any> {
    let infoSuppliersShow = false;
    // const t0 = performance.now();
    const infoShoppingCart: any[] = await this.findObjRestaurant(req.config, {
      id_user: req.userId,
      tenant: req.config.tenant,
      limit_hour: { $gte: new Date() },
    }).catch(error => {
      Utils.log(error);
      throw new InternalServerErrorException();
    });
    // const t1 = performance.now();
    // console.log('OLD LUXURY FINDOBJ time: ' + (t1 - t0).toString());

    let infoSuppliers: any[] = [];

    const send_delivery_and_products_by_supplier = await ldvDetailService.findByRef(
      req.config,
      'group_supplier_methods',
    );
    if (send_delivery_and_products_by_supplier[0].value) {
      infoSuppliersShow = true;
      if (infoShoppingCart.length > 0) {
        infoSuppliers = infoShoppingCart.map(cart => {
          return cart.info_product.supplier_delivery;
        });

        infoSuppliers = infoSuppliers.filter(
          (v, i, a) => a.findIndex(t => t._id === v._id) === i,
        );

        infoShoppingCart.map(cart => {
          cart.supplierId = cart.info_product.supplier_delivery._id;
          delete cart.info_product.supplier_delivery;
        });

        infoSuppliers.map((supplier: any) => {
          supplier.products = infoShoppingCart.filter(
            cart => cart.supplierId.toString() == supplier._id.toString(),
          );
        });
      }
    }

    let subtotal = 0;

    infoShoppingCart.forEach(product => {
      subtotal += product.total_price;
    });

    if (state && state !== 'undefined') {
      subtotal = 0;
      let validMethodSend = true;

      infoShoppingCart.forEach(product => {
        subtotal += product.total_price;
      });

      let info: any;
      if (data && data !== 'undefined') {
        info = JSON.parse(data);
        info.cart = { ...info.cart, subtotal_amount: subtotal };
        info.submitDate = new Date(Date.now()).toISOString();
        if (info.ubigeo) {
          // const t4 = performance.now();
          validMethodSend = await this.validateMethodSend(
            validMethodSend,
            infoShoppingCart,
            info.ubigeo,
            req,
            false,
            _methodService,
            campaignService,
          );
          // const t5 = performance.now();
          // console.log('OLD LUXURY VALIDATE METHODS SEND: ' + (t5 - t4).toString());
        }
      } else {
        switch (state) {
          case '0': {
            info = {
              cart: { subtotal_amount: subtotal },
              submitDate: new Date(Date.now()).toISOString(),
            };
          }
        }
      }

      const listProductsSend = infoShoppingCart.map(res => {
        return { id: res.id_product, quantity: res.quantity };
      });

      // const t2 = performance.now();

      const productToSend: any = await validateService.validateGeneral(
        listProductsSend,
        state,
        info,
        req,
        infoShoppingCart,
      );

      // const t3 = performance.now();
      // console.log('OLD LUXURY VALIDATE SERVICE: ' + (t3 - t2).toString());

      if (productToSend.length > 0) {
        subtotal = 0;
        infoShoppingCart.forEach((item, index) => {
          if (typeof productToSend[index].price === 'number') {
            productToSend[index].price =
              productToSend[index].price * item.quantity;
            subtotal += productToSend[index].price;
          } else {
            productToSend[index].price.forEach((entity, i) => {
              productToSend[index].price[i].priceEntity =
                entity.priceEntity * entity.sold;
              subtotal += productToSend[index].price[i].priceEntity;
            });
          }
        });
      }

      const response = {
        infoShoppingCart,
        productToSend,
        subtotal,
        validMethodSend,
      };
      return response;
    }

    if (infoSuppliersShow) {
      return { infoSuppliers, subtotal };
    } else {
      return { infoShoppingCart, subtotal };
    }
  }

  async validateBines(req, data, validateService): Promise<any> {
    const infoShoppingCart: any[] = await this.findObj(req.config, {
      id_user: req.userId,
      tenant: req.config.tenant,
      limit_hour: { $gte: new Date() },
    }).catch(error => {
      Utils.log(error);
      throw new InternalServerErrorException();
    });

    let info: any;
    if (data && data !== 'undefined') {
      info = JSON.parse(data);
    }

    return await validateService.validateBines(info, req, infoShoppingCart);
  }

  async getShoppingCart(
    req,
    state,
    data,
    _methodService,
    campaignService,
    validateService,
  ): Promise<any> {
    let subtotal = 0;

    const infoShoppingCart: any[] = await this.findObjValidateRules(req.config, {
      id_user: req.userId,
      tenant: req.config.tenant,
      limit_hour: { $gte: new Date() },
    }).catch(error => {
      Utils.log(error);
      throw new InternalServerErrorException();
    });

    infoShoppingCart.forEach(product => {
      subtotal += product.total_price;
    });

    if (state && state !== 'undefined') {
      subtotal = 0;
      let info: any;
      let validMethodSend = true;
      let date = new Date(Date.now());
      let milliseconds = date.getTime() - 5 * 1000 * 60 * 60;
      date.setTime(milliseconds);

      infoShoppingCart.forEach(product => {
        subtotal += product.total_price;
      });

      if (data && data !== 'undefined') {
        info = JSON.parse(data);
        info.cart = { ...info.cart, subtotal_amount: subtotal };
        //info.submitDate = new Date(Date.now()).toISOString();
        info.submitDate = date.toISOString();
        if (info.ubigeo) {
          // const t4 = performance.now();
          validMethodSend = await this.validateMethodSend(
            validMethodSend,
            infoShoppingCart,
            info.ubigeo,
            req,
            false,
            _methodService,
            campaignService,
          );
          // const t5 = performance.now();
          // console.log('OLD LUXURY VALIDATE METHODS SEND: ' + (t5 - t4).toString());
        }
      } else {
        switch (state) {
          case '0': {
            info = {
              cart: { subtotal_amount: subtotal },
              //submitDate: new Date(Date.now()).toISOString(),
              submitDate: date.toISOString()
            };
          }
        }
      }

      const listProductsSend = infoShoppingCart.map(res => {
        return { id: res.id_product, quantity: res.quantity };
      });
      // const t2 = performance.now();
      const productToSend: any = await validateService.validateGeneral(
        listProductsSend,
        state,
        info,
        req,
        infoShoppingCart,
      );

      // const t3 = performance.now();
      // console.log('OLD LUXURY VALIDATE SERVICE: ' + (t3 - t2).toString());
      if (state !== '1') {
        // TODO iterate method send if many
        if (info.ubigeo) {
          for (const [index, productCart] of infoShoppingCart.entries()) {
            infoShoppingCart[
              index
            ].method_send = await _methodService.findOneMethod(
              req.config,
              productCart.info_product.list_method[0],
              info.ubigeo,
            );
          }
        }
      }

      if (productToSend.length > 0) {
        subtotal = 0;
        infoShoppingCart.forEach((item, index) => { // producttosend esta en el mismo orden que infoShoppingcart
          // sumar warranty cost y installation cost al pruce del product.
          if (typeof productToSend[index].price === 'number') {
            productToSend[index].price =
              productToSend[index].is_valid &&
                productToSend[index].campaign_price &&
                productToSend[index].origin == 'campaña'
                ? productToSend[index].campaign_price * item.quantity
                : productToSend[index].price * item.quantity; // change cuz of LF
            subtotal += productToSend[index].price;
          } else {
            productToSend[index].price.forEach((entity, i) => {
              productToSend[index].price[i].priceEntity =
                entity.priceEntity * entity.sold;
              subtotal += productToSend[index].price[i].priceEntity;
            });
          }
        });
      }

      // CUPÓN
      let resultCoupon: any;
      state = Number(state);
      if (state > 2 && info && info.code && info.ubigeo && info.number_card) {
        let haveCoupon = infoShoppingCart.some(item => item.coupon);
        resultCoupon = await validateService.validateGeneralCoupon(req, info, productToSend, haveCoupon);
        let [order]: any = await this._orderService.findOneLastUserOrder(req.config, req.userId);
        order.coupon = resultCoupon;
        if (!resultCoupon.error) {
          order.coupon.code = info.code;
          order.coupon.valid = true;
        } else {
          order.coupon.valid = false;
        }

        await this._orderService.update(req.config, order._id, order);

      } else if (state == 0 && info && info.code) {
        resultCoupon = await validateService.validateExistsCoupon(req, info.code);

        if (infoShoppingCart.length > 0) {
          if (resultCoupon.succefully) {
            let shoppingCoupon = infoShoppingCart.find(p => p._doc.hasOwnProperty('coupon'));
            let newCouponCode = false;
            if (shoppingCoupon) {
              if (shoppingCoupon.coupon.coupon_id.toString() == resultCoupon.entity._id.toString() &&
                shoppingCoupon.coupon.code_id.toString() == resultCoupon.entity.coupons._id.toString()) {
                //resultCoupon.succefully = 'Su cupón ya se está usando';
              } else {
                newCouponCode = true;
                //resultCoupon.succefully = '¡Felicitaciones, su cupón ha sido actualizado con éxito! Se aplicará al final de su compra';
                await this.discountCodeService.increaseUsage(
                  req.config,
                  shoppingCoupon.coupon.coupon_id,
                  shoppingCoupon.coupon.code_id,
                  false
                );
              }
              resultCoupon.succefully = '¡Felicitaciones, su cupón ha sido actualizado con éxito! Se aplicará al final de su compra';
            } else {
              newCouponCode = true;
            }

            if (newCouponCode) {
              await Promise.all(
                infoShoppingCart.map(async product => {
                  const coupon = {
                    coupon_id: resultCoupon.entity._id,
                    code_id: resultCoupon.entity.coupons._id,
                    code: resultCoupon.entity.coupons.coupon_code
                  };
                  product.coupon = coupon;
                  await product.save();
                })
              ).then(async () => {
                await this.discountCodeService.increaseUsage(
                  req.config,
                  resultCoupon.entity._id,
                  resultCoupon.entity.coupons._id,
                  true
                );
              }).catch(e => {
                throw new BadRequestException('Error al actualizar el número de usos del cupón')
              });
            }
          }
        } else {
          resultCoupon.error = 'No existen productos dentro de su carrito de compras';
        }
      }

      // popularse metodo de envio, enviando el costo por producto de ese envio, tiempo de entrega por ubigeo.

      const response = {
        infoShoppingCart,
        productToSend,
        subtotal,
        validMethodSend,
        resultCoupon
      };
      return response;
    }

    return { infoShoppingCart, subtotal };
  }

  async getProductsCallcenter(
    req,
    _methodService,
    campaignService,
    validateService,
    productService,
    body,
  ): Promise<any> {
    const state = 2;
    let validMethodSend = [];
    let infoShoppingCart: any[];
    let info: any = {};
    info.submitDate = new Date(Date.now()).toISOString();

    if (body.products && body.ubigeo && body.address) {

      infoShoppingCart = [...body.products];
      await Promise.all(infoShoppingCart.map(async product => {
        const objProduct = await productService.findById(req.config, product._id)
        product.info_product = objProduct;
      }));

      info.ubigeo = body.ubigeo;
      info.address = body.address;

      validMethodSend = await this.validateMethodSendCallCenter(
        validMethodSend,
        infoShoppingCart,
        info.ubigeo,
        req,
        _methodService
      );

      const listProductsSend = [];
      infoShoppingCart.map(res => {
        listProductsSend.push(res.info_product);
      });

      const productToSend: any = await validateService.validateGeneralCallCenter(
        listProductsSend,
        state,
        info,
        req,
        validMethodSend,
      );

      return productToSend;
    } else {
      throw new BadRequestException('Faltan campos obligatorios')
    }
  }

  async customFindObj(
    config: IConnectionConfig,
    obj: any,
  ): Promise<ShoppingCart[]> {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const MethodSendModel = MethodSendSchemaManager.getModel(
      config,
      dbConection,
    );
    const ShoppingCartModel = ShoppingCartSchemaManager.getModel(
      config,
      dbConection,
    );
    const result = await ShoppingCartModel.find(obj)
      .populate([
        {
          path: 'info_product',
          model: config.tenant + 'Product',
          populate: {
            path: 'brand',
            model: config.tenant + 'Brand',
            select: 'name',
          },
        },
      ])
      .populate({
        path: 'info_product',
        populate: { path: 'supplier_delivery' },
      })
      /* .populate('populate_method_send') */
      .lean()
      .exec();
    return result;
  }

  async deleteOne(config: IConnectionConfig, _id: string): Promise<any> {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const ShoppingCartModel = ShoppingCartSchemaManager.getModel(
      config,
      dbConection,
    );
    const findItem = await ShoppingCartModel.findByIdAndRemove(_id);
    return findItem;
  }

  async deleteAllUser(config: IConnectionConfig, idUser: string): Promise<any> {
    const dbConection = await Connect.bdConnect(config.dbconn);
    const ShoppingCartModel = ShoppingCartSchemaManager.getModel(
      config,
      dbConection,
    );
    const findItem = await ShoppingCartModel.remove({ id_user: idUser }).exec();
    return findItem;
  }

  async deleteAllPass(config: IConnectionConfig): Promise<any> {
    const today = new Date();
    const dbConection = await Connect.bdConnect(config.dbconn);
    const ShoppingCartModel = ShoppingCartSchemaManager.getModel(
      config,
      dbConection,
    );
    const findItem = await ShoppingCartModel.remove({
      limit_hour: { $lt: new Date() },
    }).exec();
    return findItem;
  }
}
