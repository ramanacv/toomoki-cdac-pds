import { Controller, Get } from '@nestjs/common';
import { OPENAPI_SPEC } from './openapi.document.js';

@Controller()
export class OpenapiController {
  @Get('/openapi.json')
  openapi() {
    return OPENAPI_SPEC;
  }
}
