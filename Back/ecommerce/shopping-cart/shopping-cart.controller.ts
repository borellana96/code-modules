import {
  Controller,
  Post,
  Body,
  Req,
  BadRequestException,
  Delete,
  Put,
  Param,
  Query,
  Get,
} from '@nestjs/common';
import { ShoppingCartDto } from './dto/shopping-cart.dto';
import { ProductDto } from '../../product-config/product/dto/product.dto';
import { ShoppingCartService } from './shopping-cart.service';
import { Utils } from '../../../utils/utils';
import {
  ExceptionValidator,
  InternalServerErrorException,
  NotFoundException,
} from '../../../utils/generalExceptions';
import { ProductService } from '../../../entities/product-config/product/product.service';
import { utilsFunction } from '../../../utils/utilsFunction';
import { SendRequestERP } from '../../../utils/erp/send-request-ERP';
import { CampaignService } from '../../../entities/campaign/campaign.service';
import { ValidateService } from './validate.service';
import { MethodSendService } from '../../../entities/system-settings/supplier/method-send/method-send.service';
import { EventEmitter } from 'events';
import { ShoppingCart } from './interfaces/shopping-cart.interface';
import { LDVDetailService } from '../../ldv/ldv-detail.service';
import { UserService } from '../../system-settings/identity/user/user.service';
import { OrderController } from '../../checkout/order/order.controller';
import * as uuidv4 from 'uuid/v4';
import { LogDto } from '../../log/dto/log.dto';
import { LogsService } from '../../log/log.service';
import { DiscountCodeService } from 'src/entities/discount-code/discount-code.service';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Shopping Cart')
@Controller('shopping-cart')
export class ShoppingCartController {
  postLock = false;
  postBus = new EventEmitter();
  customers = [];
  putLock = false;
  putBus = new EventEmitter();
  updateCustomers = [];

  constructor(
    private _shoppingCartService: ShoppingCartService,
    private _productService: ProductService,
    private _methodService: MethodSendService,
    private validateService: ValidateService,
    private campaignService: CampaignService,
    private userService: UserService,
    private ldvDetailService: LDVDetailService,
    private _logService: LogsService,
    private _discountCodeService: DiscountCodeService,
  ) {
    this.postBus.setMaxListeners(0);
    this.putBus.setMaxListeners(0);
  }

  async validStock(req, updateDto, infoShoppingCard, response) {
    let error = null;
    if (updateDto.quantity > 0) {
      const infoProduct: any = await this._productService
        .findOneById(req.config, infoShoppingCard.info_product._id)
        .catch(error => {
          Utils.log(error);
          throw new InternalServerErrorException();
        });
      if (infoProduct) {
        let totalStock = infoProduct.stock;

        if (infoProduct.is_pack) {
          const maxProduct = new utilsFunction();
          totalStock = await maxProduct.maxTotalPackage(
            req,
            infoProduct.pack_products,
            this._logService,
          ).catch(error => {
            Utils.log(error);
            throw new InternalServerErrorException();
          });
        } else {
          if (req.ERP_connection && req.ERP_connection != '') {
            const logDto: LogDto = {
              cabecera: {
                nombre: '5ed92294350a1029e080b4b7',
                created_by: 'sistema',
                create_date: new Date(),
                update_date: new Date(),
              },
              detalle: [],
              onModel: req.config.tenant + '__Product',
            };

            /* if (infoProduct.code_ERP) {
              const resultERP: any = await SendRequestERP.RequestStok(
                req.ERP_connection,
                infoProduct.code_ERP,
              ).catch(error => {
                logDto.cabecera.respone_date = new Date();
                logDto.detalle.push({
                  entity_id: infoShoppingCard.info_product._id,
                  ERP_response: resultERP,
                  error,
                });
                this._logService.saveEntityReception(req.config, logDto);
                Utils.log(error);
                throw new InternalServerErrorException();
              });
              if (resultERP.Stock) {
                totalStock = Number(resultERP.Stock);
              }
            } */
          }
        }

        if (updateDto.quantity > totalStock || totalStock <= 0) {
          if (!updateDto.recalculated_price) {
            error = {
              message: 'No tienes stock suficiente.',
              addQuantity: infoProduct.stock
            };
          } else {
            error = {
              message: 'No tienes stock suficiente.',
              addQuantity: infoProduct.stock
            };
            // updateDto.quantity = infoProduct.stock;
            // response.message = "Producto fuera de stock";
          }
        }
      } else {
        throw new NotFoundException('No se ha podido encontrar el producto solicitado en su carrito de compras.');
      }
    } else {
      if (updateDto.quantity > infoShoppingCard.quantity) {
        error = 'No puede eliminar más productos de lo permitido.';
      }
    }
    return error;
  }

