import { Injectable, Scope } from '@nestjs/common';
import { ProductService } from '../../../entities/product-config/product/product.service';
import { CampaignService } from '../../../entities/campaign/campaign.service';
import { RulesAdmin } from '../../../entities/discounts/rules-admin/interfaces/rules-admin.interface';
import * as moment from 'moment';
import { CategoryService } from '../../../entities/product-config/category/category.service';
import { LDVDetailService } from '../../../entities/ldv/ldv-detail.service';
import { ShoppingCart } from './interfaces/shopping-cart.interface';
import { OrderService } from 'src/entities/checkout/order/order.service';
import { OrderSchemaManager } from 'src/entities/checkout/order/schemas/order.schema';
import { Connect } from 'src/connect/connect';
import * as mongoose from 'mongoose';
import { DiscountCodeService } from 'src/entities/discount-code/discount-code.service';
import { GroupCustomerService } from 'src/entities/system-settings/group-customer/group-customer.service';
import { MethodSendService } from 'src/entities/system-settings/supplier/method-send/method-send.service';

export enum ESteps {
  CART_STEP = 0,
  ADDRESS_CHECKOUT_STEP = 1,
  TOTAL_AMOUNT_STEP = 2,
  PAYMENT_METHOD_STEP = 3,
}

export interface IDataValidateStep {
  cart?: {
    total_amount: number;
    subtotal_amount: number;
  };
  address?: string;
  number_card?: string;
  submitDate?: string;
  code?: string;
}

@Injectable({ scope: Scope.DEFAULT })
export class ValidateService {
  constructor(
    private productService: ProductService,
    private campaignService: CampaignService,
    private categoryService: CategoryService,
    private ldvDetailService: LDVDetailService,
    private orderService: OrderService,
    private discountCodeService: DiscountCodeService,
    private groupCustomerService: GroupCustomerService,
    private methodSendService: MethodSendService
  ) { }

  async initData(req, infoShoppingCart: ShoppingCart[]) {
    // Obtener el id de los productos
    let productList = [];

    productList = infoShoppingCart.map(each => {
      each.coupon && (each.info_product.coupon = each.coupon);
      return each.info_product;
    });

    // Obtener las campañas activas diferentes
    const idDistinctCampaignList = [
      ...new Set(
        productList
          .filter((element: any) => {
            return element.campaign && element.campaign._id !== null;
          })
          .map((element: any) => {
            return element.campaign;
          }),
      ),
    ];
    let campaignList = [];
    // Por cada campaña buscar por id y traer las reglas de descuento asociadas a el
    campaignList = await this.campaignService.findDiscountRules(
      req.config,
      idDistinctCampaignList,
    );

    return [productList, campaignList];
  }

  async validateFreeDelivery(data: any, req, infoShoppingCart: ShoppingCart[], state: any, populate = false) {
    const parseData: IDataValidateStep = data ? data as IDataValidateStep : {} as IDataValidateStep;
    let productList = null;
    let campaignList = null;

    if (populate) {
      [productList, campaignList] = await this.initData(req, infoShoppingCart);
    }

    // ver si el producto cumple con las condiciones basadas en el "state" en el que estas
    state = Number(state);
    if (!productList) {
      productList = infoShoppingCart.map(each => each.info_product);

      const ProductToSend = await this.validateRules(
        productList[0].campaign,
        state,
        parseData,
        productList[0],
        productList,
        req,
        'campaña',
      );
      return [ProductToSend];
    } else {
      const ProductToSend = await this.validateRules(
        campaignList[0],
        state,
        parseData,
        productList[0],
        productList,
        req,
        'campaña',
      );
      return [ProductToSend];
    }
  }

  async validateBines(data: any, req, infoShoppingCart: ShoppingCart[]) {
    const parseData: IDataValidateStep = data ? data as IDataValidateStep : {} as IDataValidateStep;
    const [productList, campaignList] = await this.initData(req, infoShoppingCart);
    let [order]: any = await this.orderService.findOneLastUserOrder(req.config, req.userId)
    let haveCoupon = false;

    const isValid = productList.map((product: any) => {
      product.coupon && (haveCoupon = true);
      const campaign: any = campaignList.find((campaignIterable: any) => {
        if (product.campaign) {
          return (
            campaignIterable &&
            campaignIterable._id == product.campaign.toString()
          );
        }
      });
      if (campaign) {
        const valid = this.validateBinesRule(campaign, parseData);
        let validBines = valid.filter(valid => valid === false).length ? false : true;
        let validPrice = true;
        if (validBines) {
          let detailOrder = order.detail.find(
            detail => detail.product_id.toString() == product._id.toString()
          );
          validPrice = detailOrder.discount_price == product.campaign_price;
        }
        return validBines && validPrice;
      } else {
        return true;
      }
    });

    let couponValidated: any = await this.validateExistsCoupon(req, parseData.code, haveCoupon);
    let isValidCoupon = couponValidated.entity ? false : true;

    /* retornar
    [{id_producto:
      price:
      precio normal si no cumple,
      precio campaña si cumple,
      is_valid: true si cumple, false si no cumple ,
      reason: indicar cual es la condicion que no cumple}]*/
    let isValidBines = isValid.filter(valid => valid === false).length > 0 ? false : true;

    return isValidBines && isValidCoupon;
  }

  async validateGeneral(
    idProductList: any[],
    state: ESteps,
    data: any,
    req,
    infoShoppingCart: ShoppingCart[],
  ) {
    // Obtener el id de los productos
    let productList = [];
    const parseData: IDataValidateStep = data ? data as IDataValidateStep : {} as IDataValidateStep;

    productList = infoShoppingCart.map(each => each.info_product);

    const campaignsProductsToSend: any = await this.validateCampaign(
      productList,
      parseData,
      state,
      req,
    );
    const categoriesProductsToSend: any = await this.validateCategory(
      productList,
      parseData,
      state,
      req,
    );
    const productsToSend: any = await this.validateProduct(
      productList,
      parseData,
      state,
      req,
    );

    return this.resultProductsToSend(
      productList,
      idProductList,
      campaignsProductsToSend,
      categoriesProductsToSend,
      productsToSend,
      infoShoppingCart,
    );
  }

  async validateGeneralCallCenter(
    listProductsSend: any[],
    state: ESteps,
    data: any,
    req,
    listValidateMethodSend
  ) {
    const productList = [...listProductsSend];

    const campaignsProductsToSend: any = await this.validateCampaign(
      productList,
      data,
      state,
      req,
      true,
    );

    const categoriesProductsToSend: any = await this.validateCategory(
      productList,
      data,
      state,
      req,
      true,
    );

    const productsToSend: any = await this.validateProduct(
      productList,
      data,
      state,
      req,
      true,
    );

    const resultProductSend = this.resultProductsToSendCallCenter(
      productList,
      campaignsProductsToSend,
      categoriesProductsToSend,
      productsToSend,
    );

    const listProductsToSend: any = [];

    resultProductSend.map((productSend, index) => {
      let newProductToSend: any = {}
      const discounts_options: any = [];

      productSend.map(product => {
        newProductToSend.product_id = product.id_product;
        newProductToSend.original_price =
          product.special_price ? product.special_price : product.price;
        newProductToSend.has_discount = false;
        if (product.origin !== 'none' && product.is_valid) {
          newProductToSend.has_discount = true;
          let option: any = {
            origin: product.origin,
            entity_id: product.entity._id,
            entity_name: product.entity.name,
            discount_price: product.price
          }
          let listRules = product.entity.rules_admin.rules;
          listRules.map(rule => {
            if (rule.rddId.tipo.value == 'Bines') {
              option.bines = rule.rddId.values[0];
              option.binesOperator = rule.operator ? rule.operator.value : 'y';
            }
          });
          discounts_options.push(option);
        }
      });
      if (discounts_options.length > 0 && newProductToSend.has_discount) {
        newProductToSend.discounts_options = [...discounts_options];
      }

      newProductToSend.validMethodSend = listValidateMethodSend[index].exists;
      listProductsToSend.push(newProductToSend);
    });

    return listProductsToSend;
  }

