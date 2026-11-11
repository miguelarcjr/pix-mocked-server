import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PSP } from '../core/app/psp';
import { HttpInterceptor } from '../http.interceptor';
import { LoteCobVGetFilter, LoteCobVPatchRequest, LoteCobVRequest } from '../core/app/models/lotecobv';

@Controller("lotecobv")
@ApiTags("lotecobv")
@UseInterceptors(HttpInterceptor)
export class LoteCobVController {
  constructor(private readonly pspService: PSP) { }

  @Put(":id")
  @HttpCode(202)
  async put(@Body() data: LoteCobVRequest, @Param("id") id: string, @Headers() headers) {
    return await this.pspService.putLoteCobV(headers["IdOwner"], id, data);
  }

  /** Conveniência do mock: cria o lote gerando o id automaticamente. */
  @Post()
  @HttpCode(202)
  async create(@Body() data: LoteCobVRequest, @Headers() headers) {
    return await this.pspService.addLoteCobV(headers["IdOwner"], data);
  }

  @Patch(":id")
  @HttpCode(202)
  async edit(@Body() data: LoteCobVPatchRequest, @Param("id") id: string, @Headers() headers) {
    return await this.pspService.editLoteCobV(headers["IdOwner"], id, data);
  }

  @Get()
  async list(@Query() qry: LoteCobVGetFilter, @Headers() headers) {
    return await this.pspService.listLoteCobV({ ...qry, IdOwner: headers["IdOwner"] });
  }

  @Get(":id")
  async read(@Param("id") id: string, @Headers() headers) {
    return await this.pspService.readLoteCobV(headers["IdOwner"], id);
  }
}
