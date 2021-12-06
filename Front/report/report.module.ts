import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';
import { ReportSupplierComponent } from './report-supplier/report-supplier.component';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule, MatNativeDateModule, MatInputModule, MatSelectModule } from '@angular/material';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ComponentsModule } from '../components/components.module';

const reportRoutes: Routes = [
  { path: 'report-supplier', component: ReportSupplierComponent },
  { path: 'report-supplier/:type', component: ReportSupplierComponent }
];

@NgModule({
  declarations: [ReportSupplierComponent],
  imports: [RouterModule.forChild(reportRoutes), CommonModule, MatDatepickerModule, MatFormFieldModule, MatNativeDateModule,
    FormsModule,
    ReactiveFormsModule,
    MatInputModule,
    MatSelectModule,
    ComponentsModule
  ]
})
export class ReportModule { }