  async updateStock(req, idProduct, isPack, quantity, idUser, arrayPack?) {
    const arrayUpdate = await this.arrayUpdateProduct(
      idProduct,
      isPack,
      arrayPack,
    );
    await Promise.all(
      arrayUpdate.map(async productInfo => {
        const infoProduct: ProductDto = await this._productService
          .findOneById(req.config, productInfo.idProduct)
          .catch(error => {
            Utils.log(error);
            throw new InternalServerErrorException();
          });

        if (infoProduct) {
          infoProduct.stock = infoProduct.stock + quantity * productInfo.quantity;
          infoProduct.update_by = idUser;
          infoProduct.update_date = new Date();
          await this._productService
            .update(req.config, productInfo.idProduct, infoProduct)
            .catch(error => {
              Utils.log(error);
              throw new InternalServerErrorException();
            });
        }
      })
    );
  }

  async arrayUpdateProduct(id_product, isPack, arrayPack?) {
    const arrayId: Array<any> = [];
    if (isPack) {
      for (const pack of arrayPack) {
        arrayId.push({ idProduct: pack.product, quantity: pack.quantity });
      }
    } else {
      arrayId.push({ idProduct: id_product, quantity: 1 });
    }
    return arrayId;
  }

  @Get('idUserShopping')
  async getNotUserShoopingCart(
    @Req() req,
    @Param('idUserShopping') idUserShopping,
  ) {
    req.userId = idUserShopping;
    const result = await this.getShoppingCart(req);
    return result;
  }

  @Get('user/:userId')
  async listProductUser(@Req() req, @Param('userId') userId) {
    req.userId = userId
    const infoReturn = await this.getShoppingCart(req, 0)
    if (infoReturn.infoShoppingCart) {
      if (infoReturn.infoShoppingCart.length > 0) {
        const searchUpdate = { $or: [] }
        for (const shopping of infoReturn.infoShoppingCart) {
          searchUpdate.$or.push({ _id: shopping._id })
        }
        const limit_hour = new Date(Date.now() + 60000 * 60);
        this._shoppingCartService.updateMany(req.config, searchUpdate, { limit_hour })
      }
    }

    return infoReturn
  }

  @Get() // modificacion para garantia extendida y costo de instalacion
  async getShoppingCart(
    @Req() req,
    @Query('state') state?,
    @Query('info') data?,
  ) {
    return await this._shoppingCartService
      .getShoppingCart(req, state, data, this._methodService, this.campaignService, this.validateService)
      .catch(error => {
        Utils.log(error);
        throw new InternalServerErrorException();
      });
  }

  @Post('callcenter')
  async getCampaignValidated(@Req() req, @Body() body) {
    return await this._shoppingCartService
      .getProductsCallcenter(req, this._methodService, this.campaignService, this.validateService, this._productService, body)
      .catch(error => {
        Utils.log(error);
        throw new InternalServerErrorException();
      });
  }

  @Get('restaurant')
  async getShoppingCartRestaurant(
    @Req() req,
    @Query('state') state?,
    @Query('info') data?,
  ) {
    return await this._shoppingCartService
      .getShoppingCartRestaurant(req, state, data, this._methodService, this.campaignService, this.validateService, this.ldvDetailService)
      .catch(error => {
        Utils.log(error);
        throw new InternalServerErrorException();
      });
  }

  @Get('validateBines')
  async validateBines(
    @Req() req,
    @Query('info') data?,
  ) {
    return await this._shoppingCartService
      .validateBines(req, data, this.validateService)
      .catch(error => {
        Utils.log(error);
        throw new InternalServerErrorException();
      });
  }

  @Get('total-item')
  async getTotalCart(@Req() req) {
    const listProduct: any = await this._shoppingCartService.getTotalItem(
      req.config,
      {
        id_user: req.userId,
        tenant: req.config.tenant,
        limit_hour: { $gte: new Date() },
      },
    );
    let total_item = 0;
    if (listProduct) {
      total_item = listProduct;
    }
    return { total_item };
  }

  async iteratePostEvent(milliseconds): Promise<any> {
    if (this.postLock && this.customers.length > 0 && this.customers[0].milliseconds !== milliseconds) {
      await new Promise(resolve => this.postBus.once('postresolved' + milliseconds, resolve));
      // console.log(userId, milliseconds);
      // this.postLock = true;
      // console.log('Promesa resuelta');
      // await this.iteratePostEvent(userId, milliseconds);
    } else {
      this.postLock = true;
    }
  }

  resolveNextPostUser() {
    if (this.customers[1]) {
      const nextIndex = this.customers[1];
      this.customers.shift();
      this.postLock = false;
      this.postBus.emit('postresolved' + nextIndex.milliseconds);
    } else {
      this.customers.shift();
      this.postLock = false;
    }
  }

