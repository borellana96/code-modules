import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { OrderComponent } from "./order.component";
import { Routes, RouterModule } from "@angular/router";
import { ListOrderComponent } from "./list-order/list-order.component";
import { ComponentsModule } from "../components/components.module";
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule, MatOptionModule, MatSelectModule, MatTooltipModule } from '@angular/material';
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

export const orderRoutes: Routes = [
  { path: "", component: ListOrderComponent },
  { path: "detail/:id", component: OrderComponent }
];

@NgModule({
  declarations: [OrderComponent, ListOrderComponent],
  imports: [
    RouterModule.forChild(orderRoutes),
    CommonModule,
    ComponentsModule,
    MatSnackBarModule,
    MatTooltipModule,
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatOptionModule,
    MatSelectModule,
  ]
})
export class OrderModule { }
