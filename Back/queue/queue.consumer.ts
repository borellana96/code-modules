import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

import { Utils } from '../utils';
import { InternalServerErrorException } from '../generalExceptions';
import { EnterpriseService } from 'src/entities/system-settings/authorization-authentication/authorization/enterprice.service';
import { Constants } from '../constant';
import { RequestExternal } from '../requestExtenalInfo';

@Processor('queue')
export class QueueConsumer {

  constructor(
    private _enterpriseService: EnterpriseService
  ) { }

  async getInfoAction(config, key, code, method) {
    const configEnterprise: any = {};
    configEnterprise.dbconn = Constants.parametersSonr().conexionConnect;
    const infoEnterprise: any = await this._enterpriseService
      .findOne(configEnterprise, config.tenant, key)
      .catch(error => {
        Utils.log(error);
        throw new InternalServerErrorException();
      });

    if (infoEnterprise.actions_enterprise) {
      const searchAction = infoEnterprise.actions_enterprise.find(
        item => item.action == code && item.method == method,
      );
      searchAction.url =
        infoEnterprise.middleware_uploader_request + searchAction.url;
      return searchAction;
    }
  }

  @Process('user-job')
  async userExcel(job: Job<unknown>) {
    let objJob: any = job.data;
    let message = objJob.message;

    let req = message.req;
    let dates = message.dates;

    const actionEnterprise = await this.getInfoAction(req.config, req.key, 'uploader-excel', 'GET');
    const requestExternal = new RequestExternal();
    const infoReceive = await requestExternal
      .requestGo(
        actionEnterprise.url,
        'GET',
        null,
        req.keyB64,
        req.userId,
        dates,
      )
      .catch(error => {
        Utils.log(error);
        throw new InternalServerErrorException();
      });
    return infoReceive;
  }

  @Process('sales-report-job')
  async salesReportExcel(job: Job<unknown>) {
    let objJob: any = job.data;
    let message = objJob.message;

    let req = message.req;
    let params = message.params;

    const actionEnterprise = await this.getInfoAction(req.config, req.key, 'uploader-excel-report-sales', 'GET');
    const requestExternal = new RequestExternal();
    const infoReceive = await requestExternal
      .requestGo(
        actionEnterprise.url,
        'GET',
        null,
        req.keyB64,
        req.userId,
        params,
      )
      .catch(error => {
        Utils.log(error);
        throw new InternalServerErrorException();
      });
    return infoReceive;
  }

}