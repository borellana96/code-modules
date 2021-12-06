import { Component, OnInit, HostListener, ViewChild, Inject } from "@angular/core";
import { OrderService } from "src/app/shared/service/order.service";
import { ActivatedRoute, Router, NavigationEnd } from "@angular/router";
import { LdvService } from "src/app/shared/service/ldv.service";
import { MiddleService } from "src/app/shared/service/middle.service";
import { HeaderService } from "../components/header/header.service";
import { DialogOrderReasonDetailComponent } from "../components/dialog-order-reason-detail/dialog-order-reason-detail.component";
import { UserService } from '../../shared/service/user.service';
import { DOCUMENT } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SupplierService } from "src/app/shared/service/supplier.service";
import { EmailFormService } from "src/app/shared/service/email-form.service";
import { EmailService } from "src/app/shared/service/email.service";
import { FormArray, FormControl, FormGroup } from "@angular/forms";

@Component({
  selector: "app-order",
  templateUrl: "./order.component.html",
  styleUrls: ["./order.component.scss"],
})
export class OrderComponent implements OnInit {
  idOrder: any;
  orderNumber: any;
  namePage: string;
  enterpriseLogo: string;
  listLDVFlow: any[];
  listLDVAll: any[];
  listLDVAllSeller: any[];
  dropDownList: any[];
  numStatusOrder: any;
  headerFixed: boolean;
  listProducts: any;
  listProviderDelivery: any;
  url_attachment: string;
  orderInfo: any;
  validOrderField: any;
  textMessage: any;
  showPopupMessage: boolean;
  listDedication: Array<any>
  isSupplier: boolean;
  attended: boolean;
  reportERP: boolean;
  idSupplier: string;
  @ViewChild("dialogOrderReasonDetail", { static: false })
  dialogOrderReasonDetail: DialogOrderReasonDetailComponent;
  objStatus: any;
  methodSendList: FormArray = new FormArray([]);
  showSumaryConfirmation: boolean;
  indexMethodSend: number;
  validDropdownList: boolean;
  validStatusFlow: boolean = false;

  constructor(
    private orderService: OrderService,
    private _supplierService: SupplierService,
    private ldvService: LdvService,
    private middleService: MiddleService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private headerService: HeaderService,
    private userService: UserService,
    private emailService: EmailService,
    // private window: Window,
    private _snackBar: MatSnackBar,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.activatedRoute.params.subscribe((params) => {
      this.idOrder = params.id;
    });
  }

  @HostListener("window:scroll", ["$event"]) private onWindowScroll($event: Event): void {
    this.scrollEvent($event);
  }
  ngOnInit() {
    this.isSupplier = true;
    this.listDedication = [];
    this.showPopupMessage = false;
    this.userService.enterpriseLogo().subscribe((response: any) => {
      this.enterpriseLogo = response.url_attachment + response.logo;
    });
    this.headerService.sendTitle("Pedidos");
    this.namePage = "Pedidos";
    this.numStatusOrder = 0;
    this.validOrderField = {}
    this.headerFixed = false;
    this.url_attachment = localStorage.getItem("url_attachment");
    this.validDropdownList = false;
    if (this.idOrder) {
      this.ldvValidOrderInfo();
      this.getDataSupplier();
      this.getInfoOrder();
    }
  }


  scrollEvent = (event: any): void => {
    // const number = event.srcElement.scrollTop;
    const number = this.document.documentElement.scrollTop;
    if (number >= 33) {
      this.headerFixed = true;
    } else {
      this.headerFixed = false;
    }
  }

  changeAtended() {
    const body = {
      state: true,
      supplier: this.idSupplier,
    };
    this.middleService.sendLoading(true);
    this.orderService.changeAttended(this.idOrder, body).subscribe((res) => {
      this.attended = true;
      this.middleService.sendLoading(false);
    }, (error) => {
      this.middleService.sendMessage(
        this.namePage,
        error.error.message,
        "error",
      );
      this.middleService.sendLoading(false);
    });
  }