  async validateCampaign(
    productList: any[],
    parseData: IDataValidateStep,
    state: ESteps,
    req,
    fakeBinesValidation?: boolean,
  ) {
    // Obtener las campañas activas diferentes
    const idDistinctCampaignList = [
      ...new Set(
        productList
          .filter((element: any) => {
            return element.campaign && element.campaign._id !== null;
          })
          .map((element: any) => {
            return element.campaign._id;
          }),
      ),
    ];

    // Por cada campaña buscar por id y traer las reglas de descuento asociadas a el
    const campaignList = await this.campaignService.findDiscountRules(
      req.config,
      idDistinctCampaignList,
    );

    // ver si el producto cumple con las condiciones basadas en el "state" en el que estas
    state = Number(state);
    const productsToSend = await Promise.all(
      productList.map(async (product: any) => {
        const campaign: any = await campaignList.find((campaignIterable: any) => {
          if (product.campaign) {
            return (
              campaignIterable &&
              campaignIterable._id == product.campaign._id.toString()
            );
          }
          return false;
        });
        if (campaign) {
          return await this.validateRules(
            campaign,
            state,
            parseData,
            product,
            productList,
            req,
            'campaña',
            fakeBinesValidation
          );
        } else {
          return null;
        }
      }),
    );
    // retornar [{id_producto: , price: precio normal si no cumple, precio campaña si cumple, is_valid: true si cumple, false si no cumple , reason: indicar cual es la condicion que no cumple}]
    return productsToSend;
  }

  async validateCategory(
    productList: any[],
    parseData: IDataValidateStep,
    state: ESteps,
    req,
    fakeBinesValidation?: boolean,
  ) {
    // Obtener las categorias distintas
    let categoryList = [];

    productList.forEach(product => {
      categoryList = categoryList.concat(product.categories);
    });

    const idDistinctCategories = [
      ...new Set(
        categoryList
          .filter((element: any) => {
            return element && element._id !== null;
          })
          .map((element: any) => {
            return element._id;
          }),
      ),
    ];

    // Por cada categoría verificar que exista
    categoryList = await this.categoryService.findExistingCategories(
      req.config,
      idDistinctCategories,
    );

    // ver si el producto cumple con las condiciones basadas en el "state" en el que estas
    state = Number(state);
    const productsToSend = await Promise.all(
      productList.map(async (product: any, index) => {
        if (product.categories.length > 0) {
          const tempResult = await Promise.all(
            product.categories.map(async (cat: any) => {
              const category: any = categoryList.find(
                (categoryIterable: any) => {
                  return (
                    categoryIterable && categoryIterable._id == cat._id.toString()
                  );
                },
              );
              if (category) {
                return await this.validateRules(
                  category,
                  state,
                  parseData,
                  product,
                  productList,
                  req,
                  'categoria',
                  fakeBinesValidation
                );
              }
            }),
          );
          let min: any = tempResult.find(e => {
            return e !== null && e !== undefined;
          });

          if (min) {
            tempResult.forEach((result: any) => {
              if (result !== null && result !== undefined) {
                if (min.price >= result.price) {
                  min = result;
                }
              }
            });
          }

          return min;
        } else {
          return null;
        }
      }),
    );
    return productsToSend;
  }

  async validateProduct(
    productList: any[],
    parseData: IDataValidateStep,
    state: ESteps,
    req,
    fakeBinesValidation?: boolean,
  ) {
    const productsToSend = await Promise.all(
      productList.map(async (prod: any) => {
        const product = await this.productService.findOneById(
          req.config,
          prod._id,
        );
        if (product) {
          return await this.validateRules(
            product,
            state,
            parseData,
            product,
            productList,
            req,
            'producto',
            fakeBinesValidation
          );
        } else {
          return null;
        }
      }),
    );
    return productsToSend;
  }

  private resultProductsToSend(
    productList: any[],
    idProductList: any[],
    campaignsProductsToSend: any[],
    categoriesProductsToSend: any[],
    productsToSend: any[],
    infoShoppingCart: ShoppingCart[],
  ) {

    this.addDiscountValidatedOptions(
      productList,
      campaignsProductsToSend,
      categoriesProductsToSend,
      productsToSend
    );

    const campaignPrices = campaignsProductsToSend.map(
      (productToSend: any, index) => {
        if (productToSend === null) {
          return productList[index].special_price;
        }
        return productToSend.price;
      },
    );
    const categoriesPrices = categoriesProductsToSend.map(
      (productToSend: any, index) => {
        if (productToSend === null || productToSend === undefined) {
          return productList[index].special_price;
        }
        return productToSend.price;
      },
    );
    const productsPrices = productsToSend.map((productToSend: any, index) => {
      if (productToSend === null) {
        return productList[index].special_price;
      }
      return productToSend.price;
    });

    const finalProductsToSend = [];

    campaignPrices.forEach((campaignPrice, index) => {
      if (
        campaignPrice <= categoriesPrices[index] &&
        campaignPrice <= productsPrices[index] &&
        campaignsProductsToSend[index]
      ) {
        finalProductsToSend.push(campaignsProductsToSend[index]);
        // this.validateStockAndSend(campaignsProductsToSend, index, idProductList, productsPrices, categoriesPrices, productsToSend,
        //   categoriesProductsToSend, productList, finalProductsToSend, infoShoppingCart);
      } else if (
        productsPrices[index] <= categoriesPrices[index] &&
        productsPrices[index] <= campaignPrice &&
        productsToSend[index]
      ) {
        finalProductsToSend.push(productsToSend[index]);
      } else if (
        categoriesPrices[index] <= productsPrices[index] &&
        categoriesPrices[index] <= campaignPrice &&
        categoriesProductsToSend[index]
      ) {
        finalProductsToSend.push(categoriesProductsToSend[index]);
      } else {
        finalProductsToSend.push({
          id_product: productList[index]._id,
          price: productList[index].special_price,
          is_valid: true,
          reason: '',
          preventNextStep: false,
          pendding_state: false,
          origin: 'none',
          method_id: productList[index].list_method[0], //revisar esto a futuro cuando el usuario seleccione su propio método de envío
          supplier_id: productList[index].supplier._id,
          brand_id: productList[index].brand._id,
          campaign_filter_values: productList[index].campaign_filter_values,
          filter_values: productList[index].filter_values,
          campaign: productList[index].campaign,
          categories: productList[index].categories
        });
      }
    });

    return finalProductsToSend;
  }

