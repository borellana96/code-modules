import { InjectQueue } from "@nestjs/bull";
import { Injectable, Scope } from "@nestjs/common";
import { Queue } from "bull";

@Injectable({ scope: Scope.DEFAULT })
export class QueueProducerService {
  constructor(@InjectQueue('queue') private queue: Queue) { }

  async usersExport(req, dates) {
    let obj = {
      req,
      dates
    }
    await this.queue.add('user-job',
      { message: obj },
    ).catch(error => {
      console.log('Error al momento de agregar a la Cola');
    });
  }

  async salesReportExport(req, params) {
    let obj = {
      req,
      params
    }
    await this.queue.add('sales-report-job',
      { message: obj },
    ).catch(error => {
      console.log('Error al momento de agregar a la Cola');
    });
  }
}