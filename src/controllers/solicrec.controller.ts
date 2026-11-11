import { Body, Controller, Get, Headers, Param, Patch, Post, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PSP } from '../core/app/psp';
import { HttpInterceptor } from '../http.interceptor';
import { SolicRecPatchRequest, SolicRecPostRequest } from '../core/app/models/solicrec';

@Controller("solicrec")
@ApiTags("solicrec")
@UseInterceptors(HttpInterceptor)
export class SolicRecController {
  constructor(private readonly pspService: PSP) { }

  @Post()
  async create(@Body() data: SolicRecPostRequest, @Headers() headers) {
    return await this.pspService.addSolicRec(headers["IdOwner"], data);
  }

  @Get(":idSolicRec")
  async read(@Param("idSolicRec") idSolicRec: string, @Headers() headers) {
    return await this.pspService.readSolicRec(headers["IdOwner"], idSolicRec);
  }

  /** Cancelamento da solicitação: PATCH com status CANCELADA (a spec não define DELETE). */
  @Patch(":idSolicRec")
  async edit(@Body() data: SolicRecPatchRequest, @Param("idSolicRec") idSolicRec: string, @Headers() headers) {
    return await this.pspService.editSolicRec(headers["IdOwner"], idSolicRec, data);
  }
}