  async updateQuantityFather(config, fatherId) {
    const listChildren = await this._productService.findConditional(config, { father_base_variation: fatherId, is_product_variation_select: true, deleted: false, archive: false }).catch(error => {
      Utils.log(error);
      throw new InternalServerErrorException();
    });
    let totalQuantity = 0
    for (const children of listChildren) {
      totalQuantity = totalQuantity + children.stock
    }
    await this._productService.updateCondition(config, { _id: fatherId }, { stock: totalQuantity })
  }


  @Post('multi-add')
  async createMassive(@Body() createDto: any, @Req() req) {
    for (const product of createDto) {
      await this.create(product, req)
    }
    return { created: true }
  }
  @Post('call-center')
  async createCallCenter(@Body() createDto: any, @Req() req) {
    req.session = createDto.clientId
    req.userId = createDto.clientId
    return await this.create(createDto, req)
  }

  @Post() // modificacion para garantia extendida y costo de instalacion
  async create(@Body() createDto: ShoppingCartDto, @Req() req) {
    this.customers.push({ milliseconds: new Date().getTime() });
    try {
      await this.iteratePostEvent(this.customers[this.customers.length - 1].milliseconds);
      // console.log('Clientes: ', this.customers.length);
      let shoppingCartInfo: any;
      let idUserShoppingCart = req.userId;
      if (createDto.id_product && createDto.quantity) {
        try {
          const infoProduct: any = await this._productService
            .findOneById(req.config, createDto.id_product);

          if (infoProduct) {
            if (infoProduct.type_variation == 'B') {
              // No se permite ingresar producto tipo base al carrito, debido a que solo son contenedores de los productos que si se pueden vender
              throw new BadRequestException('Este producto no se encuentra disponible, por favor selecciona una de sus variaciones')
            } else {
              if (!idUserShoppingCart) {
                const date = new Date();
                idUserShoppingCart = date.getTime();
              }

              /*  if (req.ERP_connection && req.ERP_connection != '') {
                 if (infoProduct.code_ERP) {
                   let resultERP: any;
                   const logDto: LogDto = {
                     cabecera: {
                       nombre: '5ed92294350a1029e080b4b7',
                       created_by: 'sistema',
                       create_date: new Date(),
                       update_date: new Date(),
                     },
                     detalle: [],
                     onModel: req.config.tenant + '__Product',
                   };
   
                   try {
                     resultERP = await SendRequestERP.RequestStok(
                       req.ERP_connection,
                       infoProduct.code_ERP,
                     );
   
                     if (resultERP.Stock) {
                       infoProduct.stock = Number(resultERP.Stock);
                     }
   
                   } catch (error) {
                     logDto.cabecera.respone_date = new Date();
   
                     logDto.detalle.push({
                       entity_id: createDto.id_product,
                       ERP_response: resultERP,
                       error,
                     });
                     this._logService.saveEntityReception(req.config, logDto);
                     Utils.log(error);
                     throw new InternalServerErrorException();
                   }
                 }
               } */

              if (infoProduct.is_pack) {
                const maxProduct = new utilsFunction();
                try {
                  infoProduct.stock = await maxProduct.maxTotalPackage(
                    req,
                    infoProduct.pack_products,
                    this._logService,
                  );
                } catch (err) {
                  Utils.log(err);
                  throw new InternalServerErrorException();
                }
              }

              if (infoProduct.stock >= 0 && infoProduct.stock >= createDto.quantity) {
                try {
                  const existProduct = await this._shoppingCartService
                    .findObj(req.config, {
                      id_user: idUserShoppingCart,
                      id_product: createDto.id_product,
                      limit_hour: { $gte: new Date() },
                    });

                  let priceUse = 0;

                  if (!infoProduct.special_price && !infoProduct.special_offer) {
                    priceUse = infoProduct.price;
                  }
                  if (infoProduct.special_price) {
                    priceUse = infoProduct.special_price;
                  }
                  if (infoProduct.special_offer) {
                    priceUse = infoProduct.special_offer;
                  }
                  let createShoppingCart = false;
                  let haveERP = false
                  if (infoProduct.supplier) {
                    haveERP = infoProduct.supplier.report_erp
                  }
                  try {
                    const user = await this.userService.findOneCodeERP(req.config, req.userId);

                    if (existProduct.length > 0) {
                      let updateShoppingCart: ShoppingCartDto;
                      const idUpdateShooping = existProduct[0]._id;
                      updateShoppingCart = existProduct[0];
                      updateShoppingCart.quantity =
                        updateShoppingCart.quantity + createDto.quantity;
                      updateShoppingCart.total_price =
                        updateShoppingCart.quantity * priceUse; // + garantia extendida + costo de instalacion
                      // Rodrigo para 2 booleanos para determinar cual sumar (en Feria)
                      updateShoppingCart.update_date = new Date();
                      updateShoppingCart.update_by = idUserShoppingCart;
                      // agregar cada propiedad de warranty y installation cost al shoppingcart para que luego se utilice
                      // ßen el getShoppingCart
                      try {
                        const updatedShoppingCart: any = await this._shoppingCartService
                          .update(req.config, idUpdateShooping, updateShoppingCart);

                        if (infoProduct.code_ERP) {
                          let month;
                          let year = new Date().getFullYear().toString();
                          let day = new Date().getUTCDate().toString();
                          if ((new Date().getMonth() + 1) < 10) {
                            month = '0' + (new Date().getMonth() + 1);
                          } else {
                            month = (new Date().getMonth() + 1).toString();
                          }
                          if (Number(day) < 10) {
                            day = '0' + day;
                          }

                          const date = year + month + day;
                          if (req.ERP_connection && req.ERP_connection != '' && haveERP) {
                            let resultERP: any;
                            const logDto: LogDto = {
                              cabecera: {
                                nombre: '608ae8a8f8e92515766d5c68',
                                created_by: req.userId,
                                create_date: new Date(),
                                update_date: new Date(),
                              },
                              detalle: [],
                              onModel: req.config.tenant + '__Product',
                            };
                            try {
                              resultERP = await SendRequestERP.ReserveStockGuardar(
                                req.ERP_connection,
                                updatedShoppingCart.code_ERP,
                                infoProduct.code_ERP,
                                updatedShoppingCart.quantity,
                                '1236751324',
                                date,
                                user.code_ERP,
                                req.session,
                              );

                            } catch (error) {
                              logDto.cabecera.respone_date = new Date();
                              logDto.detalle.push({
                                entity_id: createDto.id_product,
                                ERP_response: resultERP,
                                error,
                                SENT_Json: updateShoppingCart,
                              });
                              this._logService.saveEntityReception(req.config, logDto);
                              Utils.log(error);
                              throw new InternalServerErrorException();
                            }
                          }
                        }
                        createShoppingCart = true;
                        shoppingCartInfo = updatedShoppingCart;
                      } catch (err) {
                        Utils.log(err);
                        throw new InternalServerErrorException();
                      }
                    } else {

                      if (req.ERP_connection && req.ERP_connection != '' && haveERP) {
                        if (infoProduct.code_ERP) {
                          let month;
                          let year = new Date().getFullYear().toString();
                          let day = new Date().getUTCDate().toString();
                          if ((new Date().getMonth() + 1) < 10) {
                            month = '0' + (new Date().getMonth() + 1);
                          } else {
                            month = (new Date().getMonth() + 1).toString();
                          }
                          if (Number(day) < 10) {
                            day = '0' + day;
                          }

                          const date = year + month + day;
                          let resultERP: any;
                          const logDto: LogDto = {
                            cabecera: {
                              nombre: '608ae89ef8e92515766d5c67',
                              created_by: req.userId,
                              create_date: new Date(),
                              update_date: new Date(),
                            },
                            detalle: [],
                            onModel: req.config.tenant + '__Product',
                          };
                          try {
                            resultERP = await SendRequestERP.ReserveStockGuardar(
                              req.ERP_connection,
                              '',
                              infoProduct.code_ERP,
                              createDto.quantity,
                              '1236751324',
                              date,
                              user.code_ERP,
                              req.session,
                            );

                          } catch (error) {
                            logDto.cabecera.respone_date = new Date();
                            logDto.detalle.push({
                              entity_id: createDto.id_product,
                              ERP_response: resultERP,
                              error,
                              SENT_Json: createDto,
                            });
                            this._logService.saveEntityReception(req.config, logDto);
                            Utils.log(error);
                            throw new InternalServerErrorException();
                          }
                          if (resultERP) {
                            createDto.code_ERP = resultERP[0].Dam_cNumMov;
                            createDto.num_session = req.session;
                          }
                        }
                      }

                      createDto.info_product = createDto.id_product;
                      createDto.name_product = infoProduct.name;
                      createDto.image_product =
                        req.url_attachment + infoProduct.image_cover;
                      createDto.price = priceUse;
                      createDto.total_price = createDto.quantity * priceUse;
                      createDto.tenant = req.config.tenant;
                      createDto.id_user = idUserShoppingCart;
                      createDto.limit_hour = new Date(Date.now() + 60000 * 60);
                      createDto.create_by = idUserShoppingCart;
                      createDto.method_send = infoProduct.list_method;
                      createDto.populate_method_send = infoProduct.list_method;

                      try {
                        const newShoppingCard: ShoppingCartDto = await this._shoppingCartService
                          .create(req.config, createDto);

                        if (newShoppingCard) {
                          createShoppingCart = true;
                          shoppingCartInfo = newShoppingCard;

                          try {
                            const infoShoppingCart: any = await this._shoppingCartService
                              .findObj(req.config, {
                                id_user: req.userId,
                                tenant: req.config.tenant,
                                limit_hour: { $gte: new Date() },
                              });

                            if (infoShoppingCart.length > 1) {
                              try {
                                let shoppingCoupon = infoShoppingCart.find(p => p.hasOwnProperty('coupon'));

                                await Promise.all(
                                  await infoShoppingCart.map(async (shoppingCartRow: ShoppingCart) => {
                                    shoppingCartRow.limit_hour = new Date(Date.now() + 60000 * 60);
                                    if (shoppingCoupon && !shoppingCartRow.coupon) {
                                      shoppingCartRow.coupon = shoppingCoupon.coupon;
                                    }
                                    await this._shoppingCartService.update(req.config, shoppingCartRow._id, shoppingCartRow).catch(error => {
                                      Utils.log(error);
                                      throw new InternalServerErrorException();
                                    });
                                  })
                                );
                              } catch (err) {
                                Utils.log(err);
                                throw new InternalServerErrorException();
                              }
                            }
                          } catch (err) {
                            Utils.log(err);
                            throw new InternalServerErrorException();
                          }
                        }
                      } catch (err) {
                        Utils.log(err);
                        throw new InternalServerErrorException();
                      }
                    }
                    if (createShoppingCart) {
                      try {
                        await this.updateStock(
                          req,
                          createDto.id_product,
                          infoProduct.is_pack,
                          createDto.quantity * -1,
                          idUserShoppingCart,
                          infoProduct.pack_products,
                        );

                        if (infoProduct.is_product_variation_select && infoProduct.type_variation == 'V') {
                          await this.updateQuantityFather(req.config, infoProduct.father_base_variation)
                        }
                      } catch (err) {
                        Utils.log(err);
                        throw new InternalServerErrorException();
                      }

                      if (infoProduct.campaign) {
                        try {
                          const campaign = await this.campaignService.findOne(req.config, infoProduct.campaign);

                          if (campaign) {
                            if (campaign.active) {
                              try {
                                await this.campaignService.updateSoldProducts(
                                  req.config,
                                  infoProduct,
                                  createDto.quantity,
                                  shoppingCartInfo,
                                );
                              } catch (err) {
                                Utils.log(err);
                                throw new InternalServerErrorException();
                              }
                            }
                          }
                        } catch (err) {
                          Utils.log(err);
                          throw new InternalServerErrorException();
                        }
                      }
                    }
                  } catch (err) {
                    Utils.log(err);
                    throw new InternalServerErrorException();
                  }
                } catch (err) {
                  Utils.log(err);
                  throw new InternalServerErrorException();
                }
              } else {
                throw new NotFoundException('El producto solicitado no cuenta con stock suficiente.');
              }
            }
          } else {
            throw new NotFoundException('No se ha podido encontrar el producto solicitado.');
          }
        } catch (err) {
          Utils.log(err);
          ExceptionValidator.validateException(err);
        }
      } else {
        throw new BadRequestException('Por favor revise que todos los campos se hayan completado.');
      }

      const returnInfo: any = {};
      returnInfo.addShoppingCart = true;
      returnInfo.idCreated = shoppingCartInfo._id;
      if (!req.userId) {
        returnInfo.idUserShoppingCart = idUserShoppingCart;
      }
      this.resolveNextPostUser();

      return returnInfo;
    } catch (err) {
      this.resolveNextPostUser();
      ExceptionValidator.validateException(err);
    }
  }

