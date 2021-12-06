import { Component, OnInit, ViewChild, HostListener } from '@angular/core';
import { FormGroup, Validators, FormControl } from "@angular/forms";
import { HeaderService } from '../../components/header/header.service';
import { OrderService } from 'src/app/shared/service/order.service';
import { saveAs } from 'file-saver';
import { UserService } from 'src/app/shared/service/user.service';
import { MiddleService } from 'src/app/shared/service/middle.service';
import { SupplierService } from 'src/app/shared/service/supplier.service';
import { GridComponent } from '../../components/grid/grid.component';
import { ActivatedRoute } from '@angular/router';
@Component({
  selector: 'app-report-supplier',
  templateUrl: './report-supplier.component.html',
  styleUrls: ['./report-supplier.component.scss']
})
export class ReportSupplierComponent implements OnInit {
  searchForm: FormGroup;
  isAdmin: boolean
  listSupplier: any
  headerFixed: boolean
  reportSalesType: string;
  @ViewChild("gridList", { static: true }) gridList: GridComponent;
  constructor(
    private headerService: HeaderService,
    private _orderService: OrderService,
    private _userService: UserService,
    private _middleService: MiddleService,
    private _supplierService: SupplierService,
    private activatedRoute: ActivatedRoute,
  ) {
    this.activatedRoute.params.subscribe((params) => {
      this.reportSalesType = params.type;
    })
  };

  @HostListener("window:scroll", ["$event"]) private onWindowScroll($event: Event): void {
    this.scrollEvent($event);
  }
  /* scrollEvent($event: Event) {
    throw new Error("Method not implemented.");
  } */


  ngOnInit() {
    this.listSupplier = []
    this.headerFixed = false;
    this.gridList.columns = [
      {
        field: "code",
        title: "Código",
        type: "text"
      },
      {
        field: "amount_total_purchase",
        title: "Sub total",
        type: "currency",
        currency: "S/",
        align: "right"
      },
      {
        field: "amount_delivery",
        title: "Delivery",
        type: "currency",
        currency: "S/",
        align: "right"
      },
      {
        field: "amount_total",
        title: "Total",
        type: "currency",
        currency: "S/",
        align: "right"
      }

    ];
    this.gridList.config.pagQuantity = 20;

    /* this.gridList.config.redirect = "system/supplier/detail/"; */
    this.gridList.config.entity = "Reporte";

    this.validAdmin()
    this.headerService.sendTitle('Reportes');
    this.searchForm = new FormGroup({
      dateIni: new FormControl(new Date(), [Validators.required]),
      dateEnd: new FormControl(new Date(), [Validators.required]),
      supplier: new FormControl(null, [Validators.required])
    });

    /* this.searchForm.controls.dateIni.disable()
    this.searchForm.controls.dateEnd.disable() */
    this.iniDate()
  }

  setDate(date: Date) {
    const day = date.getDate()
    const month = date.getMonth()
    const year = date.getFullYear()
    const newDate = new Date(year, month, day, 0, 0, 0)
    return newDate
  }

  iniDate() {
    this.searchForm.get('dateIni').patchValue(this.setDate(this.searchForm.get('dateIni').value))
    this.searchForm.get('dateEnd').patchValue(this.setDate(this.searchForm.get('dateEnd').value))
  }



  search() {

    if (((this.searchForm.get('dateIni').value).getTime()) <= ((this.searchForm.get('dateEnd').value).getTime())) {
      this.gridList.config.getService = "/order/list-report-admin/" + this.searchForm.get('dateIni').value + '/' + this.searchForm.get('dateEnd').value + '/' + this.searchForm.get('supplier').value;
      this.gridList.getInfo()
    } else {
      this._middleService.sendMessage('Reporte', 'La fecha inicial debe ser menor o igual a la fecha final', 'error')
    }

  }
  exportReport() {
    this._middleService.sendLoading(true)
    this.searchForm.value.type = this.reportSalesType;
    this._orderService.getReportSale({ params: JSON.stringify(this.searchForm.value) }).subscribe(
      (response) => {
        this._middleService.sendLoading(false);
        this._middleService.sendMessage(
          "Exportar Reporte de Ventas",
          'Se le notificará cuando su descarga del reporte de ventas haya finalizado',
          "ok"
        );
        //this.downLoadFile(response, "application/ms-excel")
      }
    )
  }

  scrollEvent = (event: any): void => {
    // const number = event.srcElement.scrollTop;
    const number = document.documentElement.scrollTop;
    if (number >= 33) {
      this.headerFixed = true;
    } else {
      this.headerFixed = false;
    }
  }


  downLoadFile(data: any, type: string) {
    saveAs(data, 'Reporte de Ventas.xlsx');
  }

  validAdmin() {
    this._userService.validAdmin().subscribe(
      (infoValid: any) => {

        this.isAdmin = infoValid.validIsAdmin
        if (this.isAdmin) {
          this.getListSupplier()
        } else {
          if (infoValid.supplierId) {
            this.searchForm.get('supplier').setValue(infoValid.supplierId)
            this.search()
          }
        }
      }, (error) => {
        this._middleService.sendMessage('Reporte', error.error.message, 'error')
      }
    )
  }

  getListSupplier() {
    this._supplierService.getAllSupplier().subscribe(
      (listSupplier: any) => {

        this.listSupplier = listSupplier
        if (listSupplier.length > 0) {
          this.searchForm.get('supplier').setValue(listSupplier[0]._id)
          this.search()
        }
      }, (error) => {
        this._middleService.sendMessage('Reporte', error.error.message, 'error')
      }
    )
  }

}