  private resultProductsToSendCallCenter(
    productList: any[],
    campaignsProductsToSend: any[],
    categoriesProductsToSend: any[],
    productsToSend: any[],
  ) {

    const finalProductsToSend = [];
    productList.forEach((product, index) => {
      const optionList: any = []
      campaignsProductsToSend[index] && (optionList.push(campaignsProductsToSend[index]))
      categoriesProductsToSend[index] && (optionList.push(categoriesProductsToSend[index]))
      productsToSend[index] && (optionList.productsToSend = optionList.push(productsToSend[index]))
      if (optionList.length === 0)
        optionList.push({
          id_product: product._id,
          special_price: product.special_price,
          origin: 'none',
        });
      finalProductsToSend.push(optionList);
    });

    return finalProductsToSend;
  }

  private addDiscountValidatedOptions(
    productList: any[],
    campaignsProductsToSend: any[],
    categoriesProductsToSend: any[],
    productsToSend: any[],
  ) {

    productList.forEach((product, index) => {
      const validatedOptions: any = {};
      campaignsProductsToSend[index] &&
        (validatedOptions.campaign = campaignsProductsToSend[index].is_valid);
      categoriesProductsToSend[index] &&
        (validatedOptions.category = categoriesProductsToSend[index].is_valid);
      productsToSend[index] &&
        (validatedOptions.product = productsToSend[index].is_valid);

      campaignsProductsToSend[index] &&
        (campaignsProductsToSend[index].validatedOptions = validatedOptions)
      categoriesProductsToSend[index] &&
        (categoriesProductsToSend[index].validatedOptions = validatedOptions)
      productsToSend[index] &&
        (productsToSend[index].validatedOptions = validatedOptions)
    });
  }

  validateBinesRule(entity: any, parseData: IDataValidateStep): boolean[] {
    if (entity.rules_admin) {
      const rulesAdmin: RulesAdmin = entity.rules_admin;
      if (rulesAdmin.rules) {
        const boolArray = rulesAdmin.rules.map(rule => {
          if (rule.rddId.tipo.value === 'Bines') {
            const bines = rule.rddId.values[0]
              .split(' ')
              .join('')
              .split(',');
            let validate = false;
            for (let product_bin of bines) {
              const test = '^' + product_bin;
              if (new RegExp(test).test(parseData.number_card)) {
                validate = true;
                break;
              }
            }
            return validate;
          }
          return true;
        });

        return boolArray;
      } else {
        return [true];
      }
    } else {
      return [true];
    }
  }