  async iteratePutEvent(milliseconds): Promise<any> {
    if (this.putLock && this.updateCustomers.length > 0 && this.updateCustomers[0].milliseconds !== milliseconds) {
      await new Promise(resolve => this.putBus.once('putresolved' + milliseconds, resolve));
      // console.log('Promesa resuelta!');
    } else {
      this.putLock = true;
    }
  }

  resolveNextPutUser() {
    if (this.updateCustomers[1]) {
      const nextIndex = this.updateCustomers[1];
      this.updateCustomers.shift();
      this.putLock = false;
      this.putBus.emit('putresolved' + nextIndex.milliseconds);
    } else {
      this.updateCustomers.shift();
      this.putLock = false;
    }
  }

  @Put('all-call-center')
  async returnAllCallCenter(@Req() req, @Body() body) {
    for (const product of body.listProduct) {
      await this.deleteCallCenterC(req, product._id, body.customerId, product.quantity_seller)
    }
    return { delete: true }
  }

  @Delete('delete-all-call-center/:userId')
  async deleteAllCallCenter(@Req() req, @Param('userId') userId) {
    await this._shoppingCartService.deleteAllUser(req.config, userId)
    return { delete: true }
  }
  @Put('call-center/:idProduct')
  async createCallCenterCallcenter(@Body() updateDto: any, @Req() req, @Param('idProduct') idProduct) {
    req.session = updateDto.id_user
    req.userId = updateDto.id_user
    return await this.updateShoppingCart(updateDto, idProduct, req)
  }

