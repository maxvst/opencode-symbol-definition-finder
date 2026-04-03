# Symbol Finder

Библиотека для поиска символов в исходном коде и OpenCode Custom Tool для навигации по коду с помощью ИИ.

## Возможности

- Поиск вхождений символа (функция, переменная, класс) в файле исходного кода
- Дизамбигуация через фрагмент кода — символ должен встречаться в фрагменте ровно один раз
- Толерантность к форматированию (пробелы, переносы строк)
- Поддержка нескольких языков (JS/TS, Python, Go, Java и др.)
- Два формата вывода: JSON и человекочитаемый для LLM

## Архитектура

```
src/
├── index.ts                  # Публичный API библиотеки
├── symbolFinder.ts           # Ядро алгоритма поиска
├── types.ts                  # Типы и интерфейсы
├── cli.ts                    # CLI-утилита
├── opencode-tool.ts          # Custom Tool для OpenCode
├── formatters/
│   ├── formatterFactory.ts   # Фабрика форматтеров
│   ├── jsonFormatter.ts      # JSON-форматирование
│   └── llmFormatter.ts       # Форматирование для LLM
└── utils/
    └── textNormalizer.ts     # Нормализация текста
```

## Установка и сборка

```bash
npm install
npm run build
```

Результат сборки:

- `dist/` — скомпилированные JS-файлы библиотеки (TypeScript + tsc)
- `dist/symbol-finder.js` — standalone ESM-бандл Custom Tool (esbuild)

## Использование как библиотека

```ts
import { SymbolFinder, LLMFormatter } from "symbol-finder";

const finder = new SymbolFinder();
const result = finder.find({
  code: "const x = foo(1);\nfunction foo(n) { return n; }\nfoo(42);",
  symbol: "foo",
  fragment: "foo(42);",
});

const formatter = new LLMFormatter();
console.log(formatter.format(result));
```

Вывод:

```
STATUS: FOUND
MATCH_COUNT: 1

MATCHES:
  - MATCH_1:
      SYMBOL: foo
      LINE: 3
      COLUMN: 1
      CONTEXT: |
        function foo(n) { return n; }
        foo(42);
```

## Использование как CLI

```bash
npx symbol-finder -f src/app.ts -s myFunction -F "myFunction(arg1, arg2)"
npx symbol-finder --file code.py --symbol MyClass --fragment "MyClass()" --format llm
```

## Использование как OpenCode Custom Tool

Скопируйте `dist/symbol-finder.js` в директорию `.opencode/tools/` вашего проекта:

```bash
mkdir -p .opencode/tools
cp dist/symbol-finder.js .opencode/tools/
```

После этого OpenCode автоматически загрузит инструмент. Имя инструмента совпадает с именем файла — `symbol-finder`.

### Параметры

| Параметр   | Тип     | Обязательный | Описание                                                        |
|------------|---------|--------------|-----------------------------------------------------------------|
| `file`     | string  | Да           | Путь к файлу относительно корня проекта                         |
| `symbol`   | string  | Да           | Имя символа для поиска                                          |
| `fragment` | string  | Да           | Фрагмент кода, содержащий символ (для дизамбигуации)            |

### Результат

Инструмент возвращает текст в формате, оптимизированном для LLM:

- `STATUS: FOUND` — символ найден, далее список совпадений с координатами (строка, колонка) и контекстом
- `STATUS: NOT_FOUND` — символ не найден
- `STATUS: ERROR` — ошибка (невалидный символ, символ не уникален во фрагменте и т.д.)

## Тесты

```bash
npm test           # Запуск всех тестов
npm run test:watch # Запуск в режиме наблюдения
```
