import {
  Controller,
  Req,
  InternalServerErrorException,
  Get,
  Query,
  Param,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as aws from 'aws-sdk';
import { Readable } from 'stream';

import { OrderService } from './order.service';
import { Utils } from 'src/utils/utils';
import { FormatExcel } from 'src/utils/format-excel';
import { SupplierService } from '../system-settings/supplier/supplier.service';
import { INotificationRequired } from '../system-settings/notification/notification.interface';
import { NotificationService } from '../system-settings/notification/service/notification.service';
import { BadGatewayException } from 'src/utils/generalExceptions';


@Controller('order')
export class OrderController {
  constructor(
    private _orderService: OrderService,
    private _supplierService: SupplierService,
    private _notificationService: NotificationService,
  ) { }

  async searchInfoSupplier(listSupplier, supplierId) {
    const supplierInfo = listSupplier.find(
      item => String(item._id) == String(supplierId),
    );
    let name = '';
    let commission = 0;
    let ruc = '';
    if (supplierInfo) {
      name = supplierInfo.name;
      ruc = supplierInfo.ruc;
      commission = supplierInfo.commission ? supplierInfo.commission : 0;
    }
    return { name, ruc, commission };
  }

  async salesReport(config, supplierId, @Query() params) {
    const iniDate = Utils.limitDate(params.dateIni);
    const endDate = Utils.nextDay(params.dateEnd);
    const objSearch = {
      create_date: { $gte: iniDate, $lt: endDate },
      status_payment: true,
    };
    if (params.supplier != 'all') {
      objSearch['detail.supplier'] = supplierId;
    }
    const report = await this._orderService.findObjPopulateUser(
      config,
      objSearch,
    );
    return report;
  }

  @Get('report-sale/:userId')
  async exportSalesReport(@Req() req, @Param('userId') userId, @Query('params') params) {
    params = JSON.parse(params);
    let filterSupplier = params.supplier;

    const listOrder: any = await this.salesReport(req.config, filterSupplier, params);
    if (params.type == 'financial') {
      this.exportFinancialSalesReport(req.config, params, userId, listOrder, filterSupplier);
    } else {
      this.exportGeneralSalesReport(req.config, params, userId, listOrder, filterSupplier);
    }
  }

  async exportGeneralSalesReport(config, params, userId, listOrder, filterSupplier) {

    const bufferExcel = await this.createGeneralExcel(config, params, listOrder, filterSupplier);

    // Fecha y Hora actual
    let date = new Date();
    let difference = date.getTime() - 5 * 1000 * 60 * 60; //Disminución de 5 horas (zona horaria)
    date.setTime(difference);
    let dateCurrent = date.toISOString()
      .substring(0, 19)
      .replace("T", "_")
      .replace(/[-]/g, "")
      .replace(/[:]/g, "");

    const fileName = config.tenant + "_ReporteVentasGeneral_" + dateCurrent + "_" + userId + ".xlsx";
    const stream = new Readable();
    stream.push(bufferExcel);
    stream.push(null);

    // Subirlo al Servidor AWS
    let bucketExcel = process.env.STORAGE_ATTACHMENT_BUCKET_NAME || 'luxurysass/storage-attachment';
    bucketExcel += '/excels';

    const s3 = new aws.S3({
      endpoint: process.env.STORAGE_ATTACHMENT_ENDPOINT || 'sfo2.digitaloceanspaces.com',
      accessKeyId: process.env.STORAGE_ATTACHMENT_KEY_ID || 'WNNKAGZ52FG6AIGRKPRB',
      secretAccessKey: process.env.STORAGE_ATTACHMENT_ACCESS_KEY || 'T17+hRBHpZY7iTt7jVFxgyRoX07V1P78ilm6/YYLLko',
    });

    var param = {
      ACL: 'public-read',
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      Bucket: bucketExcel,
      Key: fileName,
      Body: stream
    };

    s3.upload(param, (err, data) => {
      if (err)
        console.log('Error uploading excel to AWS: ', err);
      else {
        let objNotification: INotificationRequired = {
          userId: userId,
          title: 'Exportación de Reporte de Ventas',
          message: 'Su descarga de reporte de ventas ha finalizado. Seleccione aquí para descargar.',
          typeNotification: 'PROCESS',
          redirectionUrl: data.Location,
          redirectionExternal: true,
        }
        this._notificationService.create(config, objNotification).then(res => {
          console.log('Excel Notification created succesfully');
        }).catch(err => {
          throw new BadGatewayException('An error creating the excel notification');
        });
      }
    });

  }

  async createGeneralExcel(config, params, listOrder, filterSupplier) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte de ventas detallado', {
      views: [
        { state: 'frozen', ySplit: 3, activeCell: 'B4', showGridLines: false },
      ],
    });
    const supplierListId = new Set([]);
    for (const order of listOrder) {
      for (const detail of order.detail) {
        supplierListId.add(detail.supplier);
      }
    }

    const supplierList = [...supplierListId];
    const listSuplier = await this._supplierService
      .findCondition(config, { _id: { $in: supplierList } })
      .catch(error => {
        Utils.log(error);
        console.log(error);
        throw new InternalServerErrorException();
      });

    worksheet.spliceRows(0, 1);

    const letterStart = 'B';
    const letterEnd = 'AA';
    const titleValues0 = [];
    const titleValues1 = [];

    const titleValues2 = [
      '',
      'Número de pedido',
      'DNI',
      'Nombres',
      'Teléfono Celular',
      'Correo Electrónico',
      'Fecha',
      'Hora',
      'Seller',
      'RUC',
      'SKU',
      'Grupo de Categoría',
      'Categoría',
      'Sub categoría',
      'Marca',
      'Producto',
      'Cantidad',
      'Precio Unitario (S/)',
      'Subtotal (S/)',
      'Precio delivery (S/)',
      'Cupón Producto (S/)',
      'Cupón Delivery (S/)',
      'Total (S/)',
      'Comisión (%)',
      'Total Comisión (S/)',
      'Dirección de entrega',
      'Ubigeo (Distrito)',
    ];
    worksheet.spliceRows(1, 0, titleValues0, titleValues1, titleValues2);
    worksheet.columns = [
      { key: '', width: 10 },
      { key: 'order', width: 20 },
      { key: 'dni', width: 12 },
      { key: 'names', width: 37 },
      { key: 'cellphone', width: 18 },
      { key: 'email_address', width: 35 },
      { key: 'date', width: 14 },
      { key: 'hour', width: 10 },
      { key: 'supplier', width: 30 },
      { key: 'ruc', width: 15 },
      { key: 'sku', width: 15 },
      { key: 'category_group', width: 30 },
      { key: 'category', width: 30 },
      { key: 'subcategory', width: 30 },
      { key: 'brand', width: 30 },
      { key: 'product', width: 50 },
      { key: 'quantity', width: 11 },
      { key: 'price', width: 20 },
      { key: 'total', width: 20 },
      { key: 'delivery', width: 20 },
      { key: 'coupon_discount', width: 20 },
      { key: 'delivery_discount', width: 20 },
      { key: 'total_payment', width: 20 },
      { key: 'percentage_comission', width: 15 },
      { key: 'soles_comission', width: 20 },
      { key: 'address', width: 50 },
      { key: 'ubigeo', width: 25 },
    ];

    worksheet.mergeCells('B2:AA2');

    let initial_date = params.dateIni.substring(0, 10);
    let end_date = params.dateEnd.substring(0, 10);
    worksheet.getCell('Q2').value = `Reporte de ventas detallado (Desde: ${initial_date} Hasta: ${end_date})`;
    FormatExcel.formatHeader(worksheet, 2, letterStart, letterEnd);
    FormatExcel.formatHeader(worksheet, 3, letterStart, letterEnd);
    let totalReport = 0;
    let commissionTotalSoles = 0;
    let rowIndex = 3;

    console.time('Excel time: ');
    for (const order of listOrder) {
      for (const detail of order.detail) {
        if (detail.supplier === filterSupplier || params.supplier == 'all') {
          const supplier = await this.searchInfoSupplier(listSuplier, detail.supplier);
          // totalReport = totalReport + (detail.product_price * detail.quantity) + Number(detail.delivery); // revisar
          //const calcTotal = detail.product_price * detail.quantity; // revisar
          let deliveryCoupon = 0;
          let productCoupon = 0;
          if (order.coupon) {
            const delivery_coupon = order.coupon.delivery_coupon && order.coupon.delivery_coupon.find(e => e.method_id.toString() == detail.method_id.toString())
            const dif_delivery = order.detail.filter(e => delivery_coupon && e.method_id.toString() == delivery_coupon.method_id.toString())
            const discount_coupon = order.coupon.discount_coupon && order.coupon.discount_coupon.find(e => e.id_product.toString() == detail.product_id._id.toString())

            deliveryCoupon = delivery_coupon ? delivery_coupon.discount / (dif_delivery ? dif_delivery.length : 1) : 0;
            productCoupon = discount_coupon ? discount_coupon.discount : 0;
          }

          const calcTotal = detail.amount_total;
          const calTotalPayment = calcTotal + Number(detail.delivery) - productCoupon - deliveryCoupon;
          totalReport = totalReport + calTotalPayment;

          let brandInfo = '';
          let categoryName = '';
          let categoryGroup = '';
          let subCategory = '';
          let comissionProduct = 0;
          let comissionSoles = 0;

          if (detail.product_id) {
            const productInfo = detail.product_id;
            productInfo.brand && (brandInfo = productInfo.brand.name);

            if (productInfo.categories.length > 0) {
              categoryName = productInfo.categories[0].name;
              subCategory = productInfo.categories[1] && productInfo.categories[1].name
              categoryGroup = productInfo.categories[0].group && productInfo.categories[0].group.name;
            }

            if (productInfo.commission) {
              comissionProduct = productInfo.commission;
              comissionSoles = comissionProduct / 100 * calTotalPayment;
              commissionTotalSoles += comissionSoles;
            }
          }

          worksheet.addRow({
            order: order.code,
            dni: order.user_id ? order.user_id.dni : '-',
            names: order.user_id ?
              order.user_id.name +
              ' ' +
              order.user_id.lastname_father +
              ' ' +
              order.user_id.lastname_mother : '-',
            cellphone: order.user_id.cellphone,
            email_address: order.user_id.email,
            brand: brandInfo,
            supplier: supplier.name,
            sku: detail.product_code,
            ruc: supplier.ruc,
            category_group: categoryGroup,
            category: categoryName,
            subcategory: subCategory,
            date: Utils.setDateLocation(order.create_date, 'L'),
            hour: Utils.setDateLocation(order.create_date, 'LT'),
            product: detail.product_name,
            quantity: detail.quantity,
            price: Number(detail.amount_total / detail.quantity),
            delivery: Number(detail.delivery),
            total: calcTotal,
            coupon_discount: productCoupon,
            delivery_discount: deliveryCoupon,
            total_payment: calTotalPayment,
            percentage_comission: `${comissionProduct} %`,
            soles_comission: comissionSoles,
            address: order.delivery_address,
            ubigeo: order.delivery_district_id && order.delivery_district_id.name,
          });
          rowIndex++;
          FormatExcel.borderCellRow(
            worksheet,
            rowIndex,
            letterStart,
            letterEnd,
            'FFE0E0E0',
          );
          FormatExcel.formatNumber(worksheet, 'Q' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'R' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'S' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'T' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'U' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'V' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'W' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'Y' + rowIndex);

          FormatExcel.alignmentCell(worksheet, 'B' + rowIndex, 'middle', 'center');
          FormatExcel.alignmentCell(worksheet, 'C' + rowIndex, 'middle', 'center');
          FormatExcel.alignmentCell(worksheet, 'E' + rowIndex, 'middle', 'center');
          FormatExcel.alignmentCell(worksheet, 'G' + rowIndex, 'middle', 'center');
          FormatExcel.alignmentCell(worksheet, 'H' + rowIndex, 'middle', 'center');
          FormatExcel.alignmentCell(worksheet, 'J' + rowIndex, 'middle', 'center');

          if (rowIndex % 2) {
            FormatExcel.backgroundRow(
              worksheet,
              rowIndex,
              letterStart,
              letterEnd,
              'FFF9F9F9',
            );
          }
        }
      }
    }
    console.timeEnd('Excel time: ');
    rowIndex++;
    worksheet.getCell('V' + rowIndex).value = 'Total (S/) ';
    worksheet.getCell('W' + rowIndex).value = totalReport;
    worksheet.getCell('Y' + rowIndex).value = commissionTotalSoles;
    FormatExcel.formatDecimal(worksheet, 'V' + rowIndex);
    FormatExcel.formatDecimal(worksheet, 'W' + rowIndex);
    FormatExcel.alignmentCell(worksheet, 'W' + rowIndex, 'middle', 'right');
    FormatExcel.formatColor(worksheet, 'V' + rowIndex, 'FF333333', 'FFFFFF', true);
    FormatExcel.formatColor(worksheet, 'W' + rowIndex, 'FF333333', 'FFFFFF', true);
    FormatExcel.formatColor(worksheet, 'X' + rowIndex, 'FF333333', 'FFFFFF', true,);
    FormatExcel.formatColor(worksheet, 'Y' + rowIndex, 'FF333333', 'FFFFFF', true,);

    const bufferExcel: any = await new Promise((resolve, reject) => {
      workbook.xlsx.writeBuffer().then(buffer => {
        resolve(buffer);
      });
    });

    return bufferExcel;
  }

  async exportFinancialSalesReport(config, params, userId, listOrder, filterSupplier) {

    const bufferExcel = await this.createFinancialExcel(config, params, listOrder, filterSupplier);

    // Fecha y Hora actual
    let date = new Date();
    let difference = date.getTime() - 5 * 1000 * 60 * 60; //Disminución de 5 horas (zona horaria)
    date.setTime(difference);
    let dateCurrent = date.toISOString()
      .substring(0, 19)
      .replace("T", "_")
      .replace(/[-]/g, "")
      .replace(/[:]/g, "");

    const fileName = config.tenant + "_ReporteVentasFinanciero_" + dateCurrent + "_" + userId + ".xlsx";
    const stream = new Readable();
    stream.push(bufferExcel);
    stream.push(null);

    // Subirlo al Servidor AWS
    let bucketExcel = process.env.STORAGE_ATTACHMENT_BUCKET_NAME || 'luxurysass/storage-attachment';
    bucketExcel += '/excels';

    const s3 = new aws.S3({
      endpoint: process.env.STORAGE_ATTACHMENT_ENDPOINT || 'sfo2.digitaloceanspaces.com',
      accessKeyId: process.env.STORAGE_ATTACHMENT_KEY_ID || 'WNNKAGZ52FG6AIGRKPRB',
      secretAccessKey: process.env.STORAGE_ATTACHMENT_ACCESS_KEY || 'T17+hRBHpZY7iTt7jVFxgyRoX07V1P78ilm6/YYLLko',
    });

    var param = {
      ACL: 'public-read',
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      Bucket: bucketExcel,
      Key: fileName,
      Body: stream
    };

    s3.upload(param, (err, data) => {
      if (err)
        console.log('Error uploading excel to AWS: ', err);
      else {
        let objNotification: INotificationRequired = {
          userId: userId,
          title: 'Exportación de Reporte de Ventas',
          message: 'Su descarga de reporte de ventas ha finalizado. Seleccione aquí para descargar.',
          typeNotification: 'PROCESS',
          redirectionUrl: data.Location,
          redirectionExternal: true,
        }
        this._notificationService.create(config, objNotification).then(res => {
          console.log('Excel Notification created succesfully');
        }).catch(err => {
          throw new BadGatewayException('An error creating the excel notification');
        });
      }
    });

  }

  async createFinancialExcel(config, params, listOrder, filterSupplier) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte de ventas detallado', {
      views: [
        { state: 'frozen', ySplit: 3, activeCell: 'B4', showGridLines: false },
      ],
    });
    const supplierListId = new Set([]);
    for (const order of listOrder) {
      for (const detail of order.detail) {
        supplierListId.add(detail.supplier);
      }
    }

    const supplierList = [...supplierListId];
    const listSuplier = await this._supplierService
      .findCondition(config, { _id: { $in: supplierList } })
      .catch(error => {
        Utils.log(error);
        console.log(error);
        throw new InternalServerErrorException();
      });

    worksheet.spliceRows(0, 1);

    const letterStart = 'B';
    const letterEnd = 'R';
    const titleValues0 = [];
    const titleValues1 = [];

    const titleValues2 = [
      '',
      'Número de pedido',
      'Fecha',
      'Hora',
      'Seller',
      'RUC',
      'SKU',
      'Marca',
      'Producto',
      'Cantidad',
      'Precio Unitario (S/)',
      'Subtotal (S/)',
      'Precio delivery (S/)',
      'Cupón Producto (S/)',
      'Cupón Delivery (S/)',
      'Total (S/)',
      'Comisión (%)',
      'Total Comisión (S/)',
    ];
    worksheet.spliceRows(1, 0, titleValues0, titleValues1, titleValues2);
    worksheet.columns = [
      { key: '', width: 10 },
      { key: 'order', width: 20 },
      { key: 'date', width: 14 },
      { key: 'hour', width: 10 },
      { key: 'supplier', width: 30 },
      { key: 'ruc', width: 15 },
      { key: 'sku', width: 15 },
      { key: 'brand', width: 30 },
      { key: 'product', width: 50 },
      { key: 'quantity', width: 11 },
      { key: 'price', width: 20 },
      { key: 'total', width: 20 },
      { key: 'delivery', width: 20 },
      { key: 'coupon_discount', width: 20 },
      { key: 'delivery_discount', width: 20 },
      { key: 'total_payment', width: 20 },
      { key: 'percentage_comission', width: 15 },
      { key: 'soles_comission', width: 20 },
    ];

    worksheet.mergeCells('B2:R2');

    let initial_date = params.dateIni.substring(0, 10);
    let end_date = params.dateEnd.substring(0, 10);
    worksheet.getCell('Q2').value = `Reporte de ventas detallado (Desde: ${initial_date} Hasta: ${end_date})`;
    FormatExcel.formatHeader(worksheet, 2, letterStart, letterEnd);
    FormatExcel.formatHeader(worksheet, 3, letterStart, letterEnd);
    let totalReport = 0;
    let commissionTotalSoles = 0;
    let rowIndex = 3;

    console.time('Excel time: ');
    for (const order of listOrder) {
      for (const detail of order.detail) {
        if (detail.supplier === filterSupplier || params.supplier == 'all') {
          const supplier = await this.searchInfoSupplier(listSuplier, detail.supplier);
          let deliveryCoupon = 0;
          let productCoupon = 0;
          if (order.coupon) {
            const delivery_coupon = order.coupon.delivery_coupon && order.coupon.delivery_coupon.find(e => e.method_id.toString() == detail.method_id.toString())
            const dif_delivery = order.detail.filter(e => delivery_coupon && e.method_id.toString() == delivery_coupon.method_id.toString())
            const discount_coupon = order.coupon.discount_coupon && order.coupon.discount_coupon.find(e => e.id_product.toString() == detail.product_id._id.toString())

            deliveryCoupon = delivery_coupon ? delivery_coupon.discount / (dif_delivery ? dif_delivery.length : 1) : 0;
            productCoupon = discount_coupon ? discount_coupon.discount : 0;
          }

          const calcTotal = detail.amount_total;
          const calTotalPayment = calcTotal + Number(detail.delivery) - productCoupon - deliveryCoupon;
          totalReport = totalReport + calTotalPayment;

          let brandInfo = '';
          let comissionProduct = 0;
          let comissionSoles = 0;

          if (detail.product_id) {
            const productInfo = detail.product_id;
            productInfo.brand && (brandInfo = productInfo.brand.name);

            if (productInfo.commission) {
              comissionProduct = productInfo.commission;
              comissionSoles = comissionProduct / 100 * calTotalPayment;
              commissionTotalSoles += comissionSoles;
            }
          }

          worksheet.addRow({
            order: order.code,
            brand: brandInfo,
            supplier: supplier.name,
            sku: detail.product_code,
            ruc: supplier.ruc,
            date: Utils.setDateLocation(order.create_date, 'L'),
            hour: Utils.setDateLocation(order.create_date, 'LT'),
            product: detail.product_name,
            quantity: detail.quantity,
            price: Number(detail.amount_total / detail.quantity),
            delivery: Number(detail.delivery),
            total: calcTotal,
            coupon_discount: productCoupon,
            delivery_discount: deliveryCoupon,
            total_payment: calTotalPayment,
            percentage_comission: `${comissionProduct} %`,
            soles_comission: comissionSoles,
          });
          rowIndex++;
          FormatExcel.borderCellRow(
            worksheet,
            rowIndex,
            letterStart,
            letterEnd,
            'FFE0E0E0',
          );
          FormatExcel.formatNumber(worksheet, 'J' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'K' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'L' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'M' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'N' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'O' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'P' + rowIndex);
          FormatExcel.formatDecimal(worksheet, 'R' + rowIndex);

          FormatExcel.alignmentCell(worksheet, 'B' + rowIndex, 'middle', 'center');
          FormatExcel.alignmentCell(worksheet, 'C' + rowIndex, 'middle', 'center');
          FormatExcel.alignmentCell(worksheet, 'D' + rowIndex, 'middle', 'center');
          FormatExcel.alignmentCell(worksheet, 'F' + rowIndex, 'middle', 'center');

          if (rowIndex % 2) {
            FormatExcel.backgroundRow(
              worksheet,
              rowIndex,
              letterStart,
              letterEnd,
              'FFF9F9F9',
            );
          }
        }
      }
    }
    console.timeEnd('Excel time: ');
    rowIndex++;
    worksheet.getCell('O' + rowIndex).value = 'Total (S/) ';
    worksheet.getCell('P' + rowIndex).value = totalReport;
    worksheet.getCell('R' + rowIndex).value = commissionTotalSoles;
    FormatExcel.formatDecimal(worksheet, 'M' + rowIndex);
    FormatExcel.formatDecimal(worksheet, 'N' + rowIndex);
    FormatExcel.alignmentCell(worksheet, 'N' + rowIndex, 'middle', 'right');
    FormatExcel.formatColor(worksheet, 'O' + rowIndex, 'FF333333', 'FFFFFF', true);
    FormatExcel.formatColor(worksheet, 'P' + rowIndex, 'FF333333', 'FFFFFF', true);
    FormatExcel.formatColor(worksheet, 'Q' + rowIndex, 'FF333333', 'FFFFFF', true,);
    FormatExcel.formatColor(worksheet, 'R' + rowIndex, 'FF333333', 'FFFFFF', true,);

    const bufferExcel: any = await new Promise((resolve, reject) => {
      workbook.xlsx.writeBuffer().then(buffer => {
        resolve(buffer);
      });
    });

    return bufferExcel;
  }
}