  listProviderProduct(detailOrder) {
    this.listProviderDelivery = [];

    for (const order of detailOrder) {
      let existSupplier = false;
      for (const providerDelivery of this.listProviderDelivery) {
        if (providerDelivery._id == order.product_id.supplier_delivery._id) {
          const existsMethodSend = providerDelivery.listorder.find(product =>
            product.method_id == order.method_id
          )
          if (existsMethodSend) {
            providerDelivery.listorder.push(order);
            existSupplier = true;
          }
        }
      }
      if (!existSupplier) {
        let objNewSupplier: any = {};
        if (order.product_id) {
          objNewSupplier = order.product_id.supplier_delivery;
          objNewSupplier.delivery_day = order.delivery_day;
          objNewSupplier.range_day = order.range_day;
          objNewSupplier.method_id = order.method_id;
          objNewSupplier.listorder = [];
          objNewSupplier.listorder.push(order);
          this.listProviderDelivery.push(objNewSupplier);
          const result = this.orderInfo.supplier_status_order.find(status =>
            status.method_id == order.method_id &&
            status.supplierId._id == order.product_id.supplier_delivery._id
          )
          if (result) {
            this.validDropdownList = true;
            this.methodSendList.push(
              new FormGroup({
                optionSelected: new FormControl(result.status_order._id),
                nameStatus: new FormControl(result.status_order.value),
                validStatus: new FormControl(result.status_order.ref3)
              })
            )
          }
          order.product_id.supplier.report_erp && (this.validStatusFlow = true);
        }
      }
    }
  }

  getMethodSend(index: number): FormGroup {
    return this.methodSendList.controls[index] as FormGroup;
  }

  getDataSupplier() {
    this._supplierService.validIsSupplier().subscribe(
      (infoSupplier: any) => {
        this.isSupplier = infoSupplier.isSupplier;
        if (infoSupplier.supplier) {
          this.reportERP = infoSupplier.supplier.report_erp;
        }
        this.idSupplier = infoSupplier.idSupplier;
      }
    );
  }

  ldvValidOrderInfo() {
    this.ldvService.getLdvDetail('ORDER-OPTION').subscribe(
      (infoLdv: Array<any>) => {
        for (const ldvOption of infoLdv) {
          this.validOrderField[ldvOption.ref1] = ldvOption.value;
        }
      }, (error) => {
        this.middleService.sendMessage('Order', error.error.message, 'error')
      }
    );
  }

  getInfoOrder() {
    this.middleService.sendLoading(true);
    this.orderService.findOrder(this.idOrder).subscribe(
      (orderDetail: any) => {
        this.orderNumber = orderDetail.code;
        this.orderInfo = orderDetail;
        this.listProviderProduct(orderDetail.detail);
        /* this.listProducts = orderDetail.detail; */

        if (this.isSupplier) {
          if (!orderDetail.attended) {
            orderDetail.attended = []
          }
          this.attended = orderDetail.attended.some(supplierOrder => {
            return supplierOrder.supplier == this.idSupplier && supplierOrder.state;
          });
        }
        this.getObjStatusOrder();
        this.middleService.sendLoading(false);
      },
      (error) => {
        this.middleService.sendMessage(
          this.namePage,
          error.error.message,
          "error"
        );
      }
    );
  }

  getObjStatusOrder() {
    if (this.orderInfo.status_order) {
      this.objStatus = this.orderInfo.status_order;
      this.numStatusOrder = this.orderInfo.status_order.ref1;
      this.getOrderStatus('SONR-STATUS-ORDER', this.objStatus);
      this.getOrderStatus('SONR-SELLER-STATUS-ORDER');
    }
  }

