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

Установите зависимости:

```bash
cd .opencode && npm install && cd ..
```

### Активация lsp tool и LSP-серверов (opencode 1.17.x)

Плагин подменяет только интерфейс `lsp` tool — сами серверы активирует opencode. Нужны **все** условия одновременно:

| Требование | Как выполнить |
|------------|----------------|
| Экспериментальный `lsp` tool | `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` (или `OPENCODE_EXPERIMENTAL=true`) в окружении процесса opencode |
| Включённые LSP-серверы | `"lsp": true` **или** объект конфигурации LSP (например `"lsp": {"clangd": {...}}`) в `opencode.json` |
| Бинарь LSP-сервера | `typescript-language-server`, `clangd` и т.п.: opencode скачивает и кэширует их в `~/.cache/opencode`; если задан собственный `lsp.<id>.command`, бинарь обязан быть в `PATH` |
| Разрешение на tool | `"permission": { "lsp": "allow" }` |

`opencode.json` с полным набором требований:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "lsp": true,
  "permission": {
    "lsp": "allow"
  }
}
```

Важно:

- флага `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` **недостаточно** — он включает сам tool, но не LSP-серверы;
- без ключа `lsp` opencode 1.17.x отключает все встроенные LSP-серверы (в логе — `all LSPs are disabled`), и любой вызов `lsp` завершается ошибкой `No LSP server available for this file type.`;
- проверка логов: при успешной активации присутствует запись `enabled LSP servers` с нужным `id` сервера.

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
npm test                                        # Unit + Integration
npm run test:e2e                                # E2E без clangd (сюита semantic-lsp пропускается)
npm run test:e2e -- --clangd /path/to/clangd    # E2E целиком, включая clangd-сюиту
```

E2E-тесты требуют `opencode` в `PATH` (или `OPENCODE_BIN=/path/to/opencode`) и активации `lsp` tool (см. выше).

Сюита `tests/e2e/semantic-lsp.test.ts` зависит от бинаря `clangd` и по умолчанию **пропускается** — прогон остаётся зелёным, а в конце выводится подсказка, как включить эти тесты. Путь к `clangd` задаётся только явно через `--clangd`: никакие поиски в `PATH` или кэше opencode не выполняются, пропустить сюиту «специальным флагом» нельзя — её просто не запускают.

Прогон запускается скриптом `tests/e2e/run-e2e.js` в два шага: `(1/2) build` (сам `npm run build`) и `(2/2) jest`. Ошибки делятся на два класса:

- **некорректный вызов** (`--clangd` без значения, повтор флага, значение `auto`) — баннер `E2E RUN ABORTED`, прерывание до сборки, ни один тест не запускается;
- **проблема с самим бинарём** (путь не найден, это не файл, `--version` не запускается, вывод не похож на clangd) — сразу печатается баннер `INVALID CLANGD PATH`, но прогон продолжается: сюиты, не зависящие от clangd, выполняются как обычно, а `semantic-lsp.test.ts` падает с той же диагностикой, и итоговый код прогона ненулевой.

Вывод сборки при успехе сворачивается в строку `build ... ok (1.6s)`: сообщения esbuild вида «Done in 30ms» иначе читаются как результаты тестов. Полный вывод сборки показывается только когда сборка упала.

Проверенный путь попадает в конфигурацию фикстуры как `lsp.clangd.command[0]`, поэтому `clangd` не обязан быть в `PATH` (важно для Windows).

## Технические требования

- Node.js
- TypeScript 6+
- LSP-сервер, настроенный для соответствующего языка проекта (clangd для C/C++, tsserver для TS/JS и т.д.)
- Для E2E: `OPCODE_EXPERIMENTAL_LSP_TOOL=true`, `"lsp": true` в конфигурации фикстуры; clangd-проверки — через `npm run test:e2e -- --clangd <path>`
