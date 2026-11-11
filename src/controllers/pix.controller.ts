import { Body, Controller, Get, Headers, Param, Put, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PSP } from '../core/app/psp';
import { HttpInterceptor } from '../http.interceptor';
import { DevolucaoPutRequest, PixGetFilter } from '../core/app/models/pix';

@Controller("pix")
@ApiTags("pix")
@UseInterceptors(HttpInterceptor)
export class PixController {
  constructor(private readonly pspService: PSP) { }

  @Get()
  async list(@Query() qry: PixGetFilter, @Headers() headers) {
    return await this.pspService.listPix({ ...qry, IdOwner: headers["IdOwner"] });
  }

  @Get(":e2eid")
  async read(@Param("e2eid") e2eid: string, @Headers() headers) {
    return await this.pspService.readPix(headers["IdOwner"], e2eid);
  }

  @Put(":e2eid/devolucao/:id")
  async devolver(@Body() data: DevolucaoPutRequest, @Param("e2eid") e2eid: string, @Param("id") id: string, @Headers() headers) {
    return await this.pspService.addDevolucao(headers["IdOwner"], e2eid, id, data);
  }

  @Get(":e2eid/devolucao/:id")
  async readDevolucao(@Param("e2eid") e2eid: string, @Param("id") id: string, @Headers() headers) {
    return await this.pspService.readDevolucao(headers["IdOwner"], e2eid, id);
  }
}
