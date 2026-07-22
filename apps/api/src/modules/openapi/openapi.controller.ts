import { Controller, Get } from '@nestjs/common';
import { OPENAPI_SPEC } from './openapi.document.js';
import { Public } from '../auth/public.decorator.js';

@Controller()
@Public()
export class OpenapiController {
  @Get('/openapi.json')
  openapi() {
    return OPENAPI_SPEC;
  }
}
