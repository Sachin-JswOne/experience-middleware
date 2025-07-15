// src/controllers/root.controller.ts
import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

@Controller()
export class RootController {
  @Get('/')
  getHome(@Res() res: Response) {
    res.sendFile(join(__dirname, '..', 'static', 'index.html'));
  }
}
