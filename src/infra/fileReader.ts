export interface FileReader {
  exists(filePath: string): boolean;
  read(filePath: string): string;
}