  @Put(':idProduct')
  async updateShoppingCart(
    @Body() updateDto: ShoppingCartDto,
    @Param('idProduct') idProduct,
    @Req() req,
  ) {
    this.updateCustomers.push({ milliseconds: new Date().getTime() });
    // console.log('Clientes: ', this.updateCustomers.length);
    try {
      await this.iteratePutEvent(this.updateCustomers[this.updateCustomers.length - 1].milliseconds);
      let response = { update: true }

      let idUserShoppingCart = req.userId;
      if (!idUserShoppingCart) {
        idUserShoppingCart = updateDto.id_user;
      }
      if (idUserShoppingCart) {
        updateDto.quantity === 0 && (updateDto.quantity = 1);

        if (updateDto.quantity) {
          try {
            const infoShoppingCart = await this._shoppingCartService
              .findObj(req.config, {
                id_product: idProduct,
                id_user: idUserShoppingCart,
                tenant: req.config.tenant,
                limit_hour: { $gte: new Date() },
              });

            if (infoShoppingCart.length > 0) {
              updateDto.quantity =
                updateDto.quantity - infoShoppingCart[0].quantity;

              try {
                const answerValid = await this.validStock(
                  req,
                  updateDto,
                  infoShoppingCart[0],
                  response,
                );

                if (!answerValid) {
                  const idShoppingCart = infoShoppingCart[0]._id;
                  const foundShoppingCart: ShoppingCartDto = infoShoppingCart[0];

                  try {
                    const infoProduct: any = await this._productService
                      .findOneById(req.config, idProduct)

                    let priceUse = 0;
                    if (!infoProduct.special_price && !infoProduct.special_offer) {
                      priceUse = infoProduct.price;
                    }

                    if (infoProduct.special_price) {
                      priceUse = infoProduct.special_price;
                    }

                    if (infoProduct.special_offer) {
                      priceUse = infoProduct.special_offer;
                    }
                    foundShoppingCart.quantity =
                      foundShoppingCart.quantity + updateDto.quantity;
                    foundShoppingCart.price = priceUse;
                    foundShoppingCart.total_price =
                      priceUse * foundShoppingCart.quantity;
                    foundShoppingCart.update_date = new Date();
                    foundShoppingCart.update_by = idUserShoppingCart;
                    try {
                      const updateShoppingCart = await this._shoppingCartService
                        .update(req.config, idShoppingCart, foundShoppingCart);

                      let haveERP = true
                      if (infoProduct.supplier) {
                        console.log('updateeee')
                        console.log(infoProduct.supplier.report_erp)
                        haveERP = infoProduct.supplier.report_erp
                      }

                      console.log('gggggggggggggggggg')
                      console.log(haveERP)

                      if (req.ERP_connection && req.ERP_connection != '' && haveERP) {
                        try {
                          const user = await this.userService.findOneAllField(req.config, req.userId);
                          if (infoProduct.code_ERP) {
                            let month;
                            let year = new Date().getFullYear().toString();
                            let day = new Date().getUTCDate().toString();
                            if ((new Date().getMonth() + 1) < 10) {
                              month = '0' + (new Date().getMonth() + 1);
                            } else {
                              month = (new Date().getMonth() + 1).toString();
                            }
                            if (Number(day) < 10) {
                              day = '0' + day;
                            }

                            const date = year + month + day;
                            let resultERP;
                            const logDto: LogDto = {
                              cabecera: {
                                nombre: '608ae8a8f8e92515766d5c68',
                                created_by: req.userId,
                                create_date: new Date(),
                                update_date: new Date(),
                              },
                              detalle: [],
                              onModel: req.config.tenant + '__Product',
                            };
                            try {
                              resultERP = await SendRequestERP.ReserveStockGuardar(
                                req.ERP_connection,
                                updateShoppingCart.code_ERP,
                                infoProduct.code_ERP,
                                updateShoppingCart.quantity,
                                '1236751324',
                                date,
                                user.code_ERP,
                                req.session,
                              );
                            } catch (error) {
                              logDto.cabecera.respone_date = new Date();
                              logDto.detalle.push({
                                entity_id: idProduct,
                                ERP_response: resultERP,
                                error,
                                SENT_Json: updateShoppingCart,
                              });
                              this._logService.saveEntityReception(req.config, logDto);
                              Utils.log(error);
                              throw new InternalServerErrorException();
                            }
                          }
                        } catch (err) {
                          Utils.log(err);
                          throw new InternalServerErrorException();
                        }
                      }

                      if (updateDto.quantity > 0) {
                        try {
                          let infoShoppingCart: any = await this._shoppingCartService
                            .findObj(req.config, {
                              id_user: req.userId,
                              tenant: req.config.tenant,
                              limit_hour: { $gte: new Date() },
                            });

                          await Promise.all(
                            await infoShoppingCart.map(async (shoppingCartRow: ShoppingCart) => {
                              shoppingCartRow.limit_hour = new Date(Date.now() + 60000 * 30);
                              await this._shoppingCartService.update(req.config, shoppingCartRow._id, shoppingCartRow).catch(error => {
                                Utils.log(error);
                                throw new InternalServerErrorException();
                              });
                            })
                          );
                        } catch (err) {
                          Utils.log(err);
                          throw new InternalServerErrorException();
                        }
                      }

                      try {
                        await this.updateStock(
                          req,
                          idProduct,
                          infoProduct.is_pack,
                          updateDto.quantity * -1,
                          idUserShoppingCart,
                          infoProduct.pack_products,
                        )
                        if (infoProduct.is_product_variation_select && infoProduct.type_variation == 'V') {
                          await this.updateQuantityFather(req.config, infoProduct.father_base_variation)
                        }
                      } catch (err) {
                        Utils.log(err);
                        throw new InternalServerErrorException();
                      }

                      if (infoProduct.campaign) {
                        try {
                          const campaign = await this.campaignService.findOne(req.config, infoProduct.campaign);

                          if (campaign.active) {
                            try {
                              await this.campaignService.updateSoldProducts(
                                req.config,
                                infoProduct,
                                updateDto.quantity,
                                updateShoppingCart,
                              )
                            } catch (err) {
                              Utils.log(err);
                              throw new InternalServerErrorException();
                            }
                          } else if (updateDto.quantity < 0 && updateShoppingCart.reserved_campaign_stock !== 0) {
                            try {
                              await this.campaignService.updateSoldProducts(
                                req.config,
                                infoProduct,
                                updateDto.quantity,
                                updateShoppingCart,
                              );
                            } catch (err) {
                              Utils.log(err);
                              throw new InternalServerErrorException();
                            }
                          }
                        } catch (err) {
                          Utils.log(err);
                          throw new InternalServerErrorException();
                        }
                      }
                    } catch (err) {
                      Utils.log(err);
                      throw new InternalServerErrorException();
                    }
                  } catch (err) {
                    Utils.log(err);
                    throw new InternalServerErrorException();
                  }
                } else {
                  throw new NotFoundException(answerValid.message);
                }
                /*  if (updateDto.quantity > foundShoppingCart.quantity) {
                  throw new BadRequestException(
                    'No puede eliminar más productos de lo permitido.',
                  );
                } else {
                } */
              } catch (err) {
                Utils.log(err);
                ExceptionValidator.validateException(err);
              }
            } else {
              throw new NotFoundException('No se ha podido encontrar el producto solicitado');
            }
          } catch (err) {
            Utils.log(err);
            ExceptionValidator.validateException(err);
          }
        } else {
          throw new BadRequestException('Por favor revise todos los campos obligatorios.');
        }
      } else {
        throw new BadRequestException('Por favor revise todos los campos obligatorios.');
      }

      this.resolveNextPutUser();
      return response;
    } catch (err) {
      this.resolveNextPutUser();
      ExceptionValidator.validateException(err);
    }
  }


  @Delete('call-center/:idProduct/:customerId')
  async deleteCallCenterC(@Req() req, @Param('idProduct') idProduct, @Param('customerId') customerId, @Query('quantity') quantity,) {
    req.session = customerId
    req.userId = customerId
    return await this.deleteShoppingCart(idProduct, quantity, req)
  }

  @Delete(':idProduct')
  async deleteShoppingCart(
    @Param('idProduct') idProduct,
    @Query('quantity') quantity,
    @Req() req,
  ) {
    let idUserShoppingCart = req.userId;
    let idDelete: any;
    if (!idUserShoppingCart) {
      //idUserShoppingCart = updateDto.id_user
    }
    if (idUserShoppingCart) {
      const infoShoppingCart: any = await this._shoppingCartService
        .findObj(req.config, {
          id_product: idProduct,
          id_user: idUserShoppingCart,
          tenant: req.config.tenant,
        })
        .catch(error => {
          Utils.log(error);
          throw new InternalServerErrorException();
        });
      let deleteShopping;
      let productRemains = false;
      if (infoShoppingCart.length > 0) {
        if (
          quantity !== 'null' &&
          infoShoppingCart[0].quantity > Number(quantity)
        ) {
          productRemains = true;
          infoShoppingCart[0].quantity -= Number(quantity);
          infoShoppingCart[0].total_price =
            infoShoppingCart[0].quantity * infoShoppingCart[0].price;
          deleteShopping = await this._shoppingCartService.update(
            req.config,
            infoShoppingCart[0]._id,
            infoShoppingCart[0],
          );
        } else {
          idDelete = infoShoppingCart[0]._id;
          deleteShopping = await this._shoppingCartService
            .deleteOne(req.config, idDelete)
            .catch(error => {
              Utils.log(error);
              throw new InternalServerErrorException();
            });

          if (req.ERP_connection && req.ERP_connection != '') {
            const logDto: LogDto = {
              cabecera: {
                nombre: '608ae8b0f8e92515766d5c69',
                created_by: 'sistema',
                create_date: new Date(),
                update_date: new Date(),
              },
              detalle: [],
              onModel: req.config.tenant + '__Product',
            };
            const resultERP = await SendRequestERP.ReserveStockDelete(
              req.ERP_connection,
              infoShoppingCart[0].code_ERP,
              infoShoppingCart[0].num_session,
            ).catch(error => {
              logDto.cabecera.respone_date = new Date();
              logDto.detalle.push({
                entity_id: idProduct,
                ERP_response: resultERP,
                error,
                SENT_Json: infoShoppingCart,
              });
              this._logService.saveEntityReception(req.config, logDto);
              Utils.log(error);
              throw new InternalServerErrorException();
            });
          }
        }

        if (deleteShopping) {
          // Disminuir cupón si es el último producto del carrito
          if (deleteShopping.coupon) {
            const productShoppingCart: any[] = await this._shoppingCartService.findObjValidateRules(req.config, {
              id_user: req.userId,
              tenant: req.config.tenant,
              limit_hour: { $gte: new Date() },
            }).catch(error => {
              Utils.log(error);
              throw new InternalServerErrorException();
            });

            if (productShoppingCart.length == 0) {
              await this._discountCodeService.increaseUsage(
                req.config,
                deleteShopping.coupon.coupon_id,
                deleteShopping.coupon.code_id,
                false
              );
            }
          }

          const infoProduct: any = await this._productService
            .findOneById(req.config, idProduct)
            .catch(error => {
              Utils.log(error);
              throw new InternalServerErrorException();
            });

          if (infoProduct && productRemains && infoProduct.code_ERP) {
            let month;
            let year = new Date().getFullYear().toString();
            let day = new Date().getUTCDate().toString();
            if ((new Date().getMonth() + 1) < 10) {
              month = '0' + (new Date().getMonth() + 1);
            } else {
              month = (new Date().getMonth() + 1).toString();
            }
            if (Number(day) < 10) {
              day = '0' + day;
            }

            let haveERP = true
            if (infoProduct.supplier) {

              haveERP = infoProduct.supplier.report_erp
            }

            const date = year + month + day;
            if (req.ERP_connection && req.ERP_connection != '' && haveERP) {

              const user = await this.userService.findOneCodeERP(req.config, req.userId);
              const logDto: LogDto = {
                cabecera: {
                  nombre: '608ae8a8f8e92515766d5c68',
                  created_by: 'sistema',
                  create_date: new Date(),
                  update_date: new Date(),
                },
                detalle: [],
                onModel: req.config.tenant + '__Product',
              };
              const resultERP = await SendRequestERP.ReserveStockGuardar(
                req.ERP_connection,
                deleteShopping.code_ERP,
                infoProduct.code_ERP,
                deleteShopping.quantity,
                '1236751324',
                date,
                user.code_ERP,
                req.session,
              ).catch(error => {
                logDto.cabecera.respone_date = new Date();
                logDto.detalle.push({
                  entity_id: idProduct,
                  ERP_response: resultERP,
                  error,
                  SENT_Json: infoShoppingCart,
                });
                this._logService.saveEntityReception(req.config, logDto);
                Utils.log(error);
                throw new InternalServerErrorException();
              });
            }
          }

          if (infoProduct) {
            const cantidad =
              quantity !== 'null' ? quantity : infoShoppingCart[0].quantity;
            await this.updateStock(
              req,
              idProduct,
              infoProduct.is_pack,
              cantidad,
              idUserShoppingCart,
              infoProduct.pack_products,
            );
            if (infoProduct.is_product_variation_select && infoProduct.type_variation == 'V') {
              await this.updateQuantityFather(req.config, infoProduct.father_base_variation)
            }
            if (infoProduct.campaign) {
              if (deleteShopping.reserved_campaign_stock !== 0) {
                await this.campaignService.updateSoldProducts(
                  req.config,
                  infoProduct,
                  cantidad * -1,
                  deleteShopping,
                  !productRemains,
                );
              }
            }
          } else {
            throw new NotFoundException(
              'El producto no se encuentra en el carrito.',
            );
          }
        } else {
          throw new NotFoundException('El producto no se pudo eliminar.');
        }
      } else {
        throw new NotFoundException(
          'El producto no se encuentra en el carrito.',
        );
      }
    } else {
      throw new BadRequestException('Por favor revise todos los campos obligatorios.');
    }
    return { delete: true, idDeleted: idDelete };
  }
}

export class ShoppingCartAddionals {
  constructor(private _shoppingCartService: ShoppingCartService) { }
  async cleanShoppingCart(@Req() req) {
    const deleteShopping = await this._shoppingCartService
      .deleteAllUser(req.config, req.userId)
      .catch(error => {
        Utils.log(error);
        throw new InternalServerErrorException();
      });
    return deleteShopping;
  }
}
