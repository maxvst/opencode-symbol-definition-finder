# Semantic LSP Plugin для OpenCode

Плагин для [OpenCode](https://opencode.ai), который превращает встроенный `lsp` tool в семантически понятный для LLM интерфейс. Вместо указания точных координат (строка, колонка) модель передаёт имя символа и фрагмент кода, а плагин автоматически определяет позицию.

## Проблема

OpenCode предоставляет `lsp` tool для взаимодействия с LSP-серверами (goToDefinition, findReferences и др.), но требует точных координат символа — `line` и `character`. LLM регулярно ошибается при их определении, что приводит к неверным результатам.

## Решение

**Semantic LSP Plugin** перехватывает вызовы `lsp` tool через систему хуков OpenCode Plugin API:

1. **Подмена интерфейса** — убирает параметры `line`/`character`, добавляет `symbol`/`fragment`
2. **Определение координат** — читает файл, находит символ через алгоритм text-based matching, подставляет точные `line`/`character` в вызов
3. **Обогащение ответа** — добавляет предупреждения и ошибки, помогающие LLM скорректировать запрос

```
LLM вызывает lsp(filePath, operation, symbol, fragment)
        │
        ▼
   tool.definition       → подмена параметров
        │
        ▼
   tool.execute.before   → чтение файла → поиск символа → подстановка line/character
        │
        ▼
   Оригинальный lsp tool
        │
        ▼
   tool.execute.after    → обогащение ответа ошибками/предупреждениями
        │
        ▼
   Обогащённый ответ для LLM
```

## Поддерживаемые LSP-операции

| Операция | Описание |
|----------|----------|
| `goToDefinition` | Переход к определению символа |
| `findReferences` | Поиск всех ссылок на символ |
| `hover` | Документация и тип символа |
| `documentSymbol` | Все символы в документе |
| `workspaceSymbol` | Поиск символов по всей workspace |
| `goToImplementation` | Поиск реализаций интерфейса |
| `prepareCallHierarchy` | Иерархия вызовов в позиции |
| `incomingCalls` | Кто вызывает функцию |
| `outgoingCalls` | Кого вызывает функция |

## Установка

### Сборка из исходников

```bash
git clone <repo-url>
cd opencode-symbol-definition-finder
npm install
npm run build
```

Результат сборки:

- `dist/semantic-lsp-plugin.js` — бандл плагина (esbuild, ESM)
- `dist/symbol-finder.js` — Custom Tool для OpenCode (standalone)
- `dist/` — скомпилированные JS-файлы библиотеки (tsc)

### Подключение к проекту

Создайте `.opencode/plugins/semantic-lsp-plugin.js` в корне проекта:

```bash
mkdir -p .opencode/plugins
cp dist/semantic-lsp-plugin.js .opencode/plugins/
```

Создайте `.opencode/package.json` с зависимостью от Plugin SDK:

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "latest"
  }
}
```

Установите зависимости и включите LSP tool в `opencode.json`:

```json
{
  "permission": {
    "lsp": "allow"
  }
}
```

## Параметры плагина

LLM передаёт параметры через `lsp` tool:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `filePath` | string | Да | Путь к файлу |
| `operation` | string | Да | LSP-операция |
| `symbol` | string | Да | Имя символа (функция, переменная, класс) |
| `fragment` | string | Да | Фрагмент кода, содержащий символ (для дизамбигуации) |

## Архитектура проекта

```
src/
├── semantic-lsp-plugin.ts              # Plugin для OpenCode — основной продукт
├── semantic-lsp-transformer/           # Ядро алгоритма поиска символов
│   ├── SemanticLspTransformer.ts       # Основной класс с find() и bestEffort
│   ├── types.ts                        # Типы: FinderResult, FinderError, ...
│   ├── formatters/
│   │   ├── jsonFormatter.ts            # JSON-форматирование
│   │   ├── llmFormatter.ts             # Человекочитаемый формат для LLM
│   │   ├── lspFormatter.ts             # Структурированный формат для plugin
│   │   └── formatterFactory.ts         # Фабрика форматтеров
│   ├── search/
│   │   └── RegexSearchStrategy.ts      # Стратегия поиска на основе regex
│   ├── validation/
│   │   ├── ValidationChain.ts          # Цепочка валидаторов
│   │   ├── EmptyCodeValidator.ts       # ...
│   │   ├── EmptySymbolValidator.ts     # Валидаторы входных данных
│   │   ├── EmptyFragmentValidator.ts   # ...
│   │   ├── InvalidSymbolValidator.ts   # ...
│   │   └── SymbolInFragmentValidator.ts# ...
│   └── utils/
│       └── textNormalizer.ts           # Нормализация текста
├── opencode-tool.ts                    # Custom Tool (standalone symbol-finder)
├── cli.ts                              # CLI-утилита
├── index.ts                            # Публичный API библиотеки
├── infra/
│   ├── fileReader.ts                   # Интерфейс чтения файлов
│   └── nodeFileReader.ts               # Реализация через Node.js fs
└── skills/
    └── go-to-definition/SKILL.md       # Навык для OpenCode
```

## Дополнительные интерфейсы

### CLI

```bash
npx symbol-finder -f src/app.ts -s myFunction -F "myFunction(arg1, arg2)"
npx symbol-finder --file code.py --symbol MyClass --fragment "MyClass()" --format llm
npx symbol-finder -f main.go -s handler -F "handler(req)" --best-effort
```

### Библиотека

```ts
import { SemanticLspTransformer, LspFormatter } from "symbol-finder";

const finder = new SemanticLspTransformer();
const result = finder.find({
  code: "const x = foo(1);\nfunction foo(n) { return n; }\nfoo(42);",
  symbol: "foo",
  fragment: "foo(42);",
});
```

Режим `bestEffort: true` всегда возвращает ровно одну позицию с fallback на `{line: 1, column: 1}` при невозможности найти символ.

### Custom Tool

`dist/symbol-finder.js` — standalone ESM-бандл, размещаемый в `.opencode/tools/`. Предоставляет прямой поиск символов без привязки к LSP.

## Тесты

```bash
npm test           # Unit + Integration (131 тест)
npm run test:e2e   # E2E: OpenCode + clangd, поиск getUltimateAnswer() → 42
```

## Технические требования

- Node.js
- TypeScript 6+
- LSP-сервер, настроенный для соответствующего языка проекта (clangd для C/C++, tsserver для TS/JS и т.д.)