  getOrderStatus(typeLdvDetail, objStatus?) {
    this.ldvService.getLdvDetail(typeLdvDetail).subscribe(
      (listLDV: Array<any>) => {

        if (typeLdvDetail == 'SONR-STATUS-ORDER') {
          this.listLDVAll = [...listLDV];

          listLDV.sort(function (a, b) {
            if (Number(a.ref1) > Number(b.ref1)) {
              return 1;
            }
            if (Number(a.ref1) < Number(b.ref1)) {
              return -1;
            }
            return 0;
          });
          const listState = [];

          for (const state of listLDV) {
            if (state.ref3) {
              const existState = listState.find(item => item.ref1 == state.ref1)
              if (!existState) {
                listState.push(state)
              }
            }
          }

          if (Number(objStatus.ref1) == 3) {
            listState[2] = objStatus;
          }

          this.listLDVFlow = [...listState];

        } else if (typeLdvDetail == 'SONR-SELLER-STATUS-ORDER') {
          if (this.isSupplier || this.idSupplier) {
            this.listLDVAllSeller = listLDV.filter(ldv => ldv.ref3 == "true");
          } else {
            this.listLDVAllSeller = [...listLDV];
          }
          this.createDropDownList();
        }
      },
      (error) => {
        this.middleService.sendMessage(
          this.namePage,
          error.error.message,
          "error"
        );
      }
    );
  }

  createDropDownList() {
    this.dropDownList = this.listLDVAllSeller
      .filter(status => status.ref1 >= 2)
      .map(status => {
        return { _id: status._id, name: status.value }
      });
  }

  returnProducts() {
    if (localStorage.getItem("dashboard-customer")) {
      this.router.navigate([localStorage.getItem("dashboard-customer")]);
    } else {
      if (localStorage.getItem("list-order")) {
        this.router.navigate([localStorage.getItem("list-order")]);
      } else {
        this.router.navigate(["/system/dashboard"]);
      }
    }
  }

  openReasonDetail(entityName: string, entity, product: any) {
    const type = typeof (entity);
    let entityId;
    switch (type) {
      case 'object': entityId = entity._id; break;
      case 'string': entityId = entity; break;
    }
    this.dialogOrderReasonDetail.show(entityName, entityId, product);
  }

  toggleMessage(value, product?) {
    this.showPopupMessage = value
    if (!value) {
      this.listDedication = []
    } else {
      this.listDedication = product.dedication
    }
  }

  copyTextMessage(useremail: any) {
    var range = this.document.createRange();
    range.selectNodeContents(useremail);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    this.document.execCommand('copy');
    this._snackBar.open('¡correo copiado al clipboard!', 'Cerrar', {
      duration: 3000,
      verticalPosition: "top",
      horizontalPosition: "center"
    })
  }

  resendEmail() {
    debugger
    this.emailService.sendEmail(this.idSupplier, this.idOrder).subscribe(response => {
      this.middleService.sendMessage(
        this.namePage,
        "Se ha reenviado correo correctamente",
        "ok",
      );
    })
  }

  updateStatus() {
    let indexMethodSend = this.indexMethodSend;
    this.showSumaryConfirmation = false;
    this.middleService.sendLoading(true);
    let statusGroup = this.methodSendList.controls[indexMethodSend] as FormGroup;
    let statusControl = statusGroup.controls.optionSelected;
    let objStatus = {
      supplierId: this.listProviderDelivery[indexMethodSend]._id,
      status_order: statusControl.value,
      method_id: this.listProviderDelivery[indexMethodSend].method_id
    }
    this.orderService.changeStatus(this.idOrder, objStatus).subscribe(
      res => {
        this.getInfoOrder();
        this.middleService.sendMessage(
          this.namePage,
          "Se ha actualizado el estado del pedido",
          "ok",
        );
        window.location.reload();
      },
      error => {
        this.middleService.sendLoading(false);
        this.middleService.sendMessage(
          this.namePage,
          error.error.message,
          "error",
        );
      });
  }

  openConfirmation(index) {
    this.indexMethodSend = index;
    this.showSumaryConfirmation = true;
  }

  closeConfirmation() {
    this.showSumaryConfirmation = false;
  }

}
