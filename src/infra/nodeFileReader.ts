import * as fs from 'fs';
import * as path from 'path';
import { FileReader } from './fileReader';

export class NodeFileReader implements FileReader {
  exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  read(filePath: string): string {
    const absolutePath = path.resolve(filePath);
    return fs.readFileSync(absolutePath, 'utf-8');
  }
}
