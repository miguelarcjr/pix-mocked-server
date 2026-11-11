import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Put, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PSP } from '../core/app/psp';
import { HttpInterceptor } from '../http.interceptor';
import { WebhookGetFilter, WebhookPutRequest } from '../core/app/models/webhook';

@Controller("webhook")
@ApiTags("webhook")
@UseInterceptors(HttpInterceptor)
export class WebhookController {
  constructor(private readonly pspService: PSP) { }

  @Put(":chave")
  async put(@Body() data: WebhookPutRequest, @Param("chave") chave: string, @Headers() headers) {
    return await this.pspService.putWebhook(headers["IdOwner"], chave, data.webhookUrl);
  }

  @Get()
  async list(@Query() qry: WebhookGetFilter, @Headers() headers) {
    return await this.pspService.listWebhook({ ...qry, IdOwner: headers["IdOwner"] });
  }

  @Get(":chave")
  async read(@Param("chave") chave: string, @Headers() headers) {
    return await this.pspService.readWebhook(headers["IdOwner"], chave);
  }

  @Delete(":chave")
  @HttpCode(204)
  async remove(@Param("chave") chave: string, @Headers() headers) {
    return await this.pspService.removeWebhook(headers["IdOwner"], chave);
  }
}
