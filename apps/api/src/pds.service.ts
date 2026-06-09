import { Injectable } from '@nestjs/common';
import { PdsRuntime } from './pds-runtime.js';

@Injectable()
export class PdsService extends PdsRuntime {}
