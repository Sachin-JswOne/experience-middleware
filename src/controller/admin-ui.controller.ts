import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Controller('admin')
export class AdminUIController {
  @Get('*path')
  serveAdminUI(@Res() res: Response) {
    const indexPath = path.resolve(__dirname, '../../public/admin/index.html');
    if (!fs.existsSync(indexPath)) {
      throw new NotFoundException('Admin UI not found. Run npm run build:admin first.');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexPath);
  }
}