  async validateRules(
    entity: any,
    state: ESteps,
    parseData: IDataValidateStep,
    product: any,
    productList: any[],
    req: any,
    entityName: string,
    fakeBinesValidation?: boolean
  ) {
    if (entity.rules_admin) {
      const rulesAdmin: RulesAdmin = entity.rules_admin;
      let toEvaluate = [];
      let validateResult = false;
      const finalResult = [];
      let pendding_state = false;
      const reason = [];
      let preventNextStep = false;
      await Promise.all(
        rulesAdmin.rules && rulesAdmin.rules.map(async rule => {
          switch (rule.rddId.tipo.value) {
            case 'Bines': {
              if (
                state == ESteps.CART_STEP ||
                state == ESteps.ADDRESS_CHECKOUT_STEP ||
                state == ESteps.TOTAL_AMOUNT_STEP
              ) {
                validateResult = true;
                if (!fakeBinesValidation) {
                  pendding_state = true;
                }
              } else if (state == ESteps.PAYMENT_METHOD_STEP) {
                const bines = rule.rddId.values[0]
                  .split(' ')
                  .join('')
                  .split(',');
                let validate = false;
                for (let product_bin of bines) {
                  const test = '^' + product_bin;
                  if (new RegExp(test).test(parseData.number_card)) {
                    validate = true;
                    break;
                  }
                }
                validateResult = validate;
                if (!validateResult) {
                  preventNextStep = this.createReason(
                    entity,
                    product,
                    preventNextStep,
                    reason,
                    'Bines',
                    entityName,
                  );
                }
              }
              break;
            }
            case 'Fecha': {
              if (parseData.submitDate) {
                validateResult = this.validateDate(parseData, rule);
                if (!validateResult) {
                  preventNextStep = this.createReason(
                    entity,
                    product,
                    preventNextStep,
                    reason,
                    'Fecha',
                    entityName,
                  );
                }
              }
              break;
            }
            case 'Texto': {
              if (parseData.code) {
                validateResult = this.validateCode(parseData, rule);
                if (!validateResult) {
                  preventNextStep = this.createReason(
                    entity,
                    product,
                    preventNextStep,
                    reason,
                    'Texto',
                    entityName,
                  );
                }
              } else validateResult = false;
              break;
            }
            case 'Ubigeo': {
              if (state == ESteps.CART_STEP) {
                validateResult = true;
                pendding_state = true;
              } else if (
                state == ESteps.ADDRESS_CHECKOUT_STEP ||
                state == ESteps.PAYMENT_METHOD_STEP ||
                state == ESteps.TOTAL_AMOUNT_STEP
              ) {
                let validate = false;
                if (parseData.address) {
                  for (let valueRole of rule.rddId.values) {
                    if (valueRole._id == parseData.address) {
                      validate = true;
                      break;
                    }
                  }
                  validateResult = validate;
                  if (!validateResult) {
                    preventNextStep = this.createReason(
                      entity,
                      product,
                      preventNextStep,
                      reason,
                      'Ubigeo',
                      entityName,
                    );
                  }
                }
              }
              break;
            }
            case 'Atributo': {
              // Revisar que tipo de atributo es
              switch (rule.rddId.ldv_attr_field_id.code) {
                // Atributo carrito
                case 'RULE_CART': {
                  if (rule.rddId.ldv_attr_field_id.value == 'monto_total') {
                    if (
                      state == ESteps.TOTAL_AMOUNT_STEP ||
                      state == ESteps.PAYMENT_METHOD_STEP
                    ) {
                      if (parseData.cart) {
                        const result = this.validateRDDOperator(
                          rule,
                          parseData,
                          'cart',
                          'total_amount',
                        );
                        validateResult = result.validate;
                        if (!validateResult) {
                          preventNextStep = this.createReason(
                            entity,
                            product,
                            preventNextStep,
                            reason,
                            'Atributo-RULE_CART-monto_total',
                            entityName,
                          );
                        }
                      }
                    } else if (
                      state == ESteps.CART_STEP ||
                      state == ESteps.ADDRESS_CHECKOUT_STEP
                    ) {
                      validateResult = true;
                      pendding_state = true;
                    }
                  } else if (
                    rule.rddId.ldv_attr_field_id.value == 'monto_sub'
                  ) {
                    if (parseData.cart) {
                      const result = this.validateRDDOperator(
                        rule,
                        parseData,
                        'cart',
                        'subtotal_amount',
                      );
                      validateResult = result.validate;
                      if (!validateResult) {
                        preventNextStep = this.createReason(
                          entity,
                          product,
                          preventNextStep,
                          reason,
                          'Atributo-RULE_CART-monto_sub',
                          entityName,
                        );
                      }
                    }
                  }
                  break;
                }
                // Atributo campaña
                case 'RULE_CAMPAIGN': {
                  if (rule.rddId.ldv_attr_field_id.value == 'nombre') {
                    let validate = false;
                    for (const productChecker of productList) {
                      if (
                        productChecker.campaign &&
                        productChecker.campaign._id.toString() ==
                        rule.rddId.values[0]
                      ) {
                        validate = true;
                        break;
                      }
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      preventNextStep = this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_CAMPAIGN',
                        entityName,
                      );
                    }
                  }
                  break;
                }
                // Atributo categoría
                case 'RULE_CATEGORY': {
                  if (rule.rddId.ldv_attr_field_id.value == 'nombre') {
                    let validate = false;
                    for (const productChecker of productList) {
                      if (productChecker.categories) {
                        let productFound = productChecker.categories
                          .find(el => el._id.toString() === rule.rddId.values[0]);
                        if (productFound) {
                          validate = true;
                          break;
                        }
                      }
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      preventNextStep = this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_CATEGORY',
                        entityName,
                      );
                    }
                  }
                  break;
                }
                // Atributo seller
                case 'RULE_SELLER': {
                  if (rule.rddId.ldv_attr_field_id.value == 'nombre') {
                    let validate = false;
                    for (const productChecker of productList) {
                      if (
                        productChecker.supplier._id.toString() ==
                        rule.rddId.values[0]
                      ) {
                        validate = true;
                        break;
                      }
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      preventNextStep = this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_SELLER',
                        entityName,
                      );
                    }
                  }
                  break;
                }
                // Atributo producto
                case 'RULE_PRODUCT': {
                  if (rule.rddId.ldv_attr_field_id.value == 'precio') {
                    let validate = false;
                    for (let productChecker of productList) {
                      switch (rule.rddId.operator.value) {
                        case '<=': {
                          validate =
                            productChecker.special_price <=
                            rule.rddId.values[0];
                          break;
                        }
                        case '>=': {
                          validate =
                            productChecker.special_price >=
                            rule.rddId.values[0];
                          break;
                        }
                        case '=': {
                          validate =
                            productChecker.special_price ==
                            rule.rddId.values[0];
                          break;
                        }
                        case '<': {
                          validate =
                            productChecker.special_price < rule.rddId.values[0];
                          break;
                        }
                        case '>': {
                          validate =
                            productChecker.special_price > rule.rddId.values[0];
                          break;
                        }
                      }
                      if (validate == true) {
                        break;
                      }
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      preventNextStep = this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_PRODUCT-precio',
                        entityName,
                      );
                    }
                  } else if (rule.rddId.ldv_attr_field_id.value == 'marca') {
                    let validate = false;
                    for (let productChecker of productList) {
                      if (
                        productChecker.brand._id.toString() == rule.rddId.values[0]
                      ) {
                        validate = true;
                        break;
                      }
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      preventNextStep = this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_PRODUCT-marca',
                        entityName,
                      );
                    }
                  } else {
                    let validate = false;
                    for (let productChecker of productList) {
                      for (let value of rule.rddId.values) {
                        if (productChecker._id.toString() === value._id) {
                          validate = true;
                          break;
                        }
                      }
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      preventNextStep = this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_PRODUCT-sku',
                        entityName,
                      );
                    }
                  }
                  break;
                }
                case 'RULE_FILTER': {
                  if (rule.rddId.ldv_attr_field_id.value == 'nombre') {
                    let validate = false;
                    if (product.campaign_filter_values) {
                      for (const fc of product.campaign_filter_values) {
                        let entityCamp;
                        if (rule.rddId.values[0].entityFilterName === 'campaña') {
                          if (product.campaign) {
                            entityCamp = product.campaign._id.toString()
                          }
                        }
                        if (
                          entityCamp &&
                          rule.rddId.values[0].entityFilterId === entityCamp.toString() &&
                          rule.rddId.values[0].filterId === fc.filter_id.toString() &&
                          rule.rddId.values[0].filterValue === fc[rule.rddId.values[0].filterType]
                        ) {
                          validate = true;
                          break;
                        }
                      }
                    }
                    if (product.filter_values) {
                      for (const fc of product.filter_values) {
                        let entityCat;
                        if (rule.rddId.values[0].entityFilterName === 'categoria') {
                          if (product.categories) {
                            entityCat = product.categories.find(e => e._id.toString() == rule.rddId.values[0].entityFilterId)
                          }
                        }
                        if (
                          entityCat &&
                          rule.rddId.values[0].entityFilterId === entityCat._id.toString() &&
                          rule.rddId.values[0].filterId === fc.filter_id.toString() &&
                          rule.rddId.values[0].filterValue === fc[rule.rddId.values[0].filterType]
                        ) {
                          validate = true;
                          break;
                        }
                      }
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      preventNextStep = this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_FILTER',
                        entityName,
                      );
                    }
                  }
                  break;
                }
              }
              break;
            }
            case 'Primera compra en Tienda': {
              validateResult = await this.validateFirstBuy(req);
              if (!validateResult) {
                preventNextStep = this.createReason(
                  entity,
                  product,
                  preventNextStep,
                  reason,
                  'Primera compra en Tienda',
                  entityName,
                );
              }
              break;
            }
            case 'Primera compra en Campaña': {
              validateResult = await this.validateFirstBuyCampaign(req, rule.rddId.values[0]);
              if (!validateResult) {
                preventNextStep = this.createReason(
                  entity,
                  product,
                  preventNextStep,
                  reason,
                  'Primera compra en Campaña',
                  entityName,
                );
              }
              break;
            }
          }

          // entityName === "campaign" && this.validateProductStock(entity, product, validateResult,
          //   preventNextStep, reason, entityName, index, idProductList);

          // Si el operador es null  'o'  'o no' entonces agregarlo al arreglo de 'Por evaluar'
          if (
            rule.operator == null ||
            rule.operator.value == 'o' ||
            rule.operator.value == 'o no'
          ) {
            if (rule.operator == null) {
              toEvaluate.push(validateResult);
            } else if (rule.operator && rule.operator.value == 'o') {
              toEvaluate.push(validateResult);
            } else if (rule.operator && rule.operator.value == 'o no') {
              if (
                (rule.rddId.tipo.value === 'Bines' &&
                  (state == ESteps.CART_STEP ||
                    state == ESteps.ADDRESS_CHECKOUT_STEP ||
                    state == ESteps.TOTAL_AMOUNT_STEP)) ||
                (rule.rddId.tipo.value === 'Ubigeo' &&
                  state == ESteps.CART_STEP) ||
                (rule.rddId.tipo.value === 'Atributo' &&
                  rule.rddId.ldv_attr_field_id.code === 'RULE_CART' &&
                  rule.rddId.ldv_attr_field_id.value == 'monto_total' &&
                  (state == ESteps.CART_STEP ||
                    state == ESteps.ADDRESS_CHECKOUT_STEP))
              ) {
                toEvaluate.push(validateResult);
              }
              toEvaluate.push(!validateResult);
            }
          }
          // Si el operador es 'y'
          else if (
            rule.operator.value == 'y' ||
            rule.operator.value == 'y no'
          ) {
            // Resolver arreglo 'PorEvaluar'
            let logicResult = this.resolveToEvaluate(toEvaluate);
            // Asignar resultado al arreglo del  resultado final
            finalResult.push(logicResult);
            // Asignar al arreglo 'Por evaluar' vacio
            toEvaluate = [];
            // Asignar el resultado (validateResult)  al array 'por evaluar'
            if (rule.operator.value != 'y no') {
              toEvaluate.push(validateResult);
            } else {
              // La regla de descuento pasa puesto que y no no aplica cuando estamos en estos steps
              if (
                (rule.rddId.tipo.value === 'Bines' &&
                  (state == ESteps.CART_STEP ||
                    state == ESteps.ADDRESS_CHECKOUT_STEP ||
                    state == ESteps.TOTAL_AMOUNT_STEP)) ||
                (rule.rddId.tipo.value === 'Ubigeo' &&
                  state == ESteps.CART_STEP) ||
                (rule.rddId.tipo.value === 'Atributo' &&
                  rule.rddId.ldv_attr_field_id.code === 'RULE_CART' &&
                  rule.rddId.ldv_attr_field_id.value == 'monto_total' &&
                  (state == ESteps.CART_STEP ||
                    state == ESteps.ADDRESS_CHECKOUT_STEP))
              ) {
                toEvaluate.push(validateResult);
              } else {
                toEvaluate.push(!validateResult);
              }
            }
          }
        }));
      // Una vez acabado el bucle Resolver el ultimo array generado 'Por evaluar'
      // Insertar el ultimo resutlado del array por evauluar  en el array del resultado final
      finalResult.push(this.resolveToEvaluate(toEvaluate));
      // Resolver el arreglo del resultado final con operador &&
      let isValid = this.resolveFinalResult(finalResult);
      if (entity.active_discount) {
        const typeDiscount = await this.ldvDetailService.findOne(
          req.config,
          entity.type_discount,
        );
        if (typeDiscount.value === '%') {
          product.discount_price =
            product.special_price * ((100 - entity.discount_amount) / 100);
        } else {
          product.discount_price =
            product.special_price - entity.discount_amount;
          if (product.special_price < 0) {
            product.discount_price = 0;
          }
        }
      }

      isValid && (preventNextStep = false);

      let nameCampaign = null;
      if (entityName == 'campaña') {
        nameCampaign = 'Precio Scotiabank';
        delete entity.products; // Se elimina acá porque antes se usa para crear el reason
        if (entity.discount_name && entity.discount_name != '') {
          nameCampaign = entity.discount_name;
        }
      }

      //entity.products = []; //No se sabe su propósito de vida

      const productToSend = {
        id_product: product._id,
        nameCampaign,
        price:
          isValid && !pendding_state
            ? entityName == 'campaña'
              ? product.campaign_price
              : product.discount_price
            : product.special_price,
        is_valid: isValid,
        reason,
        preventNextStep,
        pendding_state,
        origin: entityName,
        entity,
        campaign_price: product.campaign_price,
        freeDelivery: entity.delivery && isValid,
        method_id: product.list_method[0], //revisar esto a futuro cuando el usuario seleccione su propio método de envío
        supplier_id: product.supplier._id,
        brand_id: product.brand._id,
        campaign_filter_values: product.campaign_filter_values,
        filter_values: product.filter_values,
        campaign: product.campaign,
        categories: product.categories
      };
      if (isValid && !pendding_state) {
        productToSend['special_price'] = product.special_price;
      }

      return productToSend;
    } else {
      return null;
    }
  }

  private resolveToEvaluate(toEvaluate: any[]) {
    let logicResult;
    toEvaluate.forEach((value, index) => {
      if (index == 0) {
        logicResult = value;
      } else {
        logicResult = logicResult || value;
      }
    });
    return logicResult;
  }
  private resolveFinalResult(finalResult: any[]) {
    let logicResult;
    finalResult.forEach((value, index) => {
      if (index == 0) {
        logicResult = value;
      } else {
        logicResult = logicResult && value;
      }
    });
    return logicResult;
  }

  private validateDate(parseData: IDataValidateStep, rule: any) {
    let submitParsedDate = moment(parseData.submitDate);
    const validation = submitParsedDate.isBetween(
      rule.rddId.values[0],
      rule.rddId.values[1],
    );

    return validation;
  }

  private validateCode(parseData: IDataValidateStep, rule: any) {
    return parseData.code === rule.rddId.values[0];
  }

  private async validateFirstBuy(req: any) {
    let listOrderByUser = await this.orderService.findByUserFirstBuy(req.config, req.userId);
    let order = listOrderByUser.find(order => order.status_payment == true);
    let existsOrders = order ? false : true;
    return existsOrders;
  }

  private async validateFirstBuyCampaign(req: any, idCampaign: any) {
    const dbConection = await Connect.bdConnect(req.config.dbconn);
    const campaign = await this.campaignService.findOne(req.config, idCampaign);
    const OrderModel = OrderSchemaManager.getModel(req.config, dbConection);
    const pipeline = [
      {
        $project: { user_id: 1, create_date: 1, detail: 1, status_payment: 1 }
      },
      {
        $match: {
          user_id: { $eq: mongoose.Types.ObjectId(req.userId) },
          create_date: { $gte: campaign.create_date },
          status_payment: { $eq: true }
        }
      },
      { $unwind: { path: '$detail' } },
      {
        $match: { 'detail.reason.entity._id': { $eq: idCampaign } }
      }
    ]

    const listOrderByUser = await OrderModel.aggregate(pipeline);
    let existsOrders = listOrderByUser.length > 0 ? false : true;
    return existsOrders;
  }

  private validateRDDOperator(
    rule: any,
    parseData: IDataValidateStep,
    attribute: string,
    property: string,
  ) {
    let validate = false;
    let comment = '';
    let propertyField =
      property === 'total_amount' ? 'monto total' : ' monto subtotal';
    switch (rule.rddId.operator.value) {
      case '<=': {
        validate = parseData[attribute][property] <= rule.rddId.values[0];
        !validate &&
          (comment = `El ${propertyField} no es menor o igual al monto total de la campaña`);
        break;
      }
      case '>=': {
        validate = parseData[attribute][property] >= rule.rddId.values[0];
        !validate &&
          (comment = `El ${propertyField} no es mayor o igual al monto total de la campaña`);
        break;
      }
      case '=': {
        validate = parseData[attribute][property] == rule.rddId.values[0];
        !validate &&
          (comment = `El ${propertyField} no es igual al monto total de la campaña`);
        break;
      }
      case '<': {
        validate = parseData[attribute][property] < rule.rddId.values[0];
        !validate &&
          (comment = `El ${propertyField} no es menor al monto total de la campaña`);
        break;
      }
      case '>': {
        validate = parseData[attribute][property] > rule.rddId.values[0];
        !validate &&
          (comment = `El ${propertyField} no es mayor al monto total de la campaña`);
        break;
      }
    }
    return { validate, comment };
  }

  createReason(
    entity: any,
    product: any,
    preventNextStep: boolean,
    reason: any[],
    rule: string,
    entityName?: string,
  ) {
    let message: string = '';
    switch (rule) {
      case 'Bines':
        message = 'El medio de pago utilizado no aplica para el descuento.';
        break;
      case 'Fecha':
        message =
          'La fecha actual no aplica para el descuento';
        break;
      case 'Texto':
        message = 'El código de descuento no existe';
        break;
      case 'Ubigeo':
        message =
          'La dirección elegida no aplica para el descuento.';
        break;
      case 'Atributo-RULE_CART-monto_total':
        message =
          'El monto total no aplica para el descuento';
        break;
      case 'Atributo-RULE_CART-monto_sub':
        message = 'El monto subtotal no aplica para el descuento';
        break;
      case 'Atributo-RULE_PRODUCT-precio':
        message =
          'No existen precios en los productos elegidos que apliquen para el descuento';
        break;
      case 'Atributo-RULE_PRODUCT-marca':
        message =
          'Las marcas de los productos elegidos no aplican para el descuento';
        break;
      case 'Atributo-RULE_PRODUCT-sku':
        message =
          'Los productos elegidos no aplican para el descuento';
        break;
      case 'Atributo-RULE_CAMPAIGN':
        message = 'Su carrito no cuenta con productos de la campaña vigente';
        break;
      case 'Atributo-RULE_SELLER':
        message = 'El proveedor del producto no aplica para el descuento';
        break;
      case 'outOfStock':
        message =
          'La cantidad elegida de este producto supera el stock permitido';
    }
    if (entityName === 'campaña') {
      entity.products.forEach(prod => {
        if (product._id.toString() === prod.productId.toString()) {
          prod.exclusive && (preventNextStep = true);

          reason.push({
            rule,
            exclusive: prod.exclusive,
            message: !prod.exclusive
              ? message
              : 'El producto exclusivo no cumple con las reglas de la campaña, no puede continuar con la compra hasta que haya eliminado este producto de su carrito.',
          });
        }
      });
    } else {
      reason.push({
        rule,
        message,
      });
    }

    return preventNextStep;
  }

  validateStockAndSend(
    campaignsProductsToSend,
    index,
    idProductList,
    productsPrices,
    categoriesPrices,
    productsToSend,
    categoriesProductsToSend,
    productList,
    finalProductsToSend,
    infoShoppingCart: ShoppingCart[],
  ) {
    campaignsProductsToSend[index].entity.products.forEach(prod => {
      if (
        prod.productId._id.toString() ===
        campaignsProductsToSend[index].id_product.toString()
      ) {
        // si la cantidad a comprar supera el stock disponible entonces repartir los precios del producto entre el de campaña
        // y el de categoria o precio
        // if(idProductList[index].quantity > prod.stock - (prod.sold - infoShoppingCart[index].reserved_campaign_stock)) {
        if (infoShoppingCart[index].reserved_campaign_stock !== 0) {
          let campaignDiscountWontApplyQuantity =
            idProductList[index].quantity -
            infoShoppingCart[index].reserved_campaign_stock;

          campaignsProductsToSend[index].price = [
            {
              priceEntity: campaignsProductsToSend[index].price,
              sold: infoShoppingCart[index].reserved_campaign_stock,
            },
          ];

          if (
            productsPrices[index] <= categoriesPrices[index] &&
            productsToSend[index]
          ) {
            campaignsProductsToSend[index].price = [
              ...campaignsProductsToSend[index].price,
              {
                priceEntity: productsToSend[index].price,
                sold: campaignDiscountWontApplyQuantity,
                entity: productsToSend[index],
              },
            ];
          } else if (
            categoriesPrices[index] <= productsPrices[index] &&
            categoriesProductsToSend[index]
          ) {
            campaignsProductsToSend[index].price = [
              ...campaignsProductsToSend[index].price,
              {
                priceEntity: categoriesProductsToSend[index].price,
                sold: campaignDiscountWontApplyQuantity,
                entity: categoriesProductsToSend[index],
              },
            ];
          } else {
            campaignsProductsToSend[index].price = [
              ...campaignsProductsToSend[index].price,
              {
                priceEntity: productList[index].special_price,
                sold: campaignDiscountWontApplyQuantity,
                entity: {
                  id_product: productList[index]._id,
                  price: productList[index].special_price,
                  is_valid: true,
                  reason: '',
                  preventNextStep: false,
                  pendding_state: false,
                  origin: 'none',
                },
              },
            ];
          }
        } else {
          // If campaign is out of stock for this product
          if (
            productsPrices[index] <= categoriesPrices[index] &&
            productsToSend[index]
          ) {
            return finalProductsToSend.push(productsToSend[index]);
          } else if (
            categoriesPrices[index] <= productsPrices[index] &&
            categoriesProductsToSend[index]
          ) {
            return finalProductsToSend.push(categoriesProductsToSend[index]);
          } else {
            return finalProductsToSend.push({
              id_product: productList[index]._id,
              price: productList[index].special_price,
              is_valid: true,
              reason: '',
              preventNextStep: false,
              pendding_state: false,
              origin: 'none',
            });
          }
        }
        // }
        // else if (idProductList[index].quantity == infoShoppingCart[index].reserved_campaign_stock) {
        //   //si una persona compra un producto de una campaña la cantidad comprada no supera el stock disponible en dicha campaña
        //   return finalProductsToSend.push(campaignsProductsToSend[index]);
        // }
        // else { // si la campaña está no activa por parte del administrador y alguien compra un producto de esta campaña
        // if ( //no se aplica el precio de campaña
        //   productsPrices[index] <= categoriesPrices[index] &&
        //   productsToSend[index]
        // ) {
        //   return finalProductsToSend.push(productsToSend[index]);
        // } else if (
        //   categoriesPrices[index] <= productsPrices[index] &&
        //   categoriesProductsToSend[index]
        // ) {
        //   return finalProductsToSend.push(categoriesProductsToSend[index]);
        // } else {
        //   return finalProductsToSend.push({
        //     id_product: productList[index]._id,
        //     price: productList[index].special_price,
        //     is_valid: true,
        //     reason: '',
        //     preventNextStep: false,
        //     pendding_state: false,
        //     origin: 'none',
        //   });
        // }
        // }
        finalProductsToSend.push(campaignsProductsToSend[index]);
      }
    });
  }

  private applyDiscount(list, discountType, discount, maxCouponDiscountAmount) {
    let deliveryAmountTotal = 0;

    list.map(element => {
      let reachTop = false;
      let discountAmount = 0;

      if (!reachTop) {
        const price = element.price;
        let auxDiscount = deliveryAmountTotal;

        if (discountType.value == 'percentage') {
          discountAmount = discount * price / 100;
        } else if (discountType.value == 'fixed') {
          discountAmount = (price > discount) ? discount : price;
        }

        deliveryAmountTotal += discountAmount;

        if (deliveryAmountTotal >= maxCouponDiscountAmount) {
          discountAmount = maxCouponDiscountAmount - auxDiscount;
          deliveryAmountTotal = maxCouponDiscountAmount;
          reachTop = true;
        }
      }

      //isMethodSend && (element.discount = discountAmount);
      element.discount = discountAmount;
    });

    return deliveryAmountTotal;
  }

  async validateGeneralCoupon(req, data, productList, haveCoupon?) {
    const existsCoupon: any = await this.validateExistsCoupon(req, data.code, haveCoupon);

    if (existsCoupon && existsCoupon.entity) {
      let entityCoupon = existsCoupon.entity;
      let productsValidated = await this.validateCouponProducts(req, data, entityCoupon, productList);
      let result: any = {};

      if (productsValidated && productsValidated.length > 0) {
        let discountAmountTotal;
        let deliveryDiscountAmountTotal;

        if (entityCoupon.have_discount) {
          //const priceListCoupon = productsValidated.map((product: any) => product.price);
          const priceListCoupon = productsValidated.map((product: any) => {
            return { id_product: product.id_product, price: product.price }
          });
          discountAmountTotal = this.applyDiscount(
            priceListCoupon,
            entityCoupon.coupon_discount_type,
            entityCoupon.coupon_discount_amount,
            entityCoupon.max_coupon_discount_amount
          );
          result.amount_discount_coupon = discountAmountTotal;
          result.discount_coupon = priceListCoupon;
        }

        if (entityCoupon.have_delivery_discount) {
          const methodList = await Promise.all(
            productsValidated
              .filter((product: any) => {
                return product.method_id && product.method_id !== null;
              })
              .map(async (product: any) => {
                let methodSend: any = await this.methodSendService.findOneMethod(
                  req.config,
                  product.method_id,
                  data.ubigeo
                );
                return methodSend && { method_id: methodSend.id, price: methodSend.price };
              })
          );

          const methodListString = [...new Set(methodList.map(m => JSON.stringify(m)))];
          const methodListDistinct = methodListString.map(m => JSON.parse(m));

          deliveryDiscountAmountTotal = this.applyDiscount(
            methodListDistinct,
            entityCoupon.delivery_discount_type,
            entityCoupon.delivery_discount_amount,
            entityCoupon.max_delivery_discount_amount
          );
          result.amount_delivery_coupon = deliveryDiscountAmountTotal;
          result.delivery_coupon = methodListDistinct;
        }
      } else {
        result.error = 'Las condiciones no cumplen con sus productos, no se le aplicará el cupón';
      }
      result.coupon_id = entityCoupon._id;
      result.code_id = entityCoupon.coupons._id;
      return result;
    }
  }

  async validateExistsCoupon(req, code, haveCoupon?) {
    let [entityCoupon]: any = await this.discountCodeService.findOne(req.config, code);

    if (entityCoupon) {

      if (entityCoupon.coupons.capacity == 0 ||
        entityCoupon.coupons.total_used < entityCoupon.coupons.capacity || haveCoupon) {

        let coupon = entityCoupon.coupons;
        let existUser;
        if (coupon.target_type.value == 'all') {
          existUser = true;

        } else if (coupon.target_type.value == 'group') {
          const group: any = await this.groupCustomerService.findOne(req.config, coupon.target_entity);
          group && (existUser = group.list_customer.find(user => user._id.toString() == req.userId));

        } else if (coupon.target_type.value == 'list') {
          existUser = coupon.target_entity == req.userId;
        }

        if (existUser) {
          const infoSend: any = {};
          infoSend.entity = entityCoupon;
          infoSend.succefully = '¡Felicitaciones, su cupón ha sido agregado con éxito! Se aplicará al final de su compra';
          return infoSend;

        } else {
          const infoSend: any = {};
          infoSend.error = 'El cupón ingresado no es válido';
          return infoSend;
        }
      } else {
        const infoSend: any = {};
        infoSend.error = 'El cupón ingresado excedió el límite de usos';
        return infoSend;
      }
    } else {
      const infoSend: any = {};
      infoSend.error = 'El cupón ingresado no existe';
      return infoSend;
    }
  }

  async validateCouponProducts(req, data, entityCoupon, productList) {
    const newProductsToSend = await Promise.all(
      productList.map((product: any) => {
        return this.validateRulesCoupon(
          entityCoupon,
          data,
          product,
          req
        );
      })
    );
    return newProductsToSend.filter((product: any) => product.is_valid == true);
  }

  async validateRulesCoupon(
    entity: any,
    parseData: IDataValidateStep,
    product: any,
    req: any
  ) {
    if (entity.rules_admin) {
      const rulesAdmin: RulesAdmin = entity.rules_admin;
      let toEvaluate = [];
      let validateResult = false;
      const finalResult = [];
      const reason = [];
      let preventNextStep = false;
      await Promise.all(
        rulesAdmin.rules && rulesAdmin.rules.map(async rule => {
          switch (rule.rddId.tipo.value) {
            case 'Bines': {
              const bines = rule.rddId.values[0].split(' ').join('').split(',');
              let validate = false;
              for (let product_bin of bines) {
                const test = '^' + product_bin;
                if (new RegExp(test).test(parseData.number_card)) {
                  validate = true;
                  break;
                }
              }
              validateResult = validate;
              if (!validateResult) {
                this.createReason(
                  entity,
                  product,
                  preventNextStep,
                  reason,
                  'Bines'
                );
              }
              break;
            }
            case 'Fecha': {
              if (parseData.submitDate) {
                validateResult = this.validateDate(parseData, rule);
                if (!validateResult) {
                  this.createReason(
                    entity,
                    product,
                    preventNextStep,
                    reason,
                    'Fecha'
                  );
                }
              }
              break;
            }
            case 'Texto': {
              if (parseData.code) {
                validateResult = this.validateCode(parseData, rule);
                if (!validateResult) {
                  this.createReason(
                    entity,
                    product,
                    preventNextStep,
                    reason,
                    'Texto'
                  );
                }
              } else validateResult = false;
              break;
            }
            case 'Ubigeo': {
              let validate = false;
              if (parseData.address) {
                for (let valueRole of rule.rddId.values) {
                  if (valueRole._id == parseData.address.toString()) {
                    validate = true;
                    break;
                  }
                }
                validateResult = validate;
                if (!validateResult) {
                  this.createReason(
                    entity,
                    product,
                    preventNextStep,
                    reason,
                    'Ubigeo'
                  );
                }
              }
              break;
            }
            case 'Atributo': {
              // Revisar que tipo de atributo es
              switch (rule.rddId.ldv_attr_field_id.code) {
                // Atributo carrito
                case 'RULE_CART': {
                  if (rule.rddId.ldv_attr_field_id.value == 'monto_total') {
                    if (parseData.cart) {
                      const result = this.validateRDDOperator(
                        rule,
                        parseData,
                        'cart',
                        'total_amount',
                      );
                      validateResult = result.validate;
                      if (!validateResult) {
                        this.createReason(
                          entity,
                          product,
                          preventNextStep,
                          reason,
                          'Atributo-RULE_CART-monto_total'
                        );
                      }
                    }
                  } else if (
                    rule.rddId.ldv_attr_field_id.value == 'monto_sub'
                  ) {
                    if (parseData.cart) {
                      const result = this.validateRDDOperator(
                        rule,
                        parseData,
                        'cart',
                        'subtotal_amount',
                      );
                      validateResult = result.validate;
                      if (!validateResult) {
                        this.createReason(
                          entity,
                          product,
                          preventNextStep,
                          reason,
                          'Atributo-RULE_CART-monto_sub'
                        );
                      }
                    }
                  }
                  break;
                }
                // Atributo campaña
                case 'RULE_CAMPAIGN': {
                  if (rule.rddId.ldv_attr_field_id.value == 'nombre') {
                    let validate = false;
                    if (product.campaign &&
                      product.campaign._id.toString() == rule.rddId.values[0] &&
                      product.validatedOptions.campaign) {
                      validate = true;
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_CAMPAIGN'
                      );
                    }
                  }
                  break;
                }
                // Atributo categoría
                case 'RULE_CATEGORY': {
                  if (rule.rddId.ldv_attr_field_id.value == 'nombre') {
                    let validate = false;
                    if (product.categories) {
                      let productFound = product.categories
                        .find(el => el._id.toString() === rule.rddId.values[0]);
                      if (productFound && product.validatedOptions.category) {
                        validate = true;
                      }
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      preventNextStep = this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_CATEGORY'
                      );
                    }
                  }
                  break;
                }
                // Atributo seller
                case 'RULE_SELLER': {
                  if (rule.rddId.ldv_attr_field_id.value == 'nombre') {
                    let validate = false;
                    if (product.supplier_id.toString() == rule.rddId.values[0]) {
                      validate = true;
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      preventNextStep = this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_SELLER'
                      );
                    }
                  }
                  break;
                }
                // Atributo producto
                case 'RULE_PRODUCT': {
                  if (rule.rddId.ldv_attr_field_id.value == 'precio') {
                    let validate = false;
                    switch (rule.rddId.operator.value) {
                      case '<=': {
                        validate =
                          product.price <=
                          rule.rddId.values[0];
                        break;
                      }
                      case '>=': {
                        validate =
                          product.price >=
                          rule.rddId.values[0];
                        break;
                      }
                      case '=': {
                        validate =
                          product.price ==
                          rule.rddId.values[0];
                        break;
                      }
                      case '<': {
                        validate =
                          product.price < rule.rddId.values[0];
                        break;
                      }
                      case '>': {
                        validate =
                          product.price > rule.rddId.values[0];
                        break;
                      }
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_PRODUCT-precio'
                      );
                    }
                  } else if (rule.rddId.ldv_attr_field_id.value == 'marca') {
                    let validate = false;
                    if (product.brand._id.toString() == rule.rddId.values[0]) {
                      validate = true;
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_PRODUCT-marca'
                      );
                    }
                  } else {
                    let validate = false;
                    for (let value of rule.rddId.values) {
                      if (product.id_product.toString() === value._id && product.validatedOptions.product) {
                        validate = true;
                        break;
                      }
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_PRODUCT-sku'
                      );
                    }
                  }
                  break;
                }
                case 'RULE_FILTER': {
                  if (rule.rddId.ldv_attr_field_id.value == 'nombre') {
                    let validate = false;
                    if (product.campaign_filter_values) {
                      for (const fc of product.campaign_filter_values) {
                        let entityCamp;
                        if (rule.rddId.values[0].entityFilterName === 'campaña') {
                          if (product.campaign) {
                            entityCamp = product.campaign._id.toString()
                          }
                        }
                        if (
                          entityCamp &&
                          rule.rddId.values[0].entityFilterId === entityCamp.toString() &&
                          rule.rddId.values[0].filterId === fc.filter_id.toString() &&
                          rule.rddId.values[0].filterValue === fc[rule.rddId.values[0].filterType]
                        ) {
                          validate = true;
                          break;
                        }
                      }
                    }
                    if (product.filter_values) {
                      for (const fc of product.filter_values) {
                        let entityCat;
                        if (rule.rddId.values[0].entityFilterName === 'categoria') {
                          if (product.categories) {
                            entityCat = product.categories.find(e => e._id.toString() == rule.rddId.values[0].entityFilterId)
                          }
                        }
                        if (
                          entityCat &&
                          rule.rddId.values[0].entityFilterId === entityCat._id.toString() &&
                          rule.rddId.values[0].filterId === fc.filter_id.toString() &&
                          rule.rddId.values[0].filterValue === fc[rule.rddId.values[0].filterType]
                        ) {
                          validate = true;
                          break;
                        }
                      }
                    }
                    validateResult = validate;
                    if (!validateResult) {
                      preventNextStep = this.createReason(
                        entity,
                        product,
                        preventNextStep,
                        reason,
                        'Atributo-RULE_FILTER'
                      );
                    }
                  }
                  break;
                }
              }
              break;
            }
            case 'Primera compra en Tienda': {
              validateResult = await this.validateFirstBuy(req);
              if (!validateResult) {
                this.createReason(
                  entity,
                  product,
                  preventNextStep,
                  reason,
                  'Primera compra en Tienda'
                );
              }
              break;
            }
            case 'Primera compra en Campaña': {
              validateResult = await this.validateFirstBuyCampaign(req, rule.rddId.values[0]);
              if (!validateResult) {
                this.createReason(
                  entity,
                  product,
                  preventNextStep,
                  reason,
                  'Primera compra en Campaña'
                );
              }
              break;
            }
          }

          // Si el operador es null  'o'  'o no' entonces agregarlo al arreglo de 'Por evaluar'
          if (
            rule.operator == null ||
            rule.operator.value == 'o' ||
            rule.operator.value == 'o no'
          ) {
            if (rule.operator == null) {
              toEvaluate.push(validateResult);
            } else if (rule.operator && rule.operator.value == 'o') {
              toEvaluate.push(validateResult);
            } else if (rule.operator && rule.operator.value == 'o no') {
              if (
                rule.rddId.tipo.value === 'Bines' ||
                rule.rddId.tipo.value === 'Ubigeo' ||
                (rule.rddId.tipo.value === 'Atributo' &&
                  rule.rddId.ldv_attr_field_id.code === 'RULE_CART' &&
                  rule.rddId.ldv_attr_field_id.value == 'monto_total')
              ) {
                toEvaluate.push(validateResult);
              }
              toEvaluate.push(!validateResult);
            }
          }
          // Si el operador es 'y'
          else if (
            rule.operator.value == 'y' ||
            rule.operator.value == 'y no'
          ) {
            // Resolver arreglo 'PorEvaluar'
            let logicResult = this.resolveToEvaluate(toEvaluate);
            // Asignar resultado al arreglo del  resultado final
            finalResult.push(logicResult);
            // Asignar al arreglo 'Por evaluar' vacio
            toEvaluate = [];
            // Asignar el resultado (validateResult)  al array 'por evaluar'
            if (rule.operator.value != 'y no') {
              toEvaluate.push(validateResult);
            } else {
              // La regla de descuento pasa puesto que y no no aplica cuando estamos en estos steps
              if (
                rule.rddId.tipo.value === 'Bines' ||
                rule.rddId.tipo.value === 'Ubigeo' ||
                (rule.rddId.tipo.value === 'Atributo' &&
                  rule.rddId.ldv_attr_field_id.code === 'RULE_CART' &&
                  rule.rddId.ldv_attr_field_id.value == 'monto_total')
              ) {
                toEvaluate.push(validateResult);
              } else {
                toEvaluate.push(!validateResult);
              }
            }
          }
        }));
      // Una vez acabado el bucle Resolver el ultimo array generado 'Por evaluar'
      // Insertar el ultimo resutlado del array por evauluar  en el array del resultado final
      finalResult.push(this.resolveToEvaluate(toEvaluate));
      // Resolver el arreglo del resultado final con operador &&
      let isValid = this.resolveFinalResult(finalResult);


      const productToSend = {
        id_product: product.id_product,
        is_valid: isValid,
        reason,
        price: product.price,
        method_id: product.method_id
      };

      return productToSend;
    } else {
      return null;
    }
  }
}
