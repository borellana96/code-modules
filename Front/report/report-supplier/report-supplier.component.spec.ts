import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportSupplierComponent } from './report-supplier.component';

xdescribe('ReportSupplierComponent', () => {
  let component: ReportSupplierComponent;
  let fixture: ComponentFixture<ReportSupplierComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ReportSupplierComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ReportSupplierComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